import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { withdraw } from "../../treasury/withdraw";
import { sampleTreasuryConfig, setupEmulator } from "../utilities.test";
import { loadTreasuryScript } from "../../shared";
import type { TreasuryConfiguration } from "../../types/contracts";
import type { Address, RewardAccount, Script } from "@blaze-cardano/core";

describe("When withdrawing", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let rewardAccount: RewardAccount;
  let scriptAddress: Address;
  let treasuryScript: Script;
  let config: TreasuryConfiguration;
  let refInput: Core.TransactionUnspentOutput;
  beforeEach(async () => {
    emulator = await setupEmulator();
    config = await sampleTreasuryConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, config);
    rewardAccount = treasury.rewardAccount;
    scriptAddress = treasury.scriptAddress;
    treasuryScript = treasury.script.Script;
    emulator.accounts.set(rewardAccount, amount);
    refInput = emulator.lookupScript(treasury.script.Script);
  });

  describe("anyone", async () => {
    test("can withdraw and lock funds at the script address", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await withdraw(config, amount, blaze),
        );
      });
    });
    test("can split funds across multiple script outputs", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .lockLovelace(scriptAddress, amount / 2n, Data.Void())
            .lockLovelace(scriptAddress, amount / 2n, Data.Void()),
        );
      });
    });
    test("can attach native assets while locking", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .lockAssets(
              scriptAddress,
              makeValue(amount, ["a".repeat(64), 1n]),
              Data.Void(),
            ),
        );
      });
    });
    test("can attach any datum", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .lockLovelace(scriptAddress, amount, Data.Void()),
        );
      });
    });
  });

  describe("a malicious user", () => {
    test("cannot withdraw funds to some other address", async () => {
      await emulator.as("MalicuiousUser", async (blaze, address) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .payLovelace(address, amount, Data.Void()),
        );
      });
    });
    test("cannot steal funds by splitting them between destinations", async () => {
      await emulator.as("MalicuiousUser", async (blaze, address) => {
        emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .lockLovelace(scriptAddress, amount / 2n, Data.Void())
            .payLovelace(address, amount / 2n, Data.Void()),
        );
      });
    });
    test("cannot attach a staking address", async () => {
      await emulator.as("MalicuiousUser", async (blaze, address) => {
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
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount, Data.Void())
            .addReferenceInput(refInput!)
            .lockLovelace(fullAddress, amount, Data.Void()),
        );
      });
    });
    test("cannot spend from treasury script while withdrawing", async () => {
      await emulator.as("MalicuiousUser", async (blaze, address) => {
        const scriptUtxo = new Core.TransactionUnspentOutput(
          new Core.TransactionInput(Core.TransactionId("0".repeat(64)), 0n),
          new Core.TransactionOutput(scriptAddress, makeValue(5_000_000_000n)),
        );
        emulator.addUtxo(scriptUtxo);
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addWithdrawal(rewardAccount, amount)
            .addReferenceInput(refInput!)
            .addInput(scriptUtxo)
            .lockLovelace(scriptAddress, amount + 5_000_000_000n, Data.Void()),
        );
      });
    });
  });
});
