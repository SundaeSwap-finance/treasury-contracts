import {
  Address,
  CredentialType,
  NetworkId,
  RewardAccount,
  Script,
  TransactionUnspentOutput,
  Value,
  type CredentialCore,
} from "@blaze-cardano/core";
import {
  Blaze,
  cborToScript,
  Core,
  makeValue,
  Provider,
  Wallet,
} from "@blaze-cardano/sdk";
import { type Cardano } from "@cardano-sdk/core";

import {
  TreasuryConfiguration,
  TreasuryTreasuryWithdraw,
  VendorConfiguration,
  VendorVendorSpend,
} from "../generated-types/contracts.js";

export interface ICompiledScript<T, C> {
  config: C;
  script: T;
  credential: CredentialCore;
  rewardAccount?: RewardAccount;
  scriptAddress: Address;
  scriptRef?: TransactionUnspentOutput;
}

export interface IConfigs {
  treasury: TreasuryConfiguration;
  vendor: VendorConfiguration;
  trace?: boolean;
}

export interface IConfigsWithScripts {
  configs: IConfigs;
  scripts?: ICompiledScripts;
}

export interface IScriptsWithConfigs {
  configs?: IConfigs;
  scripts: ICompiledScripts;
}

export type TConfigsOrScripts = IConfigsWithScripts | IScriptsWithConfigs;

export function loadConfigsAndScripts<P extends Provider, W extends Wallet>(
  blaze: Blaze<P, W>,
  configsOrScripts: TConfigsOrScripts,
): {
  configs: IConfigs;
  scripts: ICompiledScripts;
} {
  if (configsOrScripts.configs && !configsOrScripts.scripts) {
    configsOrScripts.scripts = loadScripts(
      blaze.provider.network,
      configsOrScripts.configs.treasury,
      configsOrScripts.configs.vendor,
      configsOrScripts.configs.trace,
    );
  } else if (configsOrScripts.scripts && !configsOrScripts.configs) {
    configsOrScripts.configs = {
      treasury: configsOrScripts.scripts.treasuryScript.config,
      vendor: configsOrScripts.scripts.vendorScript.config,
    };
  }
  if (!configsOrScripts.configs || !configsOrScripts.scripts) {
    throw new Error("Couldn't load scripts");
  }

  return {
    configs: configsOrScripts.configs,
    scripts: configsOrScripts.scripts,
  };
}

