use cardano/address.{Credential}
use cardano/assets.{from_asset_list}
use cardano/transaction.{Input,
  Output, OutputReference, Transaction, find_input}
use logic/treasury/disburse
use logic/treasury/fund
use logic/treasury/reorganize
use logic/treasury/sweep
use logic/treasury/withdraw
use types.{
  Disburse, Fund, Reorganize, SweepTreasury, TreasuryConfiguration,
  TreasurySpendRedeemer,
}
use utilities.{ensure_compliant_scripts, find_script_hash_registry}

/// A treasury script to hold funds withdrawn from the Cardano treasury
validator treasury(config: TreasuryConfiguration) {
  // Funds can be spent to:
  //  - Sweep them back to the treasury
  //  - Set up a new vendor project
  //  - Disburse funds for arbitrary spending
  //  - Reorganize the treasury UTxOs
  spend(
    _d,
    redeemer: TreasurySpendRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    expect Some(spent_input) = find_input(self.inputs, utxo)
    let account = spent_input.output.address.payment_credential
    let registry =
      find_script_hash_registry(self.reference_inputs, config.registry_token)
    ensure_compliant_scripts(self.inputs, registry)

    when redeemer is {
      // Funds can be swept back to the treasury after the expiration
      SweepTreasury { .. } -> sweep.logic(config, account, self)
      // UTxOs at the treasury address can be reorganized, such as splitting or merging them
      Reorganize { .. } -> reorganize.logic(config, account, self)
      // Funds can be used to fund a new vendor project
      Fund { amount } ->
        fund.logic(config, account, from_asset_list(amount), registry, self)
      // Funds can be disbursed to arbitrary destinations
      Disburse { amount } ->
        disburse.logic(config, account, from_asset_list(amount), self)
    }

    True
  }

  // Funds can be withdrawn only if they are paid to the spending portion of this script
  // without a staking address; this is how the funds are moved out of the reward account
  // after a treasury withdrawal
  withdraw(_, account: Credential, self: Transaction) {
    let registry =
      find_script_hash_registry(self.reference_inputs, config.registry_token)
    withdraw.logic(self.withdrawals, account, registry, self)
  }

  // (n.b. We could just use `else` for these, but it's clearer to make things explicit)

  // The funds received by the treasury are not allowed to vote in governance
  vote(_r, _v, _t) {
    False
  }

  // The funds received by the treasury are not allowed to publish any certificates
  // In particular, this prevents the stake script from delegating to a stake pool,
  // registering a stake pool, registering as a DRep, or delegating to a DRep.
  publish(_r, _c, _t) {
    False
  }

  else(_) {
    False
  }
}
