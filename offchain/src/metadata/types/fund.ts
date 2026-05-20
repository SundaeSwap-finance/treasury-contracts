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

/** Funding-time allowlist destinations attached to fund transaction metadata. */
export interface IFundAllowlistDestination {
  address: string;
  label?: string;
}

export interface IFundAllowlist {
  scriptHash: string;
  addresses: IFundAllowlistDestination[];
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
  allowlist?: IFundAllowlist;
}
