import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import { loadTreasuryScript, unix_to_slot } from "../../src/shared";
import { reorganize } from "../../src/treasury/reorganize";
import {
  TreasurySpendRedeemer,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../src/types/contracts";
import {
  registryToken,
  reorganize_key,
  Reorganizer,
  sampleTreasuryConfig,
  setupEmulator,
} from "../utilities";

describe("When reorganizing", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let config: TreasuryConfiguration;
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let scriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    config = await sampleTreasuryConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, config);
    rewardAccount = treasury.rewardAccount!;
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
        makeValue(500_000n, ["a".repeat(56), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    thirdScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(thirdScriptInput);

    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName)),
    )!;

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
            [makeValue(500_000_500_000n, ["a".repeat(56), 1n])],
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
            [makeValue(2_000_000n, ["a".repeat(56), 1n])],
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
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput),
          /Trace equal_plus_min_ada\(input_sum, output_sum\)/,
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
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .lockAssets(scriptAddress, makeValue(499_999_999_999n), Data.Void())
            .payLovelace(address, 1_000_000n)
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput),
          /Trace equal_plus_min_ada\(input_sum, output_sum\)/,
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
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .lockAssets(scriptAddress, makeValue(500_000_500_000n), Data.Void())
            .payAssets(address, makeValue(2_000_000n, ["a".repeat(56), 1n]))
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput),
          /Trace equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });

    test("cannot change staking address type", async () => {
      const fullAddress = new Core.Address({
        type: Core.AddressType.BasePaymentScriptStakeKey,
        networkId: Core.NetworkId.Testnet,
        paymentPart: {
          type: Core.CredentialType.ScriptHash,
          hash: treasuryScript.Script.hash(),
        },
        delegationPart: {
          type: Core.CredentialType.KeyHash, // Not a script
          hash: treasuryScript.Script.hash(),
        },
      });
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .lockAssets(
              fullAddress,
              scriptInput.output().amount(),
              Data.Void(),
            ),
          /expect target.stake_credential == Some\(Referenced.Inline\(account\)\)/,
        );
      });
    });

    test("cannot change staking address hash", async () => {
      const fullAddress = new Core.Address({
        type: Core.AddressType.BasePaymentScriptStakeScript,
        networkId: Core.NetworkId.Testnet,
        paymentPart: {
          type: Core.CredentialType.ScriptHash,
          hash: treasuryScript.Script.hash(),
        },
        delegationPart: {
          type: Core.CredentialType.ScriptHash,
          hash: "0".repeat(56), // Just use an arbitrary hash
        },
      });
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, "Reorganize"),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .lockAssets(
              fullAddress,
              scriptInput.output().amount(),
              Data.Void(),
            ),
          /expect target.stake_credential == Some\(Referenced.Inline\(account\)\)/,
        );
      });
    });

    test("cannot add native assets", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.fund(
          Reorganizer,
          makeValue(2_000_000n, ["b".repeat(56), 1n]),
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
              makeValue(500_000_00_000n, ["b".repeat(56), 1n]),
              Data.Void(),
            )
            .addRequiredSigner(
              Ed25519KeyHashHex(await reorganize_key(emulator)),
            )
            .setValidUntil(unix_to_slot(config.expiration - 1000n))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput),
          /Trace equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });

    describe("after the timeout", async () => {
      beforeEach(async () => {
        emulator.stepForwardToUnix(config.expiration + 1n);
      });

      test("cannot rebalance", async () => {
        await emulator.as(Reorganizer, async (blaze) => {
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .setValidUntil(unix_to_slot(config.expiration + 5000n))
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .addRequiredSigner(
                Ed25519KeyHashHex(await reorganize_key(emulator)),
              )
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, "Reorganize"),
              )
              .lockAssets(
                scriptAddress,
                makeValue(500_000_000_000n),
                Data.Void(),
              ),
            /Trace is_entirely_before\(/,
          );
        });
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
          /Trace satisfied\(config.permissions.reorganize/,
        );
      });
    });
  });
});
