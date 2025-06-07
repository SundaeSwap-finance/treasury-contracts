import { IAnchor, IMetadataBodyBase } from "./shared";

export interface IAnchorWithLabel extends IAnchor {
  label: string;
}

export interface IMilestone {
  description: string;
  evidence: IAnchorWithLabel[];
}

export interface IWithdraw extends IMetadataBodyBase {
  event: "withdraw";
  milestones: Record<string, IMilestone>;
}
