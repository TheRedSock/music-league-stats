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

Sign-in accepts at most 10 attempts per 15 minutes per client on Vercel, with a
bounded in-process limiter and an 8 KiB request limit. Self-hosted instances use
one shared bucket rather than trusting arbitrary forwarded IP headers. Multiple
instances also need a hosting-edge rate limit; in-process limits reset on restart.
Vercel client identity uses its [platform forwarding header](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).

New multi-league comparison jobs are admitted under the database advisory lock:
at most 12 starts per hour and two recently active jobs. Existing cached scopes
and resumable checkpoints remain available. Capacity messages stop automatic
polling and let the visitor choose an existing scope or try again later.

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

## Analytics refresh recovery

Imports and analytics refreshes have separate outcomes. A successful merge stays
saved even if its following analytics refresh is interrupted. The admin UI shows
HTTP errors (including non-JSON hosting errors), the failing calculation, and a
request reference where available.

Refreshes checkpoint each calculation in the same transaction as its output.
Each league has six separate calculation checkpoints. Reopening Admin and choosing
**Resume analytics refresh** continues the latest interrupted or failed checkpoint;
completed steps are retained. Keep the page open to drive the requests. Closing it
pauses the workflow after any in-flight request finishes; there is no background
scheduler. A new import invalidates old checkpoints and starts a fresh rebuild.

Analytics requests use a 60-second Vercel duration, a 35-second database statement
limit, and a 40-second calculation budget, leaving room for rollback and an error
response. Lock acquisition is bounded, and a busy advance returns saved progress.
The browser checks saved state after interrupted requests and retries transient
failures with bounded backoff. Persistent calculation failures retain their cursor
for manual resume. SQL errors and timings are logged with the job/checkpoint ID.

The optional PostgreSQL integration test uses `ANALYTICS_TEST_DATABASE_URL` pointing
to an existing migrated database. It copies input data into transaction-local
temporary tables, uses a separate advisory lock, and rolls everything back. Run
`npx vitest run src/lib/analytics-materialize.integration.test.ts` to exercise
rollback, resume, replay protection, and a complete refresh. Regular `npm test`
runs without database access and skips this opt-in test.

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
- `/relationships` — full tables for player-to-player relationship metrics,
  optionally focused from a player profile section
- `/relationships/graphs?view=progression` — per-league score timelines with
  cumulative points, tied standings, round points, player highlighting, and
  early/late points-per-round averages. Only rounds with exported votes appear;
  results may be partial. Missed rounds add zero and multiple submissions are
  summed. Selected-round subsets restart totals at zero. Early/late averages
  split the displayed rounds in half (the middle round belongs to the early
  half) and include missed rounds; they use raw, not normalized, points.
- `/facts` — submission patterns and voting quirks (appeal shape, round
  races/landslides, submission-order bias), with three-row previews and detailed tables
- `/faq` — plain-language metric explanations
- Repeated `league=<uuid>` parameters select leagues. With no selection, pages
  show all leagues; `league=all` is also supported. The selector offers Latest
  league. Public `round` parameters are retired and ignored. Progression has its
  own displayed-round subset.
- Admins can optionally store the Music League app league ID. When present,
  league and round labels link to `app.musicleague.com` using the imported round
  IDs from `rounds.csv`.

### Metric definitions and limitations

- An active ballot is any participant with at least one exported vote row in a
  round, including an explicit zero-point row. For active ballots, every scored
  submission not owned by that voter is an eligible opportunity; scored means it
  was visible to voters or has exported vote rows. Omitted rows are counted as
  zero in analytics. Submitters who never voted in a round are shown as did not
  vote and do not create zeroes. People with neither a vote nor a submission in
  a round are not treated as participants in that round.
- Eligible point totals and positive reach are calculated from those query-time
  eligible opportunities, with self-votes excluded from both numerators and
  denominators. Imported vote rows are not rewritten or expanded.
- A song's raw support index is its received points divided by the expected
  points from the actual eligible ballot budgets that could reach it. `1.0`
  means the song met expected support for that round context. Support index
  (EB) shrinks that ratio toward `1.0` with corpus-estimated sample-size
  variance (`Var(SI) ≈ τ² + φ/E`) for cross-round rankings; support z is the
  standardized surplus under the same model. Song percentiles are calculated
  within the complete round before search and pagination.
