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
import { ETransactionEvent } from "src";
import {
  MultisigScript,
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
import { withdraw } from "../../src/vendor/withdraw";
import {
  registryToken,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities";

describe("When withdrawing from the vendor script", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
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
  let vendorSigner: Ed25519KeyHashHex;
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
    configsOrScripts = {
      configs: { treasury: treasuryConfig, vendor: vendorConfig, trace: true },
    };
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
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
    test("can withdraw a matured payouts", async () => {
      emulator.stepForwardToSlot(2n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can withdraw native tokens", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [secondScriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can withdraw *only* native tokens", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [fifthScriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can withdraw a multiple matured payouts", async () => {
      emulator.stepForwardToSlot(3n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(3)))),
            inputs: [thirdScriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can withdraw all payouts", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [thirdScriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can withdraw unpaused payouts", async () => {
      emulator.stepForwardToSlot(11n);
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(11)))),
            inputs: [fourthScriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("can spend without withdrawing", async () => {
      await emulator.as(Vendor, async (blaze, vendorAddress) => {
        await emulator.expectValidTransaction(
          blaze,
          // NOTE: this behavior is important so the vendor can attach metadata.
          // For example, this can be used to publish proof of accomplishment, invoices, etc.
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(0)))),
            inputs: [scriptInput],
            destination: vendorAddress,
            signers: [vendorSigner],
          }),
        );
      });
    });
    test("cannot withdraw unmatured payouts", async () => {
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(0))
            .addRequiredSigner(vendorSigner)
            .addInput(
              scriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            ),
          /Trace expect \[vendor_output\] =/,
        );
      });
    });
    test("cannot steal unmatured payout", async () => {
      await emulator.as(Vendor, async (blaze) => {
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 1000n,
              value: coreValueToContractsValue(makeValue(500_000_000_000n)),
              status: "Active",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(0))
            .addRequiredSigner(vendorSigner)
            .addInput(
              scriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(1_000_000n),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace equal_plus_min_ada\(expected_output_value, vendor_output.value\)/,
        );
      });
    });
    test("cannot leave matured payouts", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(3n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 2000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Active",
            },
            {
              maturation: 10000n,
              value: coreValueToContractsValue(
                makeValue(0n, ["a".repeat(56), 1n]),
              ),
              status: "Active",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              thirdScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(10_000_000n, ["a".repeat(56), 1n]),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace output_vendor_datum == VendorDatum \{ vendor: input_vendor_datum.vendor, payouts: remaining_payouts \}/,
        );
      });
    });
    test("cannot change future payouts dates", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(2n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 2000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Active",
            },
            {
              maturation: 3000n,
              value: coreValueToContractsValue(
                makeValue(0n, ["a".repeat(56), 1n]),
              ),
              status: "Active",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              thirdScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(10_000_000n, ["a".repeat(56), 1n]),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace output_vendor_datum == VendorDatum \{ vendor: input_vendor_datum.vendor, payouts: remaining_payouts \}/,
        );
      });
    });
    test("cannot change future payouts amounts", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(2n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 2000n,
              value: coreValueToContractsValue(
                makeValue(10_000_000n, ["a".repeat(56), 1n]),
              ),
              status: "Active",
            },
            {
              maturation: 3000n,
              value: coreValueToContractsValue(makeValue(0n)),
              status: "Active",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              thirdScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(10_000_000n, ["a".repeat(56), 1n]),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace output_vendor_datum == VendorDatum \{ vendor: input_vendor_datum.vendor, payouts: remaining_payouts \}/,
        );
      });
    });
    test("cannot unpause future payouts", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(2n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 2000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Active",
            },
            {
              maturation: 10000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Active",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              fourthScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(10_000_000n),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace output_vendor_datum == VendorDatum \{ vendor: input_vendor_datum.vendor, payouts: remaining_payouts \}/,
        );
      });
    });
    test("cannot pause future payouts", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(2n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
            {
              maturation: 2000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Paused",
            },
            {
              maturation: 10000n,
              value: coreValueToContractsValue(makeValue(10_000_000n)),
              status: "Paused",
            },
          ],
        };
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              fourthScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(20_000_000n),
              Data.serialize(VendorDatum, datum),
            ),
          /Trace output_vendor_datum == VendorDatum \{ vendor: input_vendor_datum.vendor, payouts: remaining_payouts \}/,
        );
      });
    });
    test("cannot add native assets", async () => {
      await emulator.as(Vendor, async (blaze) => {
        emulator.stepForwardToSlot(2n);
        const datum: VendorDatum = {
          vendor,
          payouts: [
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
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .setValidFrom(Slot(3))
            .addRequiredSigner(vendorSigner)
            .addInput(
              fourthScriptInput,
              Data.serialize(VendorSpendRedeemer, "Withdraw"),
            )
            .lockAssets(
              vendorScriptAddress,
              makeValue(20_000_000n, ["b".repeat(56), 100n]),
              Data.serialize(VendorDatum, datum),
            ),
          / {8}Trace equal_plus_min_ada\(expected_output_value, vendor_output.value\)/,
        );
      });
    });
  });

  describe("a malicious user", () => {
    test("cannot withdraw funds", async () => {
      emulator.stepForwardToSlot(2n);
      await emulator.as("MaliciousUser", async (blaze, signer) => {
        await emulator.expectScriptFailure(
          await withdraw({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(2)))),
            inputs: [scriptInput],
            destination: signer,
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
