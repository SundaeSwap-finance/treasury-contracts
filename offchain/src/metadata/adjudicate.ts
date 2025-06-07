import { IMetadataBodyBase } from "./shared";

export interface IMilestone {
  reason: string;
  resolution?: string;
}

interface IAdjudicate extends IMetadataBodyBase {
  milestones: Record<string, IMilestone>;
}

export interface IPause extends IAdjudicate {
  event: "pause";
}

export interface IResume extends IAdjudicate {
  event: "resume";
}
