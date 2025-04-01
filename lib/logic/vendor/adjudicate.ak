use aiken/collection/list
use aiken/interval.{is_entirely_after}
use cardano/address.{Credential}
use cardano/transaction.{InlineDatum, Transaction}
use sundae/multisig.{satisfied}
use types.{Active, Paused, PayoutStatus, VendorConfiguration, VendorDatum}
use utilities.{equal_plus_min_ada, outputs_of}

// The oversight committee can pause a specific payouts during a dispute
// Specifically, this logic enforces that:
//  - There is a single vendor input
//  - There is a single vendor output with an equal value (allowing for ADA to increase for minUTxO)
//  - The list of payouts is the same length
//  - For each paired input and output payout
//    - The maturity date and amount are unchanged
//    - If the input payout is active and matures in the past, the status is unchanged
//  - If at least one payout flips from active to inactive, the `pause` permission is satisfied
//  - If at least one payout flips from Inactive to Active, the `resume` permission is satisfied
//  - At least one payout changes
pub fn logic(
  statuses: List<PayoutStatus>,
  config: VendorConfiguration,
  account: Credential,
  transaction: Transaction,
) {
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

  expect [vendor_output] =
    outputs
      |> list.filter(
          fn(output) { output.address.payment_credential == account },
        )
  expect vendor_output.address.stake_credential == None

  expect InlineDatum(output_vendor_datum) = vendor_output.datum
  expect output_vendor_datum: VendorDatum = output_vendor_datum

  expect
    list.length(input_vendor_datum.payouts) == list.length(
      output_vendor_datum.payouts,
    )

  let (pause_permission_needed, resume_permission_needed) =
    input_vendor_datum.payouts
      |> list.zip(output_vendor_datum.payouts)
      |> list.zip(statuses)
      |> list.foldl(
          (False, False),
          fn(((ip, op), status), (pause, resume)) {
            expect status == op.status
            expect ip.maturation == op.maturation
            expect ip.value == op.value
            expect
              if is_entirely_after(validity_range, ip.maturation) && ip.status == Active {
                op.status == Active
              } else {
                True
              }
            (
              pause || ip.status == Active && op.status == Paused,
              resume || ip.status == Paused && op.status == Active,
            )
          },
        )

  and {
    equal_plus_min_ada(vendor_input.value, vendor_output.value),
    or {
      pause_permission_needed,
      resume_permission_needed,
    },
    or {
      !pause_permission_needed,
      satisfied(
        config.permissions.pause,
        extra_signatories,
        validity_range,
        withdrawals,
      ),
    },
    or {
      !resume_permission_needed,
      satisfied(
        config.permissions.resume,
        extra_signatories,
        validity_range,
        withdrawals,
      ),
    },
  }
}
