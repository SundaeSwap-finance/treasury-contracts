import {
  AssetId,
  Ed25519KeyHashHex,
  PlutusData,
  Script,
  toHex,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  Value,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";

import {
  VendorDatum,
  VendorSpendRedeemer,
} from "../../generated-types/contracts.js";
import {
  contractsValueToCoreValue,
  loadConfigsAndScripts,
  rewardAccountFromScript,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IModifyArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  input: TransactionUnspentOutput;
  new_vendor: VendorDatum;
  signers: Ed25519KeyHashHex[];
  additionalScripts: { script: Script; redeemer: PlutusData }[];
}

export async function modify<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  input,
  new_vendor,
  signers,
  additionalScripts,
}: IModifyArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress: treasuryScriptAddress } = scripts.treasuryScript;
  const { scriptAddress: vendorScriptAddress, script: vendorScript } =
    scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(
    vendorScript.Script.hash(),
  );
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");
  const thirty_six_hours = 36 * 60 * 60 * 1000; // 36 hours in milliseconds
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()))
    .setValidUntil(blaze.provider.unixToSlot(now.valueOf() + thirty_six_hours))
    .addInput(input, Data.serialize(VendorSpendRedeemer, "Modify"));
  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }
  if (!!additionalScripts) {
    for (const { script, redeemer } of additionalScripts) {
      tx = tx.addWithdrawal(
        rewardAccountFromScript(script, blaze.provider.network),
        0n,
        redeemer,
      );
    }
  }

  let vendorOutput = Value.zero();
  for (const payout of new_vendor.payouts) {
    vendorOutput = Value.merge(
      vendorOutput,
      contractsValueToCoreValue(payout.value),
    );
  }
  const remainder = Value.merge(
    input.output().amount(),
    Value.negate(vendorOutput),
  );

  tx = tx.lockAssets(
    vendorScriptAddress,
    vendorOutput,
    Data.serialize(VendorDatum, new_vendor),
  );
  if (!Value.empty(remainder)) {
    tx = tx.lockAssets(treasuryScriptAddress, remainder, Data.Void());
  }
  return tx;
}

export interface ICancelArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  input: TransactionUnspentOutput;
  signers: Ed25519KeyHashHex[];
}

export async function cancel<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  input,
  signers,
}: ICancelArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress: treasuryScriptAddress } = scripts.treasuryScript;
  const { script: vendorScript } = scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(
    vendorScript.Script.hash(),
  );
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");
  const thirty_six_hours = 36 * 60 * 60 * 1000; // 36 hours in milliseconds
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()))
    .setValidUntil(blaze.provider.unixToSlot(now.valueOf() + thirty_six_hours))
    .addInput(input, Data.serialize(VendorSpendRedeemer, "Modify"));
  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  tx = tx.lockAssets(
    treasuryScriptAddress,
    input.output().amount(),
    Data.Void(),
  );

  return tx;
}
