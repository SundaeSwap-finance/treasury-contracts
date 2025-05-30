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
import {
  contractsValueToCoreValue,
  loadTreasuryScript,
  loadVendorScript,
  unix_to_slot,
} from "../../shared";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../types/contracts";

export async function sweep<P extends Provider, W extends Wallet>(
  configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration },
  now: Date,
  inputs: TransactionUnspentOutput[],
  treasuryInput: TransactionUnspentOutput,
  blaze: Blaze<P, W>,
): Promise<TxBuilder> {
  const { scriptAddress: treasuryScriptAddress, script: treasuryScript } = loadTreasuryScript(
    blaze.provider.network,
    configs.treasury,
  );
  const { scriptAddress: vendorScriptAddress, script: vendorScript } =
    loadVendorScript(blaze.provider.network, configs.vendor);
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(vendorScript.Script);
  const treasuryRefInput = await blaze.provider.resolveScriptRef(treasuryScript.Script);
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");
  if (!treasuryRefInput)
    throw new Error("Could not find treasury script reference on-chain");
  let thirtSixHours = 36n * 60n * 60n * 1000n;
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .addReferenceInput(treasuryRefInput)
    .addInput(treasuryInput, Data.serialize(TreasurySpendRedeemer, "SweepTreasury"))
    // .lockAssets(treasuryScriptAddress, treasuryInput.output().amount(), Data.Void())
    .setDonation(1n)
    .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
    .setValidUntil(unix_to_slot(BigInt(now.valueOf()) + thirtSixHours));

  let value = Value.zero();
  for (const input of inputs) {
    tx = tx.addInput(input, Data.serialize(VendorSpendRedeemer, "SweepVendor"));
    let datum = Data.parse(
      VendorDatum,
      input.output().datum()!.asInlineData()!,
    );
    datum.payouts = datum.payouts.filter(
      (p) => p.maturation < now.valueOf() && p.status === "Active",
    );
    let carryThrough = Value.sum(
      datum.payouts.map((p) => contractsValueToCoreValue(p.value)),
    );
    let remainder = Value.merge(
      input.output().amount(),
      Value.negate(carryThrough),
    );
    if (!Value.empty(carryThrough)) {
      tx.lockAssets(
        vendorScriptAddress,
        carryThrough,
        Data.serialize(VendorDatum, datum),
      );
    }
    value = Value.merge(value, remainder);
  }
  // the offchain calculates value in the same way as the onchain (including the minAda)
  // The value we expect to be sweeping is the single Paused payout
  const expectedValueToClaim = makeValue(0n, ["a".repeat(56), 50n])

  if (!Value.empty(value)) {
    tx = tx.lockAssets(treasuryScriptAddress, Value.merge(expectedValueToClaim, treasuryInput.output().amount()), Data.Void());
  }
  return tx;
}
