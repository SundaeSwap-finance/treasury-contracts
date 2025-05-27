use aiken/collection/list
use cardano/address.{Credential, Referenced, Script, VerificationKey}
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

// Select all outputs with a matching payment credential. Allowing stake credential to be whatever.
pub fn select_by_payment_credential(account: Credential) -> fn(Output) -> Bool {
  fn(output: Output) { output.address.payment_credential == account }
}

// Select all outputs with a matching payment credential, but requires no stake credential whatsoever.
pub fn select_by_payment_credential_strict(
  account: Credential,
) -> fn(Output) -> Bool {
  fn(output: Output) {
    let target = output.address
    if target.payment_credential == account {
      expect None = target.stake_credential
      True
    } else {
      False
    }
  }
}

// Select all outputs with a matching payment credential AND stake credential.
pub fn select_by_address(account: Credential) -> fn(Output) -> Bool {
  fn(output: Output) {
    let target = output.address
    if target.payment_credential == account {
      // We cannot simply forward the source delegation credential because we might
      // be re-organizing ill-formed UTxO; so we cannot ensure that the source UTxO
      // was defined with the proper stake credential. Yet, we can certainly enforce
      // that the output's delegation credential matches the script.
      expect target.stake_credential == Some(Referenced.Inline(account))
      True
    } else {
      False
    }
  }
}

// Sum up all assets on the `outputs` held at `account` using a selection function.
// The selection function may crash the program if it meets unnacceptable conditions.
// Note: can also be used to traverse the inputs by mapping over them first
pub fn value_sum(outputs: List<Output>, select: fn(Output) -> Bool) -> Value {
  outputs
    |> list.reduce(
        assets.zero,
        fn(total, output) {
          if select(output) {
            assets.merge(total, output.value)
          } else {
            total
          }
        },
      )
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
