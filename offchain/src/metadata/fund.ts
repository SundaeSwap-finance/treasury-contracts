import type { IAnchor, IMetadataBodyBase } from "./shared";

export interface IVendor {
  label: string;
  details?: IAnchor;
}

export interface IMilestone {
  identifier: string;
  label?: string;
  description?: string;
  acceptanceCriteria?: string;
  details?: IAnchor;
}

export interface IFund extends IMetadataBodyBase {
  event: "fund";
  instance: string;
  identifier: string;
  otherIdentifiers: string[];
  label: string;
  description: string;
  vendor: IVendor;
  contract?: IAnchor;
  milestones: IMilestone[];
}
