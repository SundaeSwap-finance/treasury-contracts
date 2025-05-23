use cardano/transaction.{OutputReference, Transaction, find_input}
use logic/vendor/adjudicate
use logic/vendor/malformed
use logic/vendor/modify
use logic/vendor/sweep
use logic/vendor/withdraw
use types.{
  Adjudicate, Malformed, Modify, SweepVendor, VendorConfiguration, VendorDatum,
  VendorSpendRedeemer, Withdraw,
}
use utilities.{ensure_compliant_scripts, find_script_hash_registry}

/// A vendor script, for an ongoing project with an owner
validator vendor(config: VendorConfiguration) {
  spend(
    _: Option<Data>,
    redeemer: VendorSpendRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    expect Some(spent_input) = find_input(self.inputs, utxo)
    let account = spent_input.output.address.payment_credential
    let registry =
      find_script_hash_registry(self.reference_inputs, config.registry_token)
    ensure_compliant_scripts(self.inputs, registry)

    when redeemer is {
      Withdraw -> withdraw.logic(account, self)
      Adjudicate { statuses } ->
        adjudicate.logic(statuses, config, account, self)
      Modify -> modify.logic(config, account, registry, self)
      SweepVendor -> sweep.logic(config, account, registry, self)
      Malformed -> malformed.logic(account, registry, self)
    }

    True
  }

  // No other actions (withdrawing, minting, publishing certificates, voting, etc.) are valid
  else(_) {
    False
  }
}

// Make sure VendorDatum doesn't get tree-shaken
validator documentation {
  spend(_d: Option<VendorDatum>, _r: Data, _o: OutputReference, _s: Transaction) {
    False
  }

  else(_) {
    fail
  }
}
