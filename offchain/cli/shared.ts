import { Address, CredentialType } from "@blaze-cardano/core";
import {
  Blockfrost,
  ColdWallet,
  Core,
  Maestro,
  Wallet,
  type Provider,
} from "@blaze-cardano/sdk";
import { input, select } from "@inquirer/prompts";
import clipboard from "clipboardy";
import {
  toMultisig,
  type TPermissionMetadata,
  type TPermissionName,
} from "../src/metadata/types/permission";
import type {
  TreasuryConfiguration,
  VendorConfiguration,
} from "../src/types/contracts";

export async function maybeInput(opts: {
  message: string;
  validate?: (a: string) => boolean | string | Promise<boolean | string>;
}): Promise<string | undefined> {
  const resp = await input(opts);
  if (resp === "") {
    return undefined;
  }
  return resp;
}

export async function getDate(title: string, min?: Date): Promise<Date> {
  const dateStr = await input({
    message: `${title} (Enter a date and time in the format 2006-01-02 15:04:05)`,
    validate: function (str) {
      if (!/[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/.test(str)) {
        return "Must be a valid date";
      } else {
        const date = new Date(str);
        if (date.valueOf() < Date.now().valueOf()) {
          return "That date is in the past!";
        }
        if (min && date.valueOf() <= min.valueOf()) {
          return `The date should be after ${new Date(min).toLocaleString()}`;
        }
      }
      return true;
    },
  });
  return new Date(dateStr);
}

export async function getPermission(
  title: string,
  existing?: TPermissionName[],
): Promise<TPermissionMetadata | TPermissionName> {
  console.log(`\n${title}`);
  const msigType = await select({
    message: "Select the multisig type",
    choices: [
      { name: "Existing", value: "existing", disabled: !existing },
      { name: "Signature", value: "signature" },
      { name: "Script", value: "script" },
      { name: "Threshold", value: "threshold" },
      { name: "All", value: "all" },
      { name: "Any", value: "any" },
      { name: "Before", value: "before" },
      { name: "After", value: "after" },
    ],
  });

  switch (msigType) {
    case "signature": {
      const label = await maybeInput({
        message: "Do you want to assign a human readable label to this key?",
      });
      const address = await input({
        message:
          "Enter a hexidecimal pubkey hash, or a bech32 encoded address. In the case of a base address, we will use the payment credential ",
        validate: (s) => isAddressOrHex(s, CredentialType.KeyHash),
      });
      return await addressOrHexToPermission(
        label,
        address,
        CredentialType.KeyHash,
      );
    }
    case "script": {
      const label = await maybeInput({
        message: "Do you want to assign a human readable label to this script?",
      });
      const script = await input({
        message:
          "Enter a hexidecimal script hash, or a bech32 encoded address. In the case of a base address, we will use the payment credential ",
        validate: (s) => isAddressOrHex(s, CredentialType.ScriptHash),
      });
      return await addressOrHexToPermission(
        label,
        script,
        CredentialType.ScriptHash,
      );
    }
    case "threshold": {
      const label = await maybeInput({
        message:
          "Do you want to assign a human readable label to this grouping?",
      });
      const threshold = await input({
        message: "At least how many sub-conditions must be true?",
        validate: (s) => /^\+?(0|[1-9]\d*)$/.test(s) || "Must be an integer",
      });
      return {
        label,
        atLeast: {
          required: BigInt(threshold),
          scripts: await getPermissionList(
            `We need a set of sub-conditions, at least ${threshold} of which must be true.`,
          ),
        },
      };
    }
    case "all": {
      const label = await maybeInput({
        message:
          "Do you want to assign a human readable label to this grouping?",
      });
      const allScripts = await getPermissionList(
        "Enter list of multisigscripts",
      );
      return { label, allOf: { scripts: allScripts } };
    }
    case "any": {
      const label = await maybeInput({
        message:
          "Do you want to assign a human readable label to this grouping?",
      });
      const anyScripts = await getPermissionList(
        "Enter list of multisigscripts",
      );
      return { label, anyOf: { scripts: anyScripts } };
    }
    case "before": {
      const label = await maybeInput({
        message:
          "Do you want to assign a human readable label to this criteria?",
      });
      const beforeTime = await getDate(
        "Before which date is this criteria is valid?",
      );
      return { label, before: { time: BigInt(beforeTime.valueOf()) } };
    }
    case "after": {
      const label = await maybeInput({
        message:
          "Do you want to assign a human readable label to this criteria?",
      });
      const afterTime = await getDate(
        "After which date is this criteria valid?",
      );
      return { label, after: { time: BigInt(afterTime.valueOf()) } };
    }
    case "existing": {
      return (await select({
        message: "Reuse the permissions from which action?",
        choices: existing!.map((action) => ({
          name: action,
          value: action.toLowerCase(),
        })),
      })) as TPermissionName;
    }
    default:
      throw new Error("Invalid multisig type");
  }
}

export function isAddressOrHex(
  str: string,
  expectedType: CredentialType,
): true | string {
  if (/[0-9a-fA-F]{56}/.test(str)) {
    return true;
  } else if (str.startsWith("addr") || str.startsWith("stake")) {
    try {
      const addr = Address.fromBech32(str);
      if (str.startsWith("addr")) {
        const credType = addr.getProps().paymentPart?.type;
        if (credType !== expectedType) {
          return `Expecting a ${CredentialType[expectedType]} but got a ${CredentialType[credType!]}`;
        }
      } else {
        const credType = addr.asReward()?.getPaymentCredential().type;
        if (credType !== expectedType) {
          return `Expecting a ${CredentialType[expectedType]} but got a ${CredentialType[credType!]}`;
        }
      }
      return true;
    } catch (err) {
      return "Invalid address";
    }
  } else {
    return "Unrecognized format";
  }
}

export async function addressOrHexToHash(
  address_str: string,
  expectedType: CredentialType,
): Promise<string> {
  if (/[0-9a-fA-F]{56}/.test(address_str)) {
    return address_str;
  }
  if (address_str.startsWith("addr") || address_str.startsWith("stake")) {
    const address = Address.fromBech32(address_str);
    if (address_str.startsWith("addr")) {
      const credType = address.getProps().paymentPart?.type;
      if (credType !== expectedType) {
        throw new Error(
          `Expecting a ${expectedType} address, but got ${credType}`,
        );
      }
      return address.getProps().paymentPart!.hash;
    } else {
      const credType = address.asReward()!.getPaymentCredential().type;
      if (credType !== expectedType) {
        throw new Error(
          `Expecting a ${expectedType} address, but got ${credType}`,
        );
      }
      return address.asReward()!.getPaymentCredential().hash;
    }
  }
  throw new Error("Unrecognized format");
}

export async function addressOrHexToPermission(
  label: string | undefined,
  address_str: string,
  expectedType: CredentialType,
): Promise<TPermissionMetadata> {
  if (/[0-9a-fA-F]{56}/.test(address_str)) {
    switch (expectedType) {
      case CredentialType.KeyHash:
        return {
          label,
          signature: { key_hash: address_str },
        };
      case CredentialType.ScriptHash:
        return {
          label,
          script: { script_hash: address_str },
        };
      default:
        throw new Error("Unrecognized credential type");
    }
  }
  if (address_str.startsWith("addr") || address_str.startsWith("stake")) {
    const address = Address.fromBech32(address_str);
    if (address_str.startsWith("addr")) {
      const credType = address.getProps().paymentPart?.type;
      if (credType !== expectedType) {
        throw new Error(
          `Expecting a ${expectedType} address, but got ${credType}`,
        );
      }
      switch (credType) {
        case CredentialType.KeyHash:
          return {
            label,
            signature: {
              key_hash: address.getProps().paymentPart!.hash,
            },
          };
        case CredentialType.ScriptHash:
          return {
            label,
            script: {
              script_hash: address.getProps()!.paymentPart!.hash,
            },
          };
        default:
          throw new Error("Invalid address type");
      }
    } else {
      const credType = address.asReward()!.getPaymentCredential().type;
      if (credType !== expectedType) {
        throw new Error(
          `Expecting a ${expectedType} address, but got ${credType}`,
        );
      }
      switch (credType) {
        case CredentialType.KeyHash:
          return {
            label,
            signature: {
              key_hash: address.asReward()!.getPaymentCredential().hash,
            },
          };
        case CredentialType.ScriptHash:
          return {
            label,
            script: {
              script_hash: address.asReward()!.getPaymentCredential().hash,
            },
          };
        default:
          throw new Error("Invalid address type");
      }
    }
  }
  throw new Error("Unrecognized format");
}

export async function getPermissionList(
  title: string,
): Promise<TPermissionMetadata[]> {
  console.log(`${title}`);
  const entryMethod: "csl" | "obo" = await select({
    message: "How would you like to enter the list of criteria?",
    choices: [
      { name: "Comma separated address list", value: "csl" },
      { name: "One by one", value: "obo" },
    ],
  });

  switch (entryMethod) {
    case "csl": {
      const addresses = await input({
        message:
          "Enter the hex pubkey hashes or addresses of the signature, separated by commas",
      });
      const addressList = addresses.split(",").map((address) => address.trim());
      const msigList: TPermissionMetadata[] = [];
      for (const address of addressList) {
        msigList.push(
          await addressOrHexToPermission(
            undefined,
            address,
            CredentialType.KeyHash,
          ),
        );
      }
      return msigList;
    }
    case "obo": {
      const msigList: TPermissionMetadata[] = [];
      let addMore = true;
      while (addMore) {
        const msig = await getPermission("Next criteria");
        msigList.push(msig as TPermissionMetadata);
        addMore = await select({
          message: "Add more criteria?",
          choices: [
            { name: "Yes", value: true },
            { name: "No", value: false },
          ],
        });
      }
      return msigList;
    }
    default:
      throw new Error("Unreachable");
  }
}

export async function transactionDialog(
  txCbor: string,
  expanded: boolean,
): Promise<void> {
  const choices = [
    { name: "Copy tx cbor", value: "copy" },
    { name: "Back", value: "back" },
  ];
  if (expanded) {
    console.log("Transaction cbor: ", txCbor);
  } else {
    console.log("Transaction cbor: ", `${txCbor.slice(0, 50)}...`);
    choices.push({ name: "Expand", value: "expand" });
  }
  const choice = await select({
    message: "Select an option",
    choices: choices,
  });
  switch (choice) {
    case "copy":
      clipboard.writeSync(txCbor);
      await select({
        message: "Transaction cbor copied to clipboard.",
        choices: [{ name: "Press enter to continue.", value: "continue" }],
      });
      break;
    case "back":
      return;
    case "expand":
      await transactionDialog(txCbor, true);
      break;
    default:
      throw new Error("Unreachable");
  }
}

export async function getProvider(): Promise<Provider> {
  const providerType = await select({
    message: "Select the provider type",
    choices: [
      { name: "Blockfrost", value: "blockfrost" },
      { name: "Maestro", value: "maestro" },
    ],
  });
  switch (providerType) {
    case "blockfrost":
      const bfNetwork: "cardano-mainnet" | "cardano-preview" = await select({
        message: "Select the network",
        choices: [
          { name: "Mainnet", value: "cardano-mainnet" },
          { name: "Preview", value: "cardano-preview" },
        ],
      });
      return new Blockfrost({
        network: bfNetwork,
        projectId: await input({
          message: "Enter the Blockfrost project ID",
        }),
      });
    case "maestro":
      const mNetwork: "mainnet" | "preview" = await select({
        message: "Select the network",
        choices: [
          { name: "Mainnet", value: "mainnet" },
          { name: "Preview", value: "preview" },
        ],
      });
      return new Maestro({
        network: mNetwork,
        apiKey: await input({
          message: "Enter the Maestro API key",
        }),
      });
    default:
      throw new Error("Invalid provider type");
  }
}

export async function getWallet(provider: Provider): Promise<Wallet> {
  const address = Core.Address.fromBech32(
    await input({
      message: "Enter the address of the wallet",
    }),
  );
  const wallet = new ColdWallet(address, provider.network, provider);
  return wallet;
}

export async function getPermissions(): Promise<
  Record<TPermissionName, TPermissionMetadata | TPermissionName>
> {
  return {
    reorganize: await getPermission(
      "What permissions should be required to reorganize (split and merge) UTxOs?",
    ),
    sweep: await getPermission(
      "What permissions should be required to sweep funds back to the Cardano treasury early?",
      ["reorganize"],
    ),
    fund: await getPermission(
      "What permissions should be required to fund a new project?",
      ["reorganize", "sweep"],
    ),
    disburse: await getPermission(
      "What permissions should be required to disburse funds to an ARBITRARY address?",
      ["reorganize", "sweep", "fund"],
    ),
    pause: await getPermission(
      "What permissions should be required to pause a vendor payout?",
      ["reorganize", "sweep", "fund", "disburse"],
    ),
    resume: await getPermission(
      "What permissions should be required to resume a vendor payout?",
      ["reorganize", "sweep", "fund", "disburse", "pause"],
    ),
    modify: await getPermission(
      "What permissions should be required (in addition to the vendors approval) to modify a project?",
      ["reorganize", "sweep", "fund", "disburse", "resume"],
    ),
  };
}

export async function getTreasuryConfig(
  registry_token_policy: string | undefined,
  permissions: Record<TPermissionName, TPermissionMetadata | TPermissionName>,
): Promise<TreasuryConfiguration> {
  if (!registry_token_policy) {
    registry_token_policy = await input({
      message: "Enter the registry token policy ID",
    });
  }

  const treasury_expiration = await getDate(
    "After which date should funds at the treasury script be swept back to the Cardano treasury?",
  );
  const payout_upperbound = await getDate(
    "What should the maximum date for any vendor payout be?",
    treasury_expiration,
  );

  return {
    registry_token: registry_token_policy,
    permissions: {
      disburse: toMultisig(permissions.disburse, permissions),
      fund: toMultisig(permissions.fund, permissions),
      reorganize: toMultisig(permissions.reorganize, permissions),
      sweep: toMultisig(permissions.sweep, permissions),
    },
    expiration: BigInt(treasury_expiration.valueOf()),
    payout_upperbound: BigInt(payout_upperbound.valueOf()),
  };
}

export async function getVendorConfig(
  registry_token_policy: string | undefined,
  payout_upperbound: Date,
  permissions: Record<TPermissionName, TPermissionMetadata | TPermissionName>,
): Promise<VendorConfiguration> {
  if (!registry_token_policy) {
    registry_token_policy = await input({
      message: "Enter the registry token policy ID",
    });
  }
  const vendorExpiration = await getDate(
    "At which date should disputed payouts be swept back to the cardano treasury?",
    payout_upperbound,
  );
  return {
    registry_token: registry_token_policy,
    permissions: {
      modify: toMultisig(permissions.modify, permissions),
      pause: toMultisig(permissions.pause, permissions),
      resume: toMultisig(permissions.resume, permissions),
    },
    expiration: BigInt(vendorExpiration.valueOf()),
  };
}
