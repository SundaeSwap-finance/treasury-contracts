import {
  Address,
  CredentialType,
  Ed25519KeyHashHex,
  Script,
  Transaction,
  TransactionUnspentOutput,
} from "@blaze-cardano/core";
import {
  Blaze,
  Blockfrost,
  ColdWallet,
  Core,
  Maestro,
  NetworkName,
  Wallet,
  type Provider,
} from "@blaze-cardano/sdk";
import { checkbox, input, select } from "@inquirer/prompts";
import clipboard from "clipboardy";
import fetch from "node-fetch";
import { ETransactionEvent } from "../src";
import {
  OneshotOneshotMint,
  TreasuryConfiguration,
  TreasuryTreasurySpend,
  VendorConfiguration,
  VendorVendorSpend,
} from "../src/generated-types/contracts";
import {
  type IAnchor,
  type ITransactionMetadata,
} from "../src/metadata/shared";
import { IOutput } from "../src/metadata/types/initialize-reorganize";
import { INewInstance } from "../src/metadata/types/new-instance";
import {
  toMultisig,
  TPermissionMetadata,
  TPermissionName,
} from "../src/metadata/types/permission";
import {
  constructScriptsFromBytes,
  ICompiledScripts,
  IConfigs,
  loadConfigsAndScripts,
} from "../src/shared";
import { CustomProvider } from "./custom";

const BLOCKFROST_VAR = "BLOCKFROST_KEY";
const MAESTRO_VAR = "MAESTRO_KEY";
const WALLET_VAR = "WALLET_ADDRESS";

export interface ICompiledScriptOnDisk<C> {
  config: C;
  script: string;
  scriptRef?: TransactionUnspentOutput;
  network: Core.NetworkId;
}

export interface ICompiledScriptsOnDisk {
  treasuryScript: ICompiledScriptOnDisk<TreasuryConfiguration>;
  vendorScript: ICompiledScriptOnDisk<VendorConfiguration>;
}

export interface IOnDiskInstance {
  scripts?: ICompiledScriptsOnDisk;
  metadata?: ITransactionMetadata<INewInstance>;
}

async function getConditionsFromList(
  permissions: TPermissionMetadata[],
  min: number,
): Promise<TPermissionMetadata[]> {
  const choices = permissions.map((script) => ({
    name: script.label || JSON.stringify(script),
    value: script,
  }));
  const selections = await checkbox({
    message: "Select the conditions that will be signing the transaction",
    choices,
    validate: (selected) => {
      if (selected.length < min) {
        return `You must select at least ${min} conditions`;
      }
      return true;
    },
  });
  return selections;
}

export async function getSigners(
  ...permissions: TPermissionMetadata[]
): Promise<Set<Ed25519KeyHashHex>> {
  let signers: Set<Ed25519KeyHashHex> = new Set();

  for (const permission of permissions) {
    if ("signature" in permission) {
      signers.add(Ed25519KeyHashHex(permission.signature.keyHash));
    }

    if ("atLeast" in permission) {
      const scripts = await getConditionsFromList(
        permission.atLeast.scripts,
        Number(permission.atLeast.required),
      );
      for (const script of scripts) {
        signers = signers.union<Ed25519KeyHashHex>(await getSigners(script));
      }
    }

    if ("anyOf" in permission) {
      const scripts = await getConditionsFromList(permission.anyOf.scripts, 1);
      for (const script of scripts) {
        signers = signers.union<Ed25519KeyHashHex>(await getSigners(script));
      }
    }

    if ("allOf" in permission) {
      for (const script of permission.allOf.scripts) {
        signers = signers.union<Ed25519KeyHashHex>(await getSigners(script));
      }
    }
  }

  return signers;
}

export async function inputOrEnv(opts: {
  message: string;
  env: string;
  validate?: (a: string) => boolean | string | Promise<boolean | string>;
}): Promise<string> {
  if (process.env[opts.env] !== undefined) {
    return process.env[opts.env]!;
  }
  return await input(opts);
}

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

