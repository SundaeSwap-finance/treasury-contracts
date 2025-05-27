use aiken/interval.{is_entirely_before}
use cardano/address.{Credential}
use cardano/assets.{Value, lovelace_of, merge, negate}
use cardano/transaction.{Transaction}
use sundae/multisig.{satisfied}
use types.{TreasuryConfiguration}
use utilities.{
  equal_plus_min_ada, outputs_of, select_by_address,
  select_by_payment_credential, value_sum,
}

// To support conversion to and from stablecoins, or fiat payments,
// the oversight committee can disburse an arbitrary amount of funds
// to an arbitrary address with an arbitrary datum.
// If it's past the expiration, only native assets can be disbursed.
// If required, we could impose additional restrictions on this, such as
// an allow-list of addresses, etc.
pub fn logic(
  config: TreasuryConfiguration,
  account: Credential,
  amount: Value,
  transaction: Transaction,
) {
  let TreasuryConfiguration { expiration, permissions, .. } = config
  let Transaction { inputs, outputs, validity_range, withdrawals, .. } =
    transaction
  let input_sum =
    value_sum(outputs_of(inputs), select_by_payment_credential(account))
  let output_sum = value_sum(outputs, select_by_address(account))
  expect and {
      equal_plus_min_ada(merge(input_sum, negate(amount)), output_sum)?,
      // If we're before the expiration, we can pay out lovelace this way
      // After the expiration, we can *only* send native assets out, presumably to be converted back to ADA
      // This is to prevent USDM, for example, getting permanently locked, but also prevent the oversight committee
      // from sending out ADA that belongs the treasury
      // In practice, this is still a fairly big trust assumption, because the value of USDM could be large,
      // but without a very efficient stablecoin -> ADA conversion we can enforce at the contract level / more time to build one
      // this is the best compromise we can make for now
      or {
        (lovelace_of(amount) == 0)?,
        is_entirely_before(validity_range, expiration)?,
      }?,
      satisfied(
        permissions.disburse,
        transaction.extra_signatories,
        validity_range,
        withdrawals,
      )?,
    }
}
