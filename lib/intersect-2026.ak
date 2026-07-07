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
    transaction_id: #"e405804fb7586356f6620dab081290f80e7b2e6d1bc617f61fbf33b29521707f",
    output_index: 5,
  }
}

// New Intersect leadership keys for 2026

fn intersect_leadership_3() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"8f26ed11170b90cfac5c5ba4e2591d5701ae10659e94d0e873fec3d3",
      },
      Signature {
        key_hash: #"c16aa8f6ab20712d2ea576c0bf668011df616e79d9bd55cc26ecbdcb",
      },
    ],
  }
}

fn intersect_leadership_4() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"9ab26836263a7bfd891b8ec459e05a56c0a3c4e3a69e06b9b9d342a9",
      },
      Signature {
        key_hash: #"b7eb06dcb074ad2ff12e869e32208c59d4fecf5b7a2c258b6ddde905",
      },
    ],
  }
}

fn intersect_leadership_5() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"c95a6ac46a3af62705af2981844703704b90aa1e2e7eded40dac8022",
      },
      Signature {
        key_hash: #"2a3caa195e0e61b78776c91d3951f84f0db50a3d567c8fb8fdf51b22",
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

// New admin keys for 2026

fn intersect_admin_4() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"2303c13b5f0bf7a3259706550f166f846b1e3b626a15ee5b84825772",
      },
      Signature {
        key_hash: #"036679d166cbda2c6bd022853a644a45799e6a6a9ed647386263d809",
      },
    ],
  }
}

fn intersect_admin_5() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"2d38f904f694af80e5e87b0225d3db8d950dced4a0f2a8e26e5a8fd4",
      },
      Signature {
        key_hash: #"62714a7605a9051de9ed35b25ff9c5fe8bf6ef64810b6921688c5e42",
      },
    ],
  }
}

// Oversight committee members for 2026

fn cardano_foundation() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"c9f2966a1b357718b45a006954106ba1f7ae9fea16e9826f3486ddd6",
      },
      Signature {
        key_hash: #"ac3de68e8e1f9af3e00b299e7858bc44e126b33e130d06223d799d5d",
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

fn sundial() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"540405628384dcfd390fe4cad0d61adb3741676fc8387a4ad56cab52",
      },
      Signature {
        key_hash: #"e0c942f43d5c327c17fd501fb7d6ab9d1c7cc10b2aa989888a91d6ee",
      },
    ],
  }
}

fn eternl() -> MultisigScript {
  AnyOf {
    scripts: [
      Signature {
        key_hash: #"bf39799afe57f185947b6ca54efdc2a48eb628eeef4b64003b8e2433",
      },
      Signature {
        key_hash: #"c01015cfebdfcd092add60d4398834cf9e84289cd17d7e2b3559b0dd",
      },
    ],
  }
}

// Groups

fn intersect_leadership() -> List<MultisigScript> {
  [intersect_leadership_3(), intersect_leadership_4(), intersect_leadership_5()]
}

fn intersect_admin() -> List<MultisigScript> {
  [
    intersect_admin_1(),
    intersect_admin_2(),
    intersect_admin_3(),
    intersect_admin_4(),
    intersect_admin_5(),
  ]
}

fn trusted_entities() -> List<MultisigScript> {
  [
    cardano_foundation(),
    sundae_labs(),
    nmkr(),
    dquadrant(),
    sundial(),
    eternl(),
  ]
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
      AtLeast { required: 2, scripts: intersect_leadership() },
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
  #"51486a2f1496d4d3a688a9b111971aa9b731ed045d900b601345ca4e"
}

// 1 August 2029 at 0:00:00 UTC
pub fn treasury_expiration() {
  1880236800000
}

// 30 August 2029 at 0:00:00 UTC
pub fn payout_upperbound() {
  1882742400000
}

// 30 September 2029 at 0:00:00
pub fn vendor_expiration() {
  1885420800000
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
