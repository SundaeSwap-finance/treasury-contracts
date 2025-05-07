import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  toHex,
} from "@blaze-cardano/core";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  pause_key,
  Pauser,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  vendor_key,
} from "../utilities.test";
import {
  loadTreasuryScript,
  loadVendorScript,
  coreValueToContractsValue,
  slot_to_unix,
  unix_to_slot,
} from "../../shared";
import {
  MultisigScript,
  PayoutStatus,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from "../../types/contracts";

(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 

describe("adjudicate tests", () => {
  let emulator: Emulator;
  let config: VendorConfiguration;
  let scriptInput: Core.TransactionUnspentOutput;
  let inputDatum: VendorDatum;
  let refInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let pauseSigner: Ed25519KeyHashHex;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
  let provider: EmulatorProvider;

  const printUtxoDatumsAtAddress = async (address:Address) => {
    const utxos = await provider.getUnspentOutputs(address)
    const datums = utxos.map(u => Data.parse(VendorDatum, u.output().datum()?.asInlineData()!))
    console.log(JSON.stringify(datums, null, 2))
  }

  beforeEach(async () => {
    emulator = await setupEmulator();
    const vendorConfig = await sampleVendorConfig(emulator);
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
    );
    config = vendorConfig;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    pauseSigner = Ed25519KeyHashHex(await pause_key(emulator));

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(200_000_000n, ["a".repeat(56), 1n]),
      ),
    );
    inputDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: slot_to_unix(Slot(0)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(1)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(2)),
          value: coreValueToContractsValue(makeValue(0n, ["a".repeat(56), 1n])),
          status: "Active",
        },
      ],
    };
    scriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, inputDatum)),
      );
    emulator.addUtxo(scriptInput);
    provider = new EmulatorProvider(emulator)
    refInput = emulator.lookupScript(vendorScript.Script);
  });

  describe("the oversight committee", () => {
    describe("can pause", () => {
      test("matured payouts", async () => {
        await emulator.as(Pauser, async (blaze) => {
          emulator.stepForwardToSlot(Slot(10)); // At this point all payouts have matured
          const registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
          );
          const thirty_six_hours = 36n * 60n * 60n * 1000n;
          const statuses: PayoutStatus[] = ["Paused", "Paused", "Paused"];
          const newDatum = {
            vendor: inputDatum.vendor,
            payouts: inputDatum.payouts.map((p, idx) => {
              return { 
                maturation: p.maturation,
                value: p.value,
                status: statuses[idx],
              }
            })
          }
          console.log('Datums before:')
          printUtxoDatumsAtAddress(vendorScriptAddress)
          await emulator.expectValidTransaction(
            blaze,
            blaze.newTransaction()
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .setValidFrom(Slot(0)) // Set arbitrary lower bound for validity range 
              .setValidUntil(unix_to_slot(BigInt(new Date(Number(slot_to_unix(Slot(10)))).valueOf()) + thirty_six_hours))
              .addInput(
                scriptInput,
                Data.serialize(VendorSpendRedeemer, {
                  Adjudicate: {
                    statuses
                  }
                })
              )
              .addRequiredSigner(pauseSigner)
              .lockAssets(
                vendorScriptAddress,
                scriptInput.output().amount(),
                Data.serialize(VendorDatum, newDatum)
              )
          );
          console.log('Datums after:')
          printUtxoDatumsAtAddress(vendorScriptAddress)
        });
      });
    });
  });
});
