import { z } from "zod";

const optionalDate = z
  .union([
    z.literal(""),
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  ])
  .transform((value) => value || null);

export const leagueInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(80)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers, and single hyphens",
      ),
    totalRounds: z.number().int().min(1).max(10000),
    maxPlayers: z.number().int().min(1).max(10000),
    songsPerPlayerPerRound: z.number().int().min(1).max(1000),
    status: z.enum(["active", "ended"]),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .strict()
  .refine(
    ({ startDate, endDate }) =>
      !startDate || !endDate || endDate >= startDate,
    {
      path: ["endDate"],
      message: "End date must be on or after start date",
    },
  );

export type LeagueInput = z.infer<typeof leagueInputSchema>;
