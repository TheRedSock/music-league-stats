# Repository improvements delivery

Branch: `codex/repository-improvements`. All implementation commits stay on this branch. No push, pull request, merge, or deployment is part of this delivery.

The baseline and detailed acceptance criteria are in [the audit](audit-2026-10-08/REVIEW.md). This log records implementation and verification as each stage is completed.

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Patched dependencies, bounded sign-in attempts and scope generation | Complete |
| 1 | Responsive navigation, accessible dialogs/popovers, accurate ranks and formatting | Complete |
| 2 | Homepage and Songs visual and editorial reference | Complete |
| 3 | Players, profiles, Facts, Compare, methodology, admin hierarchy | Complete |
| 4 | Graph defaults, legends, keyboard/touch details and URL state | Complete |
| 5 | Profile query grouping, import preparation, readiness reuse and retry behavior | Complete |
| 6 | On-demand details, maintained benchmarks, refresh instrumentation and measured optimization | Complete |

Verification uses the existing configured database for read-only inspection. Imports, refreshes and mutations require isolated fixtures. Each stage receives a commit only after its applicable acceptance checks pass. A limitation will be recorded explicitly rather than marked as verified.

## Stage 0

Updated Next and its ESLint config to 16.3.8, PostCSS to the patched 8.5 line, sharp to 0.35.5, and compatible transitive dependencies. Production audit: zero vulnerabilities. The full development audit retains nine affected package entries from two roots: braces (deeply nested glob input) and Drizzle's bundled older esbuild (development server). These tools process repository-controlled inputs here and the esbuild server is not used. The automatic “fixes” downgrade eslint-config-next and drizzle-kit across major versions; those downgrades were deliberately not applied. Audit JSON is saved alongside this log. Revisit when compatible upstream fixes ship.

Admin sign-in now bounds both attempts and request bytes. The limiter is per process, uses a bounded map, rejects spoofable forwarding headers outside Vercel, and returns Retry-After. It supplements rather than replaces a shared hosting-edge limit. New combination jobs use database-serialized admission (12/hour, two recently active jobs); existing cached work and recovery checkpoints are preserved. Deferred views stop polling and explain how to retry.

Validation: lint, type checking, production build, and 93 tests passed; 16 pre-existing PostgreSQL integration tests remain opt-in. New tests cover blocked login/cookie issuance, malformed and oversized input, limiter expiry/memory bounds, trusted identity handling, and scope budget boundaries. Production route smoke checks cover all main routes. No schema or live data writes were needed.

## Stage 1

The header wraps into a five-link row on narrow screens. Scope is part of each actual navigation URL, including modified clicks and copied links. Table menus use native top-layer popovers; dialogs use native modal behavior with initial focus, explicit boundary wrapping, Escape, scroll containment and trigger restoration. Adjusted rank is named explicitly, and ordinal/point formatting is shared. Route-level Suspense boundaries keep filtered navigation compatible with the patched Next release.

Validation: lint, type checking, production build and 94 unit tests passed (16 database tests still opt-in). Browser checks at 360, 390, 768 and 1440 px found no document overflow, including the latest league's long name. The one-row Columns menu remains fully visible on desktop and mobile; zero and many-row states were also checked. Tab and Shift+Tab wrap inside the profile dialog after a clean reload, Escape restores its trigger, and the background is inert. Wide detail tables scroll within the modal. Screenshots are in delivery-evidence/stage-1-*.jpg.

## Stage 2

Home now leads with standings, a compact totals strip and five players. The shared surfaces use flat backgrounds, restrained borders and square-ended bars. One league selector carries the full current name; draft selections and Apply stay inside its popover. Song identities have wrapping titles and a separate artist line. The default table has points and voters reached; sorting by an advanced measure reveals that column, while saved custom selections survive migration. Search uses Next Form navigation. Repeated methodology paragraphs were replaced with contextual links; similarity is explicitly a score out of 100, not a shared-likes percentage.

Validation: lint, type checking, production build and 94 tests passed. Real-data browser checks exercised all-league selection, latest-league long titles and adjusted-support sorting. At 390×844, the first Home player starts at y=520 and the first Songs result at approximately y=520. Width checks passed at 360/390/768/1440 px. Desktop and mobile screenshots in delivery-evidence/stage-2-*.jpg show the reference treatment. Advanced controls remain available; deeper methodology targets are completed in Stage 3.

