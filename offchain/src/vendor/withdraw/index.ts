import {
  Address,
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  Hash28ByteBase16,
  PlutusData,
  Script,
  toHex,
  TransactionUnspentOutput,
  Value,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  Value as SdkValue,
  TxBuilder,
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
  rewardAccountFromScript,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IWithdrawArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  inputs: TransactionUnspentOutput[];
  destination?: Address;
  destinations?: { address: Address; amount: Value }[];
  signers: Ed25519KeyHashHex[];
  additionalScripts?: {
    script: Script | Hash28ByteBase16;
    redeemer: PlutusData;
  }[];
  metadata?: ITransactionMetadata<IWithdraw | IComplete>;
}

export async function withdraw<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  inputs,
  destination,
  destinations,
  signers,
  additionalScripts,
  metadata,
}: IWithdrawArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress } = scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()));

  if (!!additionalScripts) {
    for (const { script, redeemer } of additionalScripts) {
      const refInput = await blaze.provider.resolveScriptRef(script);
      if (refInput) {
        tx.addReferenceInput(refInput!).addWithdrawal(
          rewardAccountFromScript(
            refInput.output().scriptRef()!,
            blaze.provider.network,
          ),
          0n,
          redeemer,
        );
      } else {
        throw new Error(
          `Could not find one of the additional scripts provided on-chain: ${script instanceof Script ? script.hash() : script}. Please publish the script and try again.`,
        );
      }
    }
  }

  if (!scripts.vendorScript.scriptRef) {
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
    tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx.addRequiredSigner(signer);
  }

  let totalValue = SdkValue.zero();
  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx];
    const oldDatum = input.output().datum()?.asInlineData();
    tx.addInput(input, Data.serialize(VendorSpendRedeemer, "Withdraw"));

    if (oldDatum !== undefined) {
      const datum = Data.parse(VendorDatum, oldDatum);
      const newDatum: VendorDatum = {
        vendor: datum.vendor,
        payouts: [],
      };
      let thisValue = SdkValue.zero();
      for (const payout of datum.payouts) {
        if (
          payout.status === "Active" &&
          payout.maturation < BigInt(now.valueOf())
        ) {
          thisValue = SdkValue.merge(
            thisValue,
            contractsValueToCoreValue(payout.value),
          );
        } else {
          newDatum.payouts.push(payout);
        }
      }
      const remainder = SdkValue.merge(
        input.output().amount(),
        SdkValue.negate(thisValue),
      );
      if (newDatum.payouts.length > 0 || !SdkValue.empty(remainder)) {
        tx.lockAssets(
          scriptAddress,
          remainder,
          Data.serialize(VendorDatum, newDatum),
        );
      }
      totalValue = SdkValue.merge(totalValue, thisValue);
    }
  }

  if (destination) {
    tx.payAssets(destination, totalValue);
  } else if (destinations) {
    for (const { address, amount } of destinations) {
      tx.payAssets(address, amount);
    }
  } else if (!tx.outputsCount) {
    for (const input of inputs) {
      tx.addOutput(input.output());
    }
  }

  return tx;
}