export async function getOptional<T, O>(
  message: string,
  opts: O,
  call: (o: O) => Promise<T>,
): Promise<T | undefined> {
  const option = await select({
    message: message,
    choices: [
      { name: "Yes", value: true },
      { name: "No", value: false },
    ],
  });
  if (option) {
    return await call(opts);
  } else {
    return undefined;
  }
}

export async function getAnchor(): Promise<IAnchor> {
  return {
    anchorUrl: await input({
      message: "Enter the URL of the anchor (e.g., https://example.com/anchor)",
      validate: (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return "Invalid URL format";
        }
      },
    }),
    anchorDataHash: await input({
      message: "Enter the hash of the anchor data (hex format)",
      validate: (hash) => {
        if (/^[0-9a-fA-F]{64}$/.test(hash)) {
          return true;
        }
        return "Hash must be a 64-character hexadecimal string";
      },
    }),
  } as IAnchor;
}

export async function getDate(
  title: string,
  defaultDate?: Date,
  min?: Date,
): Promise<Date> {
  const dateStr = await input({
    message: `${title} (Enter a date and time in the format 2006-01-02 15:04:05)`,
    default:
      defaultDate &&
      `${defaultDate.getUTCFullYear()}-${(defaultDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${defaultDate.getUTCDate().toString().padStart(2, "0")} ${defaultDate.getHours().toString().padStart(2, "0")}:${defaultDate.getMinutes().toString().padStart(2, "0")}:${defaultDate.getSeconds().toString().padStart(2, "0")}`,
    validate: function (str) {
      // Awkward hack
      if (new Date(str) === defaultDate) {
        return true;
      }
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
  opts: { allowCancel: boolean } = { allowCancel: false },
): Promise<TPermissionMetadata | TPermissionName | null> {
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
    ].concat(opts.allowCancel ? [{ name: "Cancel", value: "cancel" }] : []),
  });

  switch (msigType) {
    case "cancel": {
      return null;
    }

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

export function isAddress(
  str: string,
  expectedType: CredentialType,
): true | string {
  if (str.startsWith("addr") || str.startsWith("stake")) {
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

export function isAddressOrHex(
  str: string,
  expectedType: CredentialType,
): true | string {
  if (/[0-9a-fA-F]{56}/.test(str)) {
    return true;
  } else {
    return isAddress(str, expectedType);
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
          signature: { keyHash: address_str },
        };
      case CredentialType.ScriptHash:
        return {
          label,
          script: { scriptHash: address_str },
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
              keyHash: address.getProps().paymentPart!.hash,
            },
          };
        case CredentialType.ScriptHash:
          return {
            label,
            script: {
              scriptHash: address.getProps()!.paymentPart!.hash,
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
              keyHash: address.asReward()!.getPaymentCredential().hash,
            },
          };
        case CredentialType.ScriptHash:
          return {
            label,
            script: {
              scriptHash: address.asReward()!.getPaymentCredential().hash,
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
      do {
        addMore = await select({
          message: "Add more criteria?",
          choices: [
            { name: "Yes", value: true },
            { name: "No", value: false },
          ],
        });
        if (addMore) {
          const msig = await getPermission("Next criteria", undefined, {
            allowCancel: true,
          });
          if (msig !== null) {
            msigList.push(msig as TPermissionMetadata);
          }
        }
      } while (addMore);
      return msigList;
    }
    default:
      throw new Error("Unreachable");
  }
}

export async function transactionDialog(
  network: Core.NetworkId,
  txCbor: string,
  expanded: boolean,
  allowSubmitToApi: boolean = true,
): Promise<void> {
  const choices = [{ name: "Copy tx cbor", value: "copy" }];
  if (allowSubmitToApi) {
    choices.push({ name: "Submit to API", value: "submit" });
  }

  if (expanded) {
    console.log("Transaction cbor: ", txCbor);
  } else {
    console.log("Transaction cbor: ", `${txCbor.slice(0, 50)}...`);
    choices.push({ name: "Expand", value: "expand" });
  }
  choices.push({ name: "Back", value: "back" });
  while (true) {
    try {
      const choice = await select({
        message: "Select an option",
        choices: choices,
      });
      switch (choice) {
        case "copy":
          try {
            clipboard.writeSync(txCbor);
            await select({
              message: "Transaction cbor copied to clipboard.",
              choices: [
                { name: "Press enter to continue.", value: "continue" },
              ],
            });
          } catch {
            console.log("Failed to copy to clipboard; expand the cbor instead");
            expanded = true;
          }
          break;
        case "submit":
          const url =
            network === Core.NetworkId.Testnet
              ? "https://api.treasury.preview.sundae.fi/graphql"
              : "https://api.treasury.sundae.fi/graphql";
          const query = `
          mutation {
            newTransaction(tx: {
              label: "${await input({ message: "What label should the tx have in the UI?" })}",
              cborHex: "${txCbor}"
            }) {
              ok
            }
          }
        `;
          const resp = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ query }),
          });
          console.log(await resp.json());
          break;
        case "back":
          return;
        case "expand":
          console.log("Transaction cbor: ", txCbor);
          expanded = true;
          break;
        default:
          throw new Error("Unreachable");
      }
    } catch (err) {
      console.error("Encountered some error: ", err);
      continue;
    }
  }
}

