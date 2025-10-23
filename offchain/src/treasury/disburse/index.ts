import {
  Address,
  AssetId,
  AuxiliaryData,
  Datum,
  Ed25519KeyHashHex,
  NetworkId,
  PlutusData,
  Script,
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

import { ITransactionMetadata, toTxMetadata } from "../../metadata/shared.js";
import { IDisburse } from "../../metadata/types/disburse.js";

import { TreasurySpendRedeemer } from "../../generated-types/contracts.js";
import {
  coreValueToContractsValue,
  loadConfigsAndScripts,
  rewardAccountFromScript,
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IDisburseArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  input: TransactionUnspentOutput | TransactionUnspentOutput[];
  recipients: { address: Address; amount: Value }[];
  datum?: Datum;
  signers: Ed25519KeyHashHex[];
  validFromSlot?: number;
  validUntilSlot?: number;
  metadata?: ITransactionMetadata<IDisburse>;
  additionalScripts?: { script: Script; redeemer: PlutusData }[];
  after?: boolean;
}

export async function disburse<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  input,
  recipients,
  datum = undefined,
  signers,
  validFromSlot,
  validUntilSlot,
  metadata,
  additionalScripts,
  after = false,
}: IDisburseArgs<P, W>): Promise<TxBuilder> {
  console.log("Disburse transaction started");
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { scriptAddress: treasuryScriptAddress } = scripts.treasuryScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  let tx = blaze.newTransaction().addReferenceInput(registryInput);

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


  if (!!additionalScripts) {
    for (const { script, redeemer } of additionalScripts) {
      const refInput = await blaze.provider.resolveScriptRef(script);
      tx
        .addReferenceInput(refInput!)
        .addWithdrawal(
          rewardAccountFromScript(script, blaze.provider.network),
          0n,
          redeemer,
        );
    }
  }
    
  // todo: double check if the one shot script needs to be provided
  if (after) {
    tx.setValidFrom(Slot(Number(configs.treasury.expiration / 1000n) + 1));
  } else if (validFromSlot) {
    tx.setValidFrom(Slot(validFromSlot));
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

  if (metadata) {
    const auxData = new AuxiliaryData();
    auxData.setMetadata(toTxMetadata(metadata));
    tx = tx.setAuxiliaryData(auxData);
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  for (const { address, amount } of recipients) {
    if (datum) {
      tx.lockAssets(address, amount, datum);
    } else {
      tx.payAssets(address, amount);
    }
  }

  const disbursedAmount = recipients.reduce(
    (acc, r) => Tx.Value.merge(acc, r.amount),
    makeValue(0n),
  );

  const inputAmount = Array.isArray(input)
    ? input.reduce(
        (acc, r) => Tx.Value.merge(acc, r.output().amount()),
        makeValue(0n),
      )
    : input.output().amount();

  for (const inp of Array.isArray(input) ? input : [input]) {
    tx = tx.addInput(
      inp,
      Data.serialize(TreasurySpendRedeemer, {
        Disburse: {
          amount: coreValueToContractsValue(disbursedAmount),
        },
      }),
    );
  }

  const remainder = Tx.Value.merge(
    inputAmount,
    Tx.Value.negate(disbursedAmount),
  );
  if (!Tx.Value.empty(remainder)) {
    tx.lockAssets(treasuryScriptAddress, remainder, Data.Void());
  }
  console.log("Disburse transaction built");
  return tx;
}
