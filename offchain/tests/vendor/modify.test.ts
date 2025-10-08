import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import {
  MultisigScript,
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from "../../src/generated-types/contracts";
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  TConfigsOrScripts,
} from "../../src/shared";
import { cancel, modify } from "../../src/vendor/modify";
import {
  Modifier,
  modify_key,
  new_vendor_key,
  NewVendor,
  registryToken,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities";

describe("", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: {
    treasury: TreasuryConfiguration;
    vendor: VendorConfiguration;
    trace?: boolean;
  };
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
  let newVendor: MultisigScript;
  let modifySigner: Ed25519KeyHashHex;
  let vendorSigner: Ed25519KeyHashHex;
  let newVendorSigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
  let configsOrScripts: TConfigsOrScripts;
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
    configs = { treasury: treasuryConfig, vendor: vendorConfig, trace: true };
    configsOrScripts = { configs };
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    newVendor = {
      Signature: {
        key_hash: await new_vendor_key(emulator),
      },
    };
    modifySigner = Ed25519KeyHashHex(await modify_key(emulator));
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));
    newVendorSigner = Ed25519KeyHashHex(await new_vendor_key(emulator));

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

  describe("the oversight committee", () => {
    describe("can modify", () => {
      test("with the vendors permission", async () => {
        const tx = await emulator.as(Modifier, async (blaze) => {
          return modify({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: scriptInput,
            new_vendor: fourthDatum,
            signers: [modifySigner, vendorSigner],
          });
        });
        await emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor],
          tx,
        );
      });
      test("with the new vendors permission", async () => {
        const newVendorDatum: VendorDatum = {
          vendor: newVendor,
          payouts: fourthDatum.payouts,
        };
        const tx = await emulator.as(Modifier, async (blaze) => {
          return modify({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: scriptInput,
            new_vendor: newVendorDatum,
            signers: [modifySigner, vendorSigner, newVendorSigner],
          });
        });
        emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor, NewVendor],
          tx,
        );
      });
      test("efficiently", async () => {
        const tx = await emulator.as(Modifier, async (blaze) => {
          const new_datum: VendorDatum = {
            vendor: vendor,
            payouts: [
              {
                maturation: 2000n,
                value: coreValueToContractsValue(makeValue(200_000_000_000n)),
                status: "Active",
              },
              {
                maturation: 5000n,
                value: coreValueToContractsValue(makeValue(300_000_000_000n)),
                status: "Active",
              },
            ],
          };
          return modify({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: scriptInput,
            new_vendor: new_datum,
            signers: [modifySigner, vendorSigner],
          });
        });
        await emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor],
          tx,
        );
      });
      test("reclaiming some", async () => {
        const tx = await emulator.as(Modifier, async (blaze) => {
          const new_datum: VendorDatum = {
            vendor: vendor,
            payouts: [
              {
                maturation: 2000n,
                value: coreValueToContractsValue(makeValue(200_000_000_000n)),
                status: "Active",
              },
              {
                maturation: 5000n,
                value: coreValueToContractsValue(makeValue(200_000_000_000n)),
                status: "Active",
              },
            ],
          };
          return modify({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: scriptInput,
            new_vendor: new_datum,
            signers: [modifySigner, vendorSigner],
          });
        });
        await emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor],
          tx,
        );
      });
      test("with native tokens", async () => {
        const new_datum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 1000n,
              value: coreValueToContractsValue(
                makeValue(0n, ["c".repeat(56), 50n]),
              ),
              status: "Active",
            },
            {
              maturation: 2000n,
              value: coreValueToContractsValue(
                makeValue(0n, ["c".repeat(56), 50n]),
              ),
              status: "Active",
            },
          ],
        };
        const tx = await emulator.as(Modifier, async (blaze) => {
          return modify({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: fifthScriptInput,
            new_vendor: new_datum,
            signers: [modifySigner, vendorSigner],
          });
        });
        await emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor],
          tx,
        );
      });
    });
    describe("cannot modify", () => {
      test("without the vendors permission", async () => {
        const newDatum: VendorDatum = {
          vendor: newVendor,
          payouts: fourthDatum.payouts,
        };
        await emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            await modify({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: scriptInput,
              new_vendor: newDatum,
              signers: [modifySigner, newVendorSigner],
            }),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("without the new vendors permission", async () => {
        const newDatum: VendorDatum = {
          vendor: newVendor,
          payouts: firstDatum.payouts,
        };
        await emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            await modify({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: scriptInput,
              new_vendor: newDatum,
              signers: [modifySigner, vendorSigner],
            }),
            /Trace expect\s*satisfied\(v.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
    describe("can cancel", () => {
      test("with the vendors permission", async () => {
        const tx = await emulator.as(Modifier, async (blaze) => {
          return cancel({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            input: scriptInput,
            signers: [modifySigner, vendorSigner],
          });
        });
        await emulator.expectValidMultisignedTransaction(
          [Modifier, Vendor],
          tx,
        );
      });
    });
    describe("cannot cancel", () => {
      test("without the vendors permission", async () => {
        await emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            await cancel({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: scriptInput,
              signers: [modifySigner],
            }),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("if stealing funds", async () => {
        emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .setValidFrom(Slot(0))
              .setValidUntil(Slot(100))
              .addInput(
                scriptInput,
                Data.serialize(VendorSpendRedeemer, "Modify"),
              )
              .addRequiredSigner(modifySigner)
              .addRequiredSigner(vendorSigner),
            /Trace greater_than_or_equal_to\(retained_funds, treasury_owned_funds\)/,
          );
        });
      });
    });
  });

  describe("the vendor", () => {
    describe("cannot", () => {
      test("modify", async () => {
        await emulator.as(Vendor, async (blaze) => {
          await emulator.expectScriptFailure(
            await modify({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: scriptInput,
              new_vendor: fourthDatum,
              signers: [Ed25519KeyHashHex(await vendor_key(emulator))],
            }),
            /Trace satisfied\(permissions.modify, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("cancel", async () => {
        await emulator.as("Vendor", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await cancel({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: scriptInput,
              signers: [
                Ed25519KeyHashHex(signer.asBase()!.getPaymentCredential().hash),
              ],
            }),
            /Trace satisfied\(permissions.modify, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
  });

  describe("a malicious user", () => {
    describe("cannot", () => {
      test("modify", async () => {
        await emulator.as("MaliciousUser", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await modify({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: fourthScriptInput,
              new_vendor: firstDatum,
              signers: [
                Ed25519KeyHashHex(signer.asBase()!.getPaymentCredential().hash),
              ],
            }),
            /Trace expect\s*satisfied\(v.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("cancel", async () => {
        await emulator.as("MaliciousUser", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await cancel({
              configsOrScripts,
              blaze,
              now: new Date(Number(emulator.slotToUnix(Slot(0)))),
              input: fourthScriptInput,
              signers: [
                Ed25519KeyHashHex(signer.asBase()!.getPaymentCredential().hash),
              ],
            }),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
  });
});
