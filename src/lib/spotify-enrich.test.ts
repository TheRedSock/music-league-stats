import { describe, expect, it } from "vitest";

import { isAmbiguousArtistName } from "@/lib/spotify-enrich";
import { parseSpotifyTrackId } from "@/lib/spotify";

describe("parseSpotifyTrackId", () => {
  it("parses track URIs", () => {
    expect(parseSpotifyTrackId("spotify:track:11dFghVXANMlKmJXsNCbNl")).toBe(
      "11dFghVXANMlKmJXsNCbNl",
    );
  });

  it("rejects non-track URIs", () => {
    expect(parseSpotifyTrackId("spotify:album:abc")).toBeNull();
    expect(parseSpotifyTrackId("not-a-uri")).toBeNull();
  });
});

describe("isAmbiguousArtistName", () => {
  it("detects multi-credit separators", () => {
    expect(isAmbiguousArtistName("Carly Rae Jepsen, Owl City")).toBe(true);
    expect(isAmbiguousArtistName("Artist A & Artist B")).toBe(true);
    expect(isAmbiguousArtistName("A / B")).toBe(true);
    expect(isAmbiguousArtistName("Drake feat. Rihanna")).toBe(true);
    expect(isAmbiguousArtistName("Drake ft. Rihanna")).toBe(true);
    expect(isAmbiguousArtistName("Artist featuring Guest")).toBe(true);
    expect(isAmbiguousArtistName("Artist with Guest")).toBe(true);
  });

  it("treats comma names as ambiguous (acceptable false positive)", () => {
    expect(isAmbiguousArtistName("Tyler, The Creator")).toBe(true);
  });

  it("leaves plain single artists alone", () => {
    expect(isAmbiguousArtistName("Radiohead")).toBe(false);
    expect(isAmbiguousArtistName("The Weeknd")).toBe(false);
  });
});
