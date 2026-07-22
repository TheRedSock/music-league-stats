# Music League Tracker

A private Music League statistics app built with Next.js, TypeScript, Tailwind,
Postgres, and Drizzle.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and replace every placeholder.
3. Apply the schema with `npm run db:migrate`.
4. Start the app with `npm run dev`.
5. Open `/admin` and sign in with `ADMIN_PASSWORD`.

Runtime queries use the pooled `DATABASE_URL`. Drizzle migrations and Studio use
the direct `DATABASE_URL_DIRECT` connection. Generate
`ADMIN_SESSION_SECRET` with at least 32 cryptographically random characters,
for example `openssl rand -base64 48`. Do not commit local environment files.

## Admin and CSV sync

Leagues are created manually in `/admin`; their source IDs are generated
automatically. The admin can edit the name, slug, rules, status, and dates.
Authentication uses a short-lived, signed, HttpOnly cookie. All write endpoints
also verify the session and same-origin request headers.

For each sync, select a target league and the four Music League exports:

- `competitors.csv`: `ID,Name`
- `rounds.csv`: `ID,Created,Name,Description,Playlist URL`
- `submissions.csv`: `Spotify URI,Title,Album,Artist(s),Submitter ID,Created,Comment,Round ID,Visible To Voters`
- `votes.csv`: `Spotify URI,Voter ID,Created,Points Assigned,Comment,Round ID`

The browser uses Papa Parse, validates exact headers, and uploads canonical JSON
in chunks of at most 500 rows and about 900 KiB. Quoted values, Unicode, CRLF,
multiline comments, BOMs, and trailing blank records are supported.

Uploads are staged by a checksum-backed batch. Repeating a chunk with the same
hash is safe; changing an already-used chunk index is rejected. Commit verifies
all rows, duplicates, checksums, and references before performing a single
database transaction. Sync is cumulative: present rows are inserted or updated,
but absent submissions and votes are never deleted or inferred as zero.
Explicit zero-point vote rows are preserved.

Failed validation is shown in import history. Correct the source file and start
a new sync; retrying an identical completed export returns its existing result.

## Public analytics

All public data pages are rendered dynamically and show a setup or unavailable
state when the database cannot be queried. URL parameters keep analytics views
shareable:

- `/` — summary, round-adjusted leaderboard, leading songs, exported point
  distribution, and vote-pattern alignment
- `/songs` — searchable, sortable, paginated song explorer
- `/players` — player directory with a configurable provisional threshold
- `/players/[id]` — cross-league player profile, directional vote patterns,
  alignment, and relative ballot order
- `league=<uuid>` and `round=<uuid>` scope every route. A round is accepted only
  when it belongs to the selected league; with all leagues selected, one round
  can still be selected directly.

### Metric definitions and limitations

- Exported points are sums of recorded vote rows. An explicit zero-point row is
  data; an absent row is not fabricated as zero.
- Eligible voter denominators count recorded rows and exclude the song
  submitter where identity permits. Positive reach is positive recorded rows
  divided by those recorded eligible rows.
- A song's support index is its share of the round's exported point pool divided
  by the equal-song-share baseline (`1 / round slate size`). `1.0` is the round
  average. Song percentiles are also calculated within the complete round
  before search and pagination.
- Player round index uses the player's share of exported round points divided by
  an equal entrant share, then averages those round-local values. The default
  non-provisional threshold is three entered rounds. These are league outcomes,
  not objective measures of musical quality.
- Vote-pattern alignment is cosine similarity over songs both voters rated,
  excluding songs owned by either voter. It is suppressed below 20 common songs
  across three rounds.
- Directional vote figures are points per recorded encounter and positive-row
  rates. Relative voting order uses each voter's latest exported `castAt` in a
  round and ranks it among observed ballot timestamps in that round.
- CSV exports do not include vote budgets, listening behavior, or reliable
  deadline context. The app therefore does not claim percentage of all possible
  votes, friendship, causality, or early/late submission against a deadline.

## Commands

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run lint` — run ESLint
- `npm run typecheck` — check TypeScript
- `npm test` — run the Vitest suite
- `npm run db:generate` — generate migrations from the schema
- `npm run db:migrate` — apply pending migrations
- `npm run db:studio` — open Drizzle Studio
