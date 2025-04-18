import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  Funder,
  fund_key,
  registryToken,
  reorganize_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
} from "../utilities.test";
import {
  coreValueToContractsValue as translateValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
  coreValueToContractsValue,
} from "../../shared";
import {
  MultisigScript,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
  VendorSpendRedeemer,
  VendorVendorSpend,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../types/contracts";
import { fund } from "../../treasury/fund";
import { sweep_malformed } from "../../vendor/malformed";

describe("With a malformed datum", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let vendorScript: VendorVendorSpend;
  let treasuryScriptAddress: Address;
  let vendorScriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = sampleVendorConfig();
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
    treasuryScript = treasuryScriptManifest.script;
    vendorScript = vendorScriptManifest.script;
    treasuryScriptAddress = treasuryScriptManifest.scriptAddress;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await reorganize_key(emulator),
      },
    };

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    scriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(scriptInput);

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(100_000_000_000n),
      ),
    );
    secondScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000n, ["a".repeat(56), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    let vendorDatum: VendorDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1n,
          value: coreValueToContractsValue(makeValue(1_000_000n)),
          status: "Active",
        },
      ],
    };
    thirdScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, vendorDatum)),
      );
    emulator.addUtxo(thirdScriptInput);

    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(50_000_000n, ["b".repeat(56), 100n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    fourthScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(fourthScriptInput);

    let [registryPolicy, registryName] = registryToken();
    registryInput = emulator.utxos().find((u) =>
      u
        .output()
        .amount()
        .multiasset()
        ?.get(AssetId(registryPolicy + registryName)),
    )!;

    refInput = emulator.lookupScript(vendorScript.Script);
  });

  describe("anyone", () => {
    test("can sweep back to the treasury contract", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await sweep_malformed(configs, [scriptInput], blaze),
        );
      });
    });
    test("can sweep multiple back to the treasury contract", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await sweep_malformed(
            configs,
            [scriptInput, secondScriptInput],
            blaze,
          ),
        );
      });
    });
    test("cannot sweep with valid datum", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectScriptFailure(
          await sweep_malformed(configs, [thirdScriptInput], blaze),
          /Trace expect\n                  inputs\n                    |> list.filter\(/,
        );
      });
    });
    test("cannot steal", async () => {
      await emulator.as("Anyone", async (blaze) => {
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .addInput(
              scriptInput,
              Data.serialize(VendorSpendRedeemer, "Malformed"),
            ),
          /Trace expect equal_plus_min_ada\(input_sum, output_sum\)/,
        );
      });
    });
    test("cannot attach stake address", async () => {
      await emulator.as("Anyone", async (blaze) => {
        let fullAddress = new Core.Address({
          type: Core.AddressType.BasePaymentScriptStakeKey,
          networkId: Core.NetworkId.Testnet,
          paymentPart: {
            type: Core.CredentialType.ScriptHash,
            hash: treasuryScript.Script.hash(),
          },
          delegationPart: {
            type: Core.CredentialType.KeyHash,
            hash: treasuryScript.Script.hash(), // Just use an arbitrary hash
          },
        });
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .addInput(
              scriptInput,
              Data.serialize(VendorSpendRedeemer, "Malformed"),
            )
            .lockAssets(fullAddress, makeValue(500_000_000_000n), Data.Void()),
          /Trace expect or {\n                            allow_stake,/,
        );
      });
    });
  });
});
