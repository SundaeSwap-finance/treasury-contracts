import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  Slot,
  toHex,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  sweep_key,
  Sweeper,
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
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from "../../types/contracts";

(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 

describe("With misconfigured payouts", () => {
  let emulator: Emulator;
  let config: VendorConfiguration;
  let scriptInput: Core.TransactionUnspentOutput;
  let inputDatum: VendorDatum;
  let refInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let sweepSigner: Ed25519KeyHashHex;
  let treasuryScriptAddress: Address;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;

  beforeEach(async () => {
    emulator = await setupEmulator();

    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
    );
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;

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
    sweepSigner = Ed25519KeyHashHex(await sweep_key(emulator));

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(200_000_000n, ["a".repeat(56), 1n]),
      ),
    );
    // Al payouts have a maturation after 15, which is the vendor contract
    // expiration time.
    inputDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: slot_to_unix(Slot(17)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(18)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(19)),
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
    refInput = emulator.lookupScript(vendorScript.Script);
  });

  describe("the oversight committee", () => {
    describe("can sweep", () => {
      test("mature, misconfigured payouts", async () => {
        await emulator.as(Sweeper, async (blaze) => {
           // At this point the expiration date was reached (slot 15) and all payouts
           // have matured and are active (thus, they should not be sweepable!).
          emulator.stepForwardToSlot(Slot(20));
          const registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(config.registry_token + toHex(Buffer.from("REGISTRY"))),
          );
          // We set the lower bound to the expiration date, but any value
          // larger or equal to the expiration and strictly lower than any
          // payout's maturation will work.
          const startInterval = new Date(Number(slot_to_unix(Slot(16))));
          const endInterval = new Date(Number(slot_to_unix(Slot(22))))
          const expiration = new Date(Number(config.expiration));
          console.log("Start of interval", startInterval);
          console.log("End of validity interval", endInterval);
          console.log("Time of expiration", expiration);
          await emulator.expectValidTransaction(
            blaze,
            blaze.newTransaction()
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .setValidFrom(unix_to_slot(BigInt(startInterval.valueOf())))
              .setValidUntil(unix_to_slot(BigInt(endInterval.valueOf())))
              .addInput(
                scriptInput,
                Data.serialize(VendorSpendRedeemer, "SweepVendor")
              )
              .addRequiredSigner(sweepSigner)
              .lockAssets(
                treasuryScriptAddress,
                scriptInput.output().amount(),
                Data.Void()
              )
          );
        });
      });
    });
  });
});
