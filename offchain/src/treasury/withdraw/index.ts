import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import { loadTreasuryScript } from "../../shared";
import type { TreasuryConfiguration } from "../../types/contracts";
import { AssetId, toHex } from "@blaze-cardano/core";

export async function withdraw<P extends Provider, W extends Wallet>(
  config: TreasuryConfiguration,
  amount: bigint,
  blaze: Blaze<P, W>,
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
  return blaze
    .newTransaction()
    .addWithdrawal(rewardAccount!, amount, Data.Void())
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .lockLovelace(scriptAddress, amount, Data.Void());
}
