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
  AllowlistConfig,
  AllowlistVendorAllowlistVendorWithdraw,
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

export interface ICompiledScripts {
  treasuryScript: ICompiledScript<
    TreasuryTreasuryWithdraw,
    TreasuryConfiguration
  >;
  vendorScript: ICompiledScript<VendorVendorSpend, VendorConfiguration>;
}

export function loadConfigsAndScripts<P extends Provider, W extends Wallet>(
  blaze: Blaze<P, W>,
  configsOrScripts: TConfigsOrScripts,
): {
  configs: IConfigs;
  scripts: ICompiledScripts;
} {
  if (configsOrScripts.configs && !configsOrScripts.scripts) {
    /**
     * @TODO This *might* produce mismatching scripts.
     */
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
  return constructScript(network, config, script.Script, scriptRef);
}

export function loadVendorScript(
  network: Core.NetworkId,
  config: VendorConfiguration,
  trace?: boolean,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<VendorVendorSpend, VendorConfiguration> {
  const script = new VendorVendorSpend(config, trace);
  return constructScript(network, config, script.Script, scriptRef);
}

export function loadAllowlistScript(
  network: Core.NetworkId,
  config: AllowlistConfig,
  trace?: boolean,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<AllowlistVendorAllowlistVendorWithdraw, AllowlistConfig> {
  const script = new AllowlistVendorAllowlistVendorWithdraw(config, trace);
  return constructScript(network, config, script.Script, scriptRef);
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
  const treasuryScript = constructScript<
    TreasuryTreasuryWithdraw,
    TreasuryConfiguration
  >(network, treasuryConfig, rawTreasuryScript, treasuryScriptRef);
  const vendorScript = constructScript<VendorVendorSpend, VendorConfiguration>(
    network,
    vendorConfig,
    rawVendorScript,
    vendorScriptRef,
  );
  return { treasuryScript, vendorScript };
}

export function constructScriptFromBytes<T, C>(
  network: Core.NetworkId,
  config: C,
  scriptBytesHex: string,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<T, C> {
  return constructScript(
    network,
    config,
    cborToScript(scriptBytesHex, "PlutusV3"),
    scriptRef,
  );
}

export function constructScript<T, C>(
  network: Core.NetworkId,
  config: C,
  script: Script,
  scriptRef?: TransactionUnspentOutput,
): ICompiledScript<T, C> {
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
    } as T,
    credential,
    scriptAddress,
    rewardAccount,
    scriptRef,
  };
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

export function coreAddressToContractsAddress(address: Address) {
  const props = address.getProps();
  let payment_credential: { VerificationKey: [string] } | { Script: [string] };
  if (props.paymentPart?.type === CredentialType.KeyHash) {
    payment_credential = {
      VerificationKey: [props.paymentPart!.hash],
    };
  } else {
    payment_credential = {
      Script: [props.paymentPart!.hash],
    };
  }
  let stake_credential: {
    Inline: [{ VerificationKey: [string] } | { Script: [string] }];
  };
  if (props.delegationPart?.type === CredentialType.KeyHash) {
    stake_credential = {
      Inline: [
        {
          VerificationKey: [props.delegationPart!.hash],
        },
      ],
    };
  } else {
    stake_credential = {
      Inline: [
        {
          Script: [props.delegationPart!.hash],
        },
      ],
    };
  }
  return {
    payment_credential,
    stake_credential,
  };
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
