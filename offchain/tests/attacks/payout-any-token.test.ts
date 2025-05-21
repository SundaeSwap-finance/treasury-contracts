import { beforeEach, describe, test } from 'bun:test';
import { Core, makeValue } from '@blaze-cardano/sdk';
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from '@blaze-cardano/core';
import { Emulator } from '@blaze-cardano/emulator';
import * as Tx from '@blaze-cardano/tx';
import * as Data from '@blaze-cardano/data';
import {
  Funder,
  fund_key,
  registryToken,
  reorganize_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
} from '../utilities.test';
import {
  coreValueToContractsValue as translateValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
  coreValueToContractsValue,
} from '../../shared';
import {
  MultisigScript,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
  VendorVendorSpend,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from '../../types/contracts';
import { fund } from '../../treasury/fund';

describe('When funding', () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let vendorScript: VendorVendorSpend;
  let treasuryScriptAddress: Address;
  let vendorScriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig
    );
    configs = { treasury: treasuryConfig, vendor: vendorConfig };
    rewardAccount = treasuryScriptManifest.rewardAccount;
    treasuryScript = treasuryScriptManifest.script;
    vendorScript = vendorScriptManifest.script;
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await reorganize_key(emulator),
      },
    };

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 0n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(500_000_000_000n, ['c'.repeat(56), 100n])
      )
    );
    scriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(scriptInput);

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 1n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(100_000_000_000n)
      )
    );
    secondScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 2n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(500_000n, ['a'.repeat(56), 1n]) // Below minUTxO to test equals_plus_min_ada
      )
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    thirdScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(thirdScriptInput);

    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 2n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(50_000_000n, ['b'.repeat(56), 100n]) // Below minUTxO to test equals_plus_min_ada
      )
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    fourthScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(fourthScriptInput);

    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName))
    )!;

    refInput = emulator.lookupScript(treasuryScript.Script);
  });

  describe('the treasury oversight committee', () => {
    describe('before the expiration', async () => {
      test('can fund a new project', async () => {
        await emulator.as(Funder, async (blaze) => {
          const payoutVal = makeValue(10_000_000_000n, ['c'.repeat(56), 100n]);

          const dat: VendorDatum = {
            vendor: vendor,
            payouts: [
              {
                maturation: 1000n,
                value: coreValueToContractsValue(payoutVal),
                status: 'Active',
              },
            ],
          };

          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .setValidUntil(
                Slot(Number(configs.treasury.expiration / 1000n) - 1)
              )
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, {
                  Fund: {
                    amount: coreValueToContractsValue(payoutVal),
                  },
                })
              )
              .lockAssets(
                vendorScriptAddress,
                payoutVal,
                Data.serialize(VendorDatum, dat)
              )
              .lockAssets(
                treasuryScriptAddress,
                Tx.Value.merge(
                  scriptInput.output().amount(),
                  Tx.Value.negate(payoutVal)
                ),
                Data.Void()
              )
          );
        });
      });
    });
  });
});
