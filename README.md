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
  retaining vote intensity. Scores range from −100% to +100%; zero means no
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
