import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  PlutusData,
  Script,
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

import {
  PayoutStatus,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../generated-types/contracts.js";
import {
  toTxMetadata,
  type ITransactionMetadata,
} from "../../metadata/shared.js";
import type { IPause, IResume } from "../../metadata/types/adjudicate.js";
import {
  loadConfigsAndScripts,
  rewardAccountFromScript,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IAdjudicateArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  now: Date;
  input: TransactionUnspentOutput;
  statuses: PayoutStatus[];
  signers: Ed25519KeyHashHex[];
  additionalScripts?: { script: Script; redeemer: PlutusData }[];
  metadata?: ITransactionMetadata<IPause | IResume>;
}

export async function adjudicate<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  now,
  input,
  statuses,
  signers,
  additionalScripts,
  metadata,
}: IAdjudicateArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
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

  // TODO: switch based on network? on preview we can only project 12 hours in the future
  const thirty_six_hours = 12 * 60 * 60 * 1000; // 36 hours in milliseconds
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(blaze.provider.unixToSlot(now.valueOf()))
    .setValidUntil(
      blaze.provider.unixToSlot(now.valueOf() + thirty_six_hours - 1000),
    )
    .addInput(
      input,
      Data.serialize(VendorSpendRedeemer, {
        Adjudicate: {
          statuses,
        },
      }),
    );

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

  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toTxMetadata(metadata));

    tx = tx.setAuxiliaryData(auxData);
  }
  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  const oldDatum = Data.parse(
    VendorDatum,
    input.output().datum()!.asInlineData()!,
  );
  if (statuses.length !== oldDatum.payouts.length) {
    throw new Error("not enough statuses");
  }
  const newDatum: VendorDatum = {
    vendor: oldDatum.vendor,
    payouts: oldDatum.payouts.map((p, idx) => {
      return {
        maturation: p.maturation,
        value: p.value,
        status: statuses[idx],
      };
    }),
  };

  tx = tx.lockAssets(
    vendorScriptAddress,
    input.output().amount(),
    Data.serialize(VendorDatum, newDatum),
  );

  return tx;
}
