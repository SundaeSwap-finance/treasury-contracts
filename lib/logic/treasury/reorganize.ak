use aiken/interval.{is_entirely_before}
use cardano/address.{Credential}
use cardano/transaction.{Transaction}
use sundae/multisig.{satisfied}
use types.{TreasuryConfiguration}
use utilities.{
  equal_plus_min_ada, outputs_of, select_by_address,
  select_by_payment_credential, value_sum,
}

// Before the expiration, the oversight committee can reorganize the treasury UTxOs, so long as no value escapes
pub fn logic(
  config: TreasuryConfiguration,
  account: Credential,
  transaction: Transaction,
) {
  let Transaction {
    inputs,
    outputs,
    validity_range,
    extra_signatories,
    withdrawals,
    ..
  } = transaction

  // The funds coming in should exactly match the funds going out
  // We allow a staking credential on the inputs, just in case someone attached one
  // but prevent them on the outputs
  let input_sum =
    value_sum(outputs_of(inputs), select_by_payment_credential(account))
  let output_sum = value_sum(outputs, select_by_address(account))

  // TODO: do we need to check that the redeemer used for all other inputs at `account` is reogranize?
  expect and {
      // All native assets must remain at the contract unchanged
      equal_plus_min_ada(input_sum, output_sum)?,
      is_entirely_before(validity_range, config.expiration)?,
      satisfied(
        config.permissions.reorganize,
        extra_signatories,
        validity_range,
        withdrawals,
      )?,
    }
}
