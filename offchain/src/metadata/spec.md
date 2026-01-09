# TOM Metadata Standard

This document describes the metadata attached to various transactions, and how that can be used to build a materialized view of the state of the world.

Each transaction relevant to the treasury oversight platform will include transaction metadata with key 1694, as reserved by [CIP-100](https://cips.cardano.org/cip/CIP-0100).

The contents of this document will be either:

- A CIP-100 JSON document, encoded via the [standard JSON to CBOR conversion](https://developers.cardano.org/docs/get-started/cardano-serialization-lib/transaction-metadata/#json-conversion).
- A json document with two keys, anchorUrl and anchorDataHash, which refer to a remotely hosted document.

The remainder of this document serves to describe the relevant transactions and fields that we expect to publish as part of the MVP. These may be extended based on discoveries or user feedback during development.

# Generic Properties / Guidance

Generally speaking, the treasury oversight smart contracts cannot enforce the structure of this metadata. Therefore, most properties should be considered optional, and any UIs should be built to tolerate missing or malformed data, such as falling back to reasonable defaults. This will ensure that, even in the presence of messy data, changing requirements, or misinterpretations of the standard, the user experience and transparency are still preserved as much as possible.

Some properties may be reused across multiple documents:

- event identifies the type of event being published, such as “new TOM instance” or “fund project”; A list of possible values is:
  - publish
  - initialize
  - reorganize
  - fund
  - disburse
  - complete
  - withdraw
  - pause
  - resume
  - modify
  - cancel
  - Sweep
- identifier assigns a unique identifier to some object
- instance identifies which treasury instance this event corresponds to
- label defines some human readable label for the object in question; the object being labeled is context sensitive
- comment can be included nearly anywhere in the metadata document to provide additional, generic textual comments that aren’t semantically covered by other fields.
- txAuthor identifies the person or entity that built the transaction for the committee. It will be a public key hash and must be present in the required signers of the transaction to prove authorship. Indexers can use this plus an allow list to differentiate expected traffic from unexpected traffic.
- anchorUrl and anchorDataHash are used to link to an external document; In some cases, anchorDataHash may be optional if the document is expected to change over time. If anchorDataHash is provided, the document is expected to be immutable.

# New TOM Instance

When publishing the scriptRegistry datum, which includes the script hashes of the treasury and vendor script, the metadata will describe the human readable labels / intentions for this instance of the treasury oversight contracts.

```json
{
  "@context": "https://github.com/SundaeSwap-finance/treasury-contracts/blob/main/offchain/src/metadata/spec.md",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "publish",
    "label": "Open Source",
    "description": "human readable markdown formatted description",
    "expiration": 1234,
    "payoutUpperbound": 5678,
    "vendorExpiration": 9012,
    "seedUtxo": {
      "transactionId": "31c2df71553c3c395fe3ae1ab0eb6e57aac28a0f5436ed413c3c8d2139c03a6d",
      "outputIndex": "0",
    },
    "permissions": {
      "reorganize": {
        "label": "Open Source Committee",
        "atLeast": {
          "required": 3,
          "scripts": [
            { "label": "ABC", "signature": { "keyHash": "..." } },
            { ... },
          ]
        }
      },
      "sweep": { ... },
      ...
    }
  }
}
```

The treasury instance is identified by the policy ID of the authenticating token locking the script registry datum. This identifier can be used by other transactions to refer to this instance specifically, when it’s not clear from context.

Largely this exists to describe the properties that the scripts were parameterized with, and assign human-readable labels suitable for use in the UI. Note that labels are optional, in which case a suitable generic fallback value should be selected.

The permissions object will describe the permissions for the 7 actions:

- Reorganize
- Sweep
- Fund
- Disburse
- Pause
- Resume
- Modify

Each permission **may** be set to either an object, which mirrors the [Aicone multisig schema](https://github.com/SundaeSwap-finance/aicone/blob/main/lib/sundae/multisig.ak#L8-L16), with added optional human readable labels, OR the key for another permissions object when the permissions are reused, to reduce duplication.

We currently do not specify a way to update these labels, but a future extension to this specification may provide one.

# Stake Address Withdrawal / Reorganize

When funds are initially withdrawn from the stake address after the treasury withdrawal governance action, funds may be split across multiple UTxOs; Additionally, when using the “Reorganize” action, UTxOs may be split, merged, or rebalanced.

In each of these transactions, the following metadata will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "initialize | reorganize"
    "reason": "human readable justification for this reorganize; optional in the case of withdraw"
    "outputs": {
      0: { "identifier": "...", "label": "..." }
    }
  }
}
```

Reason gives a justification for why the funds are being reorganized (which is superfluous in the case of the stake withdrawal).

The output’s object keys indexes into the transaction outputs. For each one, it defines a persistent identifier that will apply to each unambiguous “descendant”, and a label, which can be used for human readable display.

For example, funds might be split among separate UTxOs to reduce contention among different teams within intersect, etc.

# Fund

When we pay funds out of the treasury smart contract, into the vendor contract, the following metadata will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "fund"
    "identifier": "PO123",
    "otherIdentifiers": [...],
    "label": "Human Readable Title",
    "description": "long-form markdown annotated description",
    "vendor": {
      "label": "Sundae Labs",
      "details": {
        "anchorUrl": "ipfs://...",
        "anchorDataHash": "..."
      }
    },
    "contract": {
      "anchorUrl": "ipfs://...",
      "anchorDataHash": "...",
    },
    "milestones": {
      "001": {
        "identifier": "001",
        "label": "...",
        "description": "A human readable description",
        "acceptanceCriteria": "...",
        "details": { ... }
      }
    }
  }
}
```

The project is assigned a unique identifier, which will be inherited by all descendants of the relevant UTxO. This can be, for example, an internal project number. In some cases, there **may** be other related project numbers (for example: the vendors internal project number, or the Ekklesia identifier for the project), which can be provided in otherIdentifiers.

The project itself is given a human readable label that serves as a title, as well as a long-form, markdown formatted description.

The vendor is assigned a label, and **may** link to additional details about the vendor, which itself **may** be a CIP-100 governance metadata document.

If available, a link to the contract can be provided. This could be hosted on a durable storage solution like IPFS or Iagon storage, or on more conventional hosting platforms. It also **may** be publicly visible, or encrypted for certain parties if necessary. These are considered concerns outside the scope of the TOM portal.

Finally, each milestone itself **may** have a human readable label, description, acceptance criteria, and reference to further details via an anchor URL. The milestones are indexed by their identifier, to match other metadata messages, and must match 1:1 with the milestones in the transaction datum.

# Disburse

A disburse transaction will have the following metadata attached to it:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "disburse",
    "label": "Human Readable Title",
    "description": "long-form markdown annotated description",
    "justification": "long-form markdown justification",
    "destination": {
      "label": "Coinbase",
      "details": {
        "anchorUrl": "ipfs://...",
        "anchorDataHash": "..."
      }
    },
    "estimatedReturn": 1234
  }
}
```

The description describes mechanically **what** is intended to happen with the funds (such as “swapping for a USD to mint USDM”).
The justification defines **why** the oversight committee believes this falls within its remit as administrator of the treasury funds (“Vendor X cannot be paid in crypto”).
The destination gives a human readable label for the destination, which can be aggregated across transactions (“NBX Exchange Account”)
Destination may be encoded either as a single object or as an array of objects. Producers of metadata should prefer the array form, to ensure backwards compatibility consumers must accept either.
The estimatedReturn, if provided, gives an estimate, as a POSIX timestamp, of when the funds are expected to be returned to the treasury contract.

# Complete

The vendor contract can be spent to “withdraw” funds, and withdraw zero funds. This can be used by the vendor to provide evidence of completion for a future milestone. In such cases, the attached transaction metadata will be formatted as so:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "complete"
    "milestones": {
      "001": {
        "description": "long-form markdown annotated description",
        "evidence": [
          {
	          "label": "milestone acceptance form",
            "anchorUrl": "ipfs://...",
            "anchorDataHash": "1ef...",
          }
        ]
      }
    }
  }
}
```

