use aiken/interval.{is_entirely_before}
use cardano/address.{Credential}
use cardano/assets.{Value, merge, negate}
use cardano/transaction.{Transaction}
use sundae/multisig.{satisfied}
use types.{TreasuryConfiguration}
use utilities.{
  equal_plus_min_ada, find_script_hash_registry, outputs_of, payout_sum,
  value_sum,
}

// Pay out funds to the vendor script, to fund a new project
pub fn logic(
  config: TreasuryConfiguration,
  account: Credential,
  amount: Value,
  transaction: Transaction,
) {
  let TreasuryConfiguration { registry_token, expiration, permissions, .. } =
    config
  let Transaction {
    inputs,
    reference_inputs,
    outputs,
    validity_range,
    extra_signatories,
    withdrawals,
    ..
  } = transaction

  // Find the script hash registry, so we know the vendor script hash
  let registry = find_script_hash_registry(reference_inputs, registry_token)
  // We need to make sure that the expected amount leaves the control of the treasury script
  // This means summing up the outputs and inputs at each script
  let input_sum = value_sum(outputs_of(inputs), account, True)
  let input_vendor_sum = value_sum(outputs_of(inputs), registry.vendor, True)
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
      fn(_, p) {
        expect p.maturation <= config.expiration
        True
      },
    )

  // TODO: do we need to check that the redeemer used for all other inputs at `account` is Fund?
  // TODO: do we need amount? can we just compare the difference between inputs and outputs against the sum of the payouts?
  // might be helpful if we switch to intent-based signing, which would help us avoid cases when the tx gets invalidated
  expect and {
      payout_sum == amount,
      equal_plus_min_ada(amount, output_vendor_sum),
      output_sum == merge(input_sum, negate(amount)),
      is_entirely_before(validity_range, expiration),
      satisfied(
        permissions.fund,
        extra_signatories,
        validity_range,
        withdrawals,
      ),
    }
}