export async function getProvider(): Promise<Provider> {
  let providerType;

  if (process.env[BLOCKFROST_VAR] !== undefined) {
    console.log(
      `${BLOCKFROST_VAR} detected in env, assuming Blockfrost provider.`,
    );
    providerType = "blockfrost";
  } else if (process.env[MAESTRO_VAR] !== undefined) {
    console.log(`${MAESTRO_VAR} detected in env, assuming Maestro provider.`);
    providerType = "maestro";
  } else {
    providerType = await select({
      message: "Select the provider type",
      choices: [
        { name: "Blockfrost", value: "blockfrost" },
        { name: "Maestro", value: "maestro" },
        { name: "Custom", value: "custom" },
      ],
    });
  }

  switch (providerType) {
    case "blockfrost":
      const bfKey = await inputOrEnv({
        message: "Enter the Blockfrost project ID",
        env: BLOCKFROST_VAR,
        validate: (s) => s.startsWith("preview") || s.startsWith("mainnet"),
      });
      const bfNetwork: "cardano-mainnet" | "cardano-preview" = bfKey.startsWith(
        "preview",
      )
        ? "cardano-preview"
        : "cardano-mainnet";
      return new Blockfrost({
        network: bfNetwork,
        projectId: bfKey,
      });
    case "maestro":
      const mKey = await inputOrEnv({
        message: "Enter the Maestro API key",
        env: MAESTRO_VAR,
      });
      const mNetwork: "mainnet" | "preview" = await select({
        message: "Select the network",
        choices: [
          { name: "Mainnet", value: "mainnet" },
          { name: "Preview", value: "preview" },
        ],
      });
      return new Maestro({
        network: mNetwork,
        apiKey: mKey,
      });
    case "custom":
      const network = await select({
        message: "Select which type of network this is",
        choices: [
          {
            name: "Preview",
            value: {
              id: Core.NetworkId.Testnet,
              name: "cardano-preview" as NetworkName,
            },
          },
          {
            name: "Preprod",
            value: {
              id: Core.NetworkId.Testnet,
              name: "cardano-preprod" as NetworkName,
            },
          },
          {
            name: "Sanchonet",
            value: {
              id: Core.NetworkId.Testnet,
              name: "cardano-sanchonet" as NetworkName,
            },
          },
          {
            name: "Mainnet",
            value: {
              id: Core.NetworkId.Mainnet,
              name: "cardano-mainnet" as NetworkName,
            },
          },
        ],
      });
      return new CustomProvider(network.id, network.name);
    default:
      throw new Error("Invalid provider type");
  }
}

export async function getWallet(provider: Provider): Promise<Wallet> {
  const address = Core.Address.fromBech32(
    await inputOrEnv({
      message: "Enter the address of the wallet",
      env: WALLET_VAR,
    }),
  );
  const wallet = new ColdWallet(address, provider.network, provider);
  return wallet;
}

