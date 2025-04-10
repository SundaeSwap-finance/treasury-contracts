import {
  makeValue,
  TxBuilder,
  Value,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import { Slot, TransactionUnspentOutput } from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { loadScript } from "../shared";
import { TreasuryConfiguration, TreasurySpendRedeemer } from "../types/contracts";

export async function sweep<P extends Provider, W extends Wallet>(
  config: TreasuryConfiguration,
  input: TransactionUnspentOutput,
  blaze: Blaze<P, W>,
  amount?: bigint,
): Promise<TxBuilder> {
  amount ??= input.output().amount().coin();
  const { scriptAddress, treasuryScript } = loadScript(
    blaze.provider.network,
    config,
  );
  const refInput = await blaze.provider.resolveScriptRef(treasuryScript.Script);
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");
  let tx = blaze
    .newTransaction()
    .addInput(input, Data.serialize(TreasurySpendRedeemer, "SweepTreasury"))
    .setValidFrom(Slot(Number(config.expiration)))
    .addReferenceInput(refInput)
    .setDonation(amount);

  let remainder = Value.merge(input.output().amount(), makeValue(-amount));
  if (remainder !== Value.zero()) {
    tx = tx.lockAssets(
      scriptAddress,
      remainder,
      Data.Void(),
    );
  }

  return tx;
}
