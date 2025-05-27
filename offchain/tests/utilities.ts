import * as Data from "@blaze-cardano/data";
import {
  Bip32PrivateKey,
  Ed25519KeyHashHex,
  getBurnAddress,
  mnemonicToEntropy,
  Slot,
  toHex,
  wordlist,
  Script,
  Address,
  PlutusData,
} from "@blaze-cardano/core";
import { Emulator, EmulatorProvider } from "@blaze-cardano/emulator";
import {
  loadScripts,
  slot_to_unix,
  type CompiledScript,
  type CompiledScripts,
} from "../src/shared";
import {
  ScriptHashRegistry,
  TreasuryTreasuryWithdraw,
  type TreasuryConfiguration,
  type VendorConfiguration,
} from "../src/types/contracts";
import { Core, makeValue } from "@blaze-cardano/sdk";

export function registryTokenName(): string {
  return toHex(Buffer.from("REGISTRY"));
}

export function registryToken(idx?: number): [string, string] {
  return [
    "0000000000000000000000000000000000000000000000000000" +
      String(idx ?? 0).padStart(4, "0"),
    registryTokenName(),
  ];
}

export const Sweeper = "Sweeper";
export const Disburser = "Disburser";
export const Funder = "Funder";
export const Reorganizer = "Reorganizer";
export const Unregisterer = "Unregisterer";
export const Vendor = "Vendor";
export const Pauser = "Pauser";
export const Resumer = "Resumer";
export const Modifier = "Modifier";

export async function sweep_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Sweeper)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function disburse_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Disburser)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function fund_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Funder)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function reorganize_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Reorganizer)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function unregister_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Unregisterer)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function pause_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Pauser)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function resume_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Resumer)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function modify_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Modifier)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function vendor_key(
  emulator: Emulator,
): Promise<Core.Hash28ByteBase16> {
  return (await emulator.register(Vendor)).asBase()?.getPaymentCredential()
    .hash!;
}

export async function sampleTreasuryConfig(
  emulator: Emulator,
  idx?: number,
): Promise<TreasuryConfiguration> {
  const [policyId] = registryToken(idx);
  return {
    registry_token: policyId,
    expiration: slot_to_unix(Slot(36 * 60 * 60 + 10 * (idx ?? 0))),
    payout_upperbound: slot_to_unix(Slot(45 * 60 * 60)),
    permissions: {
      sweep: {
        Signature: {
          key_hash: await sweep_key(emulator),
        },
      },
      disburse: {
        Signature: {
          key_hash: await disburse_key(emulator),
        },
      },
      fund: {
        Signature: {
          key_hash: await fund_key(emulator),
        },
      },
      reorganize: {
        Signature: {
          key_hash: await reorganize_key(emulator),
        },
      },
      unregister: {
        Signature: {
          key_hash: await unregister_key(emulator),
        },
      },
    },
  };
}

export async function sampleVendorConfig(
  emulator: Emulator,
  idx?: number,
): Promise<VendorConfiguration> {
  const [policyId] = registryToken(idx);
  return {
    registry_token: policyId,
    expiration: slot_to_unix(Slot(60 * 60 * 60 + 10 * (idx ?? 0))),
    permissions: {
      pause: {
        Signature: {
          key_hash: await pause_key(emulator),
        },
      },
      resume: {
        Signature: {
          key_hash: await resume_key(emulator),
        },
      },
      modify: {
        Signature: {
          key_hash: await modify_key(emulator),
        },
      },
    },
  };
}

export function blocks(slot: Slot): number {
  return slot / 20;
}

export async function setupEmulator(
  txOuts: Core.TransactionOutput[] = [],
  deployDefaultScripts: boolean = true,
) {
  // TODO: custom protocol parameters needed for plutus v3?
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

  if (deployDefaultScripts) {
    deployScripts(
      emulator,
      loadScripts(
        Core.NetworkId.Testnet,
        await sampleTreasuryConfig(emulator),
        await sampleVendorConfig(emulator),
      ),
    );
  }

  await emulator.register("MaliciousUser");
  await emulator.register(
    "Anyone",
    makeValue(5_000_000n, ["a".repeat(56), 1n]),
  );
  await emulator.fund("Anyone", makeValue(1000_000_000n));

  return emulator;
}

export async function deployScripts(
  emulator: Emulator,
  scripts: CompiledScripts,
) {
  const { treasuryScript, vendorScript } = scripts;

  const [registryPolicy, registryName] = [
    scripts.treasuryScript.config.registry_token,
    registryTokenName(),
  ];
  await emulator.register(
    "Registry",
    makeValue(5_000_000n, [registryPolicy + registryName, 1n]),
    Data.serialize(ScriptHashRegistry, {
      treasury: {
        Script: [treasuryScript.credential.hash],
      },
      vendor: {
        Script: [vendorScript.credential.hash],
      },
    }),
  );

  await emulator.publishScript(treasuryScript.script.Script);
  await emulator.publishScript(vendorScript.script.Script);
}

export function scriptOutput<T, C>(
  emulator: Emulator,
  treasuryScript: CompiledScript<T, C>,
  value: Core.Value,
  datum?: PlutusData,
): Core.TransactionUnspentOutput {
  const output = new Core.TransactionUnspentOutput(
    new Core.TransactionInput(
      Core.TransactionId("1".repeat(64)),
      BigInt(emulator.utxos().length), // By using emulator.utxos().length we ensure this is unique, if a bit large
    ),
    new Core.TransactionOutput(treasuryScript.scriptAddress, value),
  );
  if (datum) {
    output.output().setDatum(Core.Datum.newInlineData(datum));
  }
  emulator.addUtxo(output);
  return output;
}
