import { Address, AssetId, RewardAccount, Slot } from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
  unix_to_slot,
} from "../../src/shared";
import {
  MultisigScript,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
  type TreasuryConfiguration,
} from "../../src/types/contracts";
import { sweep } from "../../src/vendor/sweep";
import {
  registryToken,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  vendor_key,
} from "../utilities";

describe("", () => {
  const amount = 340_000_000_000_000n;
  const thirtSixHours = 36n * 60n * 60n * 1000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let now: Date;
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
  let rewardAccount: RewardAccount;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
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
    now = new Date(Number(configs.vendor.expiration + 1000n));
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    firstDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(500_000_000_000n)),
          status: "Paused",
        },
      ],
    };
    scriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, firstDatum)),
      );
    emulator.addUtxo(scriptInput);

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(100_000_000n, ["b".repeat(56), 200_000_000_000n]),
      ),
    );
    secondDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 100000n,
          value: coreValueToContractsValue(
            makeValue(100_000_000n, ["b".repeat(56), 200_000_000_000n]),
          ),
          status: "Active",
        },
      ],
    };
    secondScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, secondDatum)),
      );
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(20_000_000n, ["a".repeat(56), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    thirdDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 2000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(makeValue(0n, ["a".repeat(56), 1n])),
          status: "Active",
        },
      ],
    };
    thirdScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, thirdDatum)),
      );
    emulator.addUtxo(thirdScriptInput);
    fourthDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 2000n,
          value: coreValueToContractsValue(
            makeValue(10_000_000n, ["a".repeat(56), 50n]),
          ),
          status: "Paused",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(
            makeValue(10_000_000n, ["a".repeat(56), 50n]),
          ),
          status: "Active",
        },
      ],
    };
    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 3n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(30_000_000n, ["a".repeat(56), 100n]),
      ),
    );
    fourthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fourthDatum)),
      );
    emulator.addUtxo(fourthScriptInput);
    fifthDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(
            makeValue(0n, ["c".repeat(56), 50n]),
          ),
          status: "Active",
        },
      ],
    };
    fifthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 4n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(300_000_000n, ["c".repeat(56), 100n]),
      ),
    );
    fifthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fifthDatum)),
      );
    emulator.addUtxo(fifthScriptInput);

    const [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName)),
    )!;

    refInput = emulator.lookupScript(vendorScript.Script);
  });

  describe("before the expiration", () => {
    describe("anyone", () => {
      test("cannot sweep", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectScriptFailure(
            await sweep(
              configs,
              new Date(Number(slot_to_unix(Slot(0)))),
              [scriptInput],
              blaze,
            ),
            /Trace expect is_entirely_after\(validity_range, config.expiration\)/,
          );
        });
      });
    });
  });

  describe("after the expiration", () => {
    beforeEach(() => {
      emulator.stepForwardToSlot(
        unix_to_slot(configs.vendor.expiration + 1000n),
      );
    });
    describe("anyone", () => {
      describe("can sweep", () => {
        test("lovelace to the treasury", async () => {
          await emulator.as("Anyone", async (blaze) => {
            await emulator.expectValidTransaction(
              blaze,
              await sweep(configs, now, [scriptInput], blaze),
            );
          });
        });
        test("native tokens to the treasury script", async () => {
          await emulator.as("Anyone", async (blaze) => {
            await emulator.expectValidTransaction(
              blaze,
              await sweep(configs, now, [fourthScriptInput], blaze),
            );
          });
        });
        test("surplus assets", async () => {
          await emulator.as("Anyone", async (blaze) => {
            await emulator.expectValidTransaction(
              blaze,
              await sweep(configs, now, [fifthScriptInput], blaze),
            );
          });
        });
      });
      describe("cannot sweep", () => {
        test("matured payouts", async () => {
          await emulator.as("Anyone", async (blaze) => {
            await emulator.expectScriptFailure(
              blaze
                .newTransaction()
                .addReferenceInput(registryInput)
                .addReferenceInput(refInput)
                .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
                .setValidUntil(
                  unix_to_slot(BigInt(now.valueOf()) + thirtSixHours),
                )
                .addInput(
                  secondScriptInput,
                  Data.serialize(VendorSpendRedeemer, "SweepVendor"),
                )
                .lockAssets(
                  vendorScriptAddress,
                  makeValue(1_000_000n),
                  Data.serialize(VendorDatum, secondDatum),
                ),
              /Trace equal_plus_min_ada\(matured_value, vendor_output.value\)/,
            );
          });
        });
      });
    });
  });
});
