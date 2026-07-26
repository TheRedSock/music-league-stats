/**
 * Normalize a Music League competitor name into a URL slug:
 * lowercase, non-alphanumeric runs → single hyphens, trimmed.
 */
export function slugifyPlayerName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug || "player";
}

/**
 * Pick a unique slug from `base`, trying `base`, then `base-2`, `base-3`, …
 * Mutates `used` by adding the chosen slug.
 */
export function allocateUniquePlayerSlug(
  baseName: string,
  used: Set<string>,
): string {
  const base = slugifyPlayerName(baseName);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) {
    n += 1;
  }
  const slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

export function playerPath(player: {
  id: string;
  slug?: string | null;
}): string {
  return `/players/${player.slug || player.id}`;
}
