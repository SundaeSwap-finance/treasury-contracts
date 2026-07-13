import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface ISweep extends IMetadataBodyBase {
  event: ETransactionEvent.SWEEP;
  comment?: string;
}
