import {
  Address,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import {
  AllowlistConfig,
  AllowlistVendorAllowlistVendorWithdraw,
  MultisigScript,
  VendorDatum,
} from "../../src/generated-types/contracts";
import {
  coreAddressToContractsAddress,
  coreValueToContractsValue,
  ICompiledScript,
  loadAllowlistScript,
  loadTreasuryScript,
  loadVendorScript,
  TConfigsOrScripts,
} from "../../src/shared";
import { fund } from "../../src/treasury";
import {
  fund_key,
  Funder,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities";

describe("With a vendor with the allowlist script", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let treasuryInput: Core.TransactionUnspentOutput;
  let scriptInput: Core.TransactionUnspentOutput;
  let firstDatum: VendorDatum;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let secondDatum: VendorDatum;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let thirdDatum: VendorDatum;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let fourthDatum: VendorDatum;
  let fifthScriptInput: Core.TransactionUnspentOutput;
  let fifthDatum: VendorDatum;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let vendorScriptAddress: Address;
  let configsOrScripts: TConfigsOrScripts;
  let allowlist: ICompiledScript<
    AllowlistVendorAllowlistVendorWithdraw,
    AllowlistConfig
  >;
  let allowedAddresses: Address[];
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
      true,
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
      true,
    );
    configsOrScripts = {
      configs: { treasury: treasuryConfig, vendor: vendorConfig, trace: true },
    };
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    allowedAddresses = await Promise.all([
      emulator.register("Allowed 1"),
      emulator.register("Allowed 2"),
      emulator.register("Allowed 3"),
    ]);

    allowlist = loadAllowlistScript(Core.NetworkId.Testnet, {
      registry_token: vendorConfig.registry_token,
      addresses: allowedAddresses.map(coreAddressToContractsAddress),
    });
    emulator.accounts.set(allowlist.rewardAccount!, 0n);
    await emulator.publishScript(allowlist.script.Script);

    vendor = {
      AllOf: {
        scripts: [
          {
            Signature: {
              key_hash: await vendor_key(emulator),
            },
          },
          {
            Script: {
              script_hash: allowlist.script.Script.hash(),
            },
          },
        ],
      },
    };

    treasuryInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 5n),
      new Core.TransactionOutput(
        treasuryScriptManifest.scriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    treasuryInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(treasuryInput);

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

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(100_000_000n, ["b".repeat(56), 200_000_000_000n]),
      ),
    );
    secondDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 100000n,
          value: coreValueToContractsValue(
            makeValue(100_000_000n, ["b".repeat(56), 200_000_000_000n]),
          ),
          status: "Active",
        },
      ],
    };
    secondScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, secondDatum)),
      );
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(20_000_000n, ["a".repeat(56), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    thirdDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 2000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(makeValue(0n, ["a".repeat(56), 1n])),
          status: "Active",
        },
      ],
    };
    thirdScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, thirdDatum)),
      );
    emulator.addUtxo(thirdScriptInput);
    fourthDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
        {
          maturation: 2000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Paused",
        },
        {
          maturation: 10000n,
          value: coreValueToContractsValue(makeValue(10_000_000n)),
          status: "Active",
        },
      ],
    };
    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 3n),
      new Core.TransactionOutput(vendorScriptAddress, makeValue(30_000_000n)),
    );
    fourthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fourthDatum)),
      );
    emulator.addUtxo(fourthScriptInput);
    fifthDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(
            makeValue(0n, ["c".repeat(56), 100n]),
          ),
          status: "Active",
        },
      ],
    };
    fifthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 4n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(3_000_000n, ["c".repeat(56), 100n]),
      ),
    );
    fifthScriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, fifthDatum)),
      );
    emulator.addUtxo(fifthScriptInput);
  });

  describe("the oversight committee", () => {
    test("can fund a new project", async () => {
      const tx = await emulator.as(Funder, async (blaze) => {
        return fund({
          configsOrScripts,
          blaze,
          input: treasuryInput,
          vendor,
          schedule: [
            {
              date: new Date(Number(emulator.slotToUnix(Slot(10)))),
              amount: makeValue(10_000_000_000n),
            },
          ],
          signers: [
            Ed25519KeyHashHex(await fund_key(emulator)),
            Ed25519KeyHashHex(await vendor_key(emulator)),
          ],
          additionalScripts: [
            { script: allowlist.script.Script, redeemer: Data.Void() },
          ],
        });
      });
      await emulator.expectValidMultisignedTransaction([Funder, Vendor], tx);
    });
  });
});