## Stage 3

Players starts with rounds, average round index and wins; advanced sorts reveal their measure. Profiles use one summary strip and three-item comparisons. Vote distributions use the same bar geometry for counts and shares, with the displayed-range denominator and total points stated explicitly. Facts leads with three observations and four URL-backed categories; previews contain three rows and definitions are expandable. Round outcomes can be opened by keyboard or touch. Compare adds a player selector and 25-row pagination. Methodology is organized around questions with stable anchors and expandable details; README now agrees with all-league defaults and retired public round filtering.

Admin starts with CSV import and analytics status, followed by compact league rows with expandable edit forms. Secondary workflows remain available. Inspection found and fixed intrinsic grid-width overflow in both the import form and profile submission lists. No imports, refreshes, edits or enrichment were executed against the configured database.

Validation: lint, type checking, production build and 94 tests passed. Browser checks followed player search into TheRedSock's profile, focused Compare on that player, verified 25 rows plus the header, changed Facts categories, checked methodology anchors and signed into local Admin for read-only inspection. At 390 px, Players, profile, Facts, Compare, Admin and methodology all fit the document width; wide tables scroll internally. Screenshots are in delivery-evidence/stage-3-*.jpg. Closed profile/Facts detail payloads are addressed separately in Stage 6.

## Stage 4

Graphs opens on League race, showing the top five standings with distinct colors and endpoint names. Any player can be added; all-player mode remains available. League, measure, additions, focused player, inspected round, graph thresholds and Matrix selections persist in URLs. Native history handles graph-only controls without refetching the page. Mobile uses a compact view selector. Statistical cutoffs, fallback links and grouping methods are secondary controls.

Matrix has a fixed numerical color legend, distinct missing-data cells, persistent pair details, a player subset picker, arrow-key navigation and a searchable/sortable paginated table. Canvas views have a native player selector and equivalent connection tables. Flow shows incoming/outgoing point totals for qualifying connections; profiles link directly to Player connections. Canvas data is cloned before the force library mutates positions/endpoints. Decorative flow particles were removed.

Validation: production build, type checking, lint and 94 unit tests passed. Browser checks confirmed the top-five default, adding TheRedSock, switching measure and reloading with both choices restored. Matrix ArrowRight selected a negative comparison and restored it after reload; the mobile click selected the same pair. Flow selected TheRedSock and showed 1,559 received / 1,576 given points with six visible table connections. All five graph views fit at 390 px; Flow's canvas measured 333 px. Desktop/mobile evidence is in delivery-evidence/stage-4-*.jpg.

## Stage 5

Materialized and live profiles share grouped cumulative vote counts instead of four correlated calculations per song. React request memoization shares readiness reads during a render without persisting a completed flag across requests. Import preparation counts UTF-8 bytes once per row, preserving the 500-row/request-byte limits and hashes. Import finalization writes an invalidation receipt into the existing JSON summary in the same transaction as invalidation. Retries always repeat cache revalidation, but skip database invalidation once receipted and skip refresh only when current analytics are completed. This preserves recovery after a committed import or lost response; old batches finalize once. No database migration is required.

Validation: all 115 tests pass against a disposable local PostgreSQL 17 database, including the previously skipped integration suite. New tests cover tied points, inferred zeroes, multiple rounds, exact UTF-8 boundaries/hashes, failure while saving the invalidation receipt, rollback and completed-import retries. Lint, type checking and production build pass. The real-data profile still renders correctly. The actual grouped SQL builder returned exactly the same 1,109 rows: PostgreSQL execution 921.502 ms → 34.947 ms. Actual import preparation for 25,000 synthetic rows: median 4,192 ms → 44 ms, identical chunks/hashes. These are query/CPU measurements, not end-to-end page or upload claims. Evidence: delivery-evidence/stage-5-*.json. scripts/prepare-test-db.mjs creates an empty local *_test database's schema and synthetic fixtures without touching configured application data.

## Stage 6

