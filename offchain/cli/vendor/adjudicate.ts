import * as Data from "@blaze-cardano/data";
import { Blaze, Provider, Wallet } from "@blaze-cardano/sdk";
import { checkbox, input } from "@inquirer/prompts";
import {
  getActualPermission,
  getBlazeInstance,
  getConfigs,
  getSigners,
  getTransactionMetadata,
  maybeInput,
  selectUtxo,
  transactionDialog,
} from "cli/shared";
import { Vendor } from "src";
import { IMilestone, IPause, IResume } from "src/metadata/adjudicate";
import { loadVendorScript } from "src/shared";
import { VendorDatum } from "src/types/contracts";

async function adjudicate(
  pause: boolean,
  blazeInstance?: Blaze<Provider, Wallet>,
): Promise<void> {
  if (!blazeInstance) {
    blazeInstance = await getBlazeInstance();
  }

  const now = Date.now();

  const oldStatus = pause ? "Paused" : "Active";
  const newStatus = pause ? "Active" : "Paused";

  const { vendorConfig, metadata } = await getConfigs();

  const { scriptAddress: vendorScriptAddress } = loadVendorScript(
    blazeInstance.provider.network,
    vendorConfig,
  );

  const utxos =
    await blazeInstance.provider.getUnspentOutputs(vendorScriptAddress);

  const utxo = await selectUtxo(utxos);

  const data = utxo.output().datum()?.asInlineData();
  if (!data) {
    throw new Error("No datum found on the selected UTXO");
  }

  const datum = Data.parse(VendorDatum, data);

  const statuses = datum.payouts.map((p) => p.status);

  const choices = datum.payouts.map((p, index) => ({
    name: new Date(Number(p.maturation)).toISOString(),
    value: index,
    disabled:
      p.status !== oldStatus || (p.maturation < now && p.status === "Active"),
  }));

  const selections = await checkbox({
    message: `Select payouts to set to ${newStatus}`,
    choices,
  });

  selections.forEach((index) => {
    statuses[index] = newStatus;
  });

  const milestones: Record<string, IMilestone> = {};

  selections.forEach(async (index) => {
    const identifier = await input({
      message: `Enter identifier for payout ${index + 1}`,
      validate: (value) => (value ? true : "Identifier cannot be empty."),
    });
    const reason = await input({
      message: `Enter reason for setting payout ${index + 1} to ${newStatus}`,
      validate: (value) => (value ? true : "Reason cannot be empty."),
    });
    let resolution = undefined;
    if (!pause) {
      resolution = await maybeInput({
        message: `Enter resolution path for resumeing payout ${index + 1} (optional)`,
      });
    }
    milestones[identifier] = {
      reason,
      resolution,
    };
  });

  const metadataBody = {
    event: pause ? "pause" : "resume",
    milestones,
  } as IPause | IResume;

  const signers = await getSigners(
    pause
      ? getActualPermission(metadata.permissions.pause, metadata.permissions)
      : getActualPermission(metadata.permissions.resume, metadata.permissions),
  );

  const txMetadata = await getTransactionMetadata(metadataBody);

  const tx = await (
    await Vendor.adjudicate(
      vendorConfig,
      blazeInstance,
      new Date(now),
      utxo,
      statuses,
      signers,
      txMetadata,
    )
  ).complete();

  await transactionDialog(tx.toCbor(), false);
}

export async function pause(
  blazeInstance?: Blaze<Provider, Wallet>,
): Promise<void> {
  await adjudicate(true, blazeInstance);
}

export async function resume(
  blazeInstance?: Blaze<Provider, Wallet>,
): Promise<void> {
  await adjudicate(false, blazeInstance);
}
