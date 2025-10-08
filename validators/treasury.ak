use aiken/interval.{is_entirely_after}
use cardano/address.{Credential}
use cardano/assets.{from_asset_list}
use cardano/certificate.{
  AlwaysAbstain, Certificate, DelegateCredential, DelegateVote,
  RegisterAndDelegateCredential, RegisterCredential, UnregisterCredential,
}
use cardano/transaction.{
  Input, Output, OutputReference, Transaction, find_input,
}
use logic/treasury/disburse
use logic/treasury/fund
use logic/treasury/reorganize
use logic/treasury/sweep
use logic/treasury/withdraw
use types.{
  Disburse, Fund, Reorganize, SweepTreasury, TreasuryConfiguration,
  TreasurySpendRedeemer,
}
use utilities.{
  ensure_compliant_scripts, ensure_no_ref_scripts, find_script_hash_registry,
}

/// A treasury script to hold funds withdrawn from the Cardano treasury
validator treasury(config: TreasuryConfiguration) {
  // Funds can be spent to:
  //  - Sweep them back to the treasury
  //  - Set up a new vendor project
  //  - Disburse funds for arbitrary spending
  //  - Reorganize the treasury UTxOs
  spend(
    // The datum is always ignored
    _d,
    redeemer: TreasurySpendRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    // Find our own input / script address
    expect Some(spent_input) = find_input(self.inputs, utxo)
    let account = spent_input.output.address.payment_credential

    // Find the script hash registry; This is a datum + NFT, locked at an always-fail script
    // that solves a circular reference. The treasury script needs to know about the vendor script hash
    // and the vendor script needs to know about the treasury script hash
    let registry =
      find_script_hash_registry(self.reference_inputs, config.registry_token)

    // We should *only* have inputs from the vendor and treasury, to prevent double satisfaction issues
    ensure_compliant_scripts(self.inputs, registry)
    // We should also disallow reference scripts on the outputs, to prevent escalating the fees
    ensure_no_ref_scripts(self.outputs)

    when redeemer is {
      // Funds can be swept back to the treasury after the expiration
      SweepTreasury { .. } -> sweep.logic(config, account, registry, self)
      // UTxOs at the treasury address can be reorganized, such as splitting or merging them
      Reorganize { .. } -> reorganize.logic(config, account, registry, self)
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
  // without our own script hash as the staking credential; this is how the funds are moved
  // out of the reward account after a treasury withdrawal
  withdraw(_, account: Credential, self: Transaction) {
    // Make sure the person withdrawing doesn't attach a script reference, which could slightly increase the fees
    ensure_no_ref_scripts(self.outputs)
    let registry =
      find_script_hash_registry(self.reference_inputs, config.registry_token)
    withdraw.logic(self.withdrawals, account, registry, self)
  }

  // The funds received by the treasury must not be used to register or delegate to a stake pool,
  // or be used to participate in governance; in particular, must be delegated to the always abstain DRep
  // to ensure large treasury withdrawals don't deadlock governance
  publish(_redeemer: Data, certificate: Certificate, self: Transaction) {
    // Article IV - Section 5 of the constitution requires that funds:
    //
    // - SHALL NOT be delegated to an SPO
    // - MUST be delegated to an auto-abstain DRep
    //
    when certificate is {
      // We allow the script to be de-registered after the expiration, to recover the deposit and clean
      // up the ledger state
      UnregisterCredential { .. } ->
        is_entirely_after(self.validity_range, config.expiration)
      // Anyone can register the script
      RegisterCredential { .. } -> True
      DelegateCredential { delegate, .. } |
      RegisterAndDelegateCredential { delegate, .. } ->
        delegate == DelegateVote(AlwaysAbstain)
      _ -> False
    }
  }

  // The funds received by the treasury are not allowed to vote in governance
  vote(_r, _v, _t) {
    False
  }

  // Any other behavior (minting, etc) automatically fails
  else(_) {
    False
  }
}
