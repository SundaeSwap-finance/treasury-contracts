import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";
import type { TPermissionMetadata, TPermissionName } from "./permission.js";

export interface INewInstance extends IMetadataBodyBase {
  event: ETransactionEvent.PUBLISH;
  label?: string;
  description?: string;
  expiration: bigint;
  payoutUpperbound: bigint;
  vendorExpiration: bigint;
  permissions: Record<
    TPermissionName,
    TPermissionMetadata | TPermissionName | null
  >;
  seedUtxo: {
    transactionId: string;
    outputIndex: bigint;
  };
}
