import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { loadTreasuryScript } from "../../shared";
import type { TreasuryConfiguration } from "../../types/contracts";
import { HexBlob, PlutusData } from "@blaze-cardano/core";

export async function withdraw<P extends Provider, W extends Wallet>(
  config: TreasuryConfiguration,
  amount: bigint,
  blaze: Blaze<P, W>,
): Promise<TxBuilder> {
  const { script, rewardAccount, scriptAddress } = loadTreasuryScript(
    blaze.provider.network,
    config,
  );
  const refInput = await blaze.provider.resolveScriptRef(script.Script);
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");
  return blaze
    .newTransaction()
    .addWithdrawal(rewardAccount, amount, Data.Void())
    .addReferenceInput(refInput)
    .lockLovelace(scriptAddress, amount, Data.Void());
}
