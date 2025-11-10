#! /usr/bin/env bash
set -e

mkdir -p offchain/src/generated-types/
aiken build -t silent # verbose
aiken build -t verbose -o plutus-trace.json
bunx @blaze-cardano/blueprint plutus.json -t plutus-trace.json -o ./offchain/src/generated-types/contracts.ts
