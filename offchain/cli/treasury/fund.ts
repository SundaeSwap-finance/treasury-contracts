/* eslint-disable @typescript-eslint/no-unused-vars */
import { Value } from "@blaze-cardano/core";
import { Blaze, makeValue, Provider, Wallet } from "@blaze-cardano/sdk";
import { input, select } from "@inquirer/prompts";
import { Treasury } from "../../src";
import type { IFund, IMilestone } from "../../src/metadata/fund";
import { toMultisig } from "../../src/metadata/permission";
import { loadTreasuryScript } from "../../src/shared";
import {
  getActualPermission,
  getAnchor,
  getBlazeInstance,
  getConfigs,
  getDate,
  getOptional,
  getPermission,
  getSigners,
  getTransactionMetadata,
  maybeInput,
  selectUtxo,
  transactionDialog,
} from "../shared";

async function getMilestones(): Promise<{
  schedules: { date: Date; amount: Value }[];
  milestones: IMilestone[];
}> {
  const milestones: IMilestone[] = [];
  const schedules: { date: Date; amount: Value }[] = [];
  let moreMilestones = true;

  while (moreMilestones) {
    const date = await getDate("When should the milestone be completed?");
    const amount = makeValue(
      BigInt(
        await input({
          message:
            "How much ADA (in lovelace) should be released for this milestone?",
          validate: (value) => {
            const parsedValue = parseInt(value, 10);
            return parsedValue > 0 ? true : "Amount must be a positive value.";
          },
        }),
      ),
    );

    const meta = {
      identifier: await input({
        message: "What is the identifier for this milestone?",
        validate: (value) => (value ? true : "Identifier cannot be empty."),
      }),
      label: await maybeInput({
        message: "What is the label for this milestone? (optional)",
      }),
      description: await maybeInput({
        message: "What is the description for this milestone? (optional)",
      }),
      acceptanceCriteria: await maybeInput({
        message:
          "What are the acceptance criteria for this milestone? (optional)",
      }),
      details: await getOptional(
        "Do you want to add details for this milestone? (optional)",
        undefined,
        getAnchor,
      ),
    } as IMilestone;

    schedules.push({ date, amount });
    milestones.push(meta);

    moreMilestones = await select({
      message: "Do you want to add another milestone?",
      choices: [
        { name: "Yes", value: true },
        { name: "No", value: false },
      ],
    });
  }

  return { schedules, milestones };
}

async function getIdentifiers(): Promise<string[]> {
  const identifiers: string[] = [];
  while (true) {
    const identifier = await maybeInput({
      message: "Add another identifier for this project? (optional)",
    });
    if (identifier) {
      identifiers.push(identifier);
    } else {
      return identifiers;
    }
  }
}

export async function fund(
  blazeInstance: Blaze<Provider, Wallet> | undefined = undefined,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }
  const { treasuryConfig, vendorConfig, metadata } = await getConfigs();
  const vendor = toMultisig(
    await getPermission("Which multisig should be able to use the funds?"),
  );

  const metadataBody = {
    event: "fund",
    instance: metadata.identifier,
    identifier: await input({
      message: "What is the main identifier for this project?",
    }),
    otherIdentifiers: await getIdentifiers(),
    label: await input({
      message: "What is the name of this project?",
      validate: (value) => (value ? true : "Name cannot be empty."),
    }),
    description: await maybeInput({
      message: "What is the description for this funding event? (optional)",
    }),
    vendor: {
      label: await input({
        message: "What is the name of the vendor?",
        validate: (value) => (value ? true : "Name cannot be empty."),
      }),
      details: await getOptional(
        "Do you want to add a link to details for this vendor? (optional)",
        undefined,
        getAnchor,
      ),
    },
    contract: await getOptional(
      "Do you want to add a contract for this funding event? (optional)",
      undefined,
      getAnchor,
    ),
    milestones: [],
  } as IFund;

  const { schedules, milestones } = await getMilestones();

  metadataBody.milestones = milestones;

  const txMetadata = await getTransactionMetadata(metadataBody);

  const { scriptAddress: treasuryScriptAddress, ...rest } = loadTreasuryScript(
    blazeInstance.provider.network,
    treasuryConfig,
  );

  const utxos = await blazeInstance.provider.getUnspentOutputs(
    treasuryScriptAddress,
  );
  const utxo = await selectUtxo(utxos);

  const fundPermissions = getActualPermission(
    metadata.permissions.fund,
    metadata.permissions,
  );
  const signers = await getSigners(fundPermissions);

  const tx = await (
    await Treasury.fund(
      {
        treasury: treasuryConfig,
        vendor: vendorConfig,
      },
      blazeInstance,
      utxo,
      vendor,
      schedules,
      signers,
      txMetadata,
    )
  ).complete();

  await transactionDialog(tx.toCbor(), false);
}
