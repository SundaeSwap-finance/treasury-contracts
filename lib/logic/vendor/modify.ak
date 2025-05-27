use aiken/collection/list
use aiken/interval.{is_entirely_after, is_entirely_before}
use aiken/option
use cardano/address.{Credential}
use cardano/assets
use cardano/transaction.{InlineDatum, Transaction}
use sundae/multisig.{satisfied}
use types.{Active, ScriptHashRegistry, VendorConfiguration, VendorDatum}
use utilities.{
  equal_plus_min_ada, outputs_of, select_by_address,
  select_by_payment_credential_strict, value_sum,
}

// The vendor and the oversight committee can agree to modify or cancel a project
// Specifically, this logic ensures:
//  - Both the vendor and the oversight authorize the transaction
//  - There is a single vendor input, and no treasury inputs
//  - All unmatured funds from the vendor script are split between the treasury and a new vendor script
pub fn logic(
  config: VendorConfiguration,
  account: Credential,
  registry: ScriptHashRegistry,
  transaction: Transaction,
) {
  let VendorConfiguration { permissions, .. } = config
  let Transaction {
    inputs,
    outputs,
    extra_signatories,
    validity_range,
    withdrawals,
    ..
  } = transaction

  // Can only modify before the contract expiration
  expect is_entirely_before(validity_range, config.expiration)

  let inputs = outputs_of(inputs)

  // Make sure we're not spending a treasury input
  expect
    inputs
      |> list.find(
          fn(input) { input.address.payment_credential == registry.treasury },
        )
      |> option.is_none()

  // We choose to only handle modifying one vendor contract at a time,
  // to simplify the contract logic
  expect [input] =
    inputs
      |> list.filter(fn(input) { input.address.payment_credential == account })
  expect InlineDatum(input_vendor_datum) = input.datum
  expect input_vendor_datum: VendorDatum = input_vendor_datum

  // Sum up the matured / unsweepable payouts
  // We do this rather than summing up the unmatured payouts so we can deal with minUTxO surplus more easily
  let matured_value =
    input_vendor_datum.payouts
      |> list.filter(
          fn(payout) {
            is_entirely_after(validity_range, payout.maturation) && payout.status == Active
          },
        )
      |> list.foldl(
          assets.zero,
          fn(payout, sum) {
            assets.merge(sum, assets.from_asset_list(payout.value))
          },
        )

  let vendor_output_sum =
    // TODO: Are vendors really not allowed to have stake credentials? What is
    // the motivation here?
    value_sum(outputs, select_by_payment_credential_strict(account))

  let treasury_output_sum =
    value_sum(outputs, select_by_address(registry.treasury))

  let unmatured_value = assets.merge(input.value, assets.negate(matured_value))
  expect and {
      equal_plus_min_ada(
        unmatured_value,
        assets.merge(vendor_output_sum, treasury_output_sum),
      )?,
      satisfied(
        input_vendor_datum.vendor,
        extra_signatories,
        validity_range,
        withdrawals,
      )?,
      satisfied(
        permissions.modify,
        extra_signatories,
        validity_range,
        withdrawals,
      )?,
    }
}