export function loadTreasuryScript(
  network: Core.NetworkId,
  config: TreasuryConfiguration,
  trace?: boolean,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<TreasuryTreasuryWithdraw, TreasuryConfiguration> {
  const script = new TreasuryTreasuryWithdraw(config, trace);
  return constructTreasuryScript(network, config, script.Script, scriptRef);
}

export function constructTreasuryScriptFromBytes(
  network: Core.NetworkId,
  config: TreasuryConfiguration,
  scriptBytesHex: string,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<TreasuryTreasuryWithdraw, TreasuryConfiguration> {
  return constructTreasuryScript(
    network,
    config,
    cborToScript(scriptBytesHex, "PlutusV3"),
    scriptRef,
  );
}

export function constructTreasuryScript(
  network: Core.NetworkId,
  config: TreasuryConfiguration,
  script: Script,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<TreasuryTreasuryWithdraw, TreasuryConfiguration> {
  const credential: Cardano.Credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.hash(),
  };
  const rewardAccount = Core.RewardAccount.fromCredential(credential, network);
  const scriptAddress = new Core.Address({
    type: Core.AddressType.BasePaymentScriptStakeScript,
    networkId: network,
    paymentPart: credential,
    delegationPart: credential,
  });
  if (scriptRef && scriptRef?.output()?.scriptRef()?.hash() !== script.hash()) {
    throw new Error("Script ref points to the wrong script!");
  }
  return {
    config,
    script: {
      Script: script,
    },
    credential,
    rewardAccount,
    scriptAddress,
    scriptRef,
  };
}

export function loadVendorScript(
  network: Core.NetworkId,
  config: VendorConfiguration,
  trace?: boolean,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<VendorVendorSpend, VendorConfiguration> {
  const script = new VendorVendorSpend(config, trace);
  return constructVendorScript(network, config, script.Script, scriptRef);
}

export function constructVendorScriptFromBytes(
  network: Core.NetworkId,
  config: VendorConfiguration,
  scriptBytesHex: string,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<VendorVendorSpend, VendorConfiguration> {
  return constructVendorScript(
    network,
    config,
    cborToScript(scriptBytesHex, "PlutusV3"),
    scriptRef,
  );
}

export function constructVendorScript(
  network: Core.NetworkId,
  config: VendorConfiguration,
  script: Script,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<VendorVendorSpend, VendorConfiguration> {
  const credential: Cardano.Credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.hash(),
  };
  const scriptAddress = new Core.Address({
    type: Core.AddressType.BasePaymentScriptStakeScript,
    networkId: network,
    paymentPart: credential,
    delegationPart: credential,
  });
  if (scriptRef && scriptRef?.output()?.scriptRef()?.hash() !== script.hash()) {
    throw new Error("Script ref points to the wrong script!");
  }
  return {
    config,
    script: {
      Script: script,
    },
    credential,
    scriptAddress,
    scriptRef,
  };
}

export interface ICompiledScripts {
  treasuryScript: ICompiledScript<
    TreasuryTreasuryWithdraw,
    TreasuryConfiguration
  >;
  vendorScript: ICompiledScript<VendorVendorSpend, VendorConfiguration>;
}

export function loadScripts(
  network: Core.NetworkId,
  treasuryConfig: TreasuryConfiguration,
  vendorConfig: VendorConfiguration,
  trace?: boolean,
  treasuryScriptRef?: TransactionUnspentOutput,
  vendorScriptRef?: TransactionUnspentOutput,
): ICompiledScripts {
  const treasuryScript = loadTreasuryScript(
    network,
    treasuryConfig,
    trace,
    treasuryScriptRef,
  );
  const vendorScript = loadVendorScript(
    network,
    vendorConfig,
    trace,
    vendorScriptRef,
  );
  return {
    treasuryScript,
    vendorScript,
  };
}

export function constructScriptsFromBytes(
  network: Core.NetworkId,
  treasuryConfig: TreasuryConfiguration,
  rawTreasuryScriptHex: string,
  vendorConfig: VendorConfiguration,
  rawVendorScriptHex: string,
  treasuryScriptRef?: TransactionUnspentOutput,
  vendorScriptRef?: TransactionUnspentOutput,
): ICompiledScripts {
  return constructScripts(
    network,
    treasuryConfig,
    cborToScript(rawTreasuryScriptHex, "PlutusV3"),
    vendorConfig,
    cborToScript(rawVendorScriptHex, "PlutusV3"),
    treasuryScriptRef,
    vendorScriptRef,
  );
}

export function constructScripts(
  network: Core.NetworkId,
  treasuryConfig: TreasuryConfiguration,
  rawTreasuryScript: Script,
  vendorConfig: VendorConfiguration,
  rawVendorScript: Script,
  treasuryScriptRef?: TransactionUnspentOutput,
  vendorScriptRef?: TransactionUnspentOutput,
): ICompiledScripts {
  const treasuryScript = constructTreasuryScript(
    network,
    treasuryConfig,
    rawTreasuryScript,
    treasuryScriptRef,
  );
  const vendorScript = constructVendorScript(
    network,
    vendorConfig,
    rawVendorScript,
    vendorScriptRef,
  );
  return { treasuryScript, vendorScript };
}

export function coreValueToContractsValue(amount: Value): {
  [policyId: string]: { [assetName: string]: bigint };
} {
  const ret: { [policyId: string]: { [assetName: string]: bigint } } = {};
  if (amount.coin() !== 0n) {
    ret[""] = {};
    ret[""][""] = amount.coin();
  }
  for (const [assetId, amt] of amount.multiasset() ?? []) {
    if (amt !== 0n) {
      const policyId = assetId.slice(0, 56);
      const assetName = assetId.slice(56);
      ret[policyId] ??= {};
      ret[policyId][assetName] = amt;
    }
  }
  return ret;
}

export function contractsValueToCoreValue(amount: {
  [policyId: string]: { [assetName: string]: bigint };
}): Value {
  const values: [string, bigint][] = [];
  for (const [policy, assets] of Object.entries(amount)) {
    if (policy === "") {
      continue;
    }
    for (const [assetName, amount] of Object.entries(assets)) {
      values.push([policy + assetName, amount]);
    }
  }

  return makeValue((amount[""] ?? {})[""] ?? 0n, ...values);
}

export function rewardAccountFromScript(
  script: Script,
  network: NetworkId,
): RewardAccount {
  const credential: Cardano.Credential = {
    type: CredentialType.ScriptHash,
    hash: script.hash(),
  };
  return RewardAccount.fromCredential(credential, network);
}
