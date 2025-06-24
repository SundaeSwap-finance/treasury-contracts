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
import { Core } from "@blaze-cardano/sdk";
import { input, select } from "@inquirer/prompts";
import {
  OneshotOneshotMint,
  ScriptHashRegistry,
} from "src/generated-types/contracts";
import { toTxMetadata } from "../../src/metadata/shared";
import { contractsValueToCoreValue } from "../../src/shared";
import {
  deployTransaction,
  getBlazeInstance,
  getConfigs,
  transactionDialog,
} from "../shared";
export async function publish(): Promise<void> {
  const blazeInstance = await getBlazeInstance();
  const { scripts, metadata } = await getConfigs(blazeInstance);
  let seed_utxo = metadata?.body.seed_utxo;
  if (!seed_utxo) {
    const utxo = await input({
      message:
        "Enter the transaction output (txId#idx) that was used to bootstrap the instance: ",
      validate: function (value) {
        return (
          /[0-9A-Fa-f]{64}#[0-9]+/.test(value) ||
          "Should be in the format txId#idx"
        );
      },
    });
    const [txId, outputIndex] = utxo.split("#");
    seed_utxo = {
      transaction_id: txId,
      output_index: BigInt(outputIndex),
    };
  }
  const oneshotScript = new OneshotOneshotMint(seed_utxo);

  const registry_token = oneshotScript.Script;
  console.log(`Registry token policy ID: ${registry_token.hash()}`);

  console.log(
    `Treasury script policy ID: ${scripts.treasuryScript.script.Script.hash()}`,
  );

  console.log(
    `Vendor script policy ID: ${scripts.vendorScript.script.Script.hash()}`,
  );

  while (true) {
    const choice = await select({
      message: "What would you like to do next?",
      choices: [
        {
          name: "Create registry transaction",
          value: "registry",
          disabled: !metadata,
        },
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
            Script: [scripts.treasuryScript.script.Script.hash()],
          },
          vendor: {
            Script: [scripts.vendorScript.script.Script.hash()],
          },
        };
        const policyId = oneshotScript.Script.hash();
        const assetName = Core.toHex(Buffer.from("REGISTRY"));
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
              TransactionId(seed_utxo.transaction_id),
              seed_utxo.output_index,
            ),
          ]);

        const auxData = new AuxiliaryData();
        auxData.setMetadata(toTxMetadata(metadata!));
        let tx = await blazeInstance
          .newTransaction()
          .addInput(bootstrapUtxoObj[0])
          .addOutput(oneshotOutput)
          .addMint(
            PolicyId(policyId),
            new Map<AssetName, bigint>([[AssetName(assetName), BigInt(1)]]),
            Void(),
          )
          .setAuxiliaryData(auxData)
          .provideScript(oneshotScript.Script);

        if (metadata.txAuthor) {
          tx = await tx.addRequiredSigner(Ed25519KeyHashHex(metadata!.txAuthor));
        }

        tx = await tx.complete();

        await transactionDialog(
          blazeInstance.provider.network,
          tx.toCbor().toString(),
          false,
        );
        break;
      case "treasury-publish":
        await transactionDialog(
          blazeInstance.provider.network,
          (
            await deployTransaction(
              blazeInstance,
              [scripts.treasuryScript.script.Script],
              await select({
                message: "Register the script hash?",
                choices: [
                  { name: "Yes", value: true },
                  { name: "No", value: false },
                ],
              }),
            )
          )
            .toCbor()
            .toString(),
          false,
        );
        break;
      case "vendor-publish":
        await transactionDialog(
          blazeInstance.provider.network,
          (
            await deployTransaction(
              blazeInstance,
              [scripts.vendorScript.script.Script],
              await select({
                message: "Register the script hash?",
                choices: [
                  { name: "Yes", value: true },
                  { name: "No", value: false },
                ],
              }),
            )
          )
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
