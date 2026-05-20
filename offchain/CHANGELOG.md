# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.26](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.25...v0.0.26) (2026-05-20)

### Features

- add `proposalGroupKey` to fund transaction metadata for linking projects under the same governance proposal ([92a6cfa](https://github.com/SundaeSwap-finance/treasury-contracts/commit/92a6cfaf2f03d07db610b00569eba484a4ec6347))
- add `allowlist` to fund metadata (`scriptHash` and payout destinations, with optional labels)
- extend fund CLI to prompt for proposal group key, allowlist addresses, and optional address labels
- document fund metadata fields in `spec.md` and `context.jsonld`
- export `ITransactionMetadata` from the package entrypoint
- add metadata round-trip test for `proposalGroupKey` and `allowlist`

### [0.0.11](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.10...v0.0.11) (2025-06-16)

### [0.0.10](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.9...v0.0.10) (2025-06-15)

### [0.0.9](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.8...v0.0.9) (2025-06-14)

### Bug Fixes

- export ([55c3e93](https://github.com/SundaeSwap-finance/treasury-contracts/commit/55c3e93a4c6477fe54fb324c1c23d2c1c67b3bbc))
- test ([263d762](https://github.com/SundaeSwap-finance/treasury-contracts/commit/263d762f76dadda82d5e1b1f83ff561c8921e3b6))

### [0.0.8](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.7...v0.0.8) (2025-06-14)

### [0.0.7](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.6...v0.0.7) (2025-06-14)

### [0.0.6](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.5...v0.0.6) (2025-06-14)

### Bug Fixes

- relative urls in file ([c996213](https://github.com/SundaeSwap-finance/treasury-contracts/commit/c9962133d94815e2480419608b8cef5cc3eae49a))
- unused var ([9205c1b](https://github.com/SundaeSwap-finance/treasury-contracts/commit/9205c1b54c3912e7d304b0ec8fbe42d82e777702))

### [0.0.5](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.4...v0.0.5) (2025-06-14)

### Bug Fixes

- auto imports ([9d8057c](https://github.com/SundaeSwap-finance/treasury-contracts/commit/9d8057cea872981105754306fb6a0b035da87fa6))

### [0.0.4](https://github.com/SundaeSwap-finance/treasury-contracts/compare/v0.0.3...v0.0.4) (2025-06-12)

### 0.0.3 (2025-06-11)

### Features

- mvp for cli to publish registry hash ([915dff7](https://github.com/SundaeSwap-finance/treasury-contracts/commit/915dff7bce25b560a85e651d7fdf03a24f311e64))

### Bug Fixes

- vscode setting json ([26f0ca1](https://github.com/SundaeSwap-finance/treasury-contracts/commit/26f0ca1d81916ced742f86098c285099ee09a32b))

### 0.0.2 (2025-05-23)

Initial release.
