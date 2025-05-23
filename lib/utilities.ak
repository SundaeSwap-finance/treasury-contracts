use aiken/collection/list
use aiken/option
use cardano/address.{Credential, Script, VerificationKey}
use cardano/assets.{PolicyId, Value, lovelace_of, without_lovelace}
use cardano/transaction.{InlineDatum, Input, Output}
use types.{Payout, ScriptHashRegistry, VendorDatum, registry_token_name}

pub fn find_script_hash_registry(
  reference_inputs: List<Input>,
  registry_token: PolicyId,
) -> ScriptHashRegistry {
  expect Some(input) =
    reference_inputs
      |> list.find(
          fn(input) {
            assets.quantity_of(
              input.output.value,
              registry_token,
              registry_token_name(),
            ) > 0
          },
        )
  expect InlineDatum(datum) = input.output.datum
  expect registry: ScriptHashRegistry = datum
  registry
}

pub fn ensure_compliant_scripts(
  inputs: List<Input>,
  registry: ScriptHashRegistry,
) {
  expect
    inputs
      |> list.all(
          fn(input) {
            when input.output.address.payment_credential is {
              VerificationKey(_) -> True
              Script(_) -> or {
                  input.output.address.payment_credential == registry.treasury,
                  input.output.address.payment_credential == registry.vendor,
                }
            }
          },
        )
}

// Get the output of each input
pub fn outputs_of(inputs: List<Input>) -> List<Output> {
  list.map(inputs, fn(input) { input.output })
}

pub fn equal_plus_min_ada(expected: Value, actual: Value) -> Bool {
  and {
    without_lovelace(expected) == without_lovelace(actual),
    lovelace_of(expected) <= lovelace_of(actual),
  }
}

// Sum up all assets on the `outputs` held at `account`
// Note: can also be used to traverse the inputs by mapping over them first
pub fn value_sum(
  outputs: List<Output>,
  account: Credential,
  allow_stake: Bool,
) -> Value {
  outputs
    |> list.filter(fn(output) { output.address.payment_credential == account })
    |> list.map(
        fn(output) {
          expect or {
              allow_stake,
              option.is_none(output.address.stake_credential),
            }
          output.value
        },
      )
    |> list.reduce(assets.zero, assets.merge)
}

pub fn payout_sum(
  outputs: List<Output>,
  vendor: Credential,
  filter: fn(VendorDatum, Payout) -> Bool,
) -> Value {
  outputs
    |> list.filter(fn(output) { output.address.payment_credential == vendor })
    |> list.foldl(
        assets.zero,
        fn(output, total) {
          // The datum must be well formed
          expect InlineDatum(datum) = output.datum
          expect datum: VendorDatum = datum
          let this_payout_sum =
            datum.payouts
              |> list.foldl(
                  assets.zero,
                  fn(payout, acc) {
                    if filter(datum, payout) {
                      assets.merge(acc, assets.from_asset_list(payout.value))
                    } else {
                      acc
                    }
                  },
                )
          expect equal_plus_min_ada(this_payout_sum, output.value)
          assets.merge(total, this_payout_sum)
        },
      )
}
