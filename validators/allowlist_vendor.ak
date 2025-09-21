use aiken/collection/list
use aiken/collection/pairs
use cardano/assets.{PolicyId, Value}
use cardano/address.{Address, Credential}
use cardano/transaction.{Transaction, Spend, Output}
use utilities.{find_script_hash_registry, outputs_of, value_sum, equal_plus_min_ada}
use types.{ScriptHashRegistry, TreasurySpendRedeemer, VendorSpendRedeemer, Fund, Withdraw, Modify }

pub type AllowlistConfig {
  registry_token: PolicyId,
  addresses: List<Address>
}

/// A vendor script, for an ongoing project with an owner
validator allowlist_vendor(config: AllowlistConfig) {
  withdraw(
    _r: Data,
    _c: Credential,
    self: Transaction,
  ) {
    // Find the script registry (which lets us know the treasury script address)
    let registry = find_script_hash_registry(self.reference_inputs, config.registry_token)

    or {
      is_fund_transaction(registry, self),
      is_modify_transaction(registry, self),
      is_valid_withdraw_transaction(config.addresses, registry, self),
    }
  }

  // No other actions (withdrawing, minting, voting, etc.) are valid
  else(_) {
    False
  }
}

fn is_fund_transaction(registry: ScriptHashRegistry, self: Transaction) {
  let treasury_input = self.inputs
    |> list.find(fn(i) { i.output.address.payment_credential == registry.treasury })

  when treasury_input is {
    Some(treasury_input) -> {
      expect Some(redeemer) = self.redeemers
        |> pairs.get_first(Spend(treasury_input.output_reference))

      expect redeemer: TreasurySpendRedeemer = redeemer

      when redeemer is {
        Fund { .. } -> True
        _ -> False
      }
    }
    _ -> False
  }
}

fn is_modify_transaction(registry: ScriptHashRegistry, self: Transaction) {
  let vendor_input = self.inputs
    |> list.find(fn(i) { i.output.address.payment_credential == registry.vendor })
  when vendor_input is {
    Some(vendor_input) -> {

      expect Some(redeemer) = self.redeemers
        |> pairs.get_first(Spend(vendor_input.output_reference))

      expect redeemer: VendorSpendRedeemer = redeemer

      when redeemer is {
        Modify -> True
        _ -> False
      }
    }
    _ -> False
  }
}

fn is_valid_withdraw_transaction(targets: List<Address>, registry: ScriptHashRegistry, self: Transaction) {
  let vendor_input = self.inputs
    |> list.find(fn(i) { i.output.address.payment_credential == registry.vendor })

  when vendor_input is {
    Some(vendor_input) -> {
      expect Some(redeemer) = self.redeemers
        |> pairs.get_first(Spend(vendor_input.output_reference))

      expect redeemer: VendorSpendRedeemer = redeemer

      when redeemer is {
        Withdraw -> net_outflow_is_allowed(targets, registry, self)
        _ -> False
      }
    }
    _ -> False
  }
}

fn net_outflow_is_allowed(targets: List<Address>, registry: ScriptHashRegistry, self: Transaction) {
  let inputs = outputs_of(self.inputs)
  // The (positive) quantity of ADA leaving the vendor address
  // so if the user is withdrawing 100 ADA, this will be 100 ada
  let vendor_input_sum = value_sum(inputs, registry.vendor, True)
  let vendor_output_sum = value_sum(self.outputs, registry.vendor, False)
  let vendor_outflow = vendor_output_sum |> assets.negate |> assets.merge(vendor_input_sum)

  // The (positive) quantity of ADA entering the target address
  // so if the wallet address has 10 ada on the inputs, and 110 ada on the outputs,
  // this will be 100 ada
  let target_input_sum = value_sum_addresses(inputs, targets)
  let target_output_sum = value_sum_addresses(self.outputs, targets)
  let target_inflow = target_input_sum |> assets.negate |> assets.merge(target_output_sum)

  // The target inflow can have more ADA, to account for minUTxO, but not less
  equal_plus_min_ada(vendor_outflow, target_inflow)
}

// Like value_sum, but for a specific address instead
pub fn value_sum_addresses(
  outputs: List<Output>,
  addresses: List<Address>,
) -> Value {
  outputs
    |> list.filter(fn(output) { list.has(addresses, output.address) })
    |> list.map(fn(output) { output.value })
    |> list.reduce(assets.zero, assets.merge)
}
