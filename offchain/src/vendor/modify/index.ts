import {
  AssetId,
  Ed25519KeyHashHex,
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
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../generated-types/contracts.js";
import {
  contractsValueToCoreValue,
  loadTreasuryScript,
  loadVendorScript,
} from "../../shared/index.js";

export async function modify<P extends Provider, W extends Wallet>(
  configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration },
  blaze: Blaze<P, W>,
  now: Date,
  input: TransactionUnspentOutput,
  new_vendor: VendorDatum,
  signers: Ed25519KeyHashHex[],
  trace?: boolean,
): Promise<TxBuilder> {
  const { scriptAddress: treasuryScriptAddress } = loadTreasuryScript(
    blaze.provider.network,
    configs.treasury,
    trace,
  );
  const { scriptAddress: vendorScriptAddress, script: vendorScript } =
    loadVendorScript(blaze.provider.network, configs.vendor, trace);
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

export async function cancel<P extends Provider, W extends Wallet>(
  configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration },
  blaze: Blaze<P, W>,
  now: Date,
  input: TransactionUnspentOutput,
  signers: Ed25519KeyHashHex[],
  trace?: boolean,
): Promise<TxBuilder> {
  const { scriptAddress: treasuryScriptAddress } = loadTreasuryScript(
    blaze.provider.network,
    configs.treasury,
    trace,
  );
  const { script: vendorScript } = loadVendorScript(
    blaze.provider.network,
    configs.vendor,
    trace,
  );
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
