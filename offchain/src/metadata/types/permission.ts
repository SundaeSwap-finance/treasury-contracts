import { MultisigScript } from "../../generated-types/contracts.js";

export type TPermissionName =
  | "reorganize"
  | "sweep"
  | "fund"
  | "disburse"
  | "pause"
  | "resume"
  | "modify";

export interface ISignaturePermissionMetadata {
  label?: string;
  signature: {
    key_hash: string;
  };
}

export interface IScriptPermissionMetadata {
  label?: string;
  script: {
    script_hash: string;
  };
}

export interface IThresholdPermissionMetadata {
  label?: string;
  atLeast: {
    required: bigint;
    scripts: TPermissionMetadata[];
  };
}

export interface IAllPermissionMetadata {
  label?: string;
  allOf: {
    scripts: TPermissionMetadata[];
  };
}

export interface IAnyPermissionMetadata {
  label?: string;
  anyOf: {
    scripts: TPermissionMetadata[];
  };
}
export interface IBeforePermissionMetadata {
  label?: string;
  before: {
    time: bigint;
  };
}
export interface IAfterPermissionMetadata {
  label?: string;
  after: {
    time: bigint;
  };
}

export type TPermissionMetadata =
  | ISignaturePermissionMetadata
  | IScriptPermissionMetadata
  | IThresholdPermissionMetadata
  | IAllPermissionMetadata
  | IAnyPermissionMetadata
  | IBeforePermissionMetadata
  | IAfterPermissionMetadata;

export function toMultisig(
  metadata: TPermissionMetadata | string,
  others?: Record<TPermissionName, TPermissionMetadata | string>,
): MultisigScript {
  if (typeof metadata === "string" || metadata instanceof String) {
    if (!others || !(metadata.toString() in others)) {
      throw new Error("Unrecognized permission name, or cycle detected");
    }
    return toMultisig(others[metadata.toString() as TPermissionName]);
  } else if ("signature" in metadata) {
    return { Signature: { key_hash: metadata.signature.key_hash } };
  } else if ("script" in metadata) {
    return { Script: { script_hash: metadata.script.script_hash } };
  } else if ("atLeast" in metadata) {
    return {
      AtLeast: {
        required: metadata.atLeast.required,
        scripts: metadata.atLeast.scripts.map((s) => toMultisig(s)),
      },
    };
  } else if ("allOf" in metadata) {
    return {
      AllOf: {
        scripts: metadata.allOf.scripts.map((s) => toMultisig(s)),
      },
    };
  } else if ("anyOf" in metadata) {
    return {
      AnyOf: {
        scripts: metadata.anyOf.scripts.map((s) => toMultisig(s)),
      },
    };
  } else if ("before" in metadata) {
    return {
      Before: metadata.before,
    };
  } else if ("after" in metadata) {
    return {
      After: metadata.after,
    };
  } else {
    throw new Error("Unsupported type");
  }
}
