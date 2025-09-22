import { IAnchor, IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface IDestination {
  label?: string;
  details?: IAnchor;
}

export interface IDisburse extends IMetadataBodyBase {
  event: ETransactionEvent.DISBURSE;
  label: string;
  description: string;
  justification: string;
  destination: IDestination;
  estimatedReturn?: number;
}
