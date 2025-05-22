import { input, select } from "@inquirer/prompts";
import { OneshotOneshotMint, ScriptHashRegistry, TreasuryTreasurySpend, VendorVendorSpend } from "../types/contracts";
import { getMultiSigScript, getProvider, getWallet, transactionDialog } from "./shared";
import { Blaze, Core, Value } from "@blaze-cardano/sdk";
import { Address, AssetName, Datum, HexBlob, PolicyId, TransactionId, TransactionInput, TransactionOutput, TransactionUnspentOutput } from "@blaze-cardano/core";
import { serialize, Void } from "@blaze-cardano/data";
import { contractsValueToCoreValue } from "../shared";

export async function initiate(): Promise<void> {
    const bootstrapUtxo = {
        transaction_id: await input({
            message: "Enter the transaction ID of the bootstrap UTXO",
        }),
        output_index: BigInt(await input({
            message: "Enter the output index of the bootstrap UTXO",
        })),
    };

    const oneshotScript = new OneshotOneshotMint(bootstrapUtxo);

    const registry_token = oneshotScript.Script;
    console.log(`Registry token policy ID: ${registry_token.hash()}`);

    const treasuryConfig = {
        registry_token: registry_token.hash(),
        permissions: {
            reorganize: await getMultiSigScript("Multisig for treasury reorganize"),
            sweep: await getMultiSigScript("Multisig for treasury sweep"),
            fund: await getMultiSigScript("Multisig for treasury fund"),
            disburse: await getMultiSigScript("Multisig for treasury disburse"),
        },
        expiration: BigInt(await input({
            message: "Enter the expiration time (in seconds since epoch)",
        })),
        payout_upperbound: BigInt(await input({
            message: "Enter the payout upper bound (in lovelace)",
        })),
    };

    const treasuryScript = new TreasuryTreasurySpend(treasuryConfig).Script;
    console.log(`Treasury script policy ID: ${treasuryScript.hash()}`);

    const vendorConfig = {
        registry_token: registry_token.hash(),
        permissions: {
            pause: await getMultiSigScript("Multisig for vendor pause"),
            resume: await getMultiSigScript("Multisig for vendor resume"),
            modify: await getMultiSigScript("Multisig for vendor modify"),
        },
        expiration: BigInt(await input({
            message: "Enter the expiration time (in seconds since epoch)",
        })),
    };

    const vendorScript = new VendorVendorSpend(vendorConfig).Script;
    console.log(`Vendor script policy ID: ${vendorScript.hash()}`);

    const choice = await select({
        message: "Next action",
        choices: [
            { name: "Create transaction", value: "create" },
            { name: "Exit", value: "exit" },
        ]
    });

    switch (choice) {
        case "create":
            console.log("Creating transaction...");
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
            console.log(`Asset name: ${assetName}`);
            const provider = await getProvider();
            const wallet = await getWallet(provider);
            const blazeInstance = await Blaze.from(provider, wallet);
            const oneshotAddress = new Core.Address({
                type: Core.AddressType.EnterpriseScript,
                networkId: provider.network,
                paymentPart: {
                    type: Core.CredentialType.ScriptHash,
                    hash: policyId,
                },
            });
            const oneshotOutput = new TransactionOutput(oneshotAddress, contractsValueToCoreValue({ [policyId]: { [assetName]: BigInt(1) } }));
            oneshotOutput.setDatum(Datum.fromCore(serialize(ScriptHashRegistry, registryDatum).toCore()));
            const bootstrapUtxoObj = await provider.resolveUnspentOutputs([new TransactionInput(TransactionId(bootstrapUtxo.transaction_id), bootstrapUtxo.output_index)]);
            const tx = await blazeInstance.newTransaction()
                .addInput(bootstrapUtxoObj[0])
                .addOutput(oneshotOutput)
                .addMint(PolicyId(policyId), (new Map<AssetName, bigint>([[AssetName(assetName), BigInt(1)]])), Void())
                .provideScript(oneshotScript.Script)
                .complete()
            await transactionDialog(tx.toCbor().toString(), false);
            return;
        case "exit":
            console.log("Exiting...");
            return;
        default:
            console.log("Invalid choice");
            return;
    }
}