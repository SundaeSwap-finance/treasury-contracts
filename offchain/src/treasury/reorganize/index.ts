import {
  AssetId,
  Ed25519KeyHashHex,
  PlutusData,
  Script,
  Slot,
  toHex,
  TransactionUnspentOutput,
  Value,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";

import { TreasurySpendRedeemer } from "../../generated-types/contracts.js";
import {
  loadConfigsAndScripts,
  rewardAccountFromScript,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IReorganizeArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  inputs: TransactionUnspentOutput[];
  outputAmounts: Value[];
  signers: Ed25519KeyHashHex[];
  additionalScripts?: { script: Script; redeemer: PlutusData }[];
}

export async function reorganize<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  inputs,
  outputAmounts,
  signers,
  additionalScripts,
}: IReorganizeArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { script, scriptAddress } = scripts.treasuryScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(script.Script.hash());
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");
  let tx = blaze
    .newTransaction()
    .setValidUntil(Slot(Number(configs.treasury.expiration / 1000n) - 1))
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput);

  if (!!additionalScripts) {
    for (const { script, redeemer } of additionalScripts) {
      const refInput = await blaze.provider.resolveScriptRef(script);
      tx = tx
        .addReferenceInput(refInput!)
        .addWithdrawal(
          rewardAccountFromScript(script, blaze.provider.network),
          0n,
          redeemer,
        );
    }
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  for (const input of inputs) {
    tx = tx.addInput(
      input,
      Data.serialize(TreasurySpendRedeemer, "Reorganize"),
    );
  }

  for (const outputAmount of outputAmounts) {
    tx = tx.lockAssets(scriptAddress, outputAmount, Data.Void());
  }

  return tx;
}
