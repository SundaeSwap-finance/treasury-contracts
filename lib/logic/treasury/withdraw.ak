use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Credential}
use cardano/assets.{Lovelace, lovelace_of}
use cardano/transaction.{Transaction}
use types.{ScriptHashRegistry}
use utilities.{outputs_of, select_by_address, value_sum}

// Check whether a withdraw from the reward account is done correctly.
// In particular:
//  - All funds must stay under control of `account`, the script in question
//  - A staking address must not be attached to the output, to prevent earning staking rewards or voting
//
// This also checks some subtle edge cases, such as:
//  - To prevent someone from spending existing funds controlled by the contract, `account` must not occur in the inputs
//  - To allow subtle issues around minUTxO, the funds locked at `account` must be *at least* the amount withdrawn
//  - The funds can be split across multiple UTxOs for organizational purposes
pub fn logic(
  withdrawals: Pairs<Credential, Lovelace>,
  account: Credential,
  registry: ScriptHashRegistry,
  self: Transaction,
) -> Bool {
  let Transaction { inputs, outputs, .. } = self
  // There must be only one withdrawal from this credential
  expect [amount] = withdrawals |> pairs.get_all(account)

  let inputs = outputs_of(inputs)

  // To prevent shenanigans where a disbursement equal to the amount is used to trick
  // the withdrawal, we assert that `account` never occurs in the inputs
  // This is slightly less flexible than ensuring the totals carry through, but
  // also simpler to reason about
  expect None =
    inputs
      |> list.find(
          fn(input) {
            or {
              input.address.payment_credential == registry.treasury,
              input.address.payment_credential == registry.vendor,
            }
          },
        )

  // Sum up the amounts of the withdrawal paid to `account`
  // This lets us split the funds across multiple UTxOs for accounting purposes
  // but still ensures that the total amount is correct
  let output_sum = value_sum(outputs, select_by_address(account))

  // Ensure that the output sum is *at least* the amount
  // This allows some flexibility in case of minUTxO issues, which are unlikely
  // NOTE: We do *not* let the fee be deducted here, because that would allow someone to set the fee very large!
  lovelace_of(output_sum) >= amount
}
