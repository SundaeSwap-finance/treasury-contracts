import {
  ProtocolParameters,
  Address,
  TransactionUnspentOutput,
  AssetId,
  TransactionInput,
  DatumHash,
  PlutusData,
  TransactionId,
  Transaction,
  Redeemers,
  PaymentAddress,
  TokenMap,
} from "@blaze-cardano/core";
import { Provider } from "@blaze-cardano/query";
import { Core } from "@blaze-cardano/sdk";
import { input } from "@inquirer/prompts";

const sanchonetParameters: Core.ProtocolParameters = {
  coinsPerUtxoByte: 410,
  maxTxSize: 16384,
  minFeeCoefficient: 44,
  minFeeConstant: 155381,
  maxBlockBodySize: 90112,
  maxBlockHeaderSize: 1100,
  stakeKeyDeposit: 2000000,
  poolDeposit: 500000000,
  poolRetirementEpochBound: 18,
  desiredNumberOfPools: 500,
  poolInfluence: "0.3",
  monetaryExpansion: "0.003",
  treasuryExpansion: "0.2",
  minPoolCost: 340000000,
  protocolVersion: {
    major: 8,
    minor: 0,
  },
  maxValueSize: 5000,
  collateralPercentage: 150,
  maxCollateralInputs: 3,
  costModels: new Map([
    [
      Core.PlutusLanguageVersion.V1,
      [
        100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
        201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
        100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4,
        72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0, 1,
        1, 1000, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558,
        1, 39184, 1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1,
        13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749,
        541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32,
        85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32, 85848, 228465,
        122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 270652, 22588, 4, 1457325,
        64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420, 1, 1, 81663, 32,
        59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933, 32, 24623, 32,
        53384111, 14333, 10,
      ],
    ],
    [
      Core.PlutusLanguageVersion.V2,
      [
        100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
        201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
        100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4,
        72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0, 1,
        1, 1000, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558,
        1, 39184, 1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1,
        13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749,
        541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32,
        85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32, 85848, 228465,
        122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 955506, 213312, 0, 2, 270652,
        22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420, 1,
        1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933, 32,
        24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283, 26308, 10,
      ],
    ],
    [
      Core.PlutusLanguageVersion.V3,
      [
        100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
        201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
        100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4,
        72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 123203, 7305,
        -900, 1716, 549, 57, 85848, 0, 1, 1, 1000, 42921, 4, 2, 24548, 29498,
        38, 1, 898148, 27279, 1, 51775, 558, 1, 39184, 1000, 60594, 1, 141895,
        32, 83150, 32, 15299, 32, 76049, 1, 13169, 4, 22100, 10, 28999, 74, 1,
        28999, 74, 1, 43285, 552, 1, 44749, 541, 1, 33852, 32, 68246, 32, 72362,
        32, 7243, 32, 7391, 32, 11546, 32, 85848, 123203, 7305, -900, 1716, 549,
        57, 85848, 0, 1, 90434, 519, 0, 1, 74433, 32, 85848, 123203, 7305, -900,
        1716, 549, 57, 85848, 0, 1, 1, 85848, 123203, 7305, -900, 1716, 549, 57,
        85848, 0, 1, 955506, 213312, 0, 2, 270652, 22588, 4, 1457325, 64566, 4,
        20467, 1, 4, 0, 141992, 32, 100788, 420, 1, 1, 81663, 32, 59498, 32,
        20142, 32, 24588, 32, 20744, 32, 25933, 32, 24623, 32, 43053543, 10,
        53384111, 14333, 10, 43574283, 26308, 10, 16000, 100, 16000, 100,
        962335, 18, 2780678, 6, 442008, 1, 52538055, 3756, 18, 267929, 18,
        76433006, 8868, 18, 52948122, 18, 1995836, 36, 3227919, 12, 901022, 1,
        166917843, 4307, 36, 284546, 36, 158221314, 26549, 36, 74698472, 36,
        333849714, 1, 254006273, 72, 2174038, 72, 2261318, 64571, 4, 207616,
        8310, 4, 1293828, 28716, 63, 0, 1, 1006041, 43623, 251, 0, 1, 100181,
        726, 719, 0, 1, 100181, 726, 719, 0, 1, 100181, 726, 719, 0, 1, 107878,
        680, 0, 1, 95336, 1, 281145, 18848, 0, 1, 180194, 159, 1, 1, 158519,
        8942, 0, 1, 159378, 8813, 0, 1, 107490, 3298, 1, 106057, 655, 1,
        1964219, 24520, 3,
      ],
    ],
  ]),
  prices: {
    memory: 0.0577,
    steps: 0.0000721,
  },
  maxExecutionUnitsPerTransaction: {
    memory: 14000000,
    steps: 10000000000,
  },
  maxExecutionUnitsPerBlock: {
    memory: 62000000,
    steps: 40000000000,
  },
};

