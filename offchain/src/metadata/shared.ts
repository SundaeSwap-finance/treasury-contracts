import {
  Metadata,
  Metadatum,
  MetadatumList,
  MetadatumMap,
} from "@blaze-cardano/core";
import { decodeFirst } from "cbor";

import { IPause, IResume } from "./types/adjudicate.js";
import { IComplete } from "./types/complete.js";
import { IDisburse } from "./types/disburse.js";
import { ETransactionEvent } from "./types/events.js";
import { IFund } from "./types/fund.js";
import { IInitialize } from "./types/initialize-reorganize.js";
import { INewInstance } from "./types/new-instance.js";
import { IWithdraw } from "./types/withdraw.js";

export interface IAnchor {
  anchorUrl: string;
  anchorDataHash: string;
}

export interface IMetadataBodyBase {
  event: ETransactionEvent;
}

export type TMetadataBody =
  | IPause
  | IResume
  | IFund
  | IInitialize
  | IWithdraw
  | IComplete
  | INewInstance
  | IDisburse;

export interface ITransactionMetadata<B = TMetadataBody> {
  "@context": string;
  hashAlgorithm: "blake2b-256";
  body: B;
  comment?: string;
  txAuthor: string;
  instance: string;
}

function toMetadatum(value: unknown): Metadatum | undefined {
  if (typeof value === "string" || value instanceof String) {
    const valueBytes = Buffer.from(value.toString(), "utf8");
    if (valueBytes.length <= 64) {
      return Metadatum.newText(value.toString());
    } else {
      // Break value into 64 character chunks and construct a Metadataum array out of them
      // This is because a string can be at most 64 characters
      // not all utf8 characters are 1 byte, so we need to be careful
      // to not break a character in the middle
      // We will use a greedy algorithm to find the largest chunk that fits in 64 bytes
      // We will start with 64 characters and reduce until we find a chunk that fits
      // A bit brute force, but it works for now
      const chunks = new MetadatumList();
      for (let i = 0; i < value.length; i += 64) {
        let j = 0;
        while (
          Buffer.from(value.substring(i, i + 64 - j), "utf8").length > 64
        ) {
          j++;
        }
        chunks.add(Metadatum.newText(value.substring(i, i + 64 - j)));
        i -= j;
      }
      return Metadatum.newList(chunks);
    }
  } else if (typeof value === "bigint" || typeof value === "number") {
    return Metadatum.newInteger(BigInt(value));
  } else if (Array.isArray(value)) {
    const arr = new MetadatumList();
    for (const elem of value) {
      const value = toMetadatum(elem);
      if (value !== undefined) {
        arr.add(value);
      }
    }
    return Metadatum.newList(arr);
  } else if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    value !== null
  ) {
    const map = new MetadatumMap();
    for (const [k, val] of Object.entries(value)) {
      const key = Metadatum.newText(k);
      const value = toMetadatum(val);
      if (value !== undefined) {
        map.insert(key, value);
      }
    }
    return Metadatum.newMap(map);
  } else if (value === undefined) {
    return undefined;
  } else {
    throw new Error(`Unrecognized type: ${value}`);
  }
}

export async function fromTxMetadata(
  m: Metadata,
): Promise<ITransactionMetadata> {
  const meta = m.metadata()?.get(1694n);
  if (!meta) {
    throw new Error("Invalid metadata, could not find at key 1694.");
  }

  const obj = await decodeFirst(meta.toCbor());
  const sanitized = convertNumbersToBigints<ITransactionMetadata>(obj);
  const rejoined = convertArraysToStrings<ITransactionMetadata>(sanitized);
  return rejoined;
}

export function toTxMetadata(m: ITransactionMetadata): Metadata {
  const root = new MetadatumMap();
  root.insert(Metadatum.newText("@context"), toMetadatum(m["@context"])!);
  root.insert(
    Metadatum.newText("hashAlgorithm"),
    Metadatum.newText(m.hashAlgorithm),
  );
  root.insert(Metadatum.newText("txAuthor"), Metadatum.newText(m.txAuthor));
  root.insert(Metadatum.newText("instance"), Metadatum.newText(m.instance));
  if ("comment" in m && m.comment) {
    const comment = toMetadatum(m.comment);
    root.insert(Metadatum.newText("comment"), comment!);
  }
  const body = toMetadatum(m.body);
  if (body === undefined) {
    throw new Error("must have a body");
  }
  root.insert(Metadatum.newText("body"), body);
  const metadata = new Map<bigint, Metadatum>();
  metadata.set(1694n, Metadatum.newMap(root));
  return new Metadata(metadata);
}

function convertNumbersToBigints<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(convertNumbersToBigints) as unknown as T;
  } else if (obj !== null && typeof obj === "object") {
    const newObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number") {
        newObject[key] = BigInt(value);
      } else if (typeof value === "object" && value !== null) {
        newObject[key] = convertNumbersToBigints(value);
      } else {
        newObject[key] = value;
      }
    }
    return newObject as T;
  }
  return obj;
}

function convertArraysToStrings<T>(obj: T): T {
  if (Array.isArray(obj)) {
    // Grab the subset array while including instances where there is only
    // two chunks of a string (where the last is less than 64).
    const subsetArray =
      obj.length < 3 ? obj.slice(0, 1) : obj.slice(0, obj.length - 2);
    if (
      obj.length > 0 &&
      // Ensure that every string in the subset is 64 characters in length.
      subsetArray.every((v) => typeof v === "string" && v.length === 64)
    ) {
      return obj.join("") as unknown as T;
    }

    return obj.map(convertArraysToStrings) as unknown as T;
  } else if (obj !== null && typeof obj === "object") {
    const newObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      newObject[key] = convertArraysToStrings(value);
    }
    return newObject as T;
  }
  return obj;
}
