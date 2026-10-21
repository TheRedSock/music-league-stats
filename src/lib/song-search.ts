import { sql, type SQL } from "drizzle-orm";

const fields = {
  title: sql`ranked_songs.title`,
  artist: sql`ranked_songs.artist`,
  album: sql`coalesce(ranked_songs.album, '')`,
  player: sql`ranked_songs."submitterName"`,
  league: sql`ranked_songs."leagueName"`,
  round: sql`ranked_songs."roundName"`,
};

type SearchField = keyof typeof fields;
type SearchTerm = {
  field: SearchField | null;
  value: string;
  exact: boolean;
  exclude: boolean;
};

const fieldAliases: Record<string, SearchField | undefined> = {
  title: "title",
  song: "title",
  artist: "artist",
  album: "album",
  player: "player",
  submitter: "player",
  league: "league",
  round: "round",
};

export function parseSongSearch(search: string): SearchTerm[] {
  // Keep quoted phrases together, including an unfinished quote while typing.
  const tokens = search.match(/(?:[^\s"]|"(?:\\.|[^"\\])*"?)+/g) ?? [];
  return tokens.flatMap((token): SearchTerm[] => {
    const exclude = token.startsWith("-") && token.length > 1;
    let value = exclude ? token.slice(1) : token;
    let field: SearchField | null = null;
    const prefix = /^([a-z]+):/i.exec(value);
    const recognized = prefix && Object.hasOwn(fieldAliases, prefix[1].toLowerCase())
      ? fieldAliases[prefix[1].toLowerCase()]
      : undefined;
    if (recognized && value.length > prefix![0].length) {
      field = recognized;
      value = value.slice(prefix![0].length);
    }
    const quoted = value.startsWith('"');
    const closed = quoted && value.length > 1 && value.endsWith('"');
    if (quoted) value = value.slice(1, closed ? -1 : undefined);
    value = value.replace(/\\(["\\])/g, "$1");
    if (!value) return [];
    return [{ field, value, exact: field !== null && closed, exclude }];
  });
}

export function songSearchPredicate(search: string): SQL {
  const terms = parseSongSearch(search);
  if (!terms.length) return sql`true`;
  const predicates = terms.map(({ field, value, exact, exclude }) => {
    const columns = field
      ? [fields[field]]
      : [fields.title, fields.artist, fields.album, fields.player];
    // User-entered SQL wildcard characters are literal search text.
    const pattern = `%${value.replace(/[\\%_]/g, "\\$&")}%`;
    const matches = columns.map((column) => exact
      ? sql`lower(${column}) = lower(${value})`
      : sql`${column} ilike ${pattern}`);
    const predicate = sql`(${sql.join(matches, sql` or `)})`;
    return exclude ? sql`not ${predicate}` : predicate;
  });
  return sql`(${sql.join(predicates, sql` and `)})`;
}
