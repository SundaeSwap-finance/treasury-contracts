import {
  Address,
  Ed25519KeyHashHex,
  RewardAccount,
  Slot,
} from "@blaze-cardano/core";
import * as Data from "@blaze-cardano/data";
import { Emulator } from "@blaze-cardano/emulator";
import { Core, makeValue } from "@blaze-cardano/sdk";
import { beforeEach, describe, test } from "bun:test";
import { ETransactionEvent } from "src";
import {
  MultisigScript,
  VendorDatum,
} from "../../src/generated-types/contracts";
import {
  coreValueToContractsValue,
  loadTreasuryScript,
  loadVendorScript,
  TConfigsOrScripts,
} from "../../src/shared";
import { complete } from "../../src/vendor/complete";
import {
  sampleTreasuryConfig,
  sampleVendorConfig,
  setupEmulator,
  Vendor,
  vendor_key,
} from "../utilities";

describe("When submitting evidence from the vendor script", () => {
  const amount = 340_000_000_000_000n;

  let emulator: Emulator;
  let scriptInput: Core.TransactionUnspentOutput;
  let firstDatum: VendorDatum;
  let vendor: MultisigScript;
  let vendorSigner: Ed25519KeyHashHex;
  let rewardAccount: RewardAccount;
  let vendorScriptAddress: Address;
  let configsOrScripts: TConfigsOrScripts;
  beforeEach(async () => {
    emulator = await setupEmulator();
    const treasuryConfig = await sampleTreasuryConfig(emulator);
    const vendorConfig = await sampleVendorConfig(emulator);
    const treasuryScriptManifest = loadTreasuryScript(
      Core.NetworkId.Testnet,
      treasuryConfig,
      true,
    );
    const vendorScriptManifest = loadVendorScript(
      Core.NetworkId.Testnet,
      vendorConfig,
      true,
    );
    configsOrScripts = {
      configs: { treasury: treasuryConfig, vendor: vendorConfig, trace: true },
    };
    rewardAccount = treasuryScriptManifest.rewardAccount!;
    vendorScriptAddress = vendorScriptManifest.scriptAddress;

    emulator.accounts.set(rewardAccount, amount);

    vendor = {
      Signature: {
        key_hash: await vendor_key(emulator),
      },
    };
    vendorSigner = Ed25519KeyHashHex(await vendor_key(emulator));

    scriptInput = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("1".repeat(64)), 0n),
      new Core.TransactionOutput(
        vendorScriptAddress,
        makeValue(500_000_000_000n),
      ),
    );
    firstDatum = {
      vendor: vendor,
      payouts: [
        {
          maturation: 1000n,
          value: coreValueToContractsValue(makeValue(500_000_000_000n)),
          status: "Active",
        },
      ],
    };
    scriptInput
      .output()
      .setDatum(
        Core.Datum.newInlineData(Data.serialize(VendorDatum, firstDatum)),
      );
    emulator.addUtxo(scriptInput);
  });

  describe("the vendor", () => {
    test("can complete a milestone", async () => {
      emulator.stepForwardToSlot(101n);
      await emulator.as(Vendor, async (blaze) => {
        await emulator.expectValidTransaction(
          blaze,
          await complete({
            configsOrScripts,
            blaze,
            now: new Date(Number(emulator.slotToUnix(Slot(101)))),
            inputs: [scriptInput],
            signers: [vendorSigner],
            metadata: {
              "@context": "test",
              hashAlgorithm: "blake2b-256",
              instance: "example-instance",
              txAuthor: "author",
              body: {
                event: ETransactionEvent.COMPLETE,
                milestones: {
                  "m-1": {
                    description: "example description",
                    evidence: [
                      {
                        label: "Milestone evidence",
                        anchorUrl: "https://example.com",
                      },
                    ],
                  },
                },
              },
            },
          }),
        );
      });
    });
  });
  //   test("cannot withdraw funds", async () => {
  //     emulator.stepForwardToSlot(2n);
  //     await emulator.as("MaliciousUser", async (blaze, signer) => {
  //       await emulator.expectScriptFailure(
  //         await withdraw({
  //           configsOrScripts,
  //           blaze,
  //           now: new Date(Number(emulator.slotToUnix(Slot(2)))),
  //           inputs: [scriptInput],
  //           destination: signer,
  //           signers: [
  //             Ed25519KeyHashHex(signer.asBase()!.getPaymentCredential().hash),
  //           ],
  //         }),
  //         /Trace satisfied\(input_vendor_datum.vendor, extra_signatories, validity_range, withdrawals\)/,
  //       );
  //     });
  //   });
  // });
});
