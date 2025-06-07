import type { IMetadataBodyBase } from "./shared";

export interface IOutput {
  identifier: string;
  label?: string;
}

interface IInitializeReorganize extends IMetadataBodyBase {
  instance: string;
  reason?: string;
  outputs: Record<number, IOutput>;
}

export interface IInitialize extends IInitializeReorganize {
  event: "initialize";
}

export interface IReorganize extends IInitializeReorganize {
  event: "reorganize";
}
