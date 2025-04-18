import { Core } from "@blaze-cardano/sdk";
import {
  TreasuryConfiguration,
  TreasuryTreasuryWithdraw,
  VendorConfiguration,
  VendorVendorSpend,
} from "../types/contracts";
import { Slot, Value } from "@blaze-cardano/core";

export function loadTreasuryScript(
  network: Core.NetworkId,
  config: TreasuryConfiguration,
) {
  const script = new TreasuryTreasuryWithdraw(config);
  const credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.Script.hash(),
  };
  const rewardAccount = Core.RewardAccount.fromCredential(credential, network);
  const scriptAddress = new Core.Address({
    type: Core.AddressType.EnterpriseScript,
    networkId: network,
    paymentPart: credential,
  });
  return {
    script,
    credential,
    rewardAccount,
    scriptAddress,
  };
}

export function loadVendorScript(
  network: Core.NetworkId,
  config: VendorConfiguration,
) {
  const script = new VendorVendorSpend(config);
  const credential = {
    type: Core.CredentialType.ScriptHash,
    hash: script.Script.hash(),
  };
  const scriptAddress = new Core.Address({
    type: Core.AddressType.EnterpriseScript,
    networkId: network,
    paymentPart: credential,
  });
  return {
    script,
    credential,
    scriptAddress,
  };
}

export function loadScripts(
  network: Core.NetworkId,
  treasuryConfig: TreasuryConfiguration,
  vendorConfig: VendorConfiguration,
) {
  const treasuryScript = loadTreasuryScript(network, treasuryConfig);
  const vendorScript = loadVendorScript(network, vendorConfig);
  return {
    treasuryScript,
    vendorScript,
  };
}

export function unix_to_slot(unix: bigint): Slot {
  return Slot(Number(unix / 1000n));
}

export function slot_to_unix(slot: Slot): bigint {
  return BigInt(slot) * 1000n;
}

export function coreValueToContractsValue(amount: Value): {
  [policyId: string]: { [assetName: string]: bigint };
} {
  const ret: { [policyId: string]: { [assetName: string]: bigint } } = {};
  if (amount.coin() != 0n) {
    ret[""] = {};
    ret[""][""] = amount.coin();
  }
  for (const [assetId, amt] of amount.multiasset() ?? []) {
    if (amt != 0n) {
      const policyId = assetId.slice(0, 56);
      const assetName = assetId.slice(56);
      ret[policyId] ??= {};
      ret[policyId][assetName] = amt;
    }
  }
  return ret;
}
