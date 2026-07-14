import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface ISweep extends IMetadataBodyBase {
  event: ETransactionEvent.SWEEP;
  // The identifier assigned to the funded project in the fund event, when the
  // swept surplus relates to one
  projectIdentifier?: string;
  // The fund event's milestone identifiers the surplus originated from
  milestones?: string[];
  comment?: string;
}