export async function getPermissions(): Promise<
  Record<TPermissionName, TPermissionMetadata | TPermissionName | null>
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
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >,
): Promise<TreasuryConfiguration> {
  if (!registry_token_policy) {
    registry_token_policy = await input({
      message: "Enter the registry token policy ID",
    });
  }

  const treasury_expiration = await getDate(
    "After which date should funds at the treasury script be swept back to the Cardano treasury?",
    new Date("2026-01-01 00:00:00"),
  );
  const payout_upperbound = await getDate(
    "What should the maximum date for any vendor payout be?",
    new Date("2026-03-01 00:00:00"),
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
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >,
): Promise<VendorConfiguration> {
  if (!registry_token_policy) {
    registry_token_policy = await input({
      message: "Enter the registry token policy ID",
    });
  }
  const vendorExpiration = await getDate(
    "At which date should disputed payouts be swept back to the cardano treasury?",
    new Date("2026-06-01 00:00:00"),
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

export async function deployTransaction<P extends Provider, W extends Wallet>(
  blazeInstance: Blaze<P, W>,
  scripts: Script[],
  register: boolean = false,
): Promise<Transaction> {
  const txBuilder = blazeInstance.newTransaction();
  scripts.forEach((script) => {
    txBuilder.deployScript(script);
  });
  if (register) {
    scripts.forEach((script) => {
      txBuilder.addRegisterStake(
        Core.Credential.fromCore({
          type: Core.CredentialType.ScriptHash,
          hash: script.hash(),
        }),
      );
    });
  }
  return txBuilder.complete();
}

export async function getBlazeInstance(): Promise<Blaze<Provider, Wallet>> {
  const provider = await getProvider();
  const wallet = await getWallet(provider);
  return await Blaze.from(provider, wallet);
}

export async function configToMetaData(
  instance: string,
  treasuryConfig: TreasuryConfiguration,
  vendorConfig: VendorConfiguration,
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >,
  seedUtxo: {
    transaction_id: string;
    output_index: bigint;
  },
): Promise<ITransactionMetadata<INewInstance>> {
  return await getTransactionMetadata(instance, {
    event: ETransactionEvent.PUBLISH,
    expiration: treasuryConfig.expiration,
    payoutUpperbound: treasuryConfig.payout_upperbound,
    vendorExpiration: vendorConfig.expiration,
    label: await maybeInput({
      message: "Human readable label for this instance?",
    }),
    description: await maybeInput({
      message: "Longer human readable description for this treasury instance?",
    }),
    permissions,
    seedUtxo,
  });
}

export function metaDataToConfig(
  metadata: ITransactionMetadata<INewInstance>,
): {
  treasuryConfig: TreasuryConfiguration;
  vendorConfig: VendorConfiguration;
} {
  const treasuryConfig: TreasuryConfiguration = {
    registry_token: metadata.instance,
    permissions: {
      disburse: toMultisig(
        metadata.body.permissions.disburse,
        metadata.body.permissions,
      ),
      fund: toMultisig(
        metadata.body.permissions.fund,
        metadata.body.permissions,
      ),
      reorganize: toMultisig(
        metadata.body.permissions.reorganize,
        metadata.body.permissions,
      ),
      sweep: toMultisig(
        metadata.body.permissions.sweep,
        metadata.body.permissions,
      ),
    },
    expiration: BigInt(metadata.body.expiration),
    payout_upperbound: BigInt(metadata.body.payoutUpperbound),
  };
  const vendorConfig: VendorConfiguration = {
    registry_token: metadata.instance,
    permissions: {
      modify: toMultisig(
        metadata.body.permissions.modify,
        metadata.body.permissions,
      ),
      pause: toMultisig(
        metadata.body.permissions.pause,
        metadata.body.permissions,
      ),
      resume: toMultisig(
        metadata.body.permissions.resume,
        metadata.body.permissions,
      ),
    },
    expiration: BigInt(metadata.body.vendorExpiration),
  };
  return { treasuryConfig, vendorConfig };
}

const fileName = "metadata.json";

export async function readMetadataFromFile(): Promise<
  Map<string, IOnDiskInstance>
> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const data = await fs.readFile(path.resolve(fileName), {
    encoding: "utf-8",
    flag: "a+",
  });

  if (data.trim() === "") {
    console.log("No metadata found, creating a new file.");
    return new Map<string, IOnDiskInstance>();
  }
  const obj = JSON.parse(data);
  const metadata = new Map<string, IOnDiskInstance>();
  let scriptsConstructed = false;
  for (const k of Object.keys(obj)) {
    if (!("scripts" in obj[k])) {
      if (!("metadata" in obj[k])) {
        throw new Error(
          `Invalid metadata format for key ${k}: missing scripts or metadata`,
        );
      }
      // If scripts are not present, we assume the metadata is valid
      obj[k].scripts = await metadataToScripts(
        await getBlazeInstance(),
        obj[k].metadata as ITransactionMetadata<INewInstance>,
      );
      scriptsConstructed = true;
    }
    metadata.set(k, obj[k]);
  }
  if (scriptsConstructed) {
    console.log("Scripts were constructed from metadata.");
    await writeMetadataToFile(metadata);
  }
  return metadata;
}

export function bigIntReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}

export async function writeMetadataToFile(
  metadata: Map<string, IOnDiskInstance>,
): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const obj = Object.create(null);
  for (const [k, v] of metadata) {
    obj[k] = v;
  }
  await fs.writeFile(
    path.resolve(fileName),
    JSON.stringify(obj, bigIntReplacer, 2),
  );
}

