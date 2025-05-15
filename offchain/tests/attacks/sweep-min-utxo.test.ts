import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  registryToken,
  reorganize_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  vendor_key,
} from "../utilities.test";
import {
  coreValueToContractsValue as translateValue,
  loadTreasuryScript,
  loadVendorScript,
  coreValueToContractsValue,
  slot_to_unix,
  unix_to_slot,
} from "../../shared";
import {
  MultisigScript,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../types/contracts";
import { sweep_malformed } from "../../vendor/malformed";
import { sweep } from "../../vendor/sweep";

(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 

describe("", () => {
  const amount = 340_000_000_000_000n;
  const thirtSixHours = 36n * 60n * 60n * 1000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let now: Date;

  let fourthScriptInput: Core.TransactionUnspentOutput;
  let fourthDatum: VendorDatum;

  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
  let treasuryScriptAddress: Address;
  let provider: EmulatorProvider;

  const printUtxosAtAddress = async (address:Address) => {
    console.log(JSON.stringify((await provider.getUnspentOutputs(address)).map(u => {
      const out = u.output()
      const amt = out.amount()
      const multi: { [key: string]: any } = {}
      amt.multiasset()?.forEach((v,k) => {
        multi[k] = v
      })

      return { address: out.address().toBech32(), 
              value: {
                  lovelace: amt.coin(),
                  multiasset: multi
                }
              }
    }), null, 2))
  }
  
  beforeEach(async () => {
    emulator = await setupEmulator();
    provider = new EmulatorProvider(emulator);
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
    );
    configs = { treasury: treasuryConfig, vendor: vendorConfig };
    now = new Date(Number(configs.vendor.expiration + 1000n));
    rewardAccount = treasuryScriptManifest.rewardAccount;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };

 
    fourthDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 2000n,
          value: coreValueToContractsValue(
            makeValue(0n, ["a".repeat(56), 50n]),
          ),
          status: "Paused",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(
            makeValue(0n, ["a".repeat(56), 50n]),
          ),
          status: "Active",
        },
      ],
    };
    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 3n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(1_409_370n, ["a".repeat(56), 100n]), // This should be exactly minAda + value to cover payouts
      ),
    );
    fourthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fourthDatum)),
      );
    emulator.addUtxo(fourthScriptInput);
  
    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName)),
    )!;

    refInput = emulator.lookupScript(vendorScript.Script);
  });


  describe("after the expiration", () => {
    beforeEach(() => {
      emulator.stepForwardToSlot(
        unix_to_slot(configs.vendor.expiration + 1000n),
      );
    });
    describe("anyone", () => {
      describe("can sweep", () => {
        test("native tokens to the treasury script", async () => {
          await emulator.as("Anyone", async (blaze, addr) => {
            console.log('Vendor utxos')
            await printUtxosAtAddress(vendorScriptAddress)
            console.log('Treasury utxos')
            await printUtxosAtAddress(treasuryScriptAddress)
            console.log('User utxos')
            await printUtxosAtAddress(addr)
            await emulator.expectValidTransaction(
              blaze,
              await sweep(configs, now, [fourthScriptInput], blaze),
            );
            console.log('Vendor utxos')
            await printUtxosAtAddress(vendorScriptAddress)
            console.log('Treasury utxos')
            await printUtxosAtAddress(treasuryScriptAddress)
            console.log('User utxos')
            await printUtxosAtAddress(addr)
          });
        });

      });
    });
  });
});
