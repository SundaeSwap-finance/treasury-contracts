import {
  Address,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import { ETransactionEvent } from "src";
import { modify } from "src/vendor";
import {
  AllowlistConfig,
  AllowlistVendorAllowlistVendorWithdraw,
  MultisigScript,
  VendorDatum,
} from "../../src/generated-types/contracts";
import {
  coreAddressToContractsAddress,
  coreValueToContractsValue,
  ICompiledScript,
  loadAllowlistScript,
  loadTreasuryScript,
  loadVendorScript,
  TConfigsOrScripts,
} from "../../src/shared";
import { withdraw } from "../../src/vendor/withdraw";
import {
  disburse_key,
  Modifier,
  modify_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities";

describe("With a vendor with the allowlist script", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let treasuryInput: Core.TransactionUnspentOutput;
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
  let vendor: MultisigScript;
  let vendorSigner: Ed25519KeyHashHex;
  let modifySigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScriptAddress: Address;
  let configsOrScripts: TConfigsOrScripts;
  let allowlist: ICompiledScript<
    AllowlistVendorAllowlistVendorWithdraw,
    AllowlistConfig
  >;
  let allowedAddresses: Address[];
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
      true,
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
      true,
    );
    configsOrScripts = {
      configs: { treasury: treasuryConfig, vendor: vendorConfig, trace: true },
    };
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    allowedAddresses = await Promise.all([
      emulator.register("Allowed 1"),
      emulator.register("Allowed 2"),
      emulator.register("Allowed 3"),
    ]);

    allowlist = loadAllowlistScript(
      Core.NetworkId.Testnet,
      {
        registry_token: vendorConfig.registry_token,
        addresses: allowedAddresses.map(coreAddressToContractsAddress),
        deregistration: {
          Signature: {
            key_hash: await disburse_key(emulator),
          },
        },
      },
      true,
    );
    emulator.accounts.set(allowlist.rewardAccount!, 0n);
    await emulator.publishScript(allowlist.script.Script);

    vendor = {
      AllOf: {
        scripts: [
          {
            Signature: {
              key_hash: await vendor_key(emulator),
            },
          },
          {
            Script: {
              script_hash: allowlist.script.Script.hash(),
            },
          },
        ],
      },
    };
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));
    modifySigner = Ed25519KeyHashHex(await modify_key(emulator));

    treasuryInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 5n),
      new Core.TransactionOutput(
        treasuryScriptManifest.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    treasuryInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasuryInput);

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
          status: "Active",
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
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Paused",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
      ],
    };
    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 3n),
      new Core.TransactionOutput(vendorScriptAddress, makeValue(30_000_000n)),
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
            makeValue(0n, ["c".repeat(56), 100n]),
          ),
          status: "Active",
        },
      ],
    };
    fifthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 4n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(3_000_000n, ["c".repeat(56), 100n]),
      ),
    );
    fifthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fifthDatum)),
      );
    emulator.addUtxo(fifthScriptInput);
  });

  describe("the oversight committee and vendor", () => {
    test("can modify", async () => {
      const tx = await emulator.as(Modifier, async (blaze) => {
        return modify({
          configsOrScripts,
          blaze,
          now: new Date(Number(emulator.slotToUnix(Slot(0)))),
          input: scriptInput,
          new_vendor: fourthDatum,
          signers: [modifySigner, vendorSigner],
          additionalScripts: [
            { script: allowlist.script.Script, redeemer: Data.Void() },
          ],
        });
      });
      await emulator.expectValidMultisignedTransaction([Modifier, Vendor], tx);
    });
  });

  describe("the vendor", () => {
    test("can complete milestones", async () => {
      emulator.stepForwardToSlot(2n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
            metadata: {
              "@context": "test",
              hashAlgorithm: "blake2b-256",
              instance: "example-instance",
              txAuthor: "author",
              body: {
                event: ETransactionEvent.COMPLETE,
                milestones: {
                  "m-1": {
                    description: "example description",
                    evidence: [
                      {
                        label: "Milestone evidence",
                        anchorUrl: "https://example.com",
                      },
                    ],
                  },
                },
              },
            },
          }),
        );
      });
    });
    test("can withdraw a matured payout to correct address", async () => {
      emulator.stepForwardToSlot(2000n);
      await emulator.as(Vendor, async (blaze, _) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw a matured payout to multiple addresses", async () => {
      emulator.stepForwardToSlot(2000n);
      await emulator.as(Vendor, async (blaze, _) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destinations: [
              { address: allowedAddresses[0], amount: makeValue(20_000_000n) },
              { address: allowedAddresses[1], amount: makeValue(10_000_000n) },
              {
                address: allowedAddresses[2],
                amount: makeValue(499_970_000_000n),
              },
            ],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw a matured payout to a repeated address", async () => {
      emulator.stepForwardToSlot(2000n);
      await emulator.as(Vendor, async (blaze, _) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destinations: [
              { address: allowedAddresses[0], amount: makeValue(20_000_000n) },
              { address: allowedAddresses[0], amount: makeValue(10_000_000n) },
              {
                address: allowedAddresses[0],
                amount: makeValue(499_970_000_000n),
              },
            ],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw native tokens", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [secondScriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw *only* native tokens", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [fifthScriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw a multiple matured payouts", async () => {
      emulator.stepForwardToSlot(3n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(3)))),
            inputs: [thirdScriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw all payouts", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [thirdScriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can withdraw unpaused payouts", async () => {
      emulator.stepForwardToSlot(11n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(11)))),
            inputs: [fourthScriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("can spend without withdrawing", async () => {
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          // NOTE: this behavior is important so the vendor can attach metadata.
          // For example, this can be used to publish proof of accomplishment, invoices, etc.
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            inputs: [scriptInput],
            destination: allowedAddresses[0],
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
        );
      });
    });
    test("cannot withdraw a matured payout to another address", async () => {
      emulator.stepForwardToSlot(2000n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectScriptFailure(
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
            additionalScripts: [
              { script: allowlist.script.Script, redeemer: Data.Void() },
            ],
          }),
          /Trace equal_plus_min_ada\(vendor_outflow, target_inflow\) \? False/,
        );
      });
    });
  });
});
