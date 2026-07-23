import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  importBatches,
  importChunks,
  importStagingRows,
} from "@/db/schema";
import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  formatZodError,
  importChunkSchema,
  importRowSchemas,
} from "@/lib/import-data";
import { sha256Json } from "@/lib/server-hash";

const maximumRequestBytes = 1024 * 1024;

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    requireAdminMutation(request);
    const { batchId } = await context.params;
    if (!z.uuid().safeParse(batchId).success) {
      throw new AdminRequestError("Invalid import batch ID.", 400);
    }
    const bodyText = await request.text();
    const byteSize = Buffer.byteLength(bodyText, "utf8");
    if (byteSize > maximumRequestBytes) {
      throw new AdminRequestError(
        "Chunk exceeds the 1 MiB request limit.",
        413,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new AdminRequestError("Request body is not valid JSON.", 400);
    }
    const parsed = importChunkSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminRequestError(formatZodError(parsed.error), 400);
    }
    const { kind, index, startRow, rows, hash } = parsed.data;
    if (sha256Json(rows) !== hash) {
      throw new AdminRequestError("Chunk hash does not match its rows.", 400);
    }
    const rowSchema = importRowSchemas[kind];
    const canonicalRows = rows.map((row, rowOffset) => {
      const result = rowSchema.safeParse(row);
      if (!result.success) {
        throw new AdminRequestError(
          `${kind} row ${startRow + rowOffset + 1}: ${formatZodError(result.error)}`,
          400,
        );
      }
      if (JSON.stringify(result.data) !== JSON.stringify(row)) {
        throw new AdminRequestError(
          `${kind} row ${startRow + rowOffset + 1} is not canonical.`,
          400,
        );
      }
      return result.data as Record<string, unknown>;
    });

    const progress = await db.transaction(async (tx) => {
      const [batch] = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1)
        .for("update");
      if (!batch) throw new AdminRequestError("Import batch not found.", 404);
      const expected = batch.manifest[kind];
      if (
        index >= expected.chunkCount ||
        startRow + canonicalRows.length > expected.rowCount
      ) {
        throw new AdminRequestError(
          `${kind} chunk is outside the declared manifest.`,
          409,
        );
      }
      const [existing] = await tx
        .select()
        .from(importChunks)
        .where(
          and(
            eq(importChunks.batchId, batchId),
            eq(importChunks.kind, kind),
            eq(importChunks.chunkIndex, index),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          existing.hash !== hash ||
          existing.startRow !== startRow ||
          existing.rowCount !== canonicalRows.length
        ) {
          throw new AdminRequestError(
            `${kind} chunk ${index} was already uploaded with different content.`,
            409,
          );
        }
        return {
          receivedRows: batch.receivedRows,
          receivedChunks: batch.receivedChunks,
          duplicate: true,
        };
      }
      if (batch.status !== "pending") {
        throw new AdminRequestError(
          `Cannot upload to an import with status "${batch.status}".`,
          409,
        );
      }

      await tx.insert(importChunks).values({
        batchId,
        kind,
        chunkIndex: index,
        startRow,
        rowCount: canonicalRows.length,
        byteSize,
        hash,
      });
      await tx.insert(importStagingRows).values(
        canonicalRows.map((sourceRow, rowOffset) => ({
          batchId,
          kind,
          chunkIndex: index,
          rowIndex: startRow + rowOffset,
          sourceRow,
          rowHash: sha256Json(sourceRow),
        })),
      );
      const [updated] = await tx
        .update(importBatches)
        .set({
          receivedRows: sql`${importBatches.receivedRows} + ${canonicalRows.length}`,
          receivedChunks: sql`${importBatches.receivedChunks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(importBatches.id, batchId))
        .returning({
          receivedRows: importBatches.receivedRows,
          receivedChunks: importBatches.receivedChunks,
        });
      return { ...updated, duplicate: false };
    });
    return NextResponse.json(progress);
  } catch (error) {
    if (databaseCode(error) === "23505") {
      return NextResponse.json(
        { error: "Chunk row ranges overlap another uploaded chunk." },
        { status: 409 },
      );
    }
    return adminErrorResponse(error);
  }
}
