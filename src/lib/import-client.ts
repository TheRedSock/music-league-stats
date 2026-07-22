"use client";

import Papa from "papaparse";

import {
  canonicalizeCsvRow,
  normalizeCsvHeaders,
  validateCsvHeaders,
  type ImportKind,
} from "@/lib/import-data";

export type UploadChunk = {
  kind: ImportKind;
  index: number;
  startRow: number;
  rows: unknown[];
  hash: string;
};

export type ParsedImportFile = {
  kind: ImportKind;
  fileName: string;
  rows: unknown[];
  checksum: string;
  chunks: UploadChunk[];
};

const maximumChunkRows = 500;
const targetRequestBytes = 900 * 1024;
const encoder = new TextEncoder();

export async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function estimatedRequestSize(
  kind: ImportKind,
  index: number,
  startRow: number,
  rows: unknown[],
): number {
  return encoder.encode(
    JSON.stringify({
      kind,
      index,
      startRow,
      rows,
      hash: "0".repeat(64),
    }),
  ).byteLength;
}

async function makeChunks(
  kind: ImportKind,
  rows: unknown[],
): Promise<UploadChunk[]> {
  const groups: Array<{ startRow: number; rows: unknown[] }> = [];
  let current: unknown[] = [];
  let startRow = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const next = [...current, rows[rowIndex]];
    const tooLarge =
      estimatedRequestSize(kind, groups.length, startRow, next) >
      targetRequestBytes;
    if (current.length > 0 && (current.length >= maximumChunkRows || tooLarge)) {
      groups.push({ startRow, rows: current });
      current = [rows[rowIndex]];
      startRow = rowIndex;
    } else {
      current = next;
    }
    if (
      current.length === 1 &&
      estimatedRequestSize(kind, groups.length, startRow, current) >
        targetRequestBytes
    ) {
      throw new Error(
        `${kind}.csv row ${rowIndex + 2} is too large to upload safely.`,
      );
    }
  }
  if (current.length > 0) groups.push({ startRow, rows: current });

  return Promise.all(
    groups.map(async (group, index) => ({
      kind,
      index,
      startRow: group.startRow,
      rows: group.rows,
      hash: await sha256Json(group.rows),
    })),
  );
}

export function parseImportFile(
  kind: ImportKind,
  file: File,
): Promise<ParsedImportFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      worker: true,
      skipEmptyLines: "greedy",
      beforeFirstChunk: (chunk) => chunk.replace(/^\uFEFF/, ""),
      complete: async (result) => {
        try {
          const errors = result.errors.filter(
            (error) => error.code !== "UndetectableDelimiter",
          );
          if (errors.length > 0) {
            const first = errors[0];
            throw new Error(
              `${kind}.csv row ${(first.row ?? 0) + 2}: ${first.message}`,
            );
          }
          validateCsvHeaders(
            kind,
            normalizeCsvHeaders(result.meta.fields ?? []),
          );
          const rows = result.data.map((row, index) =>
            canonicalizeCsvRow(kind, row, index),
          );
          const chunks = await makeChunks(kind, rows);
          resolve({
            kind,
            fileName: file.name,
            rows,
            chunks,
            checksum: await sha256Json(rows),
          });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => reject(error),
    });
  });
}
