import {
  Address,
  Ed25519KeyHashHex,
  Value,
  TransactionId,
  TransactionInput,
} from "@blaze-cardano/core";
import { Blaze, makeValue, Provider, Wallet } from "@blaze-cardano/sdk";
import * as Tx from "@blaze-cardano/tx";
import { input, select } from "@inquirer/prompts";
import {
  chooseAmount,
  getActualPermission,
  getAnchor,
  getBlazeInstance,
  getConfigs,
  getDate,
  getOptional,
  getSigners,
  getTransactionMetadata,
  selectUtxos,
  transactionDialog,
} from "cli/shared";
import {
  IDestination,
  IDisburse,
  IReference,
  toPermission,
  Treasury,
} from "src";
import { loadTreasuryScript } from "src/shared";

async function getDestinations(maxValue: Value): Promise<{
  recipients: { address: Address; amount: Value }[];
  destinations: IDestination[];
}> {
  const recipients: { address: Address; amount: Value }[] = [];
  const destinations: IDestination[] = [];
  let moreDestinations = true;

  while (moreDestinations) {
    const label = await input({
      message: "What is the name of the destination? (label)",
      validate: (value) =>
        value ? true : "Destination label cannot be empty.",
    });

    // todo: check if there is already function we can reuse for this
    const address = Address.fromBech32(
      await input({
        message: "Enter the address of the destination",
        validate: (value) =>
          value ? true : "Destination address cannot be empty.",
      }),
    );

    const amount = await chooseAmount(label, maxValue);
    maxValue = Tx.Value.merge(maxValue, Tx.Value.negate(amount));

    const details = await getOptional(
      "Do you want to add details for this destination? (optional)",
      undefined,
      getAnchor,
    );

    const destination = { label, details };

    recipients.push({ address, amount });
    destinations.push(destination);

    moreDestinations = await select({
      message: "Do you want to add another destination?",
      choices: [
        { name: "Yes", value: true },
        { name: "No", value: false },
      ],
    });
  }

  return { destinations, recipients };
}

// todo: let the user give a validity start or end
export async function getValidInterval(): Promise<
  { fromPosix: number; toPosix: number } | undefined
> {
  const details = await getOptional(
    "Do you want to choose transaction validity interval for this transaction? (optional)",
    "Valid Start?",
    async () => {
      return {
        validStart: await getDate("Valid Start?"),
        validEnd: await getDate("Valid End?"),
      };
    },
  );
  if (details) {
    const { validStart, validEnd } = details;
    return { fromPosix: validStart.valueOf(), toPosix: validEnd.valueOf() };
  }
  return undefined;
}

export async function getReference(): Promise<IReference> {
  const type = await select({
    message: "Type?",
    choices: [{ name: "Other", value: "Other" }],
  });
  const label = await input({ message: "Label?" });
  const uri = await input({ message: "URI?" });
  return { "@type": type, label, uri };
}

export async function disburse(
  blaze: Blaze<Provider, Wallet> | undefined = undefined,
): Promise<void> {
  if (!blaze) {
    blaze = await getBlazeInstance();
  }
  const { configs, scripts } = await getConfigs(blazeInstance);

  const { scriptAddress: treasuryScriptAddress } = loadTreasuryScript(
    blazeInstance.provider.network,
    configs.treasury,
  );

  const utxos = await blazeInstance.provider.getUnspentOutputs(
    treasuryScriptAddress,
  );
  const inputUtxos = await selectUtxos(utxos);
  const inputAmount = inputUtxos.reduce(
    (acc, r) => Tx.Value.merge(acc, r.output().amount()),
    makeValue(0n),
  );

  const signers = await getSigners(
    toPermission(configs.treasury.permissions.disburse),
  );

  const returnDate = await getOptional(
    "Will these funds be returned?",
    undefined,
    async () => getDate("When should the disbursed funds be returned?"),
  );

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
    destination: {} as IDestination,
    estimatedReturn: returnDate ? BigInt(returnDate.getTime()) : undefined,
  } as IDisburse;

  const { destinations, recipients } = await getDestinations(inputAmount);

  metadataBody.destination = destinations;

  const txMetadata = await getTransactionMetadata(
    configs.treasury.registry_token,
    metadataBody,
  );

  const validityInterval = await getValidInterval();

  while (true) {
    const reference = await getOptional(
      (txMetadata.body.references?.length ?? 0 > 0)
        ? "Attach another reference?"
        : "Attach a reference?",
      undefined,
      async () => getReference(),
    );
    if (reference) {
      txMetadata.body.references ??= [];
      txMetadata.body.references.push(reference);
    } else {
      break;
    }
  }

  const tx = await (
    await Treasury.disburse({
      configsOrScripts: {
        configs,
        scripts,
      },
      blaze: blazeInstance,
      input: inputUtxos,
      recipients,
      signers,
      metadata: txMetadata,
      validFromSlot: validityInterval
        ? blazeInstance.provider.unixToSlot(validityInterval.fromPosix)
        : undefined,
      validUntilSlot: validityInterval
        ? blazeInstance.provider.unixToSlot(validityInterval.toPosix)
        : undefined,
    })
  ).complete();

  await transactionDialog(blaze.provider.network, tx.toCbor(), false);
}