async function promptUTxO(
  address?: Address,
  txIn?: string,
  description?: string,
  count?: number,
): Promise<TransactionUnspentOutput[]> {
  const utxos: TransactionUnspentOutput[] = [];
  if (txIn) {
    console.log(`We're looking for details about TxIn ${txIn}`);
  }
  if (address) {
    console.log(`It should be at the address ${address.toBech32()}`);
  }
  if (description) {
    console.log(`It should also ${description}`);
  }
  if (!address) {
    address = Address.fromBech32(
      await input({ message: "What address does this UTxO have?" }),
    );
  }
  if (!count) {
    count = 100000;
  }
  while (count > 0) {
    count--;
    console.log("Now the next one.");
    if (!txIn) {
      txIn = await input({
        message: `What is the txIn of the UTxO you're looking for; empty to stop.`,
      });
      if (txIn === "") {
        break;
      }
    }
    const amount = await input({
      message: "How much Lovelace is on this UTxO? ",
    });
    const assets: TokenMap = new Map<AssetId, bigint>();
    while (true) {
      const assetId = await input({
        message: "If there are assets, what asset ID? (empty to stop)",
      });
      if (assetId === "") {
        break;
      }
      const amount = await input({
        message: `How much ${assetId} is at this UTxO?`,
      });
      assets.set(AssetId(assetId), BigInt(amount));
    }
    const txRefParts = txIn.split("#");
    console.log(txRefParts);
    utxos.push(
      TransactionUnspentOutput.fromCore([
        {
          txId: Core.TransactionId(txRefParts[0]),
          index: Number(txRefParts[1]),
        },
        {
          address: PaymentAddress(address.toBech32()),
          value: { coins: BigInt(amount), assets },
        },
      ]),
    );
    txIn = undefined;
  }
  return utxos;
}

export class CustomProvider extends Provider {
  async getParameters(): Promise<ProtocolParameters> {
    return sanchonetParameters;
  }
  async getUnspentOutputs(
    address: Address,
  ): Promise<TransactionUnspentOutput[]> {
    return promptUTxO(address, undefined, "");
  }
  getUnspentOutputsWithAsset(
    address: Address,
    unit: AssetId,
  ): Promise<TransactionUnspentOutput[]> {
    return promptUTxO(address, undefined, `have asset ${unit}`);
  }
  async getUnspentOutputByNFT(
    unit: AssetId,
  ): Promise<TransactionUnspentOutput> {
    return (await promptUTxO(undefined, undefined, `have NFT ${unit}`, 1))[0];
  }
  async resolveUnspentOutputs(
    txIns: TransactionInput[],
  ): Promise<TransactionUnspentOutput[]> {
    const ret: TransactionUnspentOutput[] = [];
    for (const input of txIns) {
      const txIn = `${input.transactionId()}#${input.index()}`;
      const utxo = await promptUTxO(undefined, txIn, undefined, 1);
      ret.push(utxo[0]);
    }
    return ret;
  }
  resolveDatum(_datumHash: DatumHash): Promise<PlutusData> {
    throw new Error("Method not implemented.");
  }
  async awaitTransactionConfirmation(
    _txId: TransactionId,
    _timeout?: number,
  ): Promise<boolean> {
    await input({ message: "Press enter when the transaction is confirmed." });
    return true;
  }
  postTransactionToChain(_tx: Transaction): Promise<TransactionId> {
    // TODO: copy to clipboard?
    throw new Error("Method not implemented.");
  }
  async evaluateTransaction(
    tx: Transaction,
    _additionalUtxos: TransactionUnspentOutput[],
  ): Promise<Redeemers> {
    console.log(
      "Evaluating the scripts, so we need the budgets for each redeemer; this might happen multiple times",
    );
    const redeemersWithBudget = [];
    const txRedeemers: Redeemers | undefined = tx.witnessSet().redeemers();
    if (!txRedeemers) {
      return Redeemers.fromCore([]);
    }
    for (const redeemer of txRedeemers.toCore()) {
      const budget = await input({
        message: `Enter a budget for redeemer ${redeemer.purpose}, ${redeemer.index} in the format "mem, cpu"`,
        validate: (s) => {
          if (/\d+,\s*\d+/.test(s)) {
            return true;
          }
          return 'Should be of the format "mem, cpu"';
        },
      });
      const parts = budget.split(",");
      redeemersWithBudget.push({
        purpose: redeemer.purpose,
        index: redeemer.index,
        data: redeemer.data,
        executionUnits: {
          memory: Number(parts[0]),
          steps: Number(parts[1]),
        },
      });
    }
    return Redeemers.fromCore(redeemersWithBudget);
  }
}