export async function metadataToScripts(
  blaze: Blaze<Provider, Wallet>,
  metadata: ITransactionMetadata<INewInstance>,
): Promise<ICompiledScriptsOnDisk> {
  const { treasuryConfig, vendorConfig } = metaDataToConfig(metadata);
  const { scripts } = loadConfigsAndScripts(blaze, {
    configs: {
      treasury: treasuryConfig,
      vendor: vendorConfig,
    },
  });
  return {
    treasuryScript: {
      config: scripts.treasuryScript.config,
      // toCbor will double-wrap, changing the script hash!
      script: scripts.treasuryScript.script.Script.asPlutusV3()!.rawBytes(),
      network: blaze.provider.network,
      scriptRef: scripts.treasuryScript.scriptRef,
    },
    vendorScript: {
      config: scripts.vendorScript.config,
      // toCbor will double-wrap, changing the script hash!
      script: scripts.vendorScript.script.Script.asPlutusV3()!.rawBytes(),
      network: blaze.provider.network,
      scriptRef: scripts.vendorScript.scriptRef,
    },
  };
}

export async function registerMetadata<P extends Provider, W extends Wallet>(
  blaze: Blaze<P, W>,
  identifier: string,
  metadata: ITransactionMetadata<INewInstance>,
): Promise<void> {
  const scripts = await metadataToScripts(blaze, metadata);
  const instance: IOnDiskInstance = {
    scripts,
    metadata,
  };
  const existingMetadata = await readMetadataFromFile();
  existingMetadata.set(identifier, instance);
  await writeMetadataToFile(existingMetadata);
}

