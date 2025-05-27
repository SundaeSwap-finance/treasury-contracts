import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import {
  loadTreasuryScript,
  coreValueToContractsValue as translateValue,
} from "../../src/shared";
import { disburse } from "../../src/treasury/disburse";
import {
  TreasurySpendRedeemer,
  VendorConfiguration,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../src/types/contracts";
import {
  Disburser,
  Funder,
  disburse_key,
  fund_key,
  registryToken,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
} from "../utilities";

describe("When disbursing", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let registryInput: Core.TransactionUnspentOutput;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let treasuryScriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig);
    // const vendorScript = loadVendorScript(Core.NetworkId.Testnet, vendorConfig);
    configs = { treasury: treasuryConfig, vendor: vendorConfig };
    rewardAccount = treasury.rewardAccount!;
    treasuryScript = treasury.script;
    treasuryScriptAddress = treasury.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    scriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(scriptInput);

    secondScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 1n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(100_000_000_000n),
      ),
    );
    secondScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(secondScriptInput);

    thirdScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(500_000n, ["a".repeat(56), 1n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    thirdScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(thirdScriptInput);

    fourthScriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 2n),
      new Core.TransactionOutput(
        treasuryScriptAddress,
        makeValue(50_000_000n, ["b".repeat(56), 100n]), // Below minUTxO to test equals_plus_min_ada
      ),
    );
    // TODO: update blaze to allow spending null datums for plutus v3
    fourthScriptInput.output().setDatum(Core.Datum.newInlineData(Data.Void()));
    emulator.addUtxo(fourthScriptInput);

    const [registryPolicy, registryName] = registryToken();
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
    describe("before the expiration", async () => {
      test("can disburse funds", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectValidTransaction(
            blaze,
            await disburse(
              configs,
              blaze,
              scriptInput,
              vendor,
              makeValue(10_000_000n),
              undefined,
              [Ed25519KeyHashHex(await disburse_key(emulator))],
            ),
          );
        });
      });
      test("can disburse all funds", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectValidTransaction(
            blaze,
            await disburse(
              configs,
              blaze,
              scriptInput,
              vendor,
              makeValue(500_000_000_000n),
              undefined,
              [Ed25519KeyHashHex(await disburse_key(emulator))],
            ),
          );
        });
      });
      test("can disburse native assets", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectValidTransaction(
            blaze,
            await disburse(
              configs,
              blaze,
              fourthScriptInput,
              vendor,
              makeValue(2_000_000n, ["b".repeat(56), 50n]),
              undefined,
              [Ed25519KeyHashHex(await disburse_key(emulator))],
            ),
          );
        });
      });
      test("can disburse *only* native assets", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectValidTransaction(
            blaze,
            await disburse(
              configs,
              blaze,
              fourthScriptInput,
              vendor,
              makeValue(0n, ["b".repeat(56), 50n]),
              undefined,
              [Ed25519KeyHashHex(await disburse_key(emulator))],
            ),
          );
        });
      });
      test("cannot change stake address type of change", async () => {
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
        await emulator.as(Funder, async (blaze, address) => {
          const value = translateValue(makeValue(10_000_000n));
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .setValidUntil(
                Slot(Number(configs.treasury.expiration / 1000n) - 1),
              )
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, {
                  Disburse: {
                    amount: value,
                  },
                }),
              )
              .payAssets(address, makeValue(10_000_000n))
              .lockAssets(
                fullAddress,
                makeValue(499_990_000_000n),
                Data.Void(),
              ),
            /expect target.stake_credential == Some\(Referenced.Inline\(account\)\)/,
          );
        });
      });
      test("cannot change stake address hash of change", async () => {
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
        await emulator.as(Funder, async (blaze, address) => {
          const value = translateValue(makeValue(10_000_000n));
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .setValidUntil(
                Slot(Number(configs.treasury.expiration / 1000n) - 1),
              )
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, {
                  Disburse: {
                    amount: value,
                  },
                }),
              )
              .payAssets(address, makeValue(10_000_000n))
              .lockAssets(
                fullAddress,
                makeValue(499_990_000_000n),
                Data.Void(),
              ),
            /expect target.stake_credential == Some\(Referenced.Inline\(account\)\)/,
          );
        });
      });
    });
    describe("after the expiration", async () => {
      beforeEach(async () => {
        emulator.stepForwardToUnix(configs.treasury.expiration + 1n);
      });
      test("cannot disburse ADA", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectScriptFailure(
            blaze
              .newTransaction()
              .setValidUntil(
                Slot(Number(5000n + configs.treasury.expiration / 1000n)),
              )
              .addReferenceInput(registryInput)
              .addReferenceInput(refInput)
              .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
              .addInput(
                scriptInput,
                Data.serialize(TreasurySpendRedeemer, {
                  Disburse: {
                    amount: translateValue(makeValue(10_000_000n)),
                  },
                }),
              )
              .lockAssets(
                treasuryScriptAddress,
                makeValue(499_990_000_000n),
                Data.Void(),
              )
              .payAssets(vendor, makeValue(10_000_000n)),
            /Trace is_entirely_before\(/,
          );
        });
      });
      test("can disburse *only* native tokens", async () => {
        await emulator.as(Disburser, async (blaze) => {
          const vendor = await emulator.register("Vendor");
          await emulator.expectValidTransaction(
            blaze,
            await disburse(
              configs,
              blaze,
              fourthScriptInput,
              vendor,
              makeValue(0n, ["b".repeat(56), 50n]),
              undefined,
              [Ed25519KeyHashHex(await disburse_key(emulator))],
              true,
            ),
          );
        });
      });
    });
  });
  describe("a malicious user", async () => {
    test("cannot disburse funds", async () => {
      await emulator.as("MaliciousUser", async (blaze) => {
        const vendor = await emulator.register("Vendor");
        await emulator.expectScriptFailure(
          blaze
            .newTransaction()
            .setValidUntil(Slot(Number(10)))
            .addReferenceInput(registryInput)
            .addReferenceInput(refInput)
            .addRequiredSigner(Ed25519KeyHashHex(await fund_key(emulator)))
            .addInput(
              scriptInput,
              Data.serialize(TreasurySpendRedeemer, {
                Disburse: {
                  amount: translateValue(makeValue(10_000_000n)),
                },
              }),
            )
            .payAssets(vendor, makeValue(10_000_000n))
            .lockAssets(
              treasuryScriptAddress,
              makeValue(499_990_000_000n),
              Data.Void(),
            ),
          /Trace satisfied\(permissions.disburse/,
        );
      });
    });
  });
});
