import { IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface IWithdrawMilestone {
  comment: string;
}

export interface IWithdraw extends IMetadataBodyBase {
  event: ETransactionEvent.WITHDRAW;
  milestones: Record<string, IWithdrawMilestone>;
}
