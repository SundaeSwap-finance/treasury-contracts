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

describe("Sweep spam attack", () => {
  let emulator: Emulator;
  let treasuryConfig: TreasuryConfiguration;
  let treasuryInput: Core.TransactionUnspentOutput;
  let treasuryAddress: Address;
  let treasuryRefInput: Core.TransactionUnspentOutput;
  let provider: EmulatorProvider;

  const printUtxosAtAddress = async (address:Address) => {
    console.log(JSON.stringify((await provider.getUnspentOutputs(address)).map(u => u.toCore()), null, 2))
  }

  beforeEach(async () => {
    emulator = await setupEmulator([], 2);
    treasuryConfig = await sampleTreasuryConfig(emulator, 0);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig);
    treasuryAddress = treasury.scriptAddress
    treasuryInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        treasury.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    treasuryInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasuryInput);


    provider = new EmulatorProvider(emulator);
    treasuryRefInput = emulator.lookupScript(treasury.script.Script);
  });

  describe("after the timeout", () => {
    beforeEach(() => {
      emulator.stepForwardToUnix(treasuryConfig.expiration + 1n);
    });

    describe("a malicious user", () => {
      test("can spam single lovelace sweep to introduce contention on treasury utxos", async () => {
        await emulator.as("MaliciousUser", async (blaze, addr) => {
          console.log('UTxOs at treasury address before sweep')
          printUtxosAtAddress(treasuryAddress)
          await emulator.expectValidTransaction(
            blaze,
            await sweep(treasuryConfig, treasuryInput, blaze, 1n)
          );
          console.log('UTxOs at treasury address after single lovelace sweep')
          printUtxosAtAddress(treasuryAddress)
        });
      });
    });
  });
});


