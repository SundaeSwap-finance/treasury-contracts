import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  toHex,
  TransactionUnspentOutput,
  Value,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  makeValue,
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import * as Tx from "@blaze-cardano/tx";
import { bigIntReplacer } from "cli/shared";
import type { IFund } from "../../../src/metadata/fund";
import {
  toMetadata,
  type ITransactionMetadata,
} from "../../../src/metadata/shared";
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  unix_to_slot,
} from "../../shared";
import {
  MultisigScript,
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
} from "../../types/contracts";

export async function fund<P extends Provider, W extends Wallet>(
  configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration },
  blaze: Blaze<P, W>,
  input: TransactionUnspentOutput,
  vendor: MultisigScript,
  schedule: { date: Date; amount: Value }[],
  signers: Ed25519KeyHashHex[],
  metadata?: ITransactionMetadata<IFund>,
): Promise<TxBuilder> {
  const { scriptAddress: vendorScriptAddress } = loadVendorScript(
    blaze.provider.network,
    configs.vendor,
  );
  const { script: treasuryScript, scriptAddress: treasuryScriptAddress } =
    loadTreasuryScript(blaze.provider.network, configs.treasury);
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );
  const refInput = await blaze.provider.resolveScriptRef(treasuryScript.Script);
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");

  // expiration can be far into the future, so we set a max of 3 days
  // to avoid the transaction being rejected for being "PastHorizon".
  let tx = blaze
    .newTransaction()
    .setValidUntil(
      unix_to_slot(
        blaze.provider.network,
        Math.min(
          Date.now().valueOf() + 1 * 60 * 60 * 1000, // 36 hours in milliseconds
          Number(configs.treasury.expiration) - 1,
        ),
      ),
    )
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput);

  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toMetadata(metadata));
    tx = tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  const totalPayout = schedule.reduce(
    (acc, s) => Tx.Value.merge(acc, s.amount),
    makeValue(0n),
  );

  tx = tx.addInput(
    input,
    Data.serialize(TreasurySpendRedeemer, {
      Fund: {
        amount: coreValueToContractsValue(totalPayout),
      },
    }),
  );

  const datum: VendorDatum = {
    vendor,
    payouts: schedule.map((s) => {
      return {
        maturation: BigInt(s.date.valueOf()),
        value: coreValueToContractsValue(s.amount),
        status: "Active",
      };
    }),
  };

  tx.lockAssets(
    vendorScriptAddress,
    totalPayout,
    Data.serialize(VendorDatum, datum),
  );

  const remainder = Tx.Value.merge(
    input.output().amount(),
    Tx.Value.negate(totalPayout),
  );
  if (!Tx.Value.empty(remainder)) {
    tx.lockAssets(treasuryScriptAddress, remainder, Data.Void());
  }

  return tx;
}
