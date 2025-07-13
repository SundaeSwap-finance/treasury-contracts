use aiken/cbor
use aiken/primitive/bytearray
use cardano/transaction.{OutputReference}
use sundae/multisig.{AllOf, AnyOf, AtLeast, MultisigScript, Signature}
use types.{
  TreasuryConfiguration, TreasuryPermissions, VendorConfiguration,
  VendorPermissions,
}

// Seed UTxO
fn seed_utxo() -> OutputReference {
  OutputReference {
    transaction_id: #"31c2df71553c3c395fe3ae1ab0eb6e57aac28a0f5436ed413c3c8d2139c03a6d",
    output_index: 0,
  }
}

// Entities

fn intersect_leadership_1() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"4e72b1facdc7eea745767b8daca40bf73d75eb0e88dcee80d57eec5d",
      },
      Signature {
        key_hash: #"1c732c072364a2afd42a03228f3816fec37e73f64b61f4c12bab55ee",
      },
    ],
  }
}

fn intersect_leadership_2() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"91f5b1d436080c1beca93fbbb96596312d8f615b0ad9e94470af2224",
      },
      Signature {
        key_hash: #"a1ebdcc53ad3907461d92204f9789ddb640dcdcb0d9fce786a55eaf4",
      },
    ],
  }
}

fn intersect_admin_1() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"1be0008bf2994524c0eaf0efdae4431e4a61ef7d974804fa794110b7",
      },
      Signature {
        key_hash: #"27194940fae07315f4dc7a0394535dea7795dab2f232ee40f4457e8f",
      },
    ],
  }
}

fn intersect_admin_2() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"a664de561ccd2ca9a07c060d4dd7cea4dc68ba89d4bf04b21ff0726f",
      },
      Signature {
        key_hash: #"821dbb013b85872e91f59e5c3c566390c866aea114a13b1b68f064bc",
      },
    ],
  }
}

fn intersect_admin_3() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"c236d8dc9441605238a5fe9cc7e6c1a79903289a4249c33122bf9627",
      },
      Signature {
        key_hash: #"1b5850270f7a77ea9ef570a83fb4b120bf814ec94aa0dba0c9c28844",
      },
    ],
  }
}

fn cardano_foundation() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"ac3de68e8e1f9af3e00b299e7858bc44e126b33e130d06223d799d5d",
      },
      Signature {
        key_hash: #"c9f2966a1b357718b45a006954106ba1f7ae9fea16e9826f3486ddd6",
      },
    ],
  }
}

fn sundae_labs() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"1880102b04725318eb7a6f9f481815c82473c2f50cfe9932c85a3bf8",
      },
      Signature {
        key_hash: #"7a827787c47a4e74f102330cc8566ed9845047903121025911163b9d",
      },
    ],
  }
}

fn xerberus() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"a7f06cf4e9c03c6b7eac317d5533d573a9be3018fb7b9d95dd778d39",
      },
      Signature {
        key_hash: #"d8261e2c334b58072042130182de4fb945a46dd1b1974e1df755fe96",
      },
    ],
  }
}

fn nmkr() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"8349f8b41d8337b617947ace444ef95b2b80ff2605cadf969914cf95",
      },
      Signature {
        key_hash: #"cd820bac2773f2df622c567aa547894177a818593bdae996dd0881e3",
      },
    ],
  }
}

fn dquadrant() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"679ad28e567eb42ddb30a5cf6b5f066b2defbce393f19968d711f658",
      },
      Signature {
        key_hash: #"36e0cf1e52e05ef92e52c7bc2a04493d6bae481b8acbab12ec4300d7",
      },
    ],
  }
}

// Groups

fn intersect_leadership() -> List<MultisigScript> {
  [intersect_leadership_1(), intersect_leadership_2()]
}

fn intersect_admin() -> List<MultisigScript> {
  [intersect_admin_1(), intersect_admin_2(), intersect_admin_3()]
}

fn trusted_entities() -> List<MultisigScript> {
  [cardano_foundation(), sundae_labs(), xerberus(), nmkr(), dquadrant()]
}

// Permissions

fn reorganize() -> MultisigScript {
  AllOf {
    scripts: [
      AtLeast { required: 2, scripts: intersect_admin() },
      AtLeast { required: 3, scripts: trusted_entities() },
    ],
  }
}

fn sweep_treasury() -> MultisigScript {
  AllOf {
    scripts: [
      AnyOf { scripts: intersect_admin() },
      AnyOf { scripts: intersect_leadership() },
    ],
  }
}

fn fund() -> MultisigScript {
  AllOf {
    scripts: [
      AnyOf { scripts: intersect_leadership() },
      AtLeast { required: 2, scripts: intersect_admin() },
      AtLeast { required: 2, scripts: trusted_entities() },
    ],
  }
}

fn disburse() -> MultisigScript {
  AllOf {
    scripts: [
      AllOf { scripts: intersect_leadership() },
      AtLeast { required: 2, scripts: intersect_admin() },
      AtLeast { required: 3, scripts: trusted_entities() },
    ],
  }
}

fn pause() -> MultisigScript {
  AllOf {
    scripts: [
      AnyOf { scripts: intersect_leadership() },
      AtLeast { required: 2, scripts: intersect_admin() },
    ],
  }
}

fn resume() -> MultisigScript {
  pause()
}

fn modify() -> MultisigScript {
  fund()
}

// Configuration

pub fn registry_token() {
  #"9e65e4ed7d6fd86fc4827d2b45da6d2c601fb920e8bfd794b8ecc619"
}

pub fn treasury_expiration() {
  1848700800000
}

pub fn payout_upperbound() {
  1851206400000
}

pub fn vendor_expiration() {
  1853884800000
}

pub fn treasury_configuration() -> TreasuryConfiguration {
  TreasuryConfiguration {
    registry_token: registry_token(),
    permissions: TreasuryPermissions {
      reorganize: reorganize(),
      sweep: sweep_treasury(),
      fund: fund(),
      disburse: disburse(),
    },
    expiration: treasury_expiration(),
    payout_upperbound: payout_upperbound(),
  }
}

pub fn vendor_configuration() -> VendorConfiguration {
  VendorConfiguration {
    registry_token: registry_token(),
    permissions: VendorPermissions {
      pause: pause(),
      resume: resume(),
      modify: modify(),
    },
    expiration: vendor_expiration(),
  }
}

// Printing

test display_seed_utxo() {
  trace bytearray.to_hex(cbor.serialise(seed_utxo()))
  True
}

test display_treasury_config() {
  trace bytearray.to_hex(cbor.serialise(treasury_configuration()))
  True
}

test display_vendor_config() {
  trace bytearray.to_hex(cbor.serialise(vendor_configuration()))
  True
}
