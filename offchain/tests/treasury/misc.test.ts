import { beforeEach, describe, test } from "bun:test";
import { Core } from "@blaze-cardano/sdk";
import { Credential } from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import { sampleTreasuryConfig, setupEmulator } from "../utilities.test";
import { loadTreasuryScript } from "../../shared";
import type { TreasuryConfiguration } from "../../types/contracts";

describe("A malicious user", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let credential: any; // TODO: type this?
  let config: TreasuryConfiguration;
  let refInput: Core.TransactionUnspentOutput;
  beforeEach(async () => {
    emulator = await setupEmulator();
    config = await sampleTreasuryConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, config);
    credential = treasury.credential;
    emulator.accounts.set(treasury.rewardAccount, amount);
    refInput = emulator.lookupScript(treasury.script.Script);
  });

  test("cannot deregister stake address", async () => {
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
