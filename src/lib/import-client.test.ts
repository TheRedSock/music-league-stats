import { describe, expect, it } from "vitest";
import { makeChunks, sha256Json } from "@/lib/import-client";

// Preserve the old algorithm as an independent byte-boundary reference.
async function reference(rows: unknown[]) {
  const groups: { startRow: number; rows: unknown[] }[] = [];
  let current: unknown[] = [], startRow = 0;
  const size = (list: unknown[]) => new TextEncoder().encode(JSON.stringify({ kind: "votes", index: groups.length, startRow, rows: list, hash: "0".repeat(64) })).length;
  for (let i = 0; i < rows.length; i++) {
    const next = [...current, rows[i]];
    if (current.length && (current.length >= 500 || size(next) > 900 * 1024)) {
      groups.push({ startRow, rows: current }); current = [rows[i]]; startRow = i;
    } else current = next;
    if (current.length === 1 && size(current) > 900 * 1024) throw new Error("Oversized row");
  }
  if (current.length) groups.push({ startRow, rows: current });
  return Promise.all(groups.map(async (group, index) => ({ kind: "votes", index, ...group, hash: await sha256Json(group.rows) })));
}

describe("upload chunk byte accounting", () => {
  it("preserves boundaries and hashes across UTF-8, escapes, nulls and index digit changes", async () => {
    const rows = Array.from({ length: 5101 }, (_, i) => ({ id: i, note: '🎵 Æø漢字\\"\n'.repeat(i % 2 ? 3 : 120) }));
    rows.push(null as never, undefined as never);
    expect(await makeChunks("votes", rows)).toEqual(await reference(rows));
  });
  it("preserves the exact byte limit, including envelope overhead", async () => {
    const maxLength = 900 * 1024 - new TextEncoder().encode(JSON.stringify({ kind: "votes", index: 0, startRow: 0, rows: [""], hash: "0".repeat(64) })).length;
    for (const length of [maxLength - 1, maxLength]) {
      const rows = ["x".repeat(length), "🎵"];
      expect(await makeChunks("votes", rows)).toEqual(await reference(rows));
    }
    await expect(makeChunks("votes", ["x".repeat(maxLength + 1)])).rejects.toThrow("row 2 is too large");
    await expect(makeChunks("votes", ["🎵".repeat(230400)])).rejects.toThrow("row 2 is too large");
  });
  it("handles empty input and the 500-row cap", async () => {
    expect(await makeChunks("votes", [])).toEqual([]);
    expect((await makeChunks("votes", Array(501).fill({ p: 0 }))).map(c => c.rows.length)).toEqual([500, 1]);
  });
});
