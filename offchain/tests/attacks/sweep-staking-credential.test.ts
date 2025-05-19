import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue, TxBuilder, Value } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  TransactionUnspentOutput,
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
  contractsValueToCoreValue,
} from "../../shared";
import {
  MultisigScript,
  TreasuryTreasurySpend,
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
  let treasuryScript: TreasuryTreasurySpend;
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
    treasuryScript = treasuryScriptManifest.script;
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

  const addInputs = (tx: TxBuilder, inputs: [TransactionUnspentOutput], vendorAddr: Address) => {


    let value = Value.zero();
    for (const input of inputs) {
      tx = tx.addInput(input, Data.serialize(VendorSpendRedeemer, "SweepVendor"));
      let datum = Data.parse(
        VendorDatum,
        input.output().datum()!.asInlineData()!,
      );
      datum.payouts = datum.payouts.filter(
        (p) => p.maturation < now.valueOf() && p.status === "Active",
      );
      let carryThrough = Value.sum(
        datum.payouts.map((p) => contractsValueToCoreValue(p.value)),
      );
      let remainder = Value.merge(
        input.output().amount(),
        Value.negate(carryThrough),
      );
      if (!Value.empty(carryThrough)) {
        tx.lockAssets(
          vendorAddr,
          carryThrough,
          Data.serialize(VendorDatum, datum),
        );
      }
      value = Value.merge(value, remainder);
    }
  
    if (!Value.empty(value)) {
      tx = tx.lockAssets(treasuryScriptAddress, value, Data.Void());
    }
    return tx
  }
 

  describe("after the expiration", () => {
    beforeEach(() => {
      emulator.stepForwardToSlot(
        unix_to_slot(configs.vendor.expiration + 1000n),
      );
    });
    describe("anyone", () => {
      describe("can partially sweep", () => {
        test("and attach a staking credential to a vendor output", async () => {
          let fullAddress = new Core.Address({
              type: Core.AddressType.BasePaymentScriptStakeKey,
              networkId: Core.NetworkId.Testnet,
              paymentPart: {
                type: Core.CredentialType.ScriptHash,
                hash: vendorScript.Script.hash(),
              },
              delegationPart: {
                type: Core.CredentialType.KeyHash,
                hash: vendorScript.Script.hash(), // Just use an arbitrary hash
              },
          });
          await emulator.as("Anyone", async (blaze, addr) => {
            console.log('Vendor utxos without credential')
            await printUtxosAtAddress(vendorScriptAddress)
            console.log('Treasury utxos')
            await printUtxosAtAddress(treasuryScriptAddress)

            let tx = blaze.newTransaction()
                .addReferenceInput(registryInput)
                .addReferenceInput(refInput)
                .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
                .setValidUntil(unix_to_slot(BigInt(now.valueOf()) + thirtSixHours))
            
            tx = addInputs(tx, [fourthScriptInput], fullAddress)
            
            await emulator.expectValidTransaction(
              blaze,
              tx
            );
            console.log('Vendor utxos with stake credential')
            await printUtxosAtAddress(fullAddress)
            console.log('Treasury utxos')
            await printUtxosAtAddress(treasuryScriptAddress)
          });
        });
      });
    });
  });
});
