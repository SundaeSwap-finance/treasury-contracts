import { Core } from "@blaze-cardano/sdk";
import { TreasuryConfiguration, TreasuryTreasuryWithdraw } from "../types/contracts";

export function loadScript(network: Core.NetworkId, config: TreasuryConfiguration) {
  const treasuryScript = new TreasuryTreasuryWithdraw(config);
  const credential = {
    type: Core.CredentialType.ScriptHash,
    hash: treasuryScript.Script.hash(),
  };
  const rewardAccount = Core.RewardAccount.fromCredential(credential, network);
  const scriptAddress = new Core.Address({
    type: Core.AddressType.EnterpriseScript,
    networkId: network,
    paymentPart: credential,
  });
  return {
    treasuryScript,
    credential,
    rewardAccount,
    scriptAddress,
  };
}
