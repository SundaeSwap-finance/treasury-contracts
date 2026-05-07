import { IAnchor, IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";
import type { IVendor } from "./fund.js";

/** Milestone row for modify transactions / indexer HandleModify */
export interface IModifyMilestone {
  identifier: string;
  label: string;
  description: string;
  acceptanceCriteria: string;
  /** Free-form rationale chunks (often empty when only payout dates change). */
  details: string;
}

export interface IModify extends IMetadataBodyBase {
  event: ETransactionEvent.MODIFY;
  identifier: string;
  otherIdentifiers: string[];
  label: string;
  description: string;
  reason: string;
  vendor: IVendor;
  contract: IAnchor;
  milestones: IModifyMilestone[];
}
