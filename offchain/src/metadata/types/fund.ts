import { IAnchor, IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface IVendor {
  label: string;
  details?: IAnchor;
}

export interface IFundMilestone {
  identifier: string;
  label?: string;
  description?: string;
  acceptanceCriteria?: string;
  details?: IAnchor;
}

export interface IFund extends IMetadataBodyBase {
  event: ETransactionEvent.FUND;
  identifier: string;
  proposalGroupKey?: string;
  otherIdentifiers: string[];
  label: string;
  description: string;
  vendor: IVendor;
  contract?: IAnchor;
  milestones: IFundMilestone[];
}
