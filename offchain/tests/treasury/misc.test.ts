import {
  Address,
  Credential,
  Datum,
  Ed25519KeyHashHex,
  HexBlob,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { type Cardano } from "@cardano-sdk/core";
import { beforeEach, describe, test } from "bun:test";

import { IConfigs, loadTreasuryScript } from "../../src/shared";
import { reorganize } from "../../src/treasury/reorganize";
import {
  reorganize_key,
  Reorganizer,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
} from "../utilities";

describe("", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let credential: Cardano.Credential;
  let scriptInputNoDatum: Core.TransactionUnspentOutput;
  let scriptInputRandomDatum: Core.TransactionUnspentOutput;
  let configs: IConfigs;
  let refInput: Core.TransactionUnspentOutput;
  // let treasuryScript: TreasuryTreasuryWithdraw;
  let scriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    configs = {
      treasury: await sampleTreasuryConfig(emulator),
      vendor: await sampleVendorConfig(emulator),
      trace: true,
    };
    const treasury = loadTreasuryScript(
      Core.NetworkId.Testnet,
      configs.treasury,
      true,
    );
    credential = treasury.credential;
    // treasuryScript = treasury.script;
    scriptAddress = treasury.scriptAddress;

    emulator.accounts.set(treasury.rewardAccount!, amount);

    scriptInputNoDatum = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(scriptAddress, makeValue(500_000_000_000n)),
    );
    emulator.addUtxo(scriptInputNoDatum);
    scriptInputRandomDatum = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(scriptAddress, makeValue(500_000_000_000n)),
    );
    // Set a random datum
    scriptInputRandomDatum
      .output()
      .setDatum(
        Datum.newInlineData(Core.PlutusData.fromCbor(HexBlob("1234567890"))),
      );
    emulator.addUtxo(scriptInputRandomDatum);

    refInput = emulator.lookupScript(treasury.script.Script);
  });

  describe("A permissioned user", async () => {
    // TODO: blaze / uplc crate don't let us spend with no datum
    test("can spend with no datum", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize({
            configsOrScripts: { configs },
            blaze,
            inputs: [scriptInputNoDatum],
            outputAmounts: [
              makeValue(100_000_000_000n),
              makeValue(400_000_000_000n),
            ],
            signers: [Ed25519KeyHashHex(await reorganize_key(emulator))],
          }),
        );
      });
    });
    test("can spend with arbitrary datum", async () => {
      await emulator.as(Reorganizer, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await reorganize({
            configsOrScripts: { configs },
            blaze,
            inputs: [scriptInputRandomDatum],
            outputAmounts: [
              makeValue(100_000_000_000n),
              makeValue(400_000_000_000n),
            ],
            signers: [Ed25519KeyHashHex(await reorganize_key(emulator))],
          }),
        );
      });
    });
  });

  describe("anyone", async () => {
    test("can deregister after the expiration", async () => {
      emulator.as("Anyone", async (blaze) => {
        const future = blaze.provider.unixToSlot(
          configs.treasury.expiration * 2n,
        );
        emulator.stepForwardToSlot(future);
        emulator.expectValidTransaction(
          blaze,
          blaze
            .newTransaction()
            .setValidFrom(future)
            .addReferenceInput(refInput!)
            .addDeregisterStake(Credential.fromCore(credential), Data.Void()),
        );
      });
    });
  });

  describe("A malicious user", async () => {
    test("cannot deregister stake address before expiration", async () => {
      emulator.as("MaliciousUser", async (blaze) => {
        emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(refInput!)
            .addDeregisterStake(Credential.fromCore(credential), Data.Void()),
          /Validator returned false/,
        );
      });
    });

    test("cannot delegate to a pool", async () => {
      emulator.as("MaliciousUser", async (blaze) => {
        emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(refInput!)
            .addDelegation(
              Credential.fromCore(credential),
              Core.PoolId(
                "pool1x9q4jf3zwftwygeeulku8xtlywmtmzwxjk2g3fz3j5mlwjqnr3p",
              ),
              Data.Void(),
            ),
        );
      });
    });
  });
});
