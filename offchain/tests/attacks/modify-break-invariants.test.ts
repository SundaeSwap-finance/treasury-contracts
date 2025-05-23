import { beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  Transaction,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  Modifier,
  modify_key,
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
} from "../../shared";
import {
  MultisigScript,
  TreasuryConfiguration,
  VendorConfiguration,
  VendorDatum,
} from "../../types/contracts";
import { modify } from "../../vendor/modify";

describe("", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let initialDatum: VendorDatum;
  let afterExpiryDatum: VendorDatum;
  let vendor: MultisigScript;
  let modifySigner: Ed25519KeyHashHex;
  let vendorSigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScriptAddress: Address;
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
    initialDatum = {
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
        Core.Datum.newInlineData(Data.serialize(VendorDatum, initialDatum)),
      );
    emulator.addUtxo(scriptInput);

    // Identical to the initial datum, but the date is set after the expiry
    // of the contract
    afterExpiryDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: configs.vendor.expiration + 1000n,
          value: coreValueToContractsValue(makeValue(500_000_000_000n)),
          status: "Active",
        }
      ]
    };
  });

  describe("the oversight committee", () => {
    describe("can modify", () => {
      test("the maturity date to be after the expiration date", async () => {
        let signedTx: Transaction;
        await emulator.as(Modifier, async (blaze) => {
          const tx = await modify(
            configs,
            blaze,
            new Date(Number(slot_to_unix(Slot(0)))),
            scriptInput,
            afterExpiryDatum,
            [modifySigner, vendorSigner],
          );
          const completedTx = await tx.complete();
          signedTx = completedTx;
        });
        await emulator.as(Modifier, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        await emulator.as(Vendor, async (blaze) => {
          signedTx = await blaze.signTransaction(signedTx);
        });
        const txId = await emulator.submitTransaction(signedTx!);
        emulator.awaitTransactionConfirmation(txId);
      });
    });
  });
});
