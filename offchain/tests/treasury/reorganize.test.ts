import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { Address, Ed25519KeyHashHex, RewardAccount } from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  reorganize_key,
  Reorganizer,
  sampleTreasuryConfig,
  setupEmulator,
} from "../utilities.test";
import { loadTreasuryScript, unix_to_slot } from "../../shared";
import { reorganize } from "../../treasury/reorganize";
import {
  TreasurySpendRedeemer,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../types/contracts";

describe("When reorganizing", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let config: TreasuryConfiguration;
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let scriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    config = await sampleTreasuryConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, config);
    rewardAccount = treasury.rewardAccount;
    treasuryScript = treasury.script;
    scriptAddress = treasury.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(scriptAddress, makeValue(500_000_000_000n)),
    );
    scriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(scriptInput);

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(scriptAddress, makeValue(100_000_000_000n)),
    );
    secondScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        scriptAddress,
        makeValue(500_000n, ["a".repeat(64), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    thirdScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(thirdScriptInput);

    refInput = emulator.lookupScript(treasuryScript.Script);
  });

  describe("the treasury oversight committee", () => {
    test("can split a UTxO", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize(
            config,
            blaze,
            [scriptInput],
            [makeValue(100_000_000_000n), makeValue(400_000_000_000n)],
            [Ed25519KeyHashHex(await reorganize_key(emulator))],
          ),
        );
      });
    });

    test("can merge UTxOs", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize(
            config,
            blaze,
            [scriptInput, secondScriptInput],
            [makeValue(600_000_000_000n)],
            [Ed25519KeyHashHex(await reorganize_key(emulator))],
          ),
        );
      });
    });

    test("can rebalance UTxOs", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize(
            config,
            blaze,
            [scriptInput, secondScriptInput],
            [
              makeValue(200_000_000_000n),
              makeValue(200_000_000_000n),
              makeValue(200_000_000_000n),
            ],
            [Ed25519KeyHashHex(await reorganize_key(emulator))],
          ),
        );
      });
    });

    test("can rebalance UTxOs with native assets", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize(
            config,
            blaze,
            [scriptInput, thirdScriptInput],
            [makeValue(500_000_500_000n, ["a".repeat(64), 1n])],
            [Ed25519KeyHashHex(await reorganize_key(emulator))],
          ),
        );
      });
    });

    test("can rebalance to resolve minUTxO issues", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize(
            config,
            blaze,
            [thirdScriptInput],
            [makeValue(2_000_000n, ["a".repeat(64), 1n])],
            [Ed25519KeyHashHex(await reorganize_key(emulator))],
          ),
        );
      });
    });

    test("cannot steal funds", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(refInput),
          /equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });

    test("cannot steal partial funds", async () => {
      await emulator.as(Reorganizer, async (blaze, address) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .lockAssets(scriptAddress, makeValue(499_999_999_999n), Data.Void())
            .payLovelace(address, 1_000_000n)
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(refInput),
          /equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });

    test("cannot steal native assets", async () => {
      await emulator.as(Reorganizer, async (blaze, address) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .addInput(
              thirdScriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .lockAssets(scriptAddress, makeValue(500_000_500_000n), Data.Void())
            .payAssets(address, makeValue(2_000_000n, ["a".repeat(64), 1n]))
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(refInput),
          /equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });

    test("cannot add native assets", async () => {
      await emulator.as(Reorganizer, async (blaze, address) => {
        await emulator.fund(
          Reorganizer,
          makeValue(2_000_000n, ["b".repeat(64), 1n]),
        );
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .lockAssets(
              scriptAddress,
              makeValue(500_000_00_000n, ["b".repeat(64), 1n]),
              Data.Void(),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(refInput),
          /equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });
  });

  describe("a malicious user", () => {
    test("cannot reorganize UTxOs", async () => {
      await emulator.as("MaliciousUser", async (blaze, address) => {
        await emulator.expectScriptFailure(
          await reorganize(
            config,
            blaze,
            [scriptInput],
            [makeValue(100_000_000_000n), makeValue(400_000_000_000n)],
            [Ed25519KeyHashHex(address.asBase()?.getPaymentCredential().hash!)],
          ),
          /satisfied\(config.permissions.reorganize/,
        );
      });
    });
  });
});
