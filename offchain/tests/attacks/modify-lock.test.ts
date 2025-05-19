import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  Transaction,
  TransactionId,
  TransactionInput,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  Modifier,
  modify_key,
  pause_key,
  Pauser,
  registryToken,
  resume_key,
  Resumer,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities.test";
import {
  loadTreasuryScript,
  loadVendorScript,
  coreValueToContractsValue,
  slot_to_unix,
  unix_to_slot,
} from "../../shared";
import {
  MultisigScript,
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
} from "../../types/contracts";
import { withdraw } from "../../vendor/withdraw";
import { adjudicate } from "../../vendor/adjudicate";
import { cancel, modify } from "../../vendor/modify";


(BigInt.prototype as any).toJSON = function() {
  return this.toString()
} 


describe("", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let firstDatum: VendorDatum;

  let fourthScriptInput: Core.TransactionUnspentOutput;
  let fourthDatum: VendorDatum;
  let fifthScriptInput: Core.TransactionUnspentOutput;
  let fifthDatum: VendorDatum;
  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let modifySigner: Ed25519KeyHashHex;
  let vendorSigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScript: VendorVendorSpend;
  let vendorScriptAddress: Address;
  let provider: EmulatorProvider;

  const printUtxosAtAddress = async (address:Address) => {
    console.log(JSON.stringify((await provider.getUnspentOutputs(address)).map(u => u.toCore()), null, 2))
  }


  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
    );
    configs = { treasury: treasuryConfig, vendor: vendorConfig };
    rewardAccount = treasuryScriptManifest.rewardAccount;
    vendorScript = vendorScriptManifest.script;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    modifySigner = Ed25519KeyHashHex(await modify_key(emulator));
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    firstDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(500_000_000_000n)),
          status: "Active",
        },
      ],
    };

    scriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, firstDatum)),
      );
    emulator.addUtxo(scriptInput);

 
    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName)),
    )!;

    refInput = emulator.lookupScript(vendorScript.Script);
    provider = new EmulatorProvider(emulator);
  });

  describe("the oversight committee", () => {
    describe("can modify", () => {
      test("with the vendors permission", async () => {
        let signedTx: Transaction;
        let txId: TransactionId;
        let newScriptInput: TransactionUnspentOutput;
        await emulator.as(Modifier, async (blaze) => {
          let thirty_six_hours = 36n * 60n * 60n * 1000n;
          let now = new Date(Number(slot_to_unix(Slot(0))));
          let secondDatum: VendorDatum = {
              vendor: vendor,
              payouts: [
                {
                  maturation: 1000n,
                  value: coreValueToContractsValue(makeValue(500_000_000_000_000n)), // increase payout without increasing value
                  status: "Active",
                },
              ],
            };
          const tx = await blaze.newTransaction()
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
              .setValidUntil(unix_to_slot(BigInt(now.valueOf()) + thirty_six_hours))
              .addInput(scriptInput, Data.serialize(VendorSpendRedeemer, "Modify"))
              .addRequiredSigner(modifySigner)
              .addRequiredSigner(vendorSigner)
              .lockAssets(vendorScriptAddress, scriptInput.output().amount(), Data.serialize(VendorDatum, secondDatum))

          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
          txId = signedTx.getId()
          emulator.submitTransaction(signedTx!);
        });
        
        // The payout is not claimable by the vendor as there is not enough value in the utxo
        await emulator.as(Vendor, async (blaze, addr) => {
          emulator.stepForwardToSlot(2n);
          let now = new Date(Number(slot_to_unix(Slot(2))));
          newScriptInput = (
            await blaze.provider.resolveUnspentOutputs([
              TransactionInput.fromCore({
                txId: txId,
                index: 0,
              }),
            ])
          )[0];
          await emulator.expectScriptFailure(
            await blaze.newTransaction()
                .addReferenceInput(refInput)
                .setValidFrom(unix_to_slot(BigInt(now.valueOf())))
                .addRequiredSigner(vendorSigner)
                .addInput(newScriptInput, Data.serialize(VendorSpendRedeemer, "Withdraw"))
                .payAssets(addr, newScriptInput.output().amount()) // trying to claim the remaining value in the script even though it is less than the payout
            ,
            /output.address.payment_credential == account/)
        });
      });
    });
  });
});