A vendor may complete multiple milestones at once. The keys of the milestone object make reference to the “identifier” specified in the previous “Fund” transaction.

The description is a human readable description provided by the vendor. This may be as simple as “This is monthly time and materials work.” etc.

The evidence is an array of reference to externally hosted files. This may be a link to a github, or a file hosted on IPFS. The file **may** be encrypted for only the oversight committee. The file **may** itself be a CIP-100 formatted document. The exact policy for what data is acceptable here is outside the scope of the standard. In cases where the content is expected to be immutable, the vendor may provide an anchorDataHash as usual.

# Withdraw

Funds may be withdrawn from the vendor contract. In such cases, the metadata will describe, conceptually, which milestones are being claimed. In practice, this is only needed to disambiguate if two milestones have the same maturity date, so may be left off. In cases where the metadata is nonsensical (i.e. if the milestone that was removed from the list had a different maturation date than the one identified in the metadata, the datum should take precedence.)

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "withdraw"
    "milestones": {
      "001": {
        "comment": "long-form markdown annotated comment (can be blank)"
      }
    }
  }
}
```

# Pause

The oversight committee may pause funds, preventing them from being withdrawn. In such cases, the following metadata will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "pause"
    "milestones": {
      "001": {
        "reason": "long-form markdown annotated description",
        "resolution": "improve load times"
      }
    }
  }
}
```

