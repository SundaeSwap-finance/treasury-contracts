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
    keyHash: string;
  };
}

export interface IScriptPermissionMetadata {
  label?: string;
  script: {
    scriptHash: string;
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
  metadata: TPermissionMetadata | string | null,
  others?: Record<TPermissionName, TPermissionMetadata | string | null>,
): MultisigScript {
  if (metadata === null) {
    return {
      AnyOf: {
        scripts: [],
      },
    };
  }
  if (typeof metadata === "string" || metadata instanceof String) {
    if (!others || !(metadata.toString() in others)) {
      throw new Error("Unrecognized permission name, or cycle detected");
    }
    return toMultisig(others[metadata.toString() as TPermissionName]);
  } else if ("signature" in metadata) {
    return { Signature: { key_hash: metadata.signature.keyHash } };
  } else if ("script" in metadata) {
    return { Script: { script_hash: metadata.script.scriptHash } };
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

export function toPermission(multisig: MultisigScript): TPermissionMetadata {
  if ("Signature" in multisig) {
    return {
      signature: { keyHash: multisig.Signature.key_hash },
    };
  } else if ("Script" in multisig) {
    return {
      script: { scriptHash: multisig.Script.script_hash },
    };
  } else if ("AtLeast" in multisig) {
    return {
      atLeast: {
        required: multisig.AtLeast.required,
        scripts: multisig.AtLeast.scripts.map(toPermission),
      },
    };
  } else if ("AllOf" in multisig) {
    return {
      allOf: {
        scripts: multisig.AllOf.scripts.map(toPermission),
      },
    };
  } else if ("AnyOf" in multisig) {
    return {
      anyOf: {
        scripts: multisig.AnyOf.scripts.map(toPermission),
      },
    };
  } else if ("Before" in multisig) {
    return {
      before: { time: multisig.Before.time },
    };
  } else if ("After" in multisig) {
    return {
      after: { time: multisig.After.time },
    };
  } else {
    throw new Error("Unsupported type");
  }
}