export async function getConfigs<P extends Provider, W extends Wallet>(
  blaze: Blaze<P, W>,
): Promise<{
  configs: IConfigs;
  scripts: ICompiledScripts;
  metadata?: ITransactionMetadata<INewInstance>;
}> {
  const choice = await select({
    message: "Select saved configuration or register a new one",
    choices: [
      { name: "Select from existing instances", value: "select" },
      { name: "Register a new instance", value: "register" },
    ],
  });

  switch (choice) {
    case "register": {
      return await registerNewInstance(blaze);
    }
    case "select": {
      const instanceMap = await readMetadataFromFile();

      const instanceChoices = Array.from(instanceMap.entries()).map(
        ([key, value]) => ({
          name: value.metadata?.body.label || key,
          value: key,
        }),
      );
      if (instanceChoices.length === 0) {
        console.log(
          "No saved instances found. Please register a new instance.",
        );
        return await registerNewInstance(blaze);
      }
      const selectedKey = await select({
        message: "Select a saved instance",
        choices: instanceChoices,
      });
      const instance = instanceMap.get(selectedKey);
      if (!instance) {
        throw new Error(`Metadata for ${selectedKey} not found`);
      }
      if (instance.scripts) {
        const scripts = constructScriptsFromBytes(
          instance.scripts.treasuryScript.network,
          instance.scripts.treasuryScript.config,
          instance.scripts.treasuryScript.script,
          instance.scripts.vendorScript.config,
          instance.scripts.vendorScript.script,
          instance.scripts.treasuryScript.scriptRef,
          instance.scripts.vendorScript.scriptRef,
        );
        const { configs } = loadConfigsAndScripts(blaze, {
          scripts,
        });
        return {
          configs,
          scripts,
          metadata: instance.metadata,
        };
      }
      if (instance.metadata) {
        const { treasuryConfig, vendorConfig } = metaDataToConfig(
          instance.metadata,
        );
        const configs = { treasury: treasuryConfig, vendor: vendorConfig };
        const { scripts } = loadConfigsAndScripts(blaze, { configs });
        return {
          configs,
          scripts,
          metadata: instance.metadata,
        };
      }
      throw new Error(
        `Metadata for ${selectedKey} does not contain any scripts or metadata`,
      );
    }
    default:
      throw new Error("Unreachable");
  }
}

async function registerNewInstance<P extends Provider, W extends Wallet>(
  blazeInstance: Blaze<P, W>,
): Promise<{
  configs: IConfigs;
  scripts: ICompiledScripts;
  metadata: ITransactionMetadata<INewInstance>;
}> {
  let utxoChoice;
  if (process.env[WALLET_VAR] !== undefined) {
    console.log(
      `${WALLET_VAR} detected in env, assuming UTxO selection from wallet.`,
    );
    utxoChoice = "select";
  } else {
    utxoChoice = await select({
      message: "How do you want to declare the bootstrap UTxO?",
      choices: [
        { name: "Manual", value: "manual" },
        { name: "Select from wallet", value: "select" },
        { name: "Use a random one", value: "random" },
      ],
    });
  }

  let utxo = undefined;
  switch (utxoChoice) {
    case "manual": {
      utxo = await input({
        message:
          "Enter some transaction output (txId#idx) to spend to ensure the registry NFT is unique ",
        validate: function (value) {
          return (
            /[0-9A-Fa-f]{64}#[0-9]+/.test(value) ||
            "Should be in the format txId#idx"
          );
        },
      });
      break;
    }
    default: {
      const utxos = await blazeInstance.provider.getUnspentOutputs(
        await blazeInstance.wallet.getChangeAddress(),
      );
      if (utxos.length === 0) {
        throw new Error("No UTxOs available in the wallet");
      }
      let selectedUtxo = undefined;
      if (utxoChoice === "select") {
        selectedUtxo = await selectUtxo(utxos);
      } else {
        selectedUtxo = utxos[0];
      }
      utxo = `${selectedUtxo.input().transactionId().toString()}#${selectedUtxo.input().index().toString()}`;
      break;
    }
  }
  const bootstrapUtxo = {
    transaction_id: utxo.split("#")[0],
    output_index: BigInt(utxo.split("#")[1]),
  };
  const oneshotScript = new OneshotOneshotMint(bootstrapUtxo);

  const registry_token = oneshotScript.Script;
  console.log(`Registry token policy ID: ${registry_token.hash()}`);

  console.log(`Now lets configure the permissions`);
  const permissions = await getPermissions();

  const treasuryConfig = await getTreasuryConfig(
    registry_token.hash(),
    permissions,
  );

  const treasuryScript = new TreasuryTreasurySpend(treasuryConfig).Script;
  console.log(`Treasury script policy ID: ${treasuryScript.hash()}`);

  const vendorConfig = await getVendorConfig(
    registry_token.hash(),
    new Date(Number(treasuryConfig.payout_upperbound)),
    permissions,
  );

  const vendorScript = new VendorVendorSpend(vendorConfig).Script;
  console.log(`Vendor script policy ID: ${vendorScript.hash()}`);
  const metadata = await configToMetaData(
    treasuryConfig.registry_token,
    treasuryConfig,
    vendorConfig,
    permissions,
    bootstrapUtxo,
  );
  await registerMetadata(
    blazeInstance,
    treasuryConfig.registry_token,
    metadata,
  );
  const configs = {
    treasury: treasuryConfig,
    vendor: vendorConfig,
  };
  const { scripts } = loadConfigsAndScripts(blazeInstance, {
    configs,
  });
  return {
    configs,
    scripts,
    metadata,
  };
}

