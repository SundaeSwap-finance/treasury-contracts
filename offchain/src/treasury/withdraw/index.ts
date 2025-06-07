import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  toHex,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import type { IInitialize } from "../../../src/metadata/initialize-reorganize";
import {
  toMetadata,
  type ITransactionMetadata,
} from "../../../src/metadata/shared";
import { loadTreasuryScript } from "../../shared";
import type { TreasuryConfiguration } from "../../types/contracts";

export async function withdraw<P extends Provider, W extends Wallet>(
  config: TreasuryConfiguration,
  amounts: bigint[],
  blaze: Blaze<P, W>,
  metadata?: ITransactionMetadata<IInitialize>,
  withdrawAmount: bigint | undefined = undefined,
): Promise<TxBuilder> {
  const { script, rewardAccount, scriptAddress } = loadTreasuryScript(
    blaze.provider.network,
    config,
  );
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(script.Script);
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");

  const amount = amounts.reduce((acc, val) => acc + val, BigInt(0));

  let txBuilder = blaze
    .newTransaction()
    .addWithdrawal(
      rewardAccount!,
      withdrawAmount !== undefined ? withdrawAmount : amount,
      Data.Void(),
    )
    .addReferenceInput(refInput)
    .addReferenceInput(registryInput);

  if (metadata) {
    if (amounts.length !== Object.keys(metadata.body.outputs).length)
      throw new Error(
        "Number of amounts must match number of outputs in metadata",
      );
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toMetadata(metadata));
    txBuilder = txBuilder
      .setAuxiliaryData(auxData)
      .addRequiredSigner(Ed25519KeyHashHex(metadata.txAuthor));
  }

  amounts.forEach((amt) => {
    txBuilder.lockLovelace(scriptAddress, amt, Data.Void());
  });

  return txBuilder;
}
