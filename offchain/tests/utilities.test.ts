import { expect } from "bun:test";
import {
  Blaze,
  Core,
  HotWallet,
  makeValue,
  Provider,
  TxBuilder,
  Wallet,
} from "@blaze-cardano/sdk";
import {
  Bip32PrivateKey,
  getBurnAddress,
  mnemonicToEntropy,
  wordlist,
} from "@blaze-cardano/core";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import { loadScript } from "../shared";
import type { TreasuryConfiguration } from "../types/contracts";

export function sampleConfig(): TreasuryConfiguration {
  return {
    expiration: 1000n,
    vendor_script: {
      Script: [""],
    },
    permissions: {
      sweep: {
        Signature: {
          key_hash: "ab",
        },
      },
      disburse: {
        Signature: {
          key_hash: "ab",
        },
      },
      fund: {
        Signature: {
          key_hash: "ab",
        },
      },
      reorganize: {
        Signature: {
          key_hash: "ab",
        },
      },
    },
  };
}

export async function setupBlaze(txOuts: Core.TransactionOutput[] = []) {
  const { treasuryScript } = loadScript(Core.NetworkId.Testnet, sampleConfig());
  txOuts.push(
    new Core.TransactionOutput(
      Core.Address.fromBech32(
        "addr_test1qryvgass5dsrf2kxl3vgfz76uhp83kv5lagzcp29tcana68ca5aqa6swlq6llfamln09tal7n5kvt4275ckwedpt4v7q48uhex",
      ),
      makeValue(1_000_000_000n),
    ),
  );
  txOuts.push(
    new Core.TransactionOutput(
      Core.Address.fromBech32(
        "addr_test1qryvgass5dsrf2kxl3vgfz76uhp83kv5lagzcp29tcana68ca5aqa6swlq6llfamln09tal7n5kvt4275ckwedpt4v7q48uhex",
      ),
      makeValue(5_000_000n),
    ),
  );
  txOuts.push(
    new Core.TransactionOutput(
      Core.Address.fromBech32(
        "addr_test1qryvgass5dsrf2kxl3vgfz76uhp83kv5lagzcp29tcana68ca5aqa6swlq6llfamln09tal7n5kvt4275ckwedpt4v7q48uhex",
      ),
      makeValue(3_000_000n, ["a".repeat(64), 1n]),
    ),
  );
  const scriptRef = new Core.TransactionOutput(
    getBurnAddress(Core.NetworkId.Testnet),
    makeValue(5_000_000n),
  );
  scriptRef.setScriptRef(treasuryScript.Script);
  txOuts.push(scriptRef);
  const protocolParameters = {
    coinsPerUtxoByte: 4310,
    minFeeReferenceScripts: { base: 15, range: 25600, multiplier: 1.2 },
    maxTxSize: 16384,
    minFeeCoefficient: 44,
    minFeeConstant: 155381,
    maxBlockBodySize: 90112,
    maxBlockHeaderSize: 1100,
    stakeKeyDeposit: 2e6,
    poolDeposit: 5e8,
    poolRetirementEpochBound: 18,
    desiredNumberOfPools: 500,
    poolInfluence: "3/10",
    monetaryExpansion: "3/1000",
    treasuryExpansion: "1/5",
    minPoolCost: 17e7,
    protocolVersion: { major: 9, minor: 0 },
    maxValueSize: 5e3,
    collateralPercentage: 150,
    maxCollateralInputs: 3,
    costModels: /* @__PURE__ */ new Map()
      .set(
        0,
        [
          100788, 420, 1, 1, 1e3, 173, 0, 1, 1e3, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16e3, 100, 16e3, 100, 16e3, 100, 16e3, 100, 16e3,
          100, 16e3, 100, 100, 100, 16e3, 100, 94375, 32, 132994, 32, 61462, 4,
          72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0,
          1, 1, 1e3, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775,
          558, 1, 39184, 1e3, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049,
          1, 13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1,
          44749, 541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32,
          11546, 32, 85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32,
          85848, 228465, 122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 270652,
          22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420,
          1, 1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933,
          32, 24623, 32, 53384111, 14333, 10,
        ],
      )
      .set(
        1,
        [
          100788, 420, 1, 1, 1e3, 173, 0, 1, 1e3, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16e3, 100, 16e3, 100, 16e3, 100, 16e3, 100, 16e3,
          100, 16e3, 100, 100, 100, 16e3, 100, 94375, 32, 132994, 32, 61462, 4,
          72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0,
          1, 1, 1e3, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775,
          558, 1, 39184, 1e3, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049,
          1, 13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1,
          44749, 541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32,
          11546, 32, 85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32,
          85848, 228465, 122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 955506,
          213312, 0, 2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0,
          141992, 32, 100788, 420, 1, 1, 81663, 32, 59498, 32, 20142, 32, 24588,
          32, 20744, 32, 25933, 32, 24623, 32, 43053543, 10, 53384111, 14333,
          10, 43574283, 26308, 10,
        ],
      )
      .set(
        2,
        [
          100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
          201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100,
          16000, 100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32,
          61462, 4, 72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848,
          123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1, 1000, 42921, 4, 2,
          24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558, 1, 39184, 1000,
          60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1, 13169, 4, 22100,
          10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749, 541, 1, 33852,
          32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32, 85848,
          123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 90434, 519, 0, 1,
          74433, 32, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1,
          85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 955506, 213312,
          0, 2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32,
          100788, 420, 1, 1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744,
          32, 25933, 32, 24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283,
          26308, 10, 16000, 100, 16000, 100, 962335, 18, 2780678, 6, 442008, 1,
          52538055, 3756, 18, 267929, 18, 76433006, 8868, 18, 52948122, 18,
          1995836, 36, 3227919, 12, 901022, 1, 166917843, 4307, 36, 284546, 36,
          158221314, 26549, 36, 74698472, 36, 333849714, 1, 254006273, 72,
          2174038, 72, 2261318, 64571, 4, 207616, 8310, 4, 1293828, 28716, 63,
          0, 1, 1006041, 43623, 251, 0, 1,
        ],
      ),
    prices: { memory: 577 / 1e4, steps: 721e-7 },
    maxExecutionUnitsPerTransaction: { memory: 14e6, steps: 1e10 },
    maxExecutionUnitsPerBlock: { memory: 62e6, steps: 2e10 },
  };
  const emulator = new Emulator(txOuts, protocolParameters);
  const provider = new EmulatorProvider(emulator);
  const mnemonic =
    "test test test test test test " +
    "test test test test test test " +
    "test test test test test test " +
    "test test test test test sauce";
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  const masterkey = Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), "");
  const wallet = await HotWallet.fromMasterkey(masterkey.hex(), provider);
  const blaze = await Blaze.from(provider, wallet);
  return { emulator, provider, wallet, blaze };
}

export function makeExpectTxValid(
  blaze: Blaze<Provider, Wallet>,
  emulator: Emulator,
): (tx: TxBuilder) => Promise<void> {
  return async (tx: TxBuilder) => {
    const completedTx = await tx.complete();
    const signedTx = await blaze.signTransaction(completedTx);
    const txId = await emulator.submitTransaction(signedTx);
    emulator.awaitTransactionConfirmation(txId);
    expect(txId).toBeDefined();
  };
}
export function makeExpectTxInvalid(
  blaze: Blaze<Provider, Wallet>,
  emulator: Emulator,
): (tx: TxBuilder) => Promise<void> {
  return async (tx: TxBuilder) => {
    expect(async () => {
      const completedTx = await tx.complete();
      const signedTx = await blaze.signTransaction(completedTx);
      const txId = await emulator.submitTransaction(signedTx);
      emulator.awaitTransactionConfirmation(txId);
    }).toThrow();
  };
}

export async function expectScriptFailure(tx: TxBuilder) {
  expect(() => tx.complete()).toThrow("failed script execution");
}