export async function getOutputs(): Promise<{
  amounts: bigint[];
  outputs: Record<number, IOutput>;
}> {
  const outputs: Record<number, IOutput> = {};
  const amounts: bigint[] = [];
  let outputIndex = 0;
  while (true) {
    const amount = await input({
      message: `Enter the amount (in lovelace) for output ${outputIndex} (or leave empty to finish):`,
      validate: (value) => {
        if (value === "") return true;
        const num = parseInt(value, 10);
        return num > 0 ? true : `Must be a positive number`;
      },
    });
    if (amount === "") break;

    amounts[outputIndex] = BigInt(amount);

    const output = {
      identifier: await input({
        message: `Enter a unique identifier for output ${outputIndex}:`,
        validate: (value) => {
          return value.trim() !== "" ? true : "Identifier cannot be empty";
        },
      }),
      label: await maybeInput({
        message: `Enter a human readable label for output ${outputIndex} (optional):`,
      }),
    } as IOutput;

    outputs[outputIndex] = output;
    outputIndex++;
  }
  return { amounts, outputs };
}

export async function getTransactionMetadata<MetadataBody>(
  instance: string,
  body: MetadataBody,
): Promise<ITransactionMetadata<MetadataBody>> {
  return {
    "@context":
      "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
    hashAlgorithm: "blake2b-256",
    body: body,
    instance,
    txAuthor: await input({
      message:
        "Enter a hexidecimal pubkey hash, or a bech32 encoded address for the author of this transaction",
      validate: (s) => isAddressOrHex(s, CredentialType.KeyHash),
    }).then((s) => addressOrHexToHash(s, CredentialType.KeyHash)),
    comment: await maybeInput({
      message: "An arbitrary comment you'd like to attach?",
    }),
  };
}

export async function selectUtxo(
  utxos: TransactionUnspentOutput[],
): Promise<TransactionUnspentOutput> {
  if (utxos.length === 0) {
    throw new Error("No UTxOs available to select from");
  }
  const choices = utxos.map((utxo, index) => ({
    name: `${utxo.input().transactionId().toString()}#${utxo.input().index().toString()}: ${utxo.output().amount().coin().toString()}`,
    value: index,
  }));
  const selectedIndex = await select({
    message: "Select a UTxO to use",
    choices,
  });
  return utxos[selectedIndex];
}

export async function selectUtxos(
  utxos: TransactionUnspentOutput[],
): Promise<TransactionUnspentOutput[]> {
  if (utxos.length === 0) {
    throw new Error("No UTxOs available to select from");
  }
  const choices = utxos.map((utxo, index) => ({
    name: `${utxo.input().transactionId().toString()}#${utxo.input().index().toString()}: ${utxo.output().amount().coin().toString()}`,
    value: index,
  }));
  const selectedIndices = await checkbox({
    message: "Select UTxO(s) to use",
    choices,
  });
  return selectedIndices.map((index) => utxos[index]);
}

export function getActualPermission(
  permission: TPermissionMetadata | TPermissionName | null,
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >,
): TPermissionMetadata {
  if (permission === null) {
    throw new Error("This action is disabled");
  }
  if (typeof permission === "string") {
    const actual = permissions[permission];
    if (typeof actual === "string") {
      throw new Error(`No metadata found for permission ${permission}`);
    }
    if (actual === null) {
      throw new Error(`Permission ${permission} is not allowed`);
    }
    return actual;
  }
  return permission;
}
