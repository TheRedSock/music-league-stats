import { describe, expect, it } from "vitest";

import { playerNameInputSchema } from "@/lib/player-validation";

describe("player name validation", () => {
  it("trims override names and allows clearing the override", () => {
    expect(
      playerNameInputSchema.parse({
        nameOverride: "  Display Name  ",
        slug: "havrd",
      }),
    ).toEqual({ nameOverride: "Display Name", slug: "havrd" });
    expect(
      playerNameInputSchema.parse({ nameOverride: "", slug: "havrd" }),
    ).toEqual({
      nameOverride: null,
      slug: "havrd",
    });
    expect(
      playerNameInputSchema.parse({ nameOverride: null, slug: "havrd" }),
    ).toEqual({
      nameOverride: null,
      slug: "havrd",
    });
  });

  it("normalizes and validates slug", () => {
    expect(
      playerNameInputSchema.parse({
        nameOverride: null,
        slug: "  Havrd-Name  ",
      }),
    ).toEqual({ nameOverride: null, slug: "havrd-name" });
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: null, slug: "Bad Slug" }),
    ).toThrow();
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: null, slug: "-havrd" }),
    ).toThrow();
  });

  it("rejects missing, empty-after-trim, and overly long overrides", () => {
    expect(() => playerNameInputSchema.parse({ slug: "havrd" })).toThrow();
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: "   ", slug: "havrd" }),
    ).toThrow();
    expect(() =>
      playerNameInputSchema.parse({
        nameOverride: "x".repeat(121),
        slug: "havrd",
      }),
    ).toThrow();
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: null }),
    ).toThrow();
  });
});
