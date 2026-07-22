import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import {
  canonicalizeCsvRow,
  normalizeCsvHeaders,
  sourceSubmissionId,
  validateCsvHeaders,
} from "@/lib/import-data";

describe("Music League CSV validation", () => {
  it("accepts the exact headers and strips a UTF-8 BOM", () => {
    expect(() =>
      validateCsvHeaders(
        "competitors",
        normalizeCsvHeaders(["\uFEFFID", "Name"]),
      ),
    ).not.toThrow();
  });

  it("rejects missing, reordered, and extra headers", () => {
    expect(() => validateCsvHeaders("competitors", ["Name", "ID"])).toThrow(
      "exactly these headers in order",
    );
    expect(() =>
      validateCsvHeaders("competitors", ["ID", "Name", "Extra"]),
    ).toThrow("exactly these headers in order");
  });

  it("preserves quoted commas, quotes, CRLF multiline fields, and ignores trailing blanks", () => {
    const csv =
      'Spotify URI,Title,Album,Artist(s),Submitter ID,Created,Comment,Round ID,Visible To Voters\r\nspotify:track:1,"A, song",Album,"Artist ""One""",person-1,2026-01-02T03:04:05Z,"hello,\r\n""friends""",round-1,Yes\r\n\r\n';
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: "greedy",
    });
    validateCsvHeaders("submissions", parsed.meta.fields);
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(1);
    expect(canonicalizeCsvRow("submissions", parsed.data[0], 0)).toEqual({
      spotifyUri: "spotify:track:1",
      title: "A, song",
      album: "Album",
      artists: 'Artist "One"',
      submitterId: "person-1",
      created: "2026-01-02T03:04:05Z",
      comment: 'hello,\r\n"friends"',
      roundId: "round-1",
      visibleToVoters: true,
    });
  });

  it("accepts Music League Yes and No visibility values", () => {
    const baseRow = {
      "Spotify URI": "spotify:track:1",
      Title: "Song",
      Album: "",
      "Artist(s)": "Artist",
      "Submitter ID": "person-1",
      Created: "2026-01-02T03:04:05Z",
      Comment: "",
      "Round ID": "round-1",
    };

    expect(
      canonicalizeCsvRow(
        "submissions",
        { ...baseRow, "Visible To Voters": "Yes" },
        0,
      ),
    ).toMatchObject({ visibleToVoters: true });
    expect(
      canonicalizeCsvRow(
        "submissions",
        { ...baseRow, "Visible To Voters": "No" },
        0,
      ),
    ).toMatchObject({ visibleToVoters: false });
  });

  it("accepts explicit zero-point votes and rejects negative points", () => {
    const row = {
      "Spotify URI": "spotify:track:1",
      "Voter ID": "person-2",
      Created: "2026-01-02T03:04:05Z",
      "Points Assigned": "0",
      Comment: "",
      "Round ID": "round-1",
    };
    expect(canonicalizeCsvRow("votes", row, 0)).toMatchObject({
      points: 0,
      comment: null,
    });
    expect(() =>
      canonicalizeCsvRow(
        "votes",
        { ...row, "Points Assigned": "-1" },
        0,
      ),
    ).toThrow("non-negative integer");
  });

  it("builds an unambiguous round and Spotify submission identity", () => {
    expect(sourceSubmissionId("round:a", "spotify:track:b")).toBe(
      '["round:a","spotify:track:b"]',
    );
  });
});
