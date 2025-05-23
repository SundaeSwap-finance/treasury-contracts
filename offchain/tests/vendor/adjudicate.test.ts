import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  Transaction,
  TransactionId,
  TransactionInput,
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
} from "../../src/shared";
import {
  MultisigScript,
  VendorConfiguration,
  VendorDatum,
  VendorVendorSpend,
} from "../../src/types/contracts";
import { adjudicate } from "../../src/vendor/adjudicate";
import {
  pause_key,
  Pauser,
  registryToken,
  resume_key,
  Resumer,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  vendor_key,
} from "../utilities";

describe("", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let config: VendorConfiguration;
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
  let pauseSigner: Ed25519KeyHashHex;
  let resumeSigner: Ed25519KeyHashHex;
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
    config = vendorConfig;
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    pauseSigner = Ed25519KeyHashHex(await pause_key(emulator));
    resumeSigner = Ed25519KeyHashHex(await resume_key(emulator));

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

  describe("the oversight committee", () => {
    describe("can pause", () => {
      test("one payout", async () => {
        await emulator.as(Pauser, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              scriptInput,
              ["Paused"],
              [pauseSigner],
            ),
          );
        });
      });
      test("all payouts", async () => {
        await emulator.as(Pauser, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              thirdScriptInput,
              ["Paused", "Paused", "Paused"],
              [pauseSigner],
            ),
          );
        });
      });
      test("some payouts", async () => {
        await emulator.as(Pauser, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              thirdScriptInput,
              ["Paused", "Active", "Paused"],
              [pauseSigner],
            ),
          );
        });
      });
      test("unmatured payouts", async () => {
        await emulator.as(Pauser, async (blaze) => {
          emulator.stepForwardToSlot(Slot(2));
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(2)))),
              thirdScriptInput,
              ["Active", "Paused", "Paused"],
              [pauseSigner],
            ),
          );
        });
      });
    });
    describe("cannot pause", () => {
      test("matured payouts", async () => {
        await emulator.as(Pauser, async (blaze) => {
          emulator.stepForwardToSlot(Slot(2));
          await emulator.expectScriptFailure(
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(2)))),
              thirdScriptInput,
              ["Paused", "Active", "Active"],
              [pauseSigner],
            ),
            /if is_entirely_after\(validity_range, ip.maturation\) && ip.status == Active {/,
          );
        });
      });
    });
    describe("can resume", () => {
      test("one payout", async () => {
        await emulator.as(Resumer, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              fourthScriptInput,
              ["Active", "Active", "Active"],
              [resumeSigner],
            ),
          );
        });
      });
      test("multiple payouts", async () => {
        let txId: TransactionId;
        await emulator.as(Pauser, async (blaze) => {
          const tx = await adjudicate(
            config,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            fourthScriptInput,
            ["Paused", "Paused", "Paused"],
            [pauseSigner],
          );
          const completeTx = await tx.complete();
          const signedTx = await blaze.signTransaction(completeTx);
          txId = signedTx.getId();
          emulator.submitTransaction(signedTx);
        });
        await emulator.as(Resumer, async (blaze) => {
          emulator.stepForwardToSlot(Slot(1));
          const newScriptInput = (
            await blaze.provider.resolveUnspentOutputs([
              TransactionInput.fromCore({
                txId: txId,
                index: 0,
              }),
            ])
          )[0];
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(1)))),
              newScriptInput,
              ["Paused", "Active", "Active"],
              [resumeSigner],
            ),
          );
        });
      });
      test("matured payouts", async () => {
        await emulator.as(Resumer, async (blaze) => {
          emulator.stepForwardToSlot(10);
          await emulator.expectValidTransaction(
            blaze,
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(10)))),
              fourthScriptInput,
              ["Active", "Active", "Active"],
              [resumeSigner],
            ),
          );
        });
      });
    });
    describe("can pause and resume", () => {
      test("in the same transaction", async () => {
        let signedTx: Transaction;
        await emulator.as(Resumer, async (blaze) => {
          const tx = await adjudicate(
            config,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            fourthScriptInput,
            ["Active", "Active", "Paused"],
            [resumeSigner, pauseSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Resumer, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Pauser, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
    });

    test("must either pause or resume", async () => {
      await emulator.as(Pauser, async (blaze) => {
        await emulator.expectScriptFailure(
          await adjudicate(
            config,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            fourthScriptInput,
            ["Active", "Paused", "Active"],
            [pauseSigner],
          ),
          /Trace or \{\n\s*pause_permission_needed\?,\s*resume_permission_needed\?,\s*}/,
        );
      });
    });
  });

  describe("a malicious user", () => {
    describe("cannot", () => {
      test("pause payouts", async () => {
        await emulator.as("MaliciousUser", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              fourthScriptInput,
              ["Active", "Paused", "Paused"],
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
            /Trace satisfied\(config.permissions.pause, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
      test("resume payouts", async () => {
        await emulator.as("MaliciousUser", async (blaze, signer) => {
          await emulator.expectScriptFailure(
            await adjudicate(
              config,
              blaze,
              new Date(Number(slot_to_unix(Slot(0)))),
              fourthScriptInput,
              ["Active", "Active", "Active"],
              [
                Ed25519KeyHashHex(
                  signer.asBase()?.getPaymentCredential().hash!,
                ),
              ],
            ),
            /Trace satisfied\(config.permissions.resume, extra_signatories, validity_range, withdrawals\)/,
          );
        });
      });
    });
  });
});