Profile vote details now request 25 rows when opened, with server-side search/sort, cancellation, a loading state and retryable errors. Only five preview rows reach the initial browser payload. Facts renders only previews until a detail URL is opened; its tables have server-side search and 25-row pagination. Category, search and page survive copied URLs and Back. Escape returns focus to the view-all link, including direct detail visits. Compare and Facts use player slugs without additional database round trips; Home reuses slugs from its leaderboard. Shared profile count CTEs now filter their input by league, correcting a scoped-query regression found in the final benchmark. Exact-count fixtures include all, single and empty scopes.

The old 1,600-line duplicated-SQL benchmark was replaced by a runner calling current application functions in a guarded read-only transaction. Maintained commands cover SQL, chunk preparation and production HTTP. CI now provisions PostgreSQL 17 with deterministic fixtures and runs the database tests rather than silently skipping them. The fixture UUIDs were corrected to valid version/variant bits, and combination tests now explicitly assert that they exercised a multi-league key. Successful refresh timings persist with each checkpoint and completed summary; retries retain previous timings and failed work is not counted as completed. Admin exposes the totals in a secondary disclosure.

Refresh stop/go decision: do not adopt the reuse refactor. The first, broader experiment changed floating-point tie ordering in song/player rankings, so it was rejected. Narrow reuse for distributions/relationships matched all nine output tables (integers and identities exactly, floats to 10 significant digits with a 1e-10 near-zero tolerance), but two trials on an isolated local copy of the 44,298-vote dataset saved only about 2–8% of elapsed time. The latest trial was 4,032 ms → 3,695 ms, including a two-league combination; successful base checkpoint computation was 2,220 ms → 1,966 ms. These exclude hosted network/request pacing. The alternative remains in the benchmark test only; production calculations are unchanged. The isolated copy was created through a read-only source transaction, used only for the experiment, and removed after verification. Synthetic fixtures remain the reproducible CI input.

Validation: 120 tests pass with PostgreSQL enabled; lint, type checking and production build pass. Browser checks confirmed profile page 2 contains 25 rows, artist search returns the expected song, Facts search resets page, page 2 has 25 rows, Back restores an open searched dialog, Escape returns focus, and 390 px views fit the viewport. API tests cover malformed/unbounded searches, empty results, pagination and 503 during refresh. Earlier stage screenshots cover 360/390/768/1440 px layout and graph keyboard interactions. No configured-database imports, refreshes, enrichment or schema mutations were performed.

Production-mode localhost measurements against the same source data:

| Initial route response | Audit decoded HTML | Delivery decoded HTML | Reduction | Calculated gzip, before → after |
| --- | ---: | ---: | ---: | ---: |
| Profile, all leagues | 1,393,248 B | 205,100 B | 85.3% | 197,374 → 29,562 B |
| Facts | 1,936,599 B | 82,512 B | 95.7% | 132,357 → 15,877 B |
| Compare | 990,923 B | 157,309 B | 84.1% | 44,143 → 22,931 B |

Warm complete-stream times were 164–181 ms for the profile, 79–99 ms for Facts and 79–103 ms for Compare in the recorded run. The profile's uncached all-league loader measured 480–885 ms versus the audit's 1,608–1,739 ms; the latest-league loader measured 393–431 ms versus 424–482 ms. Network variability remains visible in the raw samples. The server cache still contains full query results, so this is a browser-payload reduction, not an elimination of all database-to-server profile data. Graph payloads did not shrink materially; the added Bubbles controls/table increase its decoded response by about 7%.

Limits: HTTP measurements are complete HTML stream times on localhost, not LCP, mobile CPU traces or deployed cold-start measurements. The available browser tooling supplied viewport, DOM and screenshot checks but no network/CPU throttling. Deployed validation is intentionally outstanding because this delivery must not trigger CI/deployment. No remote cache, connection-pool increase, full analytics-module rewrite, staging-data purge or revision-retention redesign was introduced. Selective metadata invalidation remains a follow-up: the current denormalized names/enrichment require coherent invalidation. Development dependency advisories and the per-process sign-in limiter's scope remain as documented in Stage 0.


## Stage 7 — Review follow-up (2026-10-08)

Implemented the 21 follow-up notes as one acceptance checkpoint on the delivery branch:

