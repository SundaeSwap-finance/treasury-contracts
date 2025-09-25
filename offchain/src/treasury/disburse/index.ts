import {
  Address,
  AssetId,
  AuxiliaryData,
  Datum,
  Ed25519KeyHashHex,
  NetworkId,
  Slot,
  toHex,
  TransactionUnspentOutput,
  Value
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
  TConfigsOrScripts,
} from "../../shared/index.js";

export interface IDisburseArgs<P extends Provider, W extends Wallet> {
  configsOrScripts: TConfigsOrScripts;
  blaze: Blaze<P, W>;
  input: TransactionUnspentOutput;
  recipients: { address: Address; amount: Value }[];
  datum?: Datum;
  signers: Ed25519KeyHashHex[];
  after?: boolean;
  metadata?: ITransactionMetadata<IDisburse>;
}

export async function disburse<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  input,
  recipients,
  datum = undefined,
  signers,
  after = false,
  metadata,
}: IDisburseArgs<P, W>): Promise<TxBuilder> {
  console.log("Disburse transaction started");
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { script: treasuryScript, scriptAddress: treasuryScriptAddress } =
    scripts.treasuryScript;
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

  // todo: probably clean this up, and have it match fund's way of handling validity
  if (after) {
    tx = tx.setValidFrom(
      Slot(Number(configs.treasury.expiration) / 1000 + 1),
    );
  } else {
    // tx = tx.setValidUntil(
    //   Slot(Number(configs.treasury.expiration) / 1000 - 1),
    // );
    const start = Date.now();
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

  tx = tx.addInput(
    input,
    Data.serialize(TreasurySpendRedeemer, {
      Disburse: {
        amount: coreValueToContractsValue(disbursedAmount),
      },
    }),
  );

  const remainder = Tx.Value.merge(
    input.output().amount(),
    Tx.Value.negate(disbursedAmount),
  );
  if (!Tx.Value.empty(remainder)) {
    tx.lockAssets(treasuryScriptAddress, remainder, Data.Void());
  }
  console.log("Disburse transaction built");
  return tx;
}
