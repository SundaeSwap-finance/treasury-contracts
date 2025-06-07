import {
  Metadata,
  Metadatum,
  MetadatumList,
  MetadatumMap,
} from "@blaze-cardano/core";
import type { IFund } from "./fund";
import type { IInitialize } from "./initialize-reorganize";
import type { INewInstance } from "./new-instance";

export interface IAnchor {
  anchorUrl: string;
  anchorDataHash: string;
}

export interface IMetadataBodyBase {
  event: string;
}

export interface ITransactionMetadata<MB = IMetadataBodyBase> {
  "@context": string;
  hashAlgorithm: "blake2b-256";
  body: MB;
  comment?: string;
  txAuthor: string;
}

export type TMetadataBody = IInitialize | INewInstance | IFund;

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

export function toMetadata(m: ITransactionMetadata): Metadata {
  const root = new MetadatumMap();
  root.insert(Metadatum.newText("@context"), Metadatum.newText(m["@context"]));
  root.insert(
    Metadatum.newText("hashAlgorithm"),
    Metadatum.newText(m.hashAlgorithm),
  );
  root.insert(Metadatum.newText("txAuthor"), Metadatum.newText(m.txAuthor));
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