- **Home (1–2):** five standout songs; submitter links share the artist line. The two panels keep their natural heights instead of stretching the points distribution to match the list.
- **Compare (3–4):** the focus form sits opposite the heading on desktop and stacks on mobile. Support/Mutual link to a new support explanation, similarity to voting similarity, timing to timing. Hover explanations use plain language.
- **Graphs (5):** the league selector moves into the graph header, with measure and player controls on the right at desktop widths. Full league names remain in dropdown options; the closed selector truncates to fit.
- **Facts (6–9):** Voting is first and the default, followed by Artists, Rounds, Songs. Highlights change with the category and link to Spotify tracks/search, Music League rounds, or player profiles. Voting highlights avoid repeating the same song. Long titles are capped at two lines in previews; full titles remain in accessible link text and hover titles. The densest-round plural now renders correctly.
- **Songs and Players (10–16):** Columns shares the count/pagination toolbar outside the table. The unconditional scroll instruction is removed. Both tables use an untitled visual row-number column that follows sorting; Songs carries its number across pages. Songs defaults to adjusted support, migrating old defaults while keeping custom column selections. Desktop song/artist and league/round pairs sit inline; voter counts move into hover/accessible text. Songs uses more of a wide screen and 41 px rows rather than roughly 73 px. A 1920×1080 viewport shows about 18 rows instead of 10. Small screens retain contained horizontal scrolling.
- **Profiles (17–19):** “Best and worst songs” replaces “Submission range”; comparison panels have explicit View all links. “When they vote” leads with average ballot position on an early/late scale, followed by earliest/latest rounds. View all opens a searchable, 25-row paginated list on the profile route. Full round tables are server-rendered only when requested, preserving Stage 6's payload approach. Compare players links to the full timing comparison.
- **FAQ (20):** fragment destinations receive a short fade and persistent subtle tint, with animation disabled for reduced-motion preferences. A small client handler supports Next client navigation, native hash changes, same-page topic links and history; CSS :target alone failed the actual cross-route browser check.
- **Spotify enrichment (21):** retained the optional all-tracks check, with likely collaborations still the default. Artist enrichment replaces exported artist strings with Spotify credits for artist facts (counts, repeat-artist and distinct-artist facts); it does not enrich song scoring, timing, or voting metrics. A plain-looking name can still hide extra credits or differ from Spotify's name, so all-tracks has a limited corrective use. Read-only inspection found 434 successful enriched tracks, all detected as ambiguous, and zero already-checked plain-name tracks. The incremental benefit for the remaining 1,947 tracks therefore cannot be quantified from existing results. No enrichment job was run. Admin now states this limited purpose instead of implying additional metrics.

Acceptance checks: production build and TypeScript pass; repository lint passes without warnings; 101 tests pass, with 19 database tests skipped because the disposable database is not running (this stage changes no SQL, imports or refresh calculations; Stage 6 ran all 120). Browser checks use real rendered data at 1920×1080 and 390×844, with an additional 1440 px Admin check. Verified five Home rows and scoped submitter URLs; Songs page two starts at 26; Players alphabetical sorting starts with row 1; mobile Columns opens within the viewport; all Facts categories change highlights; densest rounds reads “54 songs from 27 submitters”; the profile timing list has 80 rows over four pages, search for fall-2026 returns six, and Escape closes it and restores focus. Compare and Graphs controls fit mobile without document overflow. The FAQ timing link highlights the correct question near the bottom of the page. Admin's all-tracks explanation was inspected without submitting a job.

Screenshots: `delivery-evidence/followup-*.png`. Main is unchanged; no push, deployment, configured-database write, import or refresh was performed.


### Songs width and footer refinement

Removed the Songs-only 1,500 px maximum width: the page now uses the same 1,280 px container as the header and other pages. The measures note and FAQ link share a footer row with pagination; controls wrap when both Previous and Next need more room on mobile. Statistical surprise remains opt-in, with adjusted support as the default optional column.

Validation: type checking, targeted ESLint and diff checks passed. Browser measurements at 1920×1080 confirm identical header/page bounds and aligned note/Next centres. At 390×844, the note and Next also share a row with no document overflow; pagination remains usable on page two. Evidence: `delivery-evidence/songs-shared-width-footer-*.png`.
