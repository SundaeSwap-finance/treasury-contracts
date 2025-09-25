import {
  Address,
  Ed25519KeyHashHex
} from "@blaze-cardano/core";
import { Blaze, makeValue, Provider, Wallet } from "@blaze-cardano/sdk";
import { input } from "@inquirer/prompts";
import { getBlazeInstance, getConfigs, getTransactionMetadata, selectUtxo, transactionDialog } from "cli/shared";
import { IDestination, IDisburse, Treasury } from "src";
import { loadTreasuryScript } from "src/shared";

export async function disburse(
  blazeInstance: Blaze<Provider, Wallet> | undefined = undefined,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }
  const { configs, scripts, metadata } = await getConfigs(blazeInstance);

  const { scriptAddress: treasuryScriptAddress, ...rest } = loadTreasuryScript(
    blazeInstance.provider.network,
    configs.treasury,
  );

  const utxos = await blazeInstance.provider.getUnspentOutputs(
    treasuryScriptAddress,
  );
  const inputUtxo = await selectUtxo(utxos);

  // todo: for now, hardcode these values
  // later, add prompts using getOutputs()
  // const { amounts, outputs } = await getOutputs();

  const recipient = Address.fromBech32(
    "addr1qyr5l2h8gelmp4qph7kzpzkqtky3mv9yvgkmwvdm3xweu3qu5zwsv0wyc267my62pruyl0ruw3gwjj0v9nucpqhn2gxsv56tkv",
  );
  const amount = makeValue(10_000_000n);
  const datum = undefined;
  const signers = [
    // int admin
    Ed25519KeyHashHex(
      "1be0008bf2994524c0eaf0efdae4431e4a61ef7d974804fa794110b7",
    ),
    Ed25519KeyHashHex(
      "a664de561ccd2ca9a07c060d4dd7cea4dc68ba89d4bf04b21ff0726f",
    ),
    // int leader
    Ed25519KeyHashHex(
      "4e72b1facdc7eea745767b8daca40bf73d75eb0e88dcee80d57eec5d",
    ),
    Ed25519KeyHashHex(
      "91f5b1d436080c1beca93fbbb96596312d8f615b0ad9e94470af2224",
    ),
    // cf
    Ed25519KeyHashHex(
      "c9f2966a1b357718b45a006954106ba1f7ae9fea16e9826f3486ddd6",
    ),
    // sundae
    Ed25519KeyHashHex(
      "1880102b04725318eb7a6f9f481815c82473c2f50cfe9932c85a3bf8",
    ),
    // xer
    Ed25519KeyHashHex(
      "a7f06cf4e9c03c6b7eac317d5533d573a9be3018fb7b9d95dd778d39",
    ),
    // nmkr
    Ed25519KeyHashHex(
      "8349f8b41d8337b617947ace444ef95b2b80ff2605cadf969914cf95",
    ),
  ];

  const metadataDestinations = [
    {
      label: "Coinbase",
      details: {
        anchorUrl: "ipfs://my-coinbase-destination-details",
        anchorDataHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
    {
      label: "Kraken",
      details: {
        anchorUrl: "ipfs://my-kraken-destination-details",
        anchorDataHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
  ] as IDestination[];

  const metadataBody = {
    event: "disburse",
    label: await input({
      message: "What is the name of this disbursement? (label)",
      validate: (value) => (value ? true : "Name cannot be empty."),
    }),
    description: await input({
      message: "What is the description for this disbursement?",
      validate: (value) => (value ? true : "Description cannot be empty."),
    }),
    justification: await input({
      message: "What is the justification for this disbursement?",
      validate: (value) => (value ? true : "Justification cannot be empty."),
    }),
    destination: metadataDestinations,
    estimatedReturn: 0n,
  } as IDisburse;

  const txMetadata = await getTransactionMetadata(
    configs.treasury.registry_token,
    metadataBody,
  );

  const tx = await (
    await Treasury.disburse({
      configsOrScripts: {
        configs,
        scripts,
      },
      blaze: blazeInstance,
      input: inputUtxo,
      recipient,
      amount,
      datum,
      signers,
      metadata: txMetadata,
    })
  )
  // .complete();

  await transactionDialog(blazeInstance.provider.network, tx.toCbor(), false);
}
