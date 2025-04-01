import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { sampleTreasuryConfig, setupEmulator } from "../utilities.test";
import { loadTreasuryScript, unix_to_slot } from "../../shared";
import { sweep } from "../../treasury/sweep";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
} from "../../types/contracts";
import { Address, Script } from "@blaze-cardano/core";

describe("When sweeping", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let config: TreasuryConfiguration;
  let treasuryScript: Script;
  let scriptAddress: Address;
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let withAssetScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  beforeEach(async () => {
    emulator = await setupEmulator();
    config = await sampleTreasuryConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, config);
    treasuryScript = treasury.script.Script;
    scriptAddress = treasury.scriptAddress;
    emulator.accounts.set(treasury.rewardAccount, amount);
    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        treasury.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    scriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(scriptInput);
    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        treasury.scriptAddress,
        makeValue(1_000_000_000n),
      ),
    );
    secondScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(secondScriptInput);
    withAssetScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        treasury.scriptAddress,
        makeValue(1_000_000_000n, ["a".repeat(64), 1n]),
      ),
    );
    withAssetScriptInput
      .output()
      .setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(withAssetScriptInput);
    refInput = emulator.lookupScript(treasury.script.Script);
  });

  describe("after the timeout", () => {
    beforeEach(() => {
      emulator.stepForwardToUnix(config.expiration + 1n);
    });

    describe("anyone", () => {
      test("can sweep funds back to the treasury", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await sweep(config, scriptInput, blaze),
          );
        });
      });

      test("can partially sweep, so long as the remainder stays locked", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await sweep(config, scriptInput, blaze, 5_000_000n),
          );
        });
      });

      test("can donate additional funds", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(scriptInput.output().amount().coin() + 1_000_000n),
          );
        });
      });

      test("can sweep multiple inputs at once", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .addInput(
                secondScriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(
                scriptInput.output().amount().coin() +
                  secondScriptInput.output().amount().coin(),
              ),
          );
        });
      });

      test("can sweep so long as native assets stay locked", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              .addInput(
                withAssetScriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .lockAssets(
                scriptAddress,
                makeValue(2_000_000n, ["a".repeat(64), 1n]),
                Data.Void(),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(withAssetScriptInput.output().amount().coin()),
          );
        });
      });

      test("must donate all funds not re-locked at the script address", async () => {
        await emulator.as("Anyone", async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(scriptInput.output().amount().coin() / 2n),
            /expect donation >=/,
          );
        });
      });
    });

    describe("a malicious user", () => {
      test("cannot steal from second input", async () => {
        await emulator.as("MaliciousUser", async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .addInput(
                secondScriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(
                scriptInput.output().amount().coin() +
                  secondScriptInput.output().amount().coin() -
                  1n,
              ),
            /expect donation >=/,
          );
        });
      });
      test("cannot steal native assets", async () => {
        await emulator.as("MaliciousUser", async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                withAssetScriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(withAssetScriptInput.output().amount().coin()),
            /without_lovelace\(input_sum\) == without_lovelace\(output_sum\)/,
          );
        });
      });
      test("cannot attach their own staking address", async () => {
        let fullAddress = new Core.Address({
          type: Core.AddressType.BasePaymentScriptStakeKey,
          networkId: Core.NetworkId.Testnet,
          paymentPart: {
            type: Core.CredentialType.ScriptHash,
            hash: treasuryScript.hash(),
          },
          delegationPart: {
            type: Core.CredentialType.KeyHash,
            hash: treasuryScript.hash(), // Just use an arbitrary hash
          },
        });
        await emulator.as("MaliciousUser", async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                withAssetScriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .lockAssets(
                fullAddress,
                makeValue(2_000_000n, ["a".repeat(64), 1n]),
                Data.Void(),
              )
              .setValidFrom(unix_to_slot(config.expiration + 1000n))
              .addReferenceInput(refInput)
              .setDonation(withAssetScriptInput.output().amount().coin()),
            /option.is_none\(output.address.stake_credential\)/,
          );
        });
      });
    });
  });
  describe("before the timeout", () => {
    describe("a malicious user", () => {
      test("cannot sweep funds", async () => {
        await emulator.as("MaliciousUser", async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "SweepTreasury"),
              )
              .setValidFrom(unix_to_slot(config.expiration - 1000n))
              .addReferenceInput(refInput)
              .setDonation(500_000_000_000n),
            /is_entirely_after\(validity_range, config.expiration\)/,
          );
        });
      });
    });
  });
});
