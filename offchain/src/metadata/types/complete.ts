import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface IEvidence {
  label?: string;
  anchorUrl: string;
  anchorDataHash?: string;
}

export interface ICompleteMilestone {
  description: string;
  evidence: IEvidence[];
}

export interface IComplete extends IMetadataBodyBase {
  event: ETransactionEvent.COMPLETE;
  milestones: Record<string, ICompleteMilestone>;
}
