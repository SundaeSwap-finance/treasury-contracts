import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import {
  deployScripts,
  fund_key,
  Funder,
  pause_key,
  Pauser,
  registryToken,
  reorganize_key,
  Reorganizer,
  sampleTreasuryConfig,
  sampleVendorConfig,
  scriptOutput,
  setupEmulator,
  vendor_key,
} from "../utilities";
import {
  coreValueToContractsValue,
  loadScripts,
  loadTreasuryScript,
  unix_to_slot,
  type CompiledScript,
} from "../../src/shared";
import { sweep } from "../../src/treasury/sweep";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  TreasuryTreasuryWithdraw,
  VendorDatum,
  VendorSpendRedeemer,
} from "../../src/types/contracts";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  Script,
  Slot,
} from "@blaze-cardano/core";

describe("TxPipe Audit Findings", () => {
  let emulator: Emulator;
  let config: TreasuryConfiguration;
  beforeEach(async () => {
    emulator = await setupEmulator(undefined, false);
  });

  describe("TRS-001", () => {
    describe("anyone", () => {
      test("cannot sweep multiple treasury scripts and steal ADA", async () => {
        const scripts_1 = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator, 1),
          await sampleVendorConfig(emulator, 1),
        );
        await deployScripts(emulator, scripts_1);
        const scripts_2 = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator, 2),
          await sampleVendorConfig(emulator, 2),
        );
        await deployScripts(emulator, scripts_2);

        const refInput_1 = emulator.lookupScript(
          scripts_1.treasuryScript.script.Script,
        );
        const refInput_2 = emulator.lookupScript(
          scripts_2.treasuryScript.script.Script,
        );

        const amount = 100_000_000n;
        const inputA = scriptOutput(
          emulator,
          scripts_1.treasuryScript,
          makeValue(amount),
          Data.Void(),
        );
        const inputB = scriptOutput(
          emulator,
          scripts_2.treasuryScript,
          makeValue(amount),
          Data.Void(),
        );

        const future = scripts_1.treasuryScript.config.expiration * 2n;
        emulator.stepForwardToSlot(future);

        await emulator.as("Anyone", async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                inputA,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .addInput(
                inputB,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(future))
              .addReferenceInput(refInput_1)
              .addReferenceInput(refInput_2)
              .setDonation(amount)
              .payLovelace(address, amount),
          );
        });
      });
    });
  });

  describe("TRS-002", () => {
    describe("anyone", () => {
      test("cannot double-satisfy vendors with an extra withdrawal", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const treasuryRefInput = emulator.lookupScript(
          scripts.treasuryScript.script.Script,
        );
        const vendorRefInput = emulator.lookupScript(
          scripts.vendorScript.script.Script,
        );
        let [registryPolicy, registryName] = registryToken();
        const registryInput = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy + registryName)),
        )!;
        const amount = 200_000_000n;
        const malformedInput = scriptOutput(
          emulator,
          scripts.vendorScript,
          makeValue(amount),
          Data.Void(),
        );
        emulator.accounts.set(scripts.treasuryScript.rewardAccount!, amount);
        await emulator.as(Reorganizer, async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addWithdrawal(
                scripts.treasuryScript.rewardAccount!,
                amount,
                Data.Void(),
              )
              .addInput(
                malformedInput,
                Data.serialize(VendorSpendRedeemer, "Malformed"),
              )
              .lockAssets(
                scripts.treasuryScript.scriptAddress,
                makeValue(200_000_000n),
                Data.Void(),
              )
              .addRequiredSigner(
                Ed25519KeyHashHex(await reorganize_key(emulator)),
              )
              .setValidFrom(Slot(0))
              .setValidUntil(Slot(10))
              .addReferenceInput(treasuryRefInput)
              .addReferenceInput(vendorRefInput)
              .addReferenceInput(registryInput),
          );
        });
      });
    });
  });

  describe("TRS-002", () => {});

  describe("TRS-101", () => {
    describe("the oversight committee", () => {
      test("cannot fund invalid vendor projects", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const refInput = emulator.lookupScript(
          scripts.treasuryScript.script.Script,
        );
        let [registryPolicy, registryName] = registryToken();
        const registryInput = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy + registryName)),
        )!;

        const treasuryInput = scriptOutput(
          emulator,
          scripts.treasuryScript,
          makeValue(200_000_000n),
          Data.Void(),
        );

        const upperBound = unix_to_slot(
          scripts.treasuryScript.config.expiration - 10000n,
        );
        const fundRedeemer = {
          Fund: {
            amount: coreValueToContractsValue(makeValue(100_000_000n)),
          },
        };
        const vendor = {
          Signature: {
            key_hash: await vendor_key(emulator),
          },
        };
        const firstVendor: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 0n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
          ],
        };
        const secondVendor: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 0n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(60_000_000n)),
            },
          ],
        };

        await emulator.as(Funder, async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                treasuryInput,
                Data.serialize(TreasurySpendRedeemer, fundRedeemer),
              )
              .lockAssets(
                scripts.vendorScript.scriptAddress,
                makeValue(50_000_000n),
                Data.serialize(VendorDatum, firstVendor),
              )
              .lockAssets(
                scripts.vendorScript.scriptAddress,
                makeValue(50_000_000n),
                Data.serialize(VendorDatum, secondVendor),
              )
              .lockAssets(
                scripts.treasuryScript.scriptAddress,
                makeValue(100_000_000n),
                Data.Void(),
              )
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .setValidUntil(upperBound)
              .addReferenceInput(refInput)
              .addReferenceInput(registryInput),
          );
        });
      });
    });
  });

  describe("TRS-102", () => {
    describe("the oversight committee", () => {
      test("cannot pause rewards by manipulating validFrom", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const refInput = emulator.lookupScript(
          scripts.vendorScript.script.Script,
        );
        const vendor = {
          Signature: {
            key_hash: await vendor_key(emulator),
          },
        };
        const vendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 1000n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
          ],
        };
        const vendorInput = scriptOutput(
          emulator,
          scripts.vendorScript,
          makeValue(200_000_000n),
          Data.serialize(VendorDatum, vendorDatum),
        );
        const pausedVendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 1000n,
              status: "Paused",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
          ],
        };

        const lowerBound = 0n;

        // Advance forward by 36 hours
        emulator.stepForwardToSlot(36 * 60 * 60 + 10);

        await emulator.as(Pauser, async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                vendorInput,
                Data.serialize(VendorSpendRedeemer, {
                  Adjudicate: {
                    statuses: ["Paused"],
                  },
                }),
              )
              .lockAssets(
                scripts.vendorScript.scriptAddress,
                makeValue(200_000_000n),
                Data.serialize(VendorDatum, pausedVendorDatum),
              )
              .addRequiredSigner(Ed25519KeyHashHex(await pause_key(emulator)))
              .setValidFrom(Slot(0))
              .setValidUntil(Slot(36 * 60 * 60 + 20))
              .addReferenceInput(refInput),
          );
        });
      });
    });
  });

  describe("TRS-103", () => {
    describe("the oversight committee", () => {
      test("cannot modify future payouts via malformed redeemer", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const refInput = emulator.lookupScript(
          scripts.vendorScript.script.Script,
        );
        const vendor = {
          Signature: {
            key_hash: await vendor_key(emulator),
          },
        };
        const vendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 1000n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(20_000_000n)),
            },
            {
              maturation: 2000n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(20_000_000n)),
            },
          ],
        };
        const vendorInput = scriptOutput(
          emulator,
          scripts.vendorScript,
          makeValue(200_000_000n),
          Data.serialize(VendorDatum, vendorDatum),
        );
        const manipulatedVendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 1000n,
              status: "Paused",
              value: coreValueToContractsValue(makeValue(20_000_000n)),
            },
            {
              maturation: 2000n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(1_000_000n)), // Payout modified
            },
          ],
        };

        await emulator.as(Pauser, async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                vendorInput,
                Data.serialize(VendorSpendRedeemer, {
                  Adjudicate: {
                    statuses: ["Paused"],
                  },
                }),
              )
              .lockAssets(
                scripts.vendorScript.scriptAddress,
                makeValue(200_000_000n),
                Data.serialize(VendorDatum, manipulatedVendorDatum),
              )
              .addRequiredSigner(Ed25519KeyHashHex(await pause_key(emulator)))
              .setValidFrom(Slot(0))
              .setValidUntil(Slot(36 * 60 * 60 + 20))
              .addReferenceInput(refInput),
          );
        });
      });
    });
  });

  describe("TRS-104", () => {
    describe("the oversight committee", () => {
      test("cannot steal funds via a reused vendor script", async () => {
        const scripts_1 = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator, 1),
          await sampleVendorConfig(emulator, 1),
        );
        await deployScripts(emulator, scripts_1);
        const scripts_2 = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator, 2),
          await sampleVendorConfig(emulator, 1), // Vendor script gets reused
        );
        await deployScripts(emulator, scripts_2);

        const refInput_1 = emulator.lookupScript(
          scripts_1.treasuryScript.script.Script,
        );
        const refInput_2 = emulator.lookupScript(
          scripts_2.treasuryScript.script.Script,
        );
        let [registryPolicy1, registryName] = registryToken(1);
        const registryInput1 = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy1 + registryName)),
        )!;
        let [registryPolicy2, _] = registryToken(2);
        const registryInput2 = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy2 + registryName)),
        )!;

        const amount = 100_000_000n;
        const inputA = scriptOutput(
          emulator,
          scripts_1.treasuryScript,
          makeValue(amount),
          Data.Void(),
        );
        const inputB = scriptOutput(
          emulator,
          scripts_2.treasuryScript,
          makeValue(amount),
          Data.Void(),
        );

        const future = scripts_1.treasuryScript.config.expiration * 2n;
        emulator.stepForwardToSlot(future);

        const vendor = {
          Signature: {
            key_hash: await vendor_key(emulator),
          },
        };
        const vendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 0n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(10_000_000n)),
            },
          ],
        };

        await emulator.as(Funder, async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                inputA,
                Data.serialize(TreasurySpendRedeemer, {
                  Fund: {
                    amount: coreValueToContractsValue(makeValue(10_000_000n)),
                  },
                }),
              )
              .addInput(
                inputB,
                Data.serialize(TreasurySpendRedeemer, {
                  Fund: {
                    amount: coreValueToContractsValue(makeValue(10_000_000n)),
                  },
                }),
              )
              .setValidUntil(unix_to_slot(1000n))
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .addReferenceInput(refInput_1)
              .addReferenceInput(refInput_2)
              .addReferenceInput(registryInput1)
              .addReferenceInput(registryInput2)
              .lockLovelace(
                scripts_1.vendorScript.scriptAddress,
                10_000_000n,
                Data.serialize(VendorDatum, vendorDatum),
              )
              .lockLovelace(
                scripts_1.treasuryScript.scriptAddress,
                90_000_000n,
                Data.Void(),
              )
              .lockLovelace(
                scripts_2.treasuryScript.scriptAddress,
                90_000_000n,
                Data.Void(),
              ),
          );
        });
      });
    });
  });

  describe("TRS-105", () => {
    describe("the oversight committee", () => {
      test("cannot steal malformed vendor datums", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const treasuryRefInput = emulator.lookupScript(
          scripts.treasuryScript.script.Script,
        );
        const vendorRefInput = emulator.lookupScript(
          scripts.vendorScript.script.Script,
        );
        let [registryPolicy, registryName] = registryToken();
        const registryInput = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy + registryName)),
        )!;
        const malformedInput = scriptOutput(
          emulator,
          scripts.vendorScript,
          makeValue(200_000_000n),
          Data.Void(),
        );
        const treasuryInput = scriptOutput(
          emulator,
          scripts.treasuryScript,
          makeValue(200_000_000n),
          Data.Void(),
        );
        await emulator.as(Reorganizer, async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                treasuryInput,
                Data.serialize(TreasurySpendRedeemer, "Reorganize"),
              )
              .addInput(
                malformedInput,
                Data.serialize(VendorSpendRedeemer, "Malformed"),
              )
              .lockAssets(
                scripts.treasuryScript.scriptAddress,
                makeValue(200_000_000n),
                Data.Void(),
              )
              .addRequiredSigner(
                Ed25519KeyHashHex(await reorganize_key(emulator)),
              )
              .setValidFrom(Slot(0))
              .setValidUntil(Slot(10))
              .addReferenceInput(treasuryRefInput)
              .addReferenceInput(vendorRefInput)
              .addReferenceInput(registryInput),
          );
        });
      });
    });
  });

  describe("TRS-202", () => {
    describe("the oversight committee", () => {
      test("cannot attach a stake redeemer when sweeping vendor funds", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);
        const refInput = emulator.lookupScript(
          scripts.vendorScript.script.Script,
        );
        let [registryPolicy, registryName] = registryToken();
        const registryInput = emulator.utxos().find((u) =>
          u
            .output()
            .amount()
            .multiasset()
            ?.get(AssetId(registryPolicy + registryName)),
        )!;
        const vendor = {
          Signature: {
            key_hash: await vendor_key(emulator),
          },
        };
        const vendorDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 0n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
            {
              maturation: 10n,
              status: "Paused",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
          ],
        };
        const vendorInput = scriptOutput(
          emulator,
          scripts.vendorScript,
          makeValue(200_000_000n),
          Data.serialize(VendorDatum, vendorDatum),
        );
        const updatedDatum: VendorDatum = {
          vendor: vendor,
          payouts: [
            {
              maturation: 0n,
              status: "Active",
              value: coreValueToContractsValue(makeValue(40_000_000n)),
            },
          ],
        };

        const future = scripts.vendorScript.config.expiration * 2n;

        // Advance forward by 36 hours
        emulator.stepForwardToSlot(future);

        const fullAddress = new Core.Address({
          type: Core.AddressType.BasePaymentScriptStakeKey,
          networkId: Core.NetworkId.Testnet,
          paymentPart: {
            type: Core.CredentialType.ScriptHash,
            hash: scripts.vendorScript.script.Script.hash(),
          },
          delegationPart: {
            type: Core.CredentialType.KeyHash,
            hash: scripts.treasuryScript.script.Script.hash(), // Just use an arbitrary hash
          },
        });

        await emulator.as("Anyone", async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                vendorInput,
                Data.serialize(VendorSpendRedeemer, "SweepVendor"),
              )
              .lockAssets(
                scripts.treasuryScript.scriptAddress,
                makeValue(160_000_000n),
                Data.Void(),
              )
              .lockAssets(
                fullAddress,
                makeValue(40_000_000n),
                Data.serialize(VendorDatum, updatedDatum),
              )
              .setValidFrom(unix_to_slot(future))
              .addReferenceInput(refInput)
              .addReferenceInput(registryInput),
          );
        });
      });
    });
  });

  describe("TRS-203", () => {
    describe("anyone", () => {
      test("cannot DDOS the treasury sweep", async () => {
        const scripts = loadScripts(
          Core.NetworkId.Testnet,
          await sampleTreasuryConfig(emulator),
          await sampleVendorConfig(emulator),
        );
        await deployScripts(emulator, scripts);

        const refInput = emulator.lookupScript(
          scripts.treasuryScript.script.Script,
        );

        const amount = 100_000_000_000_000n;
        const input = scriptOutput(
          emulator,
          scripts.treasuryScript,
          makeValue(amount),
          Data.Void(),
        );

        const future = scripts.treasuryScript.config.expiration * 2n;
        emulator.stepForwardToSlot(future);

        await emulator.as("Anyone", async (blaze, address) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                input,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .lockLovelace(
                scripts.treasuryScript.scriptAddress,
                amount - 1n,
                Data.Void(),
              )
              .setValidFrom(unix_to_slot(future))
              .addReferenceInput(refInput)
              .setDonation(1n),
          );
        });
      });
    });
  });
});
