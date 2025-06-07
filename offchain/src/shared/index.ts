import { Core, makeValue } from "@blaze-cardano/sdk";
import { type Cardano } from "@cardano-sdk/core";

import {
  Address,
  RewardAccount,
  Slot,
  SLOT_CONFIG_NETWORK,
  SlotConfig,
  Value,
  type CredentialCore,
} from "@blaze-cardano/core";
import {
  TreasuryConfiguration,
  TreasuryTreasuryWithdraw,
  VendorConfiguration,
  VendorVendorSpend,
} from "../types/contracts";

export interface ICompiledScript<T, C> {
  config: C;
  script: T;
  credential: CredentialCore;
  rewardAccount?: RewardAccount;
  scriptAddress: Address;
}

export function loadTreasuryScript(
  network: Core.NetworkId,
  config: TreasuryConfiguration,
): ICompiledScript<TreasuryTreasuryWithdraw, TreasuryConfiguration> {
  const script = new TreasuryTreasuryWithdraw(config);
  const credential: Cardano.Credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.Script.hash(),
  };
  const rewardAccount = Core.RewardAccount.fromCredential(credential, network);
  const scriptAddress = new Core.Address({
    type: Core.AddressType.BasePaymentScriptStakeScript,
    networkId: network,
    paymentPart: credential,
    delegationPart: credential,
  });
  return {
    config,
    script,
    credential,
    rewardAccount,
    scriptAddress,
  };
}

export function loadVendorScript(
  network: Core.NetworkId,
  config: VendorConfiguration,
): ICompiledScript<VendorVendorSpend, VendorConfiguration> {
  const script = new VendorVendorSpend(config);
  const credential: Cardano.Credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.Script.hash(),
  };
  const scriptAddress = new Core.Address({
    type: Core.AddressType.BasePaymentScriptStakeScript,
    networkId: network,
    paymentPart: credential,
    delegationPart: credential,
  });
  return {
    config,
    script,
    credential,
    scriptAddress,
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
): ICompiledScripts {
  const treasuryScript = loadTreasuryScript(network, treasuryConfig);
  const vendorScript = loadVendorScript(network, vendorConfig);
  return {
    treasuryScript,
    vendorScript,
  };
}

function getSlotConfig(network: Core.NetworkId): SlotConfig {
  switch (network) {
    case Core.NetworkId.Mainnet:
      return SLOT_CONFIG_NETWORK.Mainnet;
    case Core.NetworkId.Testnet:
      return SLOT_CONFIG_NETWORK.Preview;
    default:
      throw new Error("Network not supported for slot conversion");
  }
}

export function unix_to_slot(network: Core.NetworkId, unix: number): Slot {
  const slotConfig = getSlotConfig(network);

  return Slot(
    (unix - slotConfig.zeroTime) / slotConfig.slotLength + slotConfig.zeroSlot,
  );
}

export function slot_to_unix(network: Core.NetworkId, slot: Slot): number {
  const slotConfig = getSlotConfig(network);

  return (
    slotConfig.zeroTime +
    (slot.valueOf() - slotConfig.zeroSlot) * slotConfig.slotLength
  );
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
