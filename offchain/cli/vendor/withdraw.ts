import { Address } from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Blaze, Provider, Wallet } from "@blaze-cardano/sdk";
import { input } from "@inquirer/prompts";
import {
  getAnchor,
  getBlazeInstance,
  getConfigs,
  getSigners,
  getTransactionMetadata,
  selectUtxos,
  transactionDialog,
} from "cli/shared";
import { Vendor } from "src";
import { toPermission } from "src/metadata/permission";
import { IAnchorWithLabel, IMilestone, IWithdraw } from "src/metadata/withdraw";
import { loadVendorScript } from "src/shared";
import { VendorDatum } from "src/types/contracts";

async function getEvidence(): Promise<IAnchorWithLabel[]> {
  const evidence: IAnchorWithLabel[] = [];
  while (true) {
    const label = await input({
      message: "Enter the label for the evidence (or leave empty to finish):",
    });
    if (!label) {
      break;
    }
    const anchor = await getAnchor();
    evidence.push({ label, ...anchor });
  }
  return evidence;
}

async function getFinishedMilestones(): Promise<Record<string, IMilestone>> {
  const milestones: Record<string, IMilestone> = {};
  while (true) {
    const identifier = await input({
      message: "Enter the milestone identifier (or leave empty to finish):",
    });
    if (!identifier) {
      break;
    }
    const milestone = {
      description: await input({
        message: `Enter the description for milestone ${identifier}:`,
      }),
      evidence: await getEvidence(),
    } as IMilestone;
    milestones[identifier] = milestone;
  }
  return milestones;
}

export async function withdraw(
  blazeInstance?: Blaze<Provider, Wallet>,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }
  const { vendorConfig } = await getConfigs();

  const { scriptAddress } = loadVendorScript(
    blazeInstance.provider.network,
    vendorConfig,
  );

  const utxos = await blazeInstance.provider.getUnspentOutputs(scriptAddress);

  const now = Date.now();

  const inputs = await selectUtxos(
    utxos.filter((u) => {
      const data = u.output().datum()?.asInlineData();
      if (!data) return false;
      const datum = Data.parse(VendorDatum, data);
      return (
        datum.payouts.find((p) => Number(p.maturation) <= now) !== undefined
      );
    }),
  );

  const destination = Address.fromBech32(
    await input({
      message: "Enter the destination address",
      validate: (value) => {
        if (!value) {
          return "Destination address cannot be empty.";
        }
        //TODO: add better validation for address format
        if (!value.startsWith("addr")) {
          return "Invalid address format. Please enter a valid Cardano address.";
        }
        return true;
      },
    }),
  );

  const vendors = inputs.map((input) => {
    const data = input.output().datum()?.asInlineData();
    if (!data) {
      throw new Error("Input does not have a valid datum.");
    }
    const datum = Data.parse(VendorDatum, data);
    return datum.vendor;
  });

  const signers = (
    await Promise.all(
      vendors.map(async (vendor) => await getSigners(toPermission(vendor))),
    )
  ).flat();

  const metadataBody = {
    event: "withdraw",
    milestones: await getFinishedMilestones(),
  } as IWithdraw;

  const txMetadata = await getTransactionMetadata(metadataBody);

  const tx = await (
    await Vendor.withdraw(
      vendorConfig,
      blazeInstance,
      new Date(now),
      inputs,
      destination,
      signers,
      txMetadata,
    )
  ).complete();

  await transactionDialog(tx.toCbor(), false);
}
