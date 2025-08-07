import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  toHex,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";

import { VendorSpendRedeemer } from "../../generated-types/contracts.js";
import { ITransactionMetadata, toTxMetadata } from "../../metadata/shared.js";
import { IComplete } from "../../metadata/types/complete.js";
import {
  loadConfigsAndScripts,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface ICompleteArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  inputs: TransactionUnspentOutput[];
  signers: Ed25519KeyHashHex[];
  metadata?: ITransactionMetadata<IComplete>;
}

export async function complete<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  inputs,
  signers,
  metadata,
}: ICompleteArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { script } = scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const refInput = await blaze.provider.resolveScriptRef(script.Script.hash());
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");

  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()));
  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toTxMetadata(metadata));
    tx = tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx];
    tx = tx.addInput(input, Data.serialize(VendorSpendRedeemer, "Withdraw"));
    tx = tx.addOutput(input.output());
  }

  return tx;
}
