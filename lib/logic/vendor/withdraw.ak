use aiken/collection/list
use aiken/interval.{is_entirely_after}
use cardano/address.{Credential}
use cardano/assets
use cardano/transaction.{InlineDatum, Transaction}
use sundae/multisig.{satisfied}
use types.{Active, VendorDatum}
use utilities.{equal_plus_min_ada, outputs_of}

// The vendor can withdraw matured payouts
// Specifically, this contract enforces that:
//   - There is only a single vendor input
//   - The transaction is authorized by the vendor
//   - The sum of value leaving the vendor contract is equal to the matured payouts
//   - The unmatured payouts are preserved on the output datum
// Notably, this can be done even after the expiration: once funds mature, they belong to the vendor
pub fn logic(account: Credential, transaction: Transaction) {
  let Transaction {
    inputs,
    outputs,
    validity_range,
    extra_signatories,
    withdrawals,
    ..
  } = transaction

  expect [vendor_input] =
    outputs_of(inputs)
      |> list.filter(fn(input) { input.address.payment_credential == account })

  expect InlineDatum(input_vendor_datum) = vendor_input.datum
  expect input_vendor_datum: VendorDatum = input_vendor_datum

  let expected_payouts =
    input_vendor_datum.payouts
      |> list.filter(
          fn(payout) {
            is_entirely_after(validity_range, payout.maturation) && payout.status == Active
          },
        )
  let matured_value =
    expected_payouts
      |> list.foldl(
          assets.zero,
          fn(payout, sum) {
            assets.merge(sum, assets.from_asset_list(payout.value))
          },
        )

  expect [vendor_output] =
    outputs
      |> list.filter(
          fn(output) { output.address.payment_credential == account },
        )
  expect vendor_output.address.stake_credential == None

  expect InlineDatum(output_vendor_datum) = vendor_output.datum
  expect output_vendor_datum: VendorDatum = output_vendor_datum

  let expected_output_value =
    assets.merge(vendor_input.value, assets.negate(matured_value))

  and {
    satisfied(
      input_vendor_datum.vendor,
      extra_signatories,
      validity_range,
      withdrawals,
    ),
    output_vendor_datum == VendorDatum {
      vendor: input_vendor_datum.vendor,
      payouts: expected_payouts,
    },
    equal_plus_min_ada(expected_output_value, vendor_output.value),
  }
}
