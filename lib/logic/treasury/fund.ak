use aiken/interval.{is_entirely_before}
use cardano/address.{Credential}
use cardano/assets.{Value, merge, negate}
use cardano/transaction.{Transaction}
use sundae/multisig.{satisfied}
use types.{ScriptHashRegistry, TreasuryConfiguration}
use utilities.{equal_plus_min_ada, outputs_of, payout_sum, value_sum}

// Pay out funds to the vendor script, to fund a new project
pub fn logic(
  config: TreasuryConfiguration,
  account: Credential,
  amount: Value,
  registry: ScriptHashRegistry,
  transaction: Transaction,
) {
  let TreasuryConfiguration { expiration, permissions, .. } = config
  let Transaction {
    inputs,
    outputs,
    validity_range,
    extra_signatories,
    withdrawals,
    ..
  } = transaction

  // We need to make sure that the expected amount leaves the control of the treasury script
  // This means summing up the outputs and inputs at each script
  let inputs = outputs_of(inputs)
  let input_sum = value_sum(inputs, account, True)
  let input_vendor_sum = value_sum(inputs, registry.vendor, True)
  let output_sum = value_sum(outputs, account, False)
  let output_vendor_sum = value_sum(outputs, registry.vendor, False)

  // We can't let you spend from the vendor script here, as it might mess with the sum comparisons
  // TODO: is this true? can we get by without it because the way we compare sums would imply it would fail?
  expect input_vendor_sum == assets.zero

  // Sum up all of the payouts on all of the vendor outputs
  // checking that the datums are well formed and no payouts are too far in the future
  let payout_sum =
    payout_sum(
      outputs,
      registry.vendor,
      fn(v, p) {
        // Ensure the vendor also signs the contract
        // This ensures they consent to the work, but also prevents accidentally
        // locking funds with a nonsensical vendor multisig
        expect
          satisfied(v.vendor, extra_signatories, validity_range, withdrawals)
        // Ensure payouts are bounded, so the oversight committee doesn't create
        // a project that lasts 20 years
        expect p.maturation <= config.payout_upperbound
        True
      },
    )

  // TODO: do we need to check that the redeemer used for all other inputs at `account` is Fund?
  // TODO: do we need amount? can we just compare the difference between inputs and outputs against the sum of the payouts?
  // might be helpful if we switch to intent-based signing, which would help us avoid cases when the tx gets invalidated
  expect and {
      (payout_sum == amount)?,
      equal_plus_min_ada(amount, output_vendor_sum)?,
      equal_plus_min_ada(merge(input_sum, negate(amount)), output_sum)?,
      is_entirely_before(validity_range, expiration)?,
      satisfied(
        permissions.fund,
        extra_signatories,
        validity_range,
        withdrawals,
      )?,
    }
}
