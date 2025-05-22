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
  let vendorConfig: VendorConfiguration;
  let scriptInput: Core.TransactionUnspentOutput;
  let inputDatum: VendorDatum;
  let refInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let sweepSigner: Ed25519KeyHashHex;
  let treasuryScriptAddress: Address;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
  let expirationSlot: Slot;

  beforeEach(async () => {
    emulator = await setupEmulator();

    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
    );
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;

    vendorConfig = await sampleVendorConfig(emulator);
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
    );
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
    // Al payouts are active and mature after the expiration date
    expirationSlot = unix_to_slot(vendorConfig.expiration);
    inputDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: slot_to_unix(Slot(expirationSlot.valueOf() + 1)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(expirationSlot.valueOf() + 2)),
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: slot_to_unix(Slot(expirationSlot.valueOf() + 3)),
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
           // At this point the expiration date was reached and all payouts
           // have matured and are active (thus, they should not be sweepable!).
          const now = Slot(expirationSlot.valueOf() + 10);
          emulator.stepForwardToSlot(now);
          const registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(vendorConfig.registry_token + toHex(Buffer.from("REGISTRY"))),
          );
          // We set the lower bound to the slot after the expiration, but any value
          // larger to the expiration date and lower than the payouts'
          // maturities will work.
          const startInterval = new Date(Number(slot_to_unix(Slot(expirationSlot.valueOf() + 1))));
          const endInterval = new Date(Number(slot_to_unix(Slot(now.valueOf() + 2))))
          const expirationDate = new Date(Number(vendorConfig.expiration));
          console.log("Start of validity interval", startInterval);
          console.log("End of validity interval", endInterval);
          console.log("Date of expiration", expirationDate);
          console.log("Current slot", now);
          console.log("Expiration slot", expirationSlot);
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
