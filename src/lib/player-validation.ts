import { z } from "zod";

export const playerNameInputSchema = z
  .object({
    nameOverride: z
      .union([z.string().trim().min(1).max(120), z.literal(""), z.null()])
      .transform((value) => value || null),
  })
  .strict();

export type PlayerNameInput = z.infer<typeof playerNameInputSchema>;
