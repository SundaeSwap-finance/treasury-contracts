use cardano/address.{Credential}
use cardano/assets.{AssetName, PolicyId}
use sundae/multisig.{MultisigScript}

/// We store the script hashes at a specific datum at an always fails script
/// so we can "tie the knot" and resolve circular references
pub type ScriptHashRegistry {
  treasury: Credential,
  vendor: Credential,
}

pub fn registry_token_name() -> AssetName {
  "REGISTRY"
}

/// The different permission thresholds for the treasury
pub type TreasuryPermissions {
  // The permissions required to reorganize the UTxOs in the wallet
  reorganize: MultisigScript,
  // The condition under which the funds can be swept back early
  sweep: MultisigScript,
  // The condition under which the funds can be paid out to the vendor contract
  // This may, for example, be a lower threshold than disbursement
  fund: MultisigScript,
  // The condition under which the funds can be paid out to an arbitrary destination
  // This may, for example, be stricter than paying to the vendor contract
  disburse: MultisigScript,
  // The permission to unregister a staking credential, mainly to cleanup the
  // chain once the treasury is no longer of use.
  unregister: MultisigScript,
}

/// Treasury script configuration
pub type TreasuryConfiguration {
  // The token used to authenticate the script hash registry
  registry_token: PolicyId,
  // The permissions required for different options
  permissions: TreasuryPermissions,
  // The time after which the funds can be swept back to the treasury
  expiration: Int,
}

pub type VendorPermissions {
  // The permissions required to pause the vendor script
  pause: MultisigScript,
  // The permissions required to resume the vendor script
  resume: MultisigScript,
  // The permissions required for the oversight committee to approve a modification
  // NOTE: the vendor must also approve the modification
  modify: MultisigScript,
}

pub type VendorConfiguration {
  // The token used to authenticate the script hash registry
  registry_token: PolicyId,
  // The permissions required for different actions
  permissions: VendorPermissions,
  // The time after which unmatured funds can be swept back to the treasury
  expiration: Int,
}

pub type TreasurySpendRedeemer {
  // Reorganize funds controlled by the script
  Reorganize
  // Sweep funds back to the treasury
  SweepTreasury
  // Pay out funds to the vendor script to fund a new project
  Fund { amount: Pairs<PolicyId, Pairs<AssetName, Int>> }
  // Pay out funds to an arbitrary destination
  Disburse { amount: Pairs<PolicyId, Pairs<AssetName, Int>> }
}

pub type VendorSpendRedeemer {
  Withdraw
  Adjudicate { statuses: List<PayoutStatus> }
  Modify
  SweepVendor
  Malformed
}

pub type PayoutStatus {
  Active
  Paused
}

pub type Payout {
  maturation: Int,
  value: Pairs<PolicyId, Pairs<AssetName, Int>>,
  status: PayoutStatus,
}

pub type VendorDatum {
  vendor: MultisigScript,
  payouts: List<Payout>,
}
