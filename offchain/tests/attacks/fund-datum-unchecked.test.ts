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
  modify_key,
  pause_key,
  registryToken,
  reorganize_key,
  resume_key,
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
  loadScripts,
} from '../../shared';
import {
  MultisigScript,
  ScriptHashRegistry,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
  VendorVendorSpend,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from '../../types/contracts';
import { fund } from '../../treasury/fund';

const vendorConfigNew = async (emulator: Emulator) => {
  const [policyId, _] = registryToken();
  return {
    registry_token: policyId,
    expiration: slot_to_unix(Slot(2)),
    permissions: {
      pause: {
        Signature: {
          key_hash: await pause_key(emulator),
        },
      },
      resume: {
        Signature: {
          key_hash: await resume_key(emulator),
        },
      },
      modify: {
        Signature: {
          key_hash: await modify_key(emulator),
        },
      },
    },
  };
};

export async function setupEmulatorNew(txOuts: Core.TransactionOutput[] = []) {
  // TODO: custom protocol parameters needed for plutus v3?
  const protocolParameters = {
    coinsPerUtxoByte: 4310,
    minFeeReferenceScripts: { base: 15, range: 25600, multiplier: 1.2 },
    maxTxSize: 16384,
    minFeeCoefficient: 44,
    minFeeConstant: 155381,
    maxBlockBodySize: 90112,
    maxBlockHeaderSize: 1100,
    stakeKeyDeposit: 2e6,
    poolDeposit: 5e8,
    poolRetirementEpochBound: 18,
    desiredNumberOfPools: 500,
    poolInfluence: '3/10',
    monetaryExpansion: '3/1000',
    treasuryExpansion: '1/5',
    minPoolCost: 17e7,
    protocolVersion: { major: 9, minor: 0 },
    maxValueSize: 5e3,
    collateralPercentage: 150,
    maxCollateralInputs: 3,
    costModels: /* @__PURE__ */ new Map()
      .set(
        0,
        [
          100788, 420, 1, 1, 1e3, 173, 0, 1, 1e3, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16e3, 100, 16e3, 100, 16e3, 100, 16e3, 100, 16e3,
          100, 16e3, 100, 100, 100, 16e3, 100, 94375, 32, 132994, 32, 61462, 4,
          72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0,
          1, 1, 1e3, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775,
          558, 1, 39184, 1e3, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049,
          1, 13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1,
          44749, 541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32,
          11546, 32, 85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32,
          85848, 228465, 122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 270652,
          22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420,
          1, 1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933,
          32, 24623, 32, 53384111, 14333, 10,
        ]
      )
      .set(
        1,
        [
          100788, 420, 1, 1, 1e3, 173, 0, 1, 1e3, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16e3, 100, 16e3, 100, 16e3, 100, 16e3, 100, 16e3,
          100, 16e3, 100, 100, 100, 16e3, 100, 94375, 32, 132994, 32, 61462, 4,
          72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0,
          1, 1, 1e3, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775,
          558, 1, 39184, 1e3, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049,
          1, 13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1,
          44749, 541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32,
          11546, 32, 85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32,
          85848, 228465, 122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 955506,
          213312, 0, 2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0,
          141992, 32, 100788, 420, 1, 1, 81663, 32, 59498, 32, 20142, 32, 24588,
          32, 20744, 32, 25933, 32, 24623, 32, 43053543, 10, 53384111, 14333,
          10, 43574283, 26308, 10,
        ]
      )
      .set(
        2,
        [
          100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100,
          16000, 100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32,
          61462, 4, 72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848,
          123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1, 1000, 42921, 4, 2,
          24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558, 1, 39184, 1000,
          60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1, 13169, 4, 22100,
          10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749, 541, 1, 33852,
          32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32, 85848,
          123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 90434, 519, 0, 1,
          74433, 32, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1,
          85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 955506, 213312,
          0, 2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32,
          100788, 420, 1, 1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744,
          32, 25933, 32, 24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283,
          26308, 10, 16000, 100, 16000, 100, 962335, 18, 2780678, 6, 442008, 1,
          52538055, 3756, 18, 267929, 18, 76433006, 8868, 18, 52948122, 18,
          1995836, 36, 3227919, 12, 901022, 1, 166917843, 4307, 36, 284546, 36,
          158221314, 26549, 36, 74698472, 36, 333849714, 1, 254006273, 72,
          2174038, 72, 2261318, 64571, 4, 207616, 8310, 4, 1293828, 28716, 63,
          0, 1, 1006041, 43623, 251, 0, 1,
        ]
      ),
    prices: { memory: 577 / 1e4, steps: 721e-7 },
    maxExecutionUnitsPerTransaction: { memory: 14e6, steps: 1e10 },
    maxExecutionUnitsPerBlock: { memory: 62e6, steps: 2e10 },
  };

  const emulator = new Emulator(txOuts, protocolParameters);

  const { treasuryScript, vendorScript } = loadScripts(
    Core.NetworkId.Testnet,
    await sampleTreasuryConfig(emulator),
    await vendorConfigNew(emulator)
  );

  const [registryPolicy, registryName] = registryToken();
  await emulator.register(
    'Registry',
    makeValue(5_000_000n, [registryPolicy + registryName, 1n]),
    Data.serialize(ScriptHashRegistry, {
      treasury: {
        Script: [treasuryScript.credential.hash],
      },
      vendor: {
        Script: [vendorScript.credential.hash],
      },
    })
  );

  await emulator.publishScript(treasuryScript.script.Script);
  await emulator.publishScript(vendorScript.script.Script);
  await emulator.register('MaliciousUser');
  await emulator.register(
    'Anyone',
    makeValue(5_000_000n, ['a'.repeat(56), 1n])
  );
  await emulator.fund('Anyone', makeValue(1000_000_000n));

  return emulator;
}

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
    emulator = await setupEmulatorNew();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await vendorConfigNew(emulator);

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
                maturation: configs.vendor.expiration + 1n,
                value: coreValueToContractsValue(payoutVal),
                status: 'Active',
              },
            ],
          };

          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .setValidUntil(Slot(1))
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
