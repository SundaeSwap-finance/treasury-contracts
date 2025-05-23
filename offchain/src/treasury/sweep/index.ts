import {
  makeValue,
  TxBuilder,
  Value,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import { AssetId, toHex, TransactionUnspentOutput } from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { loadTreasuryScript, unix_to_slot } from "../../shared";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
} from "../../types/contracts";

export async function sweep<P extends Provider, W extends Wallet>(
  config: TreasuryConfiguration,
  input: TransactionUnspentOutput,
  blaze: Blaze<P, W>,
  amount?: bigint,
): Promise<TxBuilder> {
  amount ??= input.output().amount().coin();
  const { script, scriptAddress } = loadTreasuryScript(
    blaze.provider.network,
    config,
  );
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(script.Script);
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");
  let tx = blaze
    .newTransaction()
    .addInput(input, Data.serialize(TreasurySpendRedeemer, "SweepTreasury"))
    .setValidFrom(unix_to_slot(config.expiration + 1000n))
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setDonation(amount);

  const remainder = Value.merge(input.output().amount(), makeValue(-amount));
  if (remainder !== Value.zero()) {
    tx = tx.lockAssets(scriptAddress, remainder, Data.Void());
  }

  return tx;
}
