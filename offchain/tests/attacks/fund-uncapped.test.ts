import { beforeEach, describe, test } from "bun:test";
import { Core, Value, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  TransactionInput,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  Funder,
  Pauser,
  Vendor,
  fund_key,
  pause_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  vendor_key,
} from "../utilities.test";
import {
  coreValueToContractsValue as translateValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
} from "../../shared";
import {
  MultisigScript,
  VendorConfiguration,
  VendorDatum,
  type TreasuryConfiguration,
} from "../../types/contracts";
import { fund } from "../../treasury/fund";
import { withdraw } from "../../vendor/withdraw";
import { sweep } from "../../vendor/sweep";
import { adjudicate } from "../../vendor/adjudicate";

// Test steps:
// 1. Admin funds vendor script with a large number of payouts
// 2. An action that consumes the vendor output is tried

describe("With uncapped datum", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let treasuryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let treasuryScriptAddress: Address;
  let vendorScriptAddress: Address;
  let vendorSigner: Ed25519KeyHashHex;
  let pauseSigner: Ed25519KeyHashHex;
  // How much time before vendor expiration should payout maturation occur
  const slotsBeforeMaturation = 1n; // slots
  const dateMaturation = new Date(Number(slot_to_unix(Slot(Number(slotsBeforeMaturation)))));
  // The utxo holding the large datum
  let vendorScriptUnspentOutput: Core.TransactionUnspentOutput;
  const usdaPolicy = "a".repeat(56);
  const usdmPolicy = "b".repeat(56);

  // Here we set up the treasury UTxO + all the other boilerplate
  beforeEach(async () => {
    emulator = await setupEmulator();
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
    rewardAccount = treasuryScriptManifest.rewardAccount;
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));
    pauseSigner = Ed25519KeyHashHex(await pause_key(emulator));

    treasuryInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("2".repeat(64)), 0n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(500_000_000_000n, [usdaPolicy, 500_000_000_000n], [usdmPolicy, 500_000_000_000n]),
      ),
    );
    treasuryInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasuryInput);

    // Create a large vendor datum
    const [vendorDatum, vendorSchedule] = largeVendorDatum(50n);
    const vendorOutputValue = vendorSchedule.reduce(
        (acc, s) => Value.merge(s.amount, acc),
        Value.zero()
    );
    let output = new Core.TransactionOutput(vendorScriptAddress, vendorOutputValue);
    output.setDatum(Core.Datum.newInlineData(Data.serialize(VendorDatum, vendorDatum)));
    const input = new TransactionInput(Core.TransactionId("1".repeat(64)), 0n);
    vendorScriptUnspentOutput = new TransactionUnspentOutput(input, output);
    emulator.addUtxo(vendorScriptUnspentOutput);
  });

  // Helper for building a large vendor datum
  function largeVendorDatum(n: bigint): [VendorDatum, Array<{date: Date, amount: Core.Value}>] {
   let datum: VendorDatum = {
      vendor,
      payouts: []
   }; 
   let schedule = Array<{date: Date, amount: Core.Value}>();

   for (let i = 0; i < n; i++) {
     // set all payout's maturation to 1h before treasury expiratoin
     const value = makeValue(1_000_000n, [usdaPolicy, 1_000_000n], [usdmPolicy, 1_000_000n]);
     const translatedValue = translateValue(value);

     datum.payouts.push({
       maturation: slotsBeforeMaturation,
       value: translatedValue,
       status: "Active"
     })  

     schedule.push({
        date: dateMaturation,
        amount: value
      })
   }
   return [datum, schedule]
  }

  describe("the treasury oversight committee", async () => {
    test("can create a large vendor datum", async () => {
      // biggest possible datum before running out of script memory when executing fund
      const [_, schedule] = largeVendorDatum(50n);
      await emulator.as(Funder, async (blaze) => {
        const tx = await fund(
            configs,
            blaze,
            treasuryInput,
            vendor,
            schedule,
            [Ed25519KeyHashHex(await fund_key(emulator))],
        );
        emulator.expectValidTransaction(blaze, tx)
      });
    });
    test("CAN adjudicate a single payout", async () => {
      await emulator.as(Pauser, async (blaze, _vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await adjudicate(
            configs.vendor,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            vendorScriptUnspentOutput,
            Array<"Active" | "Paused">(49).fill("Active").concat(["Paused"]),
            [pauseSigner],
          ),
        );
      });
    });
    test("CAN adjudicate ALL payouts", async () => {
      await emulator.as(Pauser, async (blaze, _vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await adjudicate(
            configs.vendor,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            vendorScriptUnspentOutput,
            Array<"Active" | "Paused">(50).fill("Paused"),
            [pauseSigner],
          ),
        );
      });
    });
  });

  describe("the vendor", async () => {
    test("CANNOT withdraw any funds", async() => {
      emulator.stepForwardToSlot(slotsBeforeMaturation);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectScriptFailure(
          await withdraw(
            configs.vendor,
            blaze,
            dateMaturation,
            [vendorScriptUnspentOutput],
            vendorAddress,
            [vendorSigner],
          )
          , RegExp("execution went over budget")
        );
      });
    });
  })
  describe("anyone", () => {
    test("CANNOT sweep", async () => {
      emulator.stepForwardToUnix(configs.vendor.expiration + 3_600_000n)
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectScriptFailure(
          await sweep(
            configs,
            new Date(Number(configs.vendor.expiration + 3_600_000n)),
            [vendorScriptUnspentOutput],
            blaze,
          )
          , RegExp("execution went over budget")
        );
      });
    });
  });
});