- Player round index uses the same expected-points model, summing expected
  points for all of the player's submitted songs in each round, then averaging
  those round-local values. The qualification threshold adapts from roughly half of the selected
  rounds in small scopes to one third at full scope. These are league outcomes, not objective measures of musical
  quality.
- Vote-pattern alignment compares only songs both voters could vote on, excluding
  both players' submissions and including inferred zeroes for active voters.
  Votes are divided by each ballot's point total and centered by each voter's
  mean on the pair's shared songs within that round. Cosine similarity of the
  pooled deviations removes the positive baseline from broad allocations while
  retaining vote intensity. Scores range from −100 to +100 (displayed out of 100); zero means no
  linear agreement and negative values mean opposing preferences. Rounds where
  either shared-song ballot is flat contribute neither features nor coverage.
  The existing selected-scope sample and coverage thresholds still apply.
  Mutual support remains a separate metric. Refresh analytics after deploying
  this revision to rebuild cached scores.
- Directional and mutual vote figures include points per eligible opportunity
  and positive-opportunity rates. Mutual support also shows total points and the
  share of eligible ballot points allocated to each other. Relative voting order
  uses each voter's latest exported `castAt` in a round and displays a
  tie-aware midpoint percentile among observed ballot timestamps. Submitted
  rounds with no exported vote row are shown as did not vote.
- Point-distribution charts show vote counts or vote shares with the same bar
  geometry. Shares use the votes in the displayed score range as their denominator.
  Total points are stated separately; extended mode includes zero and 5+ scores.
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

## Verification and performance checks

CI starts disposable PostgreSQL 17, applies the migrations to an empty database,
seeds deterministic fixtures, and runs the integration tests alongside unit tests.
Locally, point `ANALYTICS_TEST_DATABASE_URL` at an empty local database with a name
ending in `_test`, run `npm run test:db:prepare`, then `npm test`. The setup command
refuses non-local or non-empty databases and never deletes existing data. Tests
use temporary tables and roll their changes back. Do not point this variable at
an application database.

- `npm run db:bench` calls current application query functions inside a read-only
  transaction. `BENCH_PLAYER` selects a profile (default: theredsock), and
  `BENCH_OUTPUT` selects the JSON report path. Request memoization is inactive in
  this standalone runner, so query counts are not live-page request counts.
- `npm run bench:profile` compares the actual grouped SQL builder with the previous
  correlated calculation and requires identical results.
- `npm run bench:chunks` compares actual import chunk preparation against the
  previous implementation using synthetic rows and exact boundary/hash equality.
- `npm run bench:http` measures a production server on `127.0.0.1:3001` (override
  with `BENCH_BASE_URL`), one initial and three warm requests. It records complete
  HTML stream time and decoded/gzip sizes, not LCP. `BENCH_OUTPUT` selects the report.
- The refresh experiment is `src/lib/refresh-reuse.integration.test.ts`. It runs
  actual checkpoints against isolated temporary tables and compares every output.
  `REFRESH_BENCH_OUTPUT` optionally saves per-step timing results. The experiment's
  stored-vote alternative is not used in production: measured savings were small.

Profiles load five vote previews initially; the full list uses a validated,
25-row, searchable endpoint. Facts loads an individual 25-row detail table only
when its URL is opened, preserving category, search and pagination. Readiness is
checked for every request. The existing server analytics cache still holds complete
query results; this change reduces browser payloads without adding a second cache.
Successful refresh-step timings are saved with their checkpoint and appear in the
admin panel. No schema migration or immediate refresh is required for these changes.

For a browser regression pass, use 360/390/768/1440 px widths: inspect navigation
and long league names; search Songs to one row and open Columns; open each detail
dialog, Tab/Shift+Tab, Escape and verify returned focus; search and paginate both
profile votes and Facts; use Matrix arrows and selection; reload the League race
with an added player. Screenshots and the completed delivery log are in
`docs/delivery-evidence` and `docs/DELIVERY.md`.
