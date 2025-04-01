use aiken/collection/list
use cardano/address.{Credential}
use cardano/transaction.{InlineDatum, Transaction}
use types.{VendorConfiguration, VendorDatum}
use utilities.{
  equal_plus_min_ada, find_script_hash_registry, outputs_of, value_sum,
}

// If the datum is malformed, such as someone sending funds to the vendor contract directly for some reason
// we don't want those to be locked, so we allow them to be swept back to the treasury contract
// Specifically, this logic enforces:
//  - Each validator at the vendor contract has a malformed datum
//  - All value from the vendor contract is paid to the treasury contract
pub fn logic(
  config: VendorConfiguration,
  account: Credential,
  transaction: Transaction,
) {
  let VendorConfiguration { registry_token, .. } = config
  let Transaction { inputs, reference_inputs, outputs, .. } = transaction

  // Find the script hash registry, so we know the treasury script hash
  let registry = find_script_hash_registry(reference_inputs, registry_token)

  // Expect *every* input at the vendor contract to be malformed
  expect
    inputs
      |> list.filter(
          fn(input) { input.output.address.payment_credential == account },
        )
      |> list.all(
          fn(input) {
            when input.output.datum is {
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
  let input_sum = value_sum(outputs_of(inputs), account, True)
  let output_sum = value_sum(outputs, registry.treasury, True)

  equal_plus_min_ada(input_sum, output_sum)
}
