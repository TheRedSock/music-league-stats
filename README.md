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
but absent submissions and votes are never deleted. Explicit zero-point vote
rows are preserved; additional zeroes are inferred only at analytics query time
for active voters who omitted eligible visible submissions.

Failed validation is shown in import history. Correct the source file and start
a new sync; retrying an identical completed export returns its existing result.

## Public analytics

Public data pages stream a static shell immediately, then load cached scoped
analytics from the database. They show a setup or unavailable state when the
database cannot be queried. URL parameters keep analytics views shareable:

- `/` — summary, round-adjusted leaderboard, leading songs, eligible point
  distribution, and vote-pattern alignment
- `/songs` — searchable, sortable, paginated song explorer
- `/players` — player directory with a configurable provisional threshold
- `/players/[id]` — cross-league player profile, directional vote patterns,
  alignment, and relative ballot order
- `/faq` — plain-language metric explanations
- `league=<uuid>` and `round=<uuid>` scope every route. With no scope
  parameters, pages default to the latest league. Use `league=all` for the full
  cross-league view. A round is accepted only when it belongs to the selected
  league; with all leagues selected, one round can still be selected directly.

### Metric definitions and limitations

- An active ballot is any participant with at least one exported vote row in a
  round, including an explicit zero-point row. For active ballots, every visible
  submission not owned by that voter is an eligible opportunity; omitted rows
  are counted as zero in analytics. Submitters who never voted in a round are
  shown as did not vote and do not create zeroes. People with neither a vote nor
  a submission in a round are not treated as participants in that round.
- Eligible point totals and positive reach are calculated from those query-time
  eligible opportunities, with self-votes excluded from both numerators and
  denominators. Imported vote rows are not rewritten or expanded.
- A song's support index is its received points divided by the expected points
  from the actual eligible ballot budgets that could reach it. `1.0` means the
  song met expected support for that round context. Song percentiles are
  calculated within the complete round before search and pagination.
- Player round index uses the same expected-points model, summing expected
  points for all of the player's submitted songs in each round, then averaging
  those round-local values. The default non-provisional threshold is three
  entered rounds. These are league outcomes, not objective measures of musical
  quality.
- Vote-pattern alignment is displayed as a percentage. It compares
  budget-normalized full-ballot vectors in the selected scope, includes inferred
  zeroes for active voters, and represents songs submitted by either player as a
  mutual-support bucket when both directions exist. It is suppressed below
  selected-scope sample and coverage thresholds.
- Directional and mutual vote figures include points per eligible opportunity
  and positive-opportunity rates. Mutual support also shows total points and the
  share of eligible ballot points allocated to each other. Relative voting order
  uses each voter's latest exported `castAt` in a round and displays its
  percentile among observed ballot timestamps. Submitted rounds with no
  exported vote row are shown as did not vote.
- Point-distribution charts group vote rows by point bucket but scale bars by
  represented points, so a two-point vote contributes twice the bar weight of a
  one-point vote. Zero buckets remain visible in extended mode but add no point
  weight.
- CSV exports do not include listening behavior or reliable deadline context.
  The app therefore does not claim friendship, causality, or early/late
  submission against a deadline.

## Commands

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run lint` — run ESLint
- `npm run typecheck` — check TypeScript
- `npm test` — run the Vitest suite
- `npm run db:generate` — generate migrations from the schema
- `npm run db:migrate` — apply pending migrations
- `npm run db:studio` — open Drizzle Studio
