import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";
import type { TPermissionMetadata, TPermissionName } from "./permission.js";

export interface INewInstance extends IMetadataBodyBase {
  event: ETransactionEvent.PUBLISH;
  label?: string;
  description?: string;
  expiration: bigint;
  payoutUpperbound?: bigint;
  vendorExpiration?: bigint;
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >;
  seed_utxo: {
    transaction_id: string;
    output_index: bigint;
  };
}
