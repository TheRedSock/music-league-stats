import { describe, expect, it } from "vitest";

import { playerNameInputSchema } from "@/lib/player-validation";

describe("player name validation", () => {
  it("trims override names and allows clearing the override", () => {
    expect(
      playerNameInputSchema.parse({ nameOverride: "  Display Name  " }),
    ).toEqual({ nameOverride: "Display Name" });
    expect(playerNameInputSchema.parse({ nameOverride: "" })).toEqual({
      nameOverride: null,
    });
    expect(playerNameInputSchema.parse({ nameOverride: null })).toEqual({
      nameOverride: null,
    });
  });

  it("rejects missing, empty-after-trim, and overly long overrides", () => {
    expect(() => playerNameInputSchema.parse({})).toThrow();
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: "   " }),
    ).toThrow();
    expect(() =>
      playerNameInputSchema.parse({ nameOverride: "x".repeat(121) }),
    ).toThrow();
  });
});
