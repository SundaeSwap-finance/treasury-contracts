import {
  AssetId,
  AuxiliaryData,
  Ed25519KeyHashHex,
  NetworkId,
  Slot,
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

import {
  MultisigScript,
  TreasurySpendRedeemer,
  VendorDatum,
} from "../../generated-types/contracts.js";
import { ITransactionMetadata, toTxMetadata } from "../../metadata/shared.js";
import { IFund } from "../../metadata/types/fund.js";
import {
  coreValueToContractsValue,
  loadConfigsAndScripts,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IFundArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  validFromSlot?: number;
  validUntilSlot?: number;
  blaze: Blaze<P, W>;
  input: TransactionUnspentOutput;
  vendor: MultisigScript;
  schedule: { date: Date; amount: Value }[];
  signers: Ed25519KeyHashHex[];
  metadata?: ITransactionMetadata<IFund>;
}

export async function fund<P extends Provider, W extends Wallet>({
  blaze,
  configsOrScripts,
  input,
  schedule,
  signers,
  metadata,
  vendor,
  validFromSlot,
  validUntilSlot,
}: IFundArgs<P, W>): Promise<TxBuilder> {
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const tx = blaze.newTransaction().addReferenceInput(registryInput);

  if (validFromSlot) {
    tx.setValidFrom(Slot(validFromSlot));
  } else {
    tx.setValidFrom(Slot(blaze.provider.unixToSlot(Date.now())));
  }

  if (validUntilSlot) {
    tx.setValidUntil(Slot(validUntilSlot));
  } else {
    const start = validFromSlot
      ? blaze.provider.slotToUnix(validFromSlot)
      : Date.now();
    const maxHorizon = blaze.provider.network === NetworkId.Testnet ? 6 : 36;
    const upperBoundUnix = Math.min(
      Number(configs.treasury.expiration),
      start + maxHorizon * 60 * 60 * 1000,
    );

    const upperBoundSlot = blaze.provider.unixToSlot(upperBoundUnix) - 30;
    tx.setValidUntil(Slot(upperBoundSlot));
  }

  if (!scripts.treasuryScript.scriptRef) {
    scripts.treasuryScript.scriptRef = await blaze.provider.resolveScriptRef(
      scripts.treasuryScript.script.Script,
    );
  }
  if (scripts.treasuryScript.scriptRef) {
    tx.addReferenceInput(scripts.treasuryScript.scriptRef);
  } else {
    tx.provideScript(scripts.treasuryScript.script.Script);
  }

  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toTxMetadata(metadata));
    tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx.addRequiredSigner(signer);
  }

  const totalPayout = schedule.reduce(
    (acc, s) => Tx.Value.merge(acc, s.amount),
    makeValue(0n),
  );

  tx.addInput(
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
    scripts.vendorScript.scriptAddress,
    totalPayout,
    Data.serialize(VendorDatum, datum),
  );

  const remainder = Tx.Value.merge(
    input.output().amount(),
    Tx.Value.negate(totalPayout),
  );
  if (!Tx.Value.empty(remainder)) {
    tx.lockAssets(scripts.treasuryScript.scriptAddress, remainder, Data.Void());
  }

  return tx;
}
