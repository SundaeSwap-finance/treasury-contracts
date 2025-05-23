import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  Transaction,
} from "@blaze-cardano/core";
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
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from "../../src/types/contracts";
import { cancel, modify } from "../../src/vendor/modify";
import {
  Modifier,
  modify_key,
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
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
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
  let modifySigner: Ed25519KeyHashHex;
  let vendorSigner: Ed25519KeyHashHex;
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
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    modifySigner = Ed25519KeyHashHex(await modify_key(emulator));
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));

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
        let signedTx: Transaction;
        await emulator.as(Modifier, async (blaze) => {
          const tx = await modify(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            scriptInput,
            fourthDatum,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
      test("efficiently", async () => {
        let signedTx: Transaction;
        await emulator.as(Modifier, async (blaze) => {
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
          const tx = await modify(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            scriptInput,
            new_datum,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
      test("reclaiming some", async () => {
        let signedTx: Transaction;
        await emulator.as(Modifier, async (blaze) => {
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
          const tx = await modify(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            scriptInput,
            new_datum,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
      test("with native tokens", async () => {
        let signedTx: Transaction;
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
        await emulator.as(Modifier, async (blaze) => {
          const tx = await modify(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            fifthScriptInput,
            new_datum,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
    });
    describe("cannot modify", () => {
      test("without the vendors permission", async () => {
        await emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            await modify(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              scriptInput,
              fourthDatum,
              [modifySigner],
            ),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
    describe("can cancel", () => {
      test("with the vendors permission", async () => {
        let signedTx: Transaction;
        await emulator.as(Modifier, async (blaze) => {
          const tx = await cancel(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            scriptInput,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
    });
    describe("cannot cancel", () => {
      test("without the vendors permission", async () => {
        await emulator.as(Modifier, async (blaze) => {
          emulator.expectScriptFailure(
            await cancel(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              scriptInput,
              [modifySigner],
            ),
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
              .setValidFrom(unix_to_slot(BigInt(0)))
              .setValidUntil(unix_to_slot(BigInt(100)))
              .addInput(
                scriptInput,
                Data.serialize(VendorSpendRedeemer, "Modify"),
              )
              .addRequiredSigner(modifySigner)
              .addRequiredSigner(vendorSigner),
            /Trace equal_plus_min_ada\(unmatured_value, assets.merge\(vendor_output_sum, treasury_output_sum\)\)/,
          );
        });
      });
    });
  });

  describe("the vendor", () => {
    describe("cannot", () => {
      test("modify", async () => {
        await emulator.as("Vendor", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await modify(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              scriptInput,
              fourthDatum,
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
            /Trace satisfied\(permissions.modify, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("cancel", async () => {
        await emulator.as("Vendor", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await cancel(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              scriptInput,
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
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
            await modify(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              fourthScriptInput,
              firstDatum,
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("cancel", async () => {
        await emulator.as("MaliciousUser", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await cancel(
              configs,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              fourthScriptInput,
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
            /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
  });
});
