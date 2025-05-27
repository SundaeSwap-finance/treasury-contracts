use aiken/collection/list
use aiken/option
use cardano/address.{Credential}
use cardano/transaction.{InlineDatum, Transaction}
use types.{ScriptHashRegistry, VendorDatum}
use utilities.{
  equal_plus_min_ada, outputs_of, select_by_address,
  select_by_payment_credential, value_sum,
}

// If the datum is malformed, such as someone sending funds to the vendor contract directly for some reason
// we don't want those to be locked, so we allow them to be swept back to the treasury contract
// Specifically, this logic enforces:
//  - Each validator at the vendor contract has a malformed datum
//  - All value from the vendor contract is paid to the treasury contract
pub fn logic(
  account: Credential,
  registry: ScriptHashRegistry,
  transaction: Transaction,
) {
  let Transaction { inputs, outputs, .. } = transaction

  let inputs = outputs_of(inputs)

  // To prevent double satisfaction, make sure there are no treasury inputs
  expect
    option.is_none(
      inputs
        |> list.find(
            fn(input) { input.address.payment_credential == registry.treasury },
          ),
    )

  // Expect *every* input at the vendor contract to be malformed
  expect
    inputs
      |> list.filter(fn(input) { input.address.payment_credential == account })
      |> list.all(
          fn(input) {
            when input.datum is {
              InlineDatum(datum) ->
                if datum is VendorDatum {
                  False
                } else {
                  True
                }
              _ -> True
            }
          },
        )

  // Note: we don't need to assert the datums of the outputs,
  // because the treasury contract doesn't use a datum at all!
  let input_sum = value_sum(inputs, select_by_payment_credential(account))

  let output_sum = value_sum(outputs, select_by_address(registry.treasury))

  expect equal_plus_min_ada(input_sum, output_sum)
}
