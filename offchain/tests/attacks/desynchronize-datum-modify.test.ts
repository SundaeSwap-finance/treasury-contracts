import { beforeEach, describe, test } from 'bun:test';
import { Core, Value, makeValue } from '@blaze-cardano/sdk';
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  Transaction,
  TransactionId,
  TransactionInput,
  TransactionUnspentOutput,
} from '@blaze-cardano/core';
import { Emulator } from '@blaze-cardano/emulator';
import * as Data from '@blaze-cardano/data';
import {
  Modifier,
  modify_key,
  pause_key,
  Pauser,
  registryToken,
  resume_key,
  Resumer,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from '../utilities.test';
import {
  loadTreasuryScript,
  loadVendorScript,
  coreValueToContractsValue,
  slot_to_unix,
  unix_to_slot,
} from '../../shared';
import {
  MultisigScript,
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from '../../types/contracts';
import { withdraw } from '../../vendor/withdraw';
import { adjudicate } from '../../vendor/adjudicate';
import { cancel, modify } from '../../vendor/modify';

describe('', () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let firstDatum: VendorDatum;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let secondDatum: VendorDatum;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let thirdDatum: VendorDatum;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let fourthDatum: VendorDatum;
  let fifthScriptInput: Core.TransactionUnspentOutput;
  let fifthDatum: VendorDatum;
  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let modifySigner: Ed25519KeyHashHex;
  let vendorSigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScript: VendorVendorSpend;
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
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    modifySigner = Ed25519KeyHashHex(await modify_key(emulator));
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 0n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(35_000_000n, ['a'.repeat(56), 1n])
      )
    );
    firstDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: 'Active',
        },
        {
          maturation: 2000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: 'Active',
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(
            makeValue(15_000_000n, ['a'.repeat(56), 1n])
          ),
          status: 'Active',
        },
      ],
    };
    scriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, firstDatum))
      );
    emulator.addUtxo(scriptInput);

    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName))
    )!;

    refInput = emulator.lookupScript(vendorScript.Script);
  });

  describe('the oversight committee', () => {
    describe('can modify', () => {
      test('with the vendors permission', async () => {
        let signedTx: Transaction;

        await emulator.as(Modifier, async (blaze) => {
          const { scriptAddress: treasuryScriptAddress } = loadTreasuryScript(
            blaze.provider.network,
            configs.treasury
          );

          const now = new Date(Number(slot_to_unix(Slot(3))));

          emulator.stepForwardToSlot(3);

          const newDatum: VendorDatum = {
            vendor: vendor,
            payouts: [
              {
                maturation: 1000n,
                value: coreValueToContractsValue(makeValue(10_000_000n)),
                status: 'Active',
              },
              {
                maturation: 2000n,
                value: coreValueToContractsValue(makeValue(10_000_000n)),
                status: 'Paused',
              },
              {
                maturation: 10000n,
                value: coreValueToContractsValue(
                  makeValue(5_000_000n, ['a'.repeat(56), 1n])
                ),
                status: 'Active',
              },
            ],
          };

          const tx = blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
            .setValidUntil(
              unix_to_slot(BigInt(now.valueOf()) + 36n * 60n * 60n * 1000n)
            )
            .addInput(
              scriptInput,
              Data.serialize(VendorSpendRedeemer, 'Modify')
            )
            .addRequiredSigner(modifySigner)
            .addRequiredSigner(vendorSigner)
            .lockAssets(
              vendorScriptAddress,
              makeValue(25_000_000n),
              Data.serialize(VendorDatum, newDatum)
            )
            .lockAssets(
              treasuryScriptAddress,
              makeValue(10_000_000n, ['a'.repeat(56), 1n]),
              Data.Void()
            );

          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
    });
  });
});
