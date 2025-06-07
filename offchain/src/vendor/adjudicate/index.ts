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
import { IPause, IResume } from "src/metadata/adjudicate";
import { ITransactionMetadata, toMetadata } from "src/metadata/shared";
import { loadVendorScript, unix_to_slot } from "../../shared";
import {
  PayoutStatus,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../types/contracts";

export async function adjudicate<P extends Provider, W extends Wallet>(
  config: VendorConfiguration,
  blaze: Blaze<P, W>,
  now: Date,
  input: TransactionUnspentOutput,
  statuses: PayoutStatus[],
  signers: Ed25519KeyHashHex[],
  metadata: ITransactionMetadata<IPause | IResume>,
): Promise<TxBuilder> {
  const { scriptAddress: vendorScriptAddress, script: vendorScript } =
    loadVendorScript(blaze.provider.network, config);
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(vendorScript.Script);
  if (!refInput)
    throw new Error("Could not find vendor script reference on-chain");

  const auxData = new AuxiliaryData();
  auxData.setMetadata(toMetadata(metadata));

  const thirty_six_hours = 36 * 60 * 60 * 1000; // 36 hours in milliseconds
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput)
    .setValidFrom(unix_to_slot(blaze.provider.network, now.valueOf()))
    .setValidUntil(
      unix_to_slot(blaze.provider.network, now.valueOf() + thirty_six_hours),
    )
    .addInput(
      input,
      Data.serialize(VendorSpendRedeemer, {
        Adjudicate: {
          statuses,
        },
      }),
    )
    .setAuxiliaryData(auxData);
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