For each milestone, the oversight committee should describe the reason the payout is being paused; if it’s not clear from the reason, the resolution field can specify an explicit path to unblocking and resuming the payment.

# Resume

After resolving the issue with a milestone, the oversight committee can resume those payouts. In such cases, the following metadata will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "resume"
      "milestones": {
      "001": {
        "reason": "long-form markdown annotated description"
      }
    }
  }
}
```

# Modify

In rare cases, the vendor and the oversight committee both agree to modify a project, changing it’s payout amount or milestones. In such cases, the following metadata (which is similar to the fund metadata, since this is essentially defining a new project) will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "modify"
    "identifier": "PO123",
    "otherIdentifiers": [...],
    "label": "Human Readable Title",
    "description": "long-form markdown annotated description",
    "reason": "long-form reason for the modification",
    "vendor": {
      "label": "Sundae Labs",
      "details": {
        "anchorUrl": "ipfs://...",
        "anchorDataHash": "..."
      }
    },
    "contract": {
      "anchorUrl": "ipfs://...",
      "anchorDataHash": "...",
    },
    "milestones": {
      "001": {
        "identifier": "001",
        "label": "...",
        "description": "A human readable description",
        "acceptanceCriteria": "...",
        "details": { ... }
      }
    }
  }
}
```

As a special case, the project may be completely cancelled and refunded to the treasury reserve contract, in which case the following simplified metadata is attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "cancel"
    "reason": "long-form reason for the cancellation",
  }
}
```

# Sweep

Finally, at the end of the lifecycle of funds, any surplus may be swept back to the cardano treasury. This applies to both the treasury contract and the vendor contract. In such cases, either no metadata is attached (if there’s no extenuating circumstances / need to comment), or the following metadata will be attached:

```json
{
  "@context": "https://raw.githubusercontent.com/SundaeSwap-finance/treasury-contracts/refs/heads/main/offchain/src/metadata/context.jsonld",
  "hashAlgorithm": "blake2b-256",
  "txAuthor": "c27...",
  "instance": "1ef...",
  "body": {
    "event": "sweep"
    "comment": "a long form comment on why funds are being swept now",
  }
}
```
