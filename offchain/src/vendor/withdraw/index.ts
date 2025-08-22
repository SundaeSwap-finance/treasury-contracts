import {
  Address,
  AssetId,
  AuxiliaryData,
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
  VendorDatum,
  VendorSpendRedeemer,
} from "../../generated-types/contracts.js";
import { ITransactionMetadata, toTxMetadata } from "../../metadata/shared.js";
import { IComplete } from "../../metadata/types/complete.js";
import { IWithdraw } from "../../metadata/types/withdraw.js";
import {
  contractsValueToCoreValue,
  loadConfigsAndScripts,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IWithdrawArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  inputs: TransactionUnspentOutput[];
  destination?: Address;
  signers: Ed25519KeyHashHex[];
  metadata?: ITransactionMetadata<IWithdraw | IComplete>;
}

export async function withdraw<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  inputs,
  destination,
  signers,
  metadata,
}: IWithdrawArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress, scriptRef } = scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()));

  if (!scriptRef) {
    scripts.vendorScript.scriptRef = await blaze.provider.resolveScriptRef(
      scripts.vendorScript.script.Script,
    );
  }
  if (scripts.vendorScript.scriptRef) {
    tx.addReferenceInput(scripts.vendorScript.scriptRef);
  } else {
    tx.provideScript(scripts.vendorScript.script.Script);
  }

  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toTxMetadata(metadata));
    tx = tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  if (destination) {
    let totalValue = Value.zero();
    for (let idx = 0; idx < inputs.length; idx++) {
      const input = inputs[idx];
      const oldDatum = input.output().datum()?.asInlineData();
      if (oldDatum !== undefined) {
        const datum = Data.parse(VendorDatum, oldDatum);
        tx = tx.addInput(
          input,
          Data.serialize(VendorSpendRedeemer, "Withdraw"),
        );
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
    }

    tx = tx.payAssets(destination, totalValue);
  } else {
    for (let idx = 0; idx < inputs.length; idx++) {
      const input = inputs[idx];
      tx.addInput(input, Data.serialize(VendorSpendRedeemer, "Withdraw"));
      tx.addOutput(input.output());
    }
  }

  return tx;
}
