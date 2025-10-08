import {
  Address,
  AssetId,
  Datum,
  Ed25519KeyHashHex,
  PlutusData,
  Script,
  Slot,
  toHex,
  TransactionUnspentOutput,
  Value,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import {
  TxBuilder,
  type Blaze,
  type Provider,
  type Wallet,
} from "@blaze-cardano/sdk";
import * as Tx from "@blaze-cardano/tx";

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
  input: TransactionUnspentOutput;
  recipient: Address;
  amount: Value;
  datum?: Datum;
  signers: Ed25519KeyHashHex[];
  additionalScripts?: { script: Script; redeemer: PlutusData }[];
  after?: boolean;
}

export async function disburse<P extends Provider, W extends Wallet>({
  configsOrScripts,
  blaze,
  input,
  recipient,
  amount,
  datum = undefined,
  signers,
  additionalScripts,
  after = false,
}: IDisburseArgs<P, W>): Promise<TxBuilder> {
  console.log("Disburse transaction started");
  const { configs, scripts } = loadConfigsAndScripts(blaze, configsOrScripts);
  const { script: treasuryScript, scriptAddress: treasuryScriptAddress } =
    scripts.treasuryScript;
  const registryInput = await blaze.provider.getUnspentOutputByNFT(
    AssetId(configs.treasury.registry_token + toHex(Buffer.from("REGISTRY"))),
  );

  const refInput = await blaze.provider.resolveScriptRef(
    treasuryScript.Script.hash(),
  );
  if (!refInput)
    throw new Error("Could not find treasury script reference on-chain");
  let tx = blaze
    .newTransaction()
    .addReferenceInput(registryInput)
    .addReferenceInput(refInput);

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

  if (after) {
    tx = tx.setValidFrom(Slot(Number(configs.treasury.expiration / 1000n) + 1));
  } else {
    tx = tx.setValidUntil(
      Slot(Number(configs.treasury.expiration / 1000n) - 1),
    );
  }

  for (const signer of signers) {
    tx = tx.addRequiredSigner(signer);
  }

  tx = tx.addInput(
    input,
    Data.serialize(TreasurySpendRedeemer, {
      Disburse: {
        amount: coreValueToContractsValue(amount),
      },
    }),
  );

  if (datum) {
    tx.lockAssets(recipient, amount, datum);
  } else {
    tx.payAssets(recipient, amount);
  }

  const remainder = Tx.Value.merge(
    input.output().amount(),
    Tx.Value.negate(amount),
  );
  if (!Tx.Value.empty(remainder)) {
    tx.lockAssets(treasuryScriptAddress, remainder, Data.Void());
  }

  return tx;
}
