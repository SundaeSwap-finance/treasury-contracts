use aiken/collection/list
use aiken/interval.{is_entirely_after}
use aiken/option
use cardano/address.{Credential}
use cardano/assets
use cardano/transaction.{InlineDatum, Transaction}
use types.{Active, ScriptHashRegistry, VendorConfiguration, VendorDatum}
use utilities.{equal_plus_min_ada, outputs_of, select_by_address, value_sum}

// After the expiration, all paused, unmatured funds can be swept back to the treasury contract
// (and thus back to the cardano treasury).
// Specifically, this enforces that:
//  - The tx is entirely after the expiration window
//  - There is exactly one vendor input with a well-formed datum
//  - Any un-matured, paused payouts are sent to the treasury
//  - Any matured or active payouts are retained at the vendor contract with a filtered datum
pub fn logic(
  config: VendorConfiguration,
  account: Credential,
  registry: ScriptHashRegistry,
  transaction: Transaction,
) {
  let Transaction { inputs, outputs, validity_range, .. } = transaction

  // Can only sweep after the global expiration
  expect is_entirely_after(validity_range, config.expiration)

  let inputs = outputs_of(inputs)
  expect
    option.is_none(
      inputs
        |> list.find(
            fn(input) { input.address.payment_credential == registry.treasury },
          ),
    )

  // We choose to only handle sweeping one UTxO at a time,
  // to simplify the contract logic
  expect [input] =
    inputs
      |> list.filter(fn(input) { input.address.payment_credential == account })
  expect InlineDatum(datum) = input.datum
  expect datum: VendorDatum = datum

  // Sum up the matured / unsweepable payouts, and build a list of what we expect to see on the output
  // We do this rather than summing up the sweepable payouts so we can deal with minUTxO surplus easily
  let expected_payouts =
    datum.payouts
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

  let vendor_outputs =
    outputs
      |> list.filter(
          fn(output) { output.address.payment_credential == account },
        )

  let treasury_output_sum =
    value_sum(outputs, select_by_address(registry.treasury))

  let swept_value = assets.merge(input.value, assets.negate(matured_value))
  expect equal_plus_min_ada(swept_value, treasury_output_sum)
  expect
    when expected_payouts is {
      [] -> vendor_outputs == []
      _ -> {
        expect [vendor_output] = vendor_outputs
        expect option.is_none(vendor_output.address.stake_credential)
        expect InlineDatum(out_datum) = vendor_output.datum
        expect out_datum: VendorDatum = out_datum
        and {
          equal_plus_min_ada(matured_value, vendor_output.value)?,
          (out_datum == VendorDatum {
            vendor: datum.vendor,
            payouts: expected_payouts,
          })?,
        }
      }
    }
}
