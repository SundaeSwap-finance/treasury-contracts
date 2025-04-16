import { beforeAll, beforeEach, describe, test } from "bun:test";
import { Core, makeValue } from "@blaze-cardano/sdk";
import {
  Address,
  AssetId,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
  toHex,
} from "@blaze-cardano/core";
import { Emulator } from "@blaze-cardano/emulator";
import * as Data from "@blaze-cardano/data";
import {
  Funder,
  fund_key,
  reorganize_key,
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
} from "../utilities.test";
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  slot_to_unix,
  unix_to_slot,
} from "../../shared";
import { reorganize } from "../../treasury/reorganize";
import {
  MultisigScript,
  TreasurySpendRedeemer,
  VendorConfiguration,
  VendorDatum,
  type TreasuryConfiguration,
  type TreasuryTreasuryWithdraw,
} from "../../types/contracts";
import { fund } from "../../treasury/fund";

describe("When funding", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let configs: { treasury: TreasuryConfiguration; vendor: VendorConfiguration };
  let scriptInput: Core.TransactionUnspentOutput;
  let secondScriptInput: Core.TransactionUnspentOutput;
  let thirdScriptInput: Core.TransactionUnspentOutput;
  let fourthScriptInput: Core.TransactionUnspentOutput;
  let refInput: Core.TransactionUnspentOutput;
  let vendor: MultisigScript;
  let rewardAccount: RewardAccount;
  let treasuryScript: TreasuryTreasuryWithdraw;
  let treasuryScriptAddress: Address;
  let vendorScriptAddress: Address;
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = sampleVendorConfig();
    const treasury = loadTreasuryScript(Core.NetworkId.Testnet, treasuryConfig);
    const vendorScript = loadVendorScript(Core.NetworkId.Testnet, vendorConfig);
    configs = { treasury: treasuryConfig, vendor: vendorConfig };
    rewardAccount = treasury.rewardAccount;
    treasuryScript = treasury.script;
    treasuryScriptAddress = treasury.scriptAddress;
    vendorScriptAddress = vendorScript.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await reorganize_key(emulator),
      },
    };

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

    refInput = emulator.lookupScript(treasuryScript.Script);
  });

  describe("the treasury oversight committee", () => {
    describe("before the expiration", async () => {
      test("can fund a new project", async () => {
        await emulator.as(Funder, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await fund(
              configs,
              blaze,
              scriptInput,
              vendor,
              [
                {
                  date: new Date(Number(slot_to_unix(Slot(10)))),
                  amount: makeValue(10_000_000_000n),
                },
              ],
              [Ed25519KeyHashHex(await fund_key(emulator))],
            ),
          );
        });
      });
      test("can fund a new project without change", async () => {
        await emulator.as(Funder, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await fund(
              configs,
              blaze,
              scriptInput,
              vendor,
              [
                {
                  date: new Date(Number(slot_to_unix(Slot(10)))),
                  amount: makeValue(500_000_000_000n),
                },
              ],
              [Ed25519KeyHashHex(await fund_key(emulator))],
            ),
          );
        });
      });
      test("can fund a new project with multiple payouts", async () => {
        await emulator.as(Funder, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await fund(
              configs,
              blaze,
              scriptInput,
              vendor,
              [
                {
                  date: new Date(Number(slot_to_unix(Slot(10)))),
                  amount: makeValue(250_000_000_000n),
                },
                {
                  date: new Date(Number(slot_to_unix(Slot(12)))),
                  amount: makeValue(250_000_000_000n),
                },
              ],
              [Ed25519KeyHashHex(await fund_key(emulator))],
            ),
          );
        });
      });
      test("can fund a new project with native tokens", async () => {
        await emulator.as(Funder, async (blaze) => {
          await emulator.expectValidTransaction(
            blaze,
            await fund(
              configs,
              blaze,
              fourthScriptInput,
              vendor,
              [
                {
                  date: new Date(Number(slot_to_unix(Slot(10)))),
                  amount: makeValue(10_000_000n),
                },
                {
                  date: new Date(Number(slot_to_unix(Slot(12)))),
                  amount: makeValue(10_000_000n, ["b".repeat(56), 50n]),
                },
              ],
              [Ed25519KeyHashHex(await fund_key(emulator))],
            ),
          );
        });
      });
      test("can fund a new project with minUtXO problems", async () => {
        await emulator.as(Funder, async (blaze) => {
          // This will consume all 50 ADA, but not all 50 `b`, meaning
          // the change UTxO will need some additional minUTxO
          await emulator.expectValidTransaction(
            blaze,
            await fund(
              configs,
              blaze,
              fourthScriptInput,
              vendor,
              [
                {
                  date: new Date(Number(slot_to_unix(Slot(10)))),
                  amount: makeValue(25_000_000n),
                },
                {
                  date: new Date(Number(slot_to_unix(Slot(12)))),
                  amount: makeValue(25_000_000n, ["b".repeat(56), 50n]),
                },
              ],
              [Ed25519KeyHashHex(await fund_key(emulator))],
            ),
          );
        });
      });
      test("cannot steal funds", async () => {
        await emulator.as(Funder, async (blaze) => {
          let registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(
              configs.treasury.registry_token + toHex(Buffer.from("REGISTRY")),
            ),
          );
          let value = coreValueToContractsValue(makeValue(1_000_000n));
          const datum: VendorDatum = {
            vendor,
            payouts: [
              {
                maturation: BigInt(10),
                value,
                status: "Active",
              },
            ],
          };
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
                  Fund: {
                    amount: value,
                  },
                }),
              )
              .lockAssets(
                vendorScriptAddress,
                makeValue(1_000_000n),
                Data.serialize(VendorDatum, datum),
              ),
            /payout_sum == amount/,
          );
        });
      });
      test("cannot mismatch redeemer and datum payout", async () => {
        await emulator.as(Funder, async (blaze) => {
          let registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(
              configs.treasury.registry_token + toHex(Buffer.from("REGISTRY")),
            ),
          );
          let value = coreValueToContractsValue(makeValue(1_000_000n));
          const datum: VendorDatum = {
            vendor,
            payouts: [
              {
                maturation: BigInt(10),
                value,
                status: "Active",
              },
            ],
          };
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
                  Fund: {
                    amount: coreValueToContractsValue(makeValue(2_000_000n)),
                  },
                }),
              )
              .lockAssets(
                vendorScriptAddress,
                makeValue(1_000_000n),
                Data.serialize(VendorDatum, datum),
              )
              .lockAssets(
                treasuryScriptAddress,
                makeValue(49_999_000_000n),
                Data.Void(),
              ),
            /payout_sum == amount/,
          );
        });
      });
      test("cannot mismatch redeemer and actual payout", async () => {
        await emulator.as(Funder, async (blaze) => {
          let registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(
              configs.treasury.registry_token + toHex(Buffer.from("REGISTRY")),
            ),
          );
          let value = coreValueToContractsValue(makeValue(1_000_000n));
          const datum: VendorDatum = {
            vendor,
            payouts: [
              {
                maturation: BigInt(10),
                value,
                status: "Active",
              },
            ],
          };
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
                  Fund: {
                    amount: coreValueToContractsValue(makeValue(1_000_000n)),
                  },
                }),
              )
              .lockAssets(
                vendorScriptAddress,
                makeValue(2_000_000n),
                Data.serialize(VendorDatum, datum),
              )
              .lockAssets(
                treasuryScriptAddress,
                makeValue(49_998_000_000n),
                Data.Void(),
              ),
            /payout_sum == amount/,
          );
        });
      });
      test("cannot fund past expiration", async () => {
        await emulator.as(Funder, async (blaze) => {
          let registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(
              configs.treasury.registry_token + toHex(Buffer.from("REGISTRY")),
            ),
          );
          let value = coreValueToContractsValue(makeValue(1_000_000n));
          const datum: VendorDatum = {
            vendor,
            payouts: [
              {
                maturation: BigInt(configs.treasury.expiration * 2n),
                value,
                status: "Active",
              },
            ],
          };
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
                  Fund: {
                    amount: value,
                  },
                }),
              )
              .lockAssets(
                vendorScriptAddress,
                makeValue(1_000_000n),
                Data.serialize(VendorDatum, datum),
              )
              .lockAssets(
                treasuryScriptAddress,
                makeValue(499_999_000_000n),
                Data.Void(),
              ),
            /p.maturation <= config.expiration/,
          );
        });
      });
    });
    describe("after the expiration", async () => {
      beforeEach(async () => {
        emulator.stepForwardToUnix(configs.treasury.expiration + 1n);
      });
      test("cannot fund a new project", async () => {
        await emulator.as(Funder, async (blaze) => {
          let registryInput = await blaze.provider.getUnspentOutputByNFT(
            AssetId(
              configs.treasury.registry_token + toHex(Buffer.from("REGISTRY")),
            ),
          );
          let value = coreValueToContractsValue(makeValue(1_000_000n));
          const datum: VendorDatum = {
            vendor,
            payouts: [
              {
                maturation: BigInt(10n),
                value,
                status: "Active",
              },
            ],
          };
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
                  Fund: {
                    amount: value,
                  },
                }),
              )
              .lockAssets(
                vendorScriptAddress,
                makeValue(1_000_000n),
                Data.serialize(VendorDatum, datum),
              )
              .lockAssets(
                treasuryScriptAddress,
                makeValue(499_999_000_000n),
                Data.Void(),
              ),
            /is_entirely_before\(/,
          );
        });
      });
    });
  });
});
