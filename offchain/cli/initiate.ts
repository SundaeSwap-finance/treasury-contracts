import {
  AssetName,
  AuxiliaryData,
  Datum,
  Ed25519KeyHashHex,
  PolicyId,
  TransactionId,
  TransactionInput,
  TransactionOutput,
} from "@blaze-cardano/core";
import { serialize, Void } from "@blaze-cardano/data";
import { Blaze, Core } from "@blaze-cardano/sdk";
import { select } from "@inquirer/prompts";
import { type ITransactionMetadata, toMetadata } from "../src/metadata/shared";
import { contractsValueToCoreValue } from "../src/shared";
import {
  OneshotOneshotMint,
  ScriptHashRegistry,
  TreasuryTreasurySpend,
  VendorVendorSpend,
} from "../src/types/contracts";
import {
  deployTransaction,
  getConfigs,
  getProvider,
  getTransactionMetadata,
  getWallet,
  transactionDialog,
} from "./shared";

export async function initiate(): Promise<void> {
  const { treasuryConfig, vendorConfig, metadata } = await getConfigs();

  const oneshotScript = new OneshotOneshotMint(metadata.seed_utxo);

  const registry_token = oneshotScript.Script;
  console.log(`Registry token policy ID: ${registry_token.hash()}`);

  const treasuryScript = new TreasuryTreasurySpend(treasuryConfig).Script;
  console.log(`Treasury script policy ID: ${treasuryScript.hash()}`);

  const vendorScript = new VendorVendorSpend(vendorConfig).Script;
  console.log(`Vendor script policy ID: ${vendorScript.hash()}`);

  let blazeInstance;

  while (true) {
    const choice = await select({
      message: "What would you like to do next?",
      choices: [
        { name: "Create registry transaction", value: "registry" },
        {
          name: "Create publish treasury script reference transaction",
          value: "treasury-publish",
        },
        {
          name: "Create publish vendor script reference transaction",
          value: "vendor-publish",
        },
        { name: "Exit", value: "exit" },
      ],
    });

    switch (choice) {
      case "registry":
        console.log("Creating transaction to publish the script registry...");
        const registryDatum: ScriptHashRegistry = {
          treasury: {
            Script: [treasuryScript.hash()],
          },
          vendor: {
            Script: [vendorScript.hash()],
          },
        };
        const policyId = oneshotScript.Script.hash();
        const assetName = Core.toHex(Buffer.from("REGISTRY"));
        if (!blazeInstance) {
          const provider = await getProvider();
          const wallet = await getWallet(provider);
          blazeInstance = await Blaze.from(provider, wallet);
        }
        const oneshotAddress = new Core.Address({
          type: Core.AddressType.EnterpriseScript,
          networkId: blazeInstance.provider.network,
          paymentPart: {
            type: Core.CredentialType.ScriptHash,
            hash: policyId,
          },
        });
        const oneshotOutput = new TransactionOutput(
          oneshotAddress,
          contractsValueToCoreValue({ [policyId]: { [assetName]: BigInt(1) } }),
        );
        oneshotOutput.setDatum(
          Datum.fromCore(serialize(ScriptHashRegistry, registryDatum).toCore()),
        );
        const bootstrapUtxoObj =
          await blazeInstance.provider.resolveUnspentOutputs([
            new TransactionInput(
              TransactionId(metadata.seed_utxo.transaction_id),
              metadata.seed_utxo.output_index,
            ),
          ]);
        const { ...metadataRaw } = metadata;
        const txMetadata: ITransactionMetadata =
          await getTransactionMetadata(metadataRaw);
        const auxData = new AuxiliaryData();
        auxData.setMetadata(toMetadata(txMetadata));
        const tx = await blazeInstance
          .newTransaction()
          .addInput(bootstrapUtxoObj[0])
          .addOutput(oneshotOutput)
          .addMint(
            PolicyId(policyId),
            new Map<AssetName, bigint>([[AssetName(assetName), BigInt(1)]]),
            Void(),
          )
          .setAuxiliaryData(auxData)
          .provideScript(oneshotScript.Script)
          .addRequiredSigner(Ed25519KeyHashHex(txMetadata.txAuthor))
          .complete();
        await transactionDialog(tx.toCbor().toString(), false);
        break;
      case "treasury-publish":
        if (!blazeInstance) {
          const provider = await getProvider();
          const wallet = await getWallet(provider);
          blazeInstance = await Blaze.from(provider, wallet);
        }
        await transactionDialog(
          (await deployTransaction(blazeInstance, [treasuryScript], true))
            .toCbor()
            .toString(),
          false,
        );
        break;
      case "vendor-publish":
        if (!blazeInstance) {
          const provider = await getProvider();
          const wallet = await getWallet(provider);
          blazeInstance = await Blaze.from(provider, wallet);
        }
        await transactionDialog(
          (await deployTransaction(blazeInstance, [vendorScript]))
            .toCbor()
            .toString(),
          false,
        );
        break;
      case "exit":
        console.log("Exiting...");
        return;
      default:
        console.log("Invalid choice");
        return;
    }
  }
}
