import {
  Address,
  Ed25519KeyHashHex,
  TransactionId,
  TransactionInput
} from "@blaze-cardano/core";
import { Blaze, makeValue, Provider, Wallet } from "@blaze-cardano/sdk";
import { getBlazeInstance, getConfigs, transactionDialog } from "cli/shared";
import { Treasury } from "src";

export async function disburse(
  blazeInstance: Blaze<Provider, Wallet> | undefined = undefined,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }
  const { treasuryConfig, vendorConfig } = await getConfigs();

  const input = (
    await blazeInstance.provider.resolveUnspentOutputs([
      TransactionInput.fromCore({
        txId: TransactionId(
          "a88413b4c998e832d6a69ec12610af68c48e65517aebf94f2dfbbfaa4974c1ec",
        ),
        index: 0,
      }),
    ])
  )[0];

  const recipient = Address.fromBech32(
    "addr1qyr5l2h8gelmp4qph7kzpzkqtky3mv9yvgkmwvdm3xweu3qu5zwsv0wyc267my62pruyl0ruw3gwjj0v9nucpqhn2gxsv56tkv",
  );
  const amount = makeValue(250_000_000n);
  const datum = undefined;
  const signers = [
    Ed25519KeyHashHex(
      "074faae7467fb0d401bfac208ac05d891db0a4622db731bb899d9e44",
    ),
    Ed25519KeyHashHex(
      "e0b68e229f9c043ab610067ed7f3c6d662b8f3c6bb4ec452c11f6411",
    ),
  ];

  const tx = await (
    await Treasury.disburse(
      { treasury: treasuryConfig, vendor: vendorConfig },
      blazeInstance,
      input,
      recipient,
      amount,
      datum,
      signers,
    )
  ).complete();

  await transactionDialog(blazeInstance.provider.network, tx.toCbor(), false);
}
