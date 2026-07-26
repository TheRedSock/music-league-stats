import { z } from "zod";

export const playerSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens",
  );

export const playerNameInputSchema = z
  .object({
    nameOverride: z
      .union([z.string().trim().min(1).max(120), z.literal(""), z.null()])
      .transform((value) => value || null),
    slug: playerSlugSchema,
  })
  .strict();

export type PlayerNameInput = z.infer<typeof playerNameInputSchema>;
