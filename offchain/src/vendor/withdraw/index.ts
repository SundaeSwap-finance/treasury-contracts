import {
  TxBuilder,
  Value,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  toHex,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  contractsValueToCoreValue,
  loadVendorScript,
  unix_to_slot,
} from "../../shared";
import {
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../types/contracts";

export async function withdraw<P extends Provider, W extends Wallet>(
  config: VendorConfiguration,
  blaze: Blaze<P, W>,
  now: Date,
  inputs: TransactionUnspentOutput[],
  destination: Address,
  signers: Ed25519KeyHashHex[],
): Promise<TxBuilder> {
  const { script, scriptAddress } = loadVendorScript(
    blaze.provider.network,
    config,
  );
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const refInput = await blaze.provider.resolveScriptRef(script.Script);
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(unix_to_slot(BigInt(now.valueOf())));

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  let totalValue = Value.zero();
  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx];
    const datum = Data.parse(
      VendorDatum,
      input.output().datum()?.asInlineData(),
    );
    tx = tx.addInput(input, Data.serialize(VendorSpendRedeemer, "Withdraw"));
    const newDatum: VendorDatum = {
      vendor: datum.vendor,
      payouts: [],
    };
    let thisValue = Value.zero();
    for (const payout of datum.payouts) {
      if (
        payout.status === "Active" &&
        payout.maturation < BigInt(now.valueOf())
      ) {
        thisValue = Value.merge(
          thisValue,
          contractsValueToCoreValue(payout.value),
        );
      } else {
        newDatum.payouts.push(payout);
      }
    }
    const remainder = Value.merge(
      input.output().amount(),
      Value.negate(thisValue),
    );
    if (newDatum.payouts.length > 0 || !Value.empty(remainder)) {
      tx = tx.lockAssets(
        scriptAddress,
        remainder,
        Data.serialize(VendorDatum, newDatum),
      );
    }
    totalValue = Value.merge(totalValue, thisValue);
  }

  tx = tx.payAssets(destination, totalValue);

  return tx;
}
