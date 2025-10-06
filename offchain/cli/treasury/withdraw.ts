import { Blaze, Provider, Wallet } from "@blaze-cardano/sdk";
import { input } from "@inquirer/prompts";
import { ETransactionEvent, Treasury } from "../../src";
import { IInitialize } from "../../src/metadata/types/initialize-reorganize";
import {
  getBlazeInstance,
  getConfigs,
  getOptional,
  getOutputs,
  getTransactionMetadata,
  maybeInput,
  transactionDialog,
} from "../shared";

export async function withdraw(
  blazeInstance: Blaze<Provider, Wallet> | undefined = undefined,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }
  const { configs, scripts } = await getConfigs(blazeInstance);

  const { amounts, outputs } = await getOutputs();

  const body: IInitialize = {
    event: ETransactionEvent.INITIALIZE,
    reason: await maybeInput({
      message: "Enter a reason for the withdrawal (optional)",
    }),
    outputs,
  };

  const withdrawAmountOpt = await getOptional(
    "Do you want to specify a withdrawal amount? (optional)",
    { message: "Enter withdrawal amount in lovelace:" },
    input,
  );
  const withdrawAmount =
    withdrawAmountOpt !== undefined
      ? BigInt(parseInt(withdrawAmountOpt))
      : undefined;
  const txMetadata = await getTransactionMetadata(
    configs.treasury.registry_token,
    body,
  );

  const tx = await Treasury.withdraw({
    configsOrScripts: { configs, scripts },
    amounts,
    blaze: blazeInstance,
    metadata: txMetadata,
    withdrawAmount,
  });
  const finalTx = await tx.complete();
  await transactionDialog(
    blazeInstance.provider.network,
    finalTx.toCbor().toString(),
    false,
  );
}
