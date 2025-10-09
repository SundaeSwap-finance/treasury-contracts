import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  Hash28ByteBase16,
  PlutusData,
  Script,
  Slot,
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
  input: TransactionUnspentOutput;
  validFromSlot?: number;
  validUntilSlot?: number;
  now: Date;
  statuses: PayoutStatus[];
  signers: Ed25519KeyHashHex[];
  additionalScripts?: {
    script: Script | Hash28ByteBase16;
    redeemer: PlutusData;
  }[];
  metadata?: ITransactionMetadata<IPause | IResume>;
}

export async function adjudicate<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  input,
  statuses,
  signers,
  additionalScripts,
  metadata,
  validFromSlot,
  validUntilSlot,
  now,
}: IAdjudicateArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress: vendorScriptAddress } = scripts.vendorScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.vendor.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addInput(
      input,
      Data.serialize(VendorSpendRedeemer, {
        Adjudicate: {
          statuses,
        },
      }),
    );

  if (validFromSlot) {
    tx.setValidFrom(Slot(validFromSlot));
  } else {
    tx.setValidFrom(blaze.provider.unixToSlot(now.valueOf()));
  }

  if (validUntilSlot) {
    tx.setValidUntil(Slot(validUntilSlot));
  } else {
    const thirty_six_hours = 12 * 60 * 60 * 1000; // 36 hours in milliseconds
    tx.setValidUntil(
      blaze.provider.unixToSlot(now.valueOf() + thirty_six_hours - 1000),
    );
  }

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

  tx.lockAssets(
    vendorScriptAddress,
    input.output().amount(),
    Data.serialize(VendorDatum, newDatum),
  );

  return tx;
}
