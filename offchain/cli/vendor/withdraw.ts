import { Address, TransactionUnspentOutput } from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Blaze, Provider, Wallet } from "@blaze-cardano/sdk";
import { input } from "@inquirer/prompts";
import {
  getBlazeInstance,
  getConfigs,
  getSigners,
  getTransactionMetadata,
  selectUtxos,
  transactionDialog,
} from "cli/shared";
import { Vendor } from "src";
import { VendorDatum } from "src/generated-types/contracts";
import { toPermission } from "src/metadata/types/permission";
import { IMilestone, IWithdraw } from "src/metadata/types/withdraw";

async function getFinishedMilestones(
  vendorInputs: TransactionUnspentOutput[],
): Promise<Record<string, IMilestone>> {
  const maturedPayouts = vendorInputs
    .map((input, index) => {
      const data = input.output().datum()?.asInlineData();
      if (!data) return undefined;
      const datum = Data.parse(VendorDatum, data);
      return datum.payouts
        .filter(
          (p) => p.status === "Active" && Number(p.maturation) <= Date.now(),
        )
        .map((p) => ({
          index,
          payout: p,
        }));
    })
    .flat()
    .filter((p) => p !== undefined);

  const milestones: Record<string, IMilestone> = {};

  for (const { index, payout } of maturedPayouts) {
    const identifier = await input({
      message: `Enter the milestone identifier for milestone in vendor utxo ${index} maturing on ${new Date(Number(payout.maturation)).toLocaleString()}:`,
      default: `${index}-${payout.maturation}`,
    });
    if (!identifier) {
      break;
    }
    const milestone = {
      comment: await input({
        message: `Enter the description for milestone ${identifier}:`,
      }),
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
  const { configs, scripts } = await getConfigs(blazeInstance);

  const { scriptAddress } = scripts.vendorScript;

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

  const signers = [];
  for (const vendor of vendors) {
    const vendorSigners = await getSigners(toPermission(vendor));
    signers.push(...vendorSigners);
  }

  const metadataBody = {
    event: "withdraw",
    milestones: await getFinishedMilestones(inputs),
  } as IWithdraw;

  const txMetadata = await getTransactionMetadata(
    configs.vendor.registry_token,
    metadataBody,
  );

  const tx = await (
    await Vendor.withdraw({
      configsOrScripts: { configs, scripts },
      blaze: blazeInstance,
      now: new Date(now),
      inputs,
      destination,
      signers,
      metadata: txMetadata,
    })
  ).complete();

  await transactionDialog(blazeInstance.provider.network, tx.toCbor(), false);
}
