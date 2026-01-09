import { IAnchor, IMetadataBodyBase } from "../shared.js";
import { ETransactionEvent } from "./events.js";

export interface IDestination {
  label: string;
  details?: IAnchor;
}

export interface IReference {
  "@type": string;
  label: string;
  uri: string;
}

export interface IDisburse extends IMetadataBodyBase {
  event: ETransactionEvent.DISBURSE;
  label: string;
  description: string;
  justification: string;
  destination: IDestination | IDestination[];
  references?: IReference[];
  estimatedReturn?: bigint;
}
