# Music League repository review and improvement plan

8 October 2026. Proposal based on the running application, its real league data, source inspection, and read-only measurements. Application code and database contents were not changed.

The strongest direction is a music club's results archive: readable standings, prominent songs and artists, and a few discoveries worth opening. The application already has enough useful functionality and distinctive data. Its generic feel comes mainly from giving every feature the same visual weight, putting statistical explanations before the results, and exposing implementation choices as ordinary controls.

Prioritize the shared layout, table defaults, language, and chart defaults. Keep the existing statistical models and interactive views. For performance, two small prototypes produced substantial improvements in isolated calculations; these deserve implementation before a wider architecture project.

[Open the annotated screenshot gallery](C:/GIT/music-league-stats/docs/audit-2026-10-08/gallery.html). It contains 20 captures, including desktop, mobile, dialogs, all five graph views, admin, and FAQ.

## Recommended first changes

| Order | Change | Why it earns its place |
| --- | --- | --- |
| 1 | Fix mobile navigation, clipped menus, rank labels, and dialog focus | These are observed usability defects, independent of aesthetic preference. |
| 2 | Redesign the homepage and Songs table as the visual reference | They establish hierarchy, typography, spacing, scope controls, and the balance between ordinary and advanced statistics. |
| 3 | Apply the same editorial approach to Players, profiles, Facts, and Compare | This removes the repeated explanation and card patterns responsible for much of the generic feel. |
| 4 | Improve graph defaults and selection, preserving the existing renderers | Progression became much more readable using controls already present. |
| 5 | Group profile calculations and fix import chunk sizing | Both have measured, substantial local gains and bounded implementation scope. |
| 6 | Stop loading hidden detail tables and deduplicate readiness reads | Improves both the interface and the amount of data/work required for initial views. |

Dependency maintenance should run as a separate small change alongside this work. A full cache, import, or framework rewrite is not justified by this audit.

## What creates the generated feel

This is a design judgment, not a claim that a screenshot can establish who or what wrote the site. Several individually reasonable conventions combine into a recognizable generic dashboard treatment.

**Every section uses the same presentation.** Dark translucent panels, large rounded corners, subtle borders, lime actions, purple/lime background glows, small icons, uppercase metadata, and explanatory subtitles recur almost everywhere. A major result, a filter, an explanatory aside, and a secondary statistic all look like peers. On Facts, this becomes a long sequence of similarly sized panels with similarly structured top-five lists.

**The site explains its machinery before satisfying curiosity.** Visitors meet eligible opportunities, empirical-Bayes shrinkage, centered cosine similarity, feature counts, and connection budgets before they have a reason to inspect those concepts. Much of the explanation is correct. Its placement makes the interface read like a technical handover document.

**The most human material gets the least room.** This league already has names such as “Speedfam I'm about to cook some dinner so I have to hurry up and make this league.” Song titles, artists, round themes, and player names supply personality without invented slogans. The tables truncate them to make room for several derived metrics of similar visual weight.

**Completeness substitutes for selection.** Twenty-seven progression lines, nine initial Songs columns, ten Players columns, hundreds of comparison rows, and repeated qualification notes say “everything is available.” They rarely tell the visitor where to look first. The consequence is visual sameness as well as cognitive load.

**Copy repeatedly anticipates objections.** Explanations restate qualifications and warn against interpretations across multiple surfaces. Keep the actual limits close to the relevant statistic, but provide the full model and its limitations in one accessible methodology location. Progressive disclosure is an established approach for keeping common tasks clear while preserving specialist options; it is not a reason to hide controls that people use frequently. [Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)

## Proposed visual and editorial direction

Use a restrained results-sheet style with character supplied by the music and league history. Keep the dark background if desired; dark mode is not the problem. Use flat surfaces, clearer dividers, larger song titles, fewer all-purpose containers, and a more deliberate relationship between large headings and compact numerical columns. Keep tabular numerals for comparisons, but stop making every supporting number look like a diagnostic readout.

Use one accent for navigation and selection. Reserve additional colors for actual meaning in charts, and accompany color with labels, line styles, or symbols. Remove page-wide purple/lime glows and decorative icon badges where they add no information. Cards still make sense for a discrete discovery or an interactive graph; a table and each of its controls do not all need their own card.

Avoid a wholesale switch to another fashionable template. Beige paper, a large serif heading, and random album art could be just as generic. A louder music-zine direction could work later, but it adds artwork, layout, and visual-density work without resolving the current hierarchy problems. The results-sheet direction is a better first investment.

Suggested homepage order:

1. Page title and one league selector. Keep the full league name available and allow wrapping. Make “All leagues” an explicit, clear choice. Whether the landing default should become the latest league is a product decision; preserve existing default behavior in the first pass.
2. One compact context line, such as “9 leagues · 80 rounds · 54 players,” instead of five equal summary cards.
3. The standings, with a clearly selected ranking measure and enough rows visible immediately to establish what the page is for.
4. A smaller songs section with song, artist, submitter, and one selected measure. Show the round theme without requiring a hover.
5. One discovery or entry into the interactive comparisons. Do not display every analytical capability on the homepage.

On mobile, the first meaningful leaderboard rows should appear within the initial 844 px viewport. Use a deliberate compact navigation pattern; making the entire document wider than the screen is not a navigation pattern. A wide analytical table can retain an obvious internal horizontal scroll area with a pinned identity column.

## Page review

| Surface | Observed behavior and effect | Proposed change |
| --- | --- | --- |
| Dashboard | Summary cards and explanations dominate the top. At 390 px wide, the leaderboard heading begins at y=882. The main leaderboard starts with total points while the songs section promotes an adjusted measure without a simple shared explanation. | Compact context line; standings first; separate total-points and adjusted views with short, consistent labels. Reduce each section to one useful introduction, if one is needed. |
| Songs | Nine default columns compete with truncated song, artist, and round names. Positive reach is rendered as “16/21 rows.” A sort dropdown duplicates column sorting. Scope and search each have an Apply action. | Default to Song/artist, Player, Round, Points, and Voters reached. Keep adjusted support readily selectable; put the other measures in Columns. Let the current sort metric appear when selected. Use “16 of 21 voters.” Consolidate the control layout and distinguish changing league from searching. |
| Players | Sorted by Points, the first visible rank values are 03, 05, 04, 11 because the column displays adjusted performance rank. Participation qualifications recur above and below the results. | Show rank for the selected ranking, or label the existing field “Adjusted rank.” Keep participation near the player and one explanation next to the ranking control. Reduce initial metrics to those needed for the selected comparison. |
| Player profile | Six summary cards, equally prominent best/worst sections, dense distribution explanations, and a “View all (1109)” vote dialog. Visible copy includes “52th” and “1 pts.” | Player identity plus a compact statistics line; best submissions and supporters first; expand the full history when requested. Use “Low-scoring entries” only where useful. Correct ordinals and singular units. Do not require a long modal for an extensive history. |
| Facts | Seventeen panels plus section headings. Repeated top-five structures and dense notation compete with more interesting artist and round facts. “Player artist streaks” counts repeats, not consecutive streaks. “Playlist-position bias” implies more than a correlation establishes. | Lead with three or four varied highlights. Group further exploration into Artists, Songs, Rounds, and Voting. Use “Most repeated artists” and “Playlist position and points.” Keep calculated observations factual and avoid generated narrative filler. |
| Compare | A very large initial table; the general landing view does not establish whose relationships to inspect. Methodological qualification occupies prominent space. | Add a visible player focus/search control and paginate to 25–50 rows. Name the active question, such as who gives points to whom. Show the measure and sample coverage beside results, with the formula available on demand. |
| FAQ | Seventeen explanation cards precede a glossary. The “short explanations” promise is undermined by long paragraphs and formulas. Some descriptions no longer match behavior. | Rename to “How the stats work” or retain FAQ with task-oriented questions. Start with “Why do the rankings differ?” and “What does this number mean?” Put formulas and inference rules in expandable sections with stable links from controls. |
| Admin | Create league comes first, followed by nine complete edit forms. At 1440 px wide, analytics refresh begins around y=4130 and CSV sync around y=4807. Anchor links help but do not fix the default workflow. | Start with current league, CSV import, and refresh status. Replace the repeated forms with a compact league list and an Edit action. Move Spotify enrichment, player overrides, and detailed logs to secondary sections. Preserve resumability and clear failure recovery. |

The Songs search, league selection, player profile navigation, graph mode changes, progression controls, and profile dialog were exercised in the browser. Admin was inspected after signing in; imports, enrichment, edits, and refresh were not executed.

### Graph review

The graphs are among the site's strongest distinguishing features. Improve how people enter and read them before considering replacement.

| View | Observed issue | Better default and interaction |
| --- | --- | --- |
| Progression | The latest league initially shows 27 lines with eight reused colors and dashes, plus 27 player chips. Switching to the top five and Standing made the race immediately readable. | Start with five to eight contenders, allow any player to be added, and retain “All players.” Label the ends of the main lines. Keep selected league/player/measure in the URL. Name the view “League race” or “Standings over time.” |
| Bubbles | A 50% slider setting translates to a 17.6% cutoff in the inspected scope. Community detection algorithms and connection budgets are exposed as ordinary controls. | Lead with “Who votes alike,” a short legend, and player search. Call the control “Fewer / more connections.” Put algorithm choice and exact cutoff in Advanced options. Preserve the distinction between similarity and real-world friendship. |
| Flow | Main and fallback arrows require substantial prose to interpret. The graph occupies a relatively small portion of a large padded area. | Lead with “Who backs whom.” Give the graph more room, keep the arrow legend nearby, and reveal a focused player's incoming/outgoing totals on selection. Avoid requiring visitors to understand fallback edge construction. |
| Matrix | A small grid sits within a much larger panel. Labels are tiny and vertical. There is no sufficiently explicit numerical color legend; hover is the main way to inspect a cell. | Add a labeled divergent scale with a neutral midpoint and distinct missing-data treatment. Enable tap/keyboard selection and a persistent pair detail area. Support a player subset and an equivalent sortable table. |
| Ego | Focusing TheRedSock produces a manageable four-connection view. “Ego” names the graph model rather than the visitor's task. Focus is local state. | Call it “One player” or “Player connections,” link directly from profiles, and encode the focused player in the URL. Keep negative alignment explicit. |

The tab ordering also deserves attention: Progression is first in the tabs while Bubbles is the default view. Choose one deliberate starting view. Graph selection should follow the question being asked rather than the name of the renderer.

See the existing application's [all-player progression](C:/GIT/music-league-stats/docs/audit-2026-10-08/screenshots/12-progression-all-players.jpg) and [top-five standings view](C:/GIT/music-league-stats/docs/audit-2026-10-08/screenshots/13-progression-top-five.jpg). These are observed states, not redesign mockups; both player count and the plotted measure changed.

## Copy and metric rules

Give each metric one public label, one short explanation, and one detailed definition. Shortening labels must not change the underlying claim. In particular, cosine similarity is not the percentage of songs two people both liked, and an adjusted support estimate is not an exact observed multiplier.

| Current wording | Proposed public wording | Detail to retain when requested |
| --- | --- | --- |
| Vote-pattern alignment | Voting similarity | Centering, cosine, shared-song coverage, inferred zeroes, and the −100 to +100 range. |
| Top aligned ballot patterns | Most similar voting | Qualification floor and how ties are ordered. |
| Support (EB) | Adjusted support | “Accounts for round size and reduces small-sample extremes.” Explain the estimate, baseline, and formula in methodology. |
| Support z | Statistical surprise | The actual null model and units. Keep this out of the default table. |
| Positive reach, 16/21 rows | Voters reached, 16 of 21 | Only eligible active voters are in the denominator. |
| Exported points | Points | Explain exports and inferred zeroes when they affect interpretation. |
| Entered rounds | Rounds played | Retain the precise participation definition in methodology. |
| Player artist streaks | Most repeated artists | Counts and distinct rounds; do not imply consecutive rounds. |
| Playlist-position bias | Playlist position and points | Correlation, sample size, and inability to infer a causal effect. |
| Fetching selected scope from database… | Loading results… | Database details belong in logs. |
| Precomputed stats / scope key / unlock wording | Results are updating | Show useful progress and the next action when a refresh fails. |

For an ordinary results section, a title and visible units may be sufficient. Put qualifications next to the control or result they qualify; do not repeat the same explanation in an introduction, tooltip, footnote, and FAQ. For a short sample, “Based on 3 rounds” is more useful than a paragraph defending the word “provisional.”

Fix documentation drift during this pass: README describes a latest-league default and round filtering, while the current public parser defaults to all leagues and retires round filters. FAQ says Songs defaults to EB ordering, while the inspected default is total points. FAQ's graph list omits Progression. Its glossary still mentions round scope.

## Functional corrections

These findings have clearer acceptance criteria than the aesthetic recommendations.

| Priority | Finding and evidence | Correction and verification |
| --- | --- | --- |
| High | At 390 px viewport width, the document is 531 px wide. Header links extend beyond the screen; following Songs can leave the page horizontally shifted. [Mobile dashboard](C:/GIT/music-league-stats/docs/audit-2026-10-08/screenshots/15-dashboard-mobile.jpg) | Adapt the header; verify 360, 390, 768, and 1440 px with long league names. Only designated table containers may scroll horizontally. |
| High | After searching for Fabienk in the latest league, Columns is clipped after roughly two choices because the short table container clips its absolutely positioned menu. [Screenshot](C:/GIT/music-league-stats/docs/audit-2026-10-08/screenshots/17-song-search-columns.jpg) | Use a properly positioned popover/portal or remove the clipping ancestor without breaking table scrolling. Test zero, one, and many rows, Escape, focus, and viewport edges. |
| High | Opening the profile votes dialog leaves focus on its trigger outside the dialog. The shared component has no focus entry, trap, or restoration. | Use native dialog behavior or a proven accessible primitive; test Tab, Shift+Tab, Escape, and return focus. Modal content should contain keyboard focus and make the background inert. [W3C dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) |
| Medium | Players' generic Rank column shows adjusted rank while another metric controls order. | Make the label unambiguous or derive ordinal position from the active ranking, respecting ties and qualification. |
| Medium | Profile distribution copy says bars/ratios are weighted by represented points, while bar heights use bucket counts and the pie uses vote shares. | Label the actual quantity. Prefer the same bar geometry for count and percentage modes; show total points separately. |
| Medium | Matrix details are mouse-hover driven, and canvas graph information lacks a complete keyboard equivalent. | Provide selectable details and a table alternative; test keyboard and touch. Do not rely solely on native title tooltips. |
| Medium | ScopedLink writes scope into a normal-click handler but leaves its actual href unscoped. Modified clicks and copied URLs therefore lose scope; prefetch also uses the other destination. This is source-confirmed. | Construct the scoped href itself, then let Link handle normal browser semantics. Test open-in-new-tab, copy link, back/forward, and ordinary navigation. |
| Low | Ordinal and plural rendering produces “52th” and “1 pts.” | Share a small formatter and verify 1st/2nd/3rd/11th/12th/13th/21st/52nd and singular units. |

Relevant source: [header](C:/GIT/music-league-stats/src/components/layout/site-header.tsx), [column picker](C:/GIT/music-league-stats/src/components/analytics/table-column-picker.tsx), [dialog](C:/GIT/music-league-stats/src/components/ui/dialog.tsx), [Players rank](C:/GIT/music-league-stats/src/components/analytics/players-table.tsx:55), [ScopedLink](C:/GIT/music-league-stats/src/components/analytics/scoped-link.tsx), and [distribution chart](C:/GIT/music-league-stats/src/components/analytics/point-distribution-chart.tsx).

## Performance measurements

The dataset contains 9 leagues, 80 rounds, 54 players, 2,406 songs, 25,105 exported vote rows, and 44,298 effective vote rows. The inspected latest league has 182 songs and six scored progression rounds. This is small enough that specific redundant work is a better first target than infrastructure expansion.

Production measurements used a local Next production server, one initial request and three subsequent requests per route, without network throttling. “Complete” means receiving the complete HTML stream. These are not browser LCP, mobile CPU, deployed cold-start, or p95 measurements. The first request for a route may benefit from caches populated by earlier routes. Sizes are decoded response bytes; gzip is calculated locally, not an observed transfer size.

| Route | First complete | Warm complete range | Decoded HTML | Calculated gzip |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 2,009 ms | 148–158 ms | 146 KB | 25 KB |
| Songs | 258 ms | 76–84 ms | 176 KB | 28 KB |
| Players | 400 ms | 79–84 ms | 159 KB | 24 KB |
| TheRedSock profile, all leagues | 1,925 ms | 184–199 ms | 1,393 KB | 197 KB |
| Facts | 523 ms | 161–193 ms | 1,937 KB | 132 KB |
| Compare | 371 ms | 120–131 ms | 991 KB | 44 KB |
| Graphs, Bubbles | 854 ms | 77–82 ms | 209 KB | 31 KB |
| Graphs, Progression | 547 ms | 81–92 ms | 584 KB | 34 KB |
| FAQ | 10 ms | 2–3 ms | 62 KB | 12 KB |

Warm headers commonly arrive in 2–4 ms, well before results finish. Fast shell delivery is useful but does not establish that the meaningful content is ready. Facts, profiles, and Compare are the obvious payload targets. Compression helps transfer size but does not remove serialization, parsing, or hydration work.

Read-only calls to the actual uncached analytics functions also isolated database work. The all-leagues profile took 1.61–1.74 seconds and returned about 1.25 MB of JSON. Songs took 181–598 ms across three samples; dashboard 253–324 ms. A materialization-status read alone took about 65–76 ms. These calls ran on one guarded transaction connection without React request memoization, so their query counts must not be read as exact live-page query counts.

### Changes worth implementing

| Change | Evidence and expected benefit | Effort and trade-off |
| --- | --- | --- |
| Group profile vote calculations | The isolated existing calculation executed four correlated subplans for each of 1,109 rows. Grouped counts/windows returned identical rows and reduced PostgreSQL execution from 1,000.792 ms to 35.836 ms. This is about 96% less time for that calculation, not the whole profile page. | Small–medium, roughly 0.5–1.5 focused days including edge cases. No intended semantic change. Test ties, zeroes, scopes, and players with sparse histories before adopting. |
| Measure import chunk bytes incrementally | Current makeChunks repeatedly clones and serializes the growing chunk. For synthetic 25,000-row input, median preparation time fell from 5,774 ms to 72 ms; for 5,000 rows, 875 ms to 14 ms. Chunk boundaries and hashes matched, including Unicode and byte-limit cases. | Small, roughly half a day. Preserve 500-row and 900 KiB limits, checksums, and oversize-row errors. This is CPU preparation, not upload or database commit speed. |
| Load detailed lists on demand | A profile initially carries all 1,109 highest-vote rows. Facts passes large detail trees through client disclosure boundaries. Closed dialogs can still carry serialized data. Compare renders a large unpaginated result. | Medium, around 1–2 days across these surfaces. Load previews and counts initially; paginate detail. First opening can require another request, so provide a clear loading state and cache results. Hiding elements with CSS or merely lazy-loading a component is insufficient. |
| Deduplicate materialization status within a request | loadAnalytics queries readiness outside the cached loaders. Homepage calls it for dashboard and alignment. Internal materialization checks also repeat. A status round trip measured roughly 65–76 ms. | Small, around half a day. Share a request-memoized status accessor. Removing one serial duplicate can save roughly one round trip in this environment; cross-request caching is a separate decision. |
| Avoid an unnecessary refresh on a completed import retry | commitImportBatch returns an already-completed summary, but its route still invalidates analytics and the client proceeds to refresh. | Small–medium. Skip only when both data commit and subsequent invalidation are known complete and analytics is current. Preserve the existing recovery path for a committed import whose invalidation failed. |
| Reuse materialized vote facts during refresh | Refresh first builds effective votes, then several later calculations reconstruct opportunity CTEs from raw data for all leagues and individual leagues. | Medium, time-box investigation to about one day before implementation. Reuse the canonical facts only after checking exclusions, inferred zeroes, denominators, and global EB variance. No percentage improvement established yet. |

The profile prototype is deliberately isolated: its original form reproduces four expensive calculations, not every join in the full profile query. Existing submission lookups use index skip scans with substantial repeated index searches; they are not simply four full-table scans per row. A submission-leading index may be useful, but first adopt the measured grouping and inspect the remaining plan. Indexes have storage and write costs.

Two recent completed analytics jobs span approximately 142 and 173 seconds from started_at to completed_at. These are wall intervals that can include client pacing and network time, not pure query runtime. Instrument individual step durations and rows processed before promising refresh acceleration. The current checkpoint model and recovery behavior are valuable.

Source entry points: [profile calculations](C:/GIT/music-league-stats/src/lib/analytics.ts:2399), [readiness wrapper](C:/GIT/music-league-stats/src/lib/analytics.ts:979), [internal readiness check](C:/GIT/music-league-stats/src/lib/analytics.ts:1615), [chunk preparation](C:/GIT/music-league-stats/src/lib/import-client.ts:59), [completed commit shortcut](C:/GIT/music-league-stats/src/lib/import-commit.ts:235), [commit route](C:/GIT/music-league-stats/src/app/api/admin/imports/[batchId]/commit/route.ts), and [materialization](C:/GIT/music-league-stats/src/lib/analytics-materialize.ts).

### Cache and refresh constraints

Do not hide readiness reads behind a long-lived cache without coordinating invalidation. The current refresh clears live materialized tables and rebuilds them in stages. A stale “completed” flag could expose incomplete results. Request-level deduplication is the low-risk first change; any cross-request cache needs invalidation for pending, processing, failed, and completed states.

Serving the previous completed revision during a refresh would improve availability, but it requires retaining separate revisions and switching atomically. That is a larger data-lifecycle change, not a quick caching flag. Defer it unless refresh interruptions are a frequent user problem.

The repository uses Next's cache facilities already. Warm local timings do not establish cache reuse across production instances. Current Next documentation describes the default server cache as in-memory; a remote cache is an additional deployment choice. Measure actual hit rates and cold-instance behavior before adding Redis or another service. [Next use cache documentation](https://nextjs.org/docs/app/api-reference/directives/use-cache)

Further bounded improvements include using canonical player slug links consistently to avoid UUID redirects, and making cache invalidation more selective after metadata edits. Treat both as follow-ups after the measured wins; denormalized names and artist enrichment must remain coherent.

Do not increase the three-connection pool blindly, parallelize chunks that lock the same import batch, precompute every league combination, or rewrite the app as a different rendering framework. The chunk route's batch lock serializes work deliberately. Nine leagues already allow 511 non-empty combinations. The retained 37,513 staging rows across 15 batches are a lifecycle consideration, not evidence of an urgent performance bottleneck.

## Repository maintenance and security

The existing foundation has useful safeguards: transactional/idempotent imports, resumable refresh steps, signed admin sessions, parameterized query construction, cached materialized analytics, and tests around statistical semantics. Preserve them through refactoring.

The production dependency audit reports five affected packages: one critical and four high at package level. These are not five verified exploitable application vulnerabilities. Next 16.2.11 and the resolved transitive packages need a maintenance pass. The flagged Windows RCE advisory requires running without Cache Components; this repository enables them, so it does not match that stated condition. Another cache-poisoning advisory concerns Pages Router SSG/ISR deployments; this app uses App Router. Assess each advisory against the actual deployment rather than treating the audit total as proof of exposure. [Official Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [official cache-poisoning advisory](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676)

Update Next and its matching ESLint configuration to a supported patched release, refresh the lockfile and explicit overrides, and run the existing checks plus route smoke tests. The sharp advisory identifies 0.35.5 as the patched version for its librsvg issue; actual exposure depends on image-processing and runtime conditions. No next/image or next/og application use was found in the inspected source, but version maintenance remains worthwhile. [Official sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)

The admin sign-in route has no application-level attempt limiter. If the deployed endpoint is publicly reachable, add a bounded rate limit at the hosting edge or authentication boundary; the deployment may already provide one. Public requests can also advance materialization for previously uncached multi-league scopes. That couples viewing results to expensive work. Add bounds and deduplication around that path before opening arbitrary scope generation to substantial crawler traffic. This is a resource-control concern, not a demonstrated authentication bypass.

The large analytics module combines models, query selection, status handling, transformations, and several variants of similar SQL. Split it incrementally along boundaries touched by real changes: shared eligibility/model definitions, materialized queries, profile details, and presentation labels. File splitting alone will not reduce database time.

The existing db-bench script duplicates substantial query logic, including an older alignment approach. Prefer benchmarks calling current application functions or shared query builders, with clearly labeled scope and revision, so optimization decisions are not made against obsolete SQL. Keep the audit prototypes as evidence, then move useful measurements into a maintained harness if adopted.

CI currently runs lint, type checking, unit tests, and a build. The audit run passed all four: 86 tests passed and 16 database integration tests were skipped across two suites. Add a small set of meaningful browser checks for the observed failure modes and run integration tests against a dedicated disposable database. A production-data audit should not become an integration fixture.

## Delivery plan and acceptance criteria

Effort ranges below are rough focused engineering time, not calendar commitments. Each change should remain independently reviewable. Prefer several small improvements to one large rewrite.

| Stage | Scope | Rough effort | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Shared navigation, popovers/dialogs, rank and formatting corrections | 1–2 days | No page overflow at 360/390/768/1440 px; complete Columns menu with one row; keyboard focus stays in dialog and returns correctly; ranking label matches meaning. |
| 2 | Homepage and Songs visual/editorial reference | 1–2 days | First meaningful rows visible on a 390×844 screen; song and artist names dominate identity cells; advanced calculations stay accessible; one clear scope state; no repeated methodology paragraphs in the normal reading path. |
| 3 | Players, profiles, Facts, Compare, FAQ, and admin hierarchy | 2–4 days, separable by route | Consistent metric labels; accurate units; compact previews; three or four leading Facts highlights; routine import/status work visible first; documentation agrees with defaults. |
| 4 | Graph defaults, legends, selection, and shareable state | 1–2 days | Top-five/eight progression readable; any player can be added; negative/zero/missing values distinguishable; selected pair/player available by keyboard and touch; URL restores the chosen view. |
| 5 | Profile SQL, chunk preparation, and request-level readiness reuse | 1–2 days | Exact result equality on representative fixtures; benchmark improvement retained; duplicate readiness reads reduced; chunk hashes/limits unchanged; retry recovery preserved. |
| 6 | Detail loading and refresh investigation | 1–3 days plus a stop/go decision | Profile/Facts initial responses omit unopened full lists; details remain searchable/paginated; actual per-step refresh costs recorded. Continue refresh refactoring only for a material measured gain. |

Stages 3 and 4 can be selected according to which pages people use most. If limiting the first batch, choose stages 1, 2, and the two measured optimizations from stage 5. They establish the direction, fix concrete breakage, and capture the clearest performance gains.

For the design review, use the same real long titles and the same scopes shown in these screenshots. Compare the first viewport and a complete task: find a player, identify a winning song, compare two voters, and inspect a historical vote. Judge whether the important content is easier to find and read, not just whether the new palette looks different.

For performance validation, repeat these measurements against the same data and build mode, then add a throttled mobile browser trace and a deployed warm/cold sample. Do not set a whole-site speed target from the isolated SQL or chunking figures. Record result readiness, transferred bytes, and interaction responsiveness separately.

## Evidence and reproduction

- [Screenshot gallery](C:/GIT/music-league-stats/docs/audit-2026-10-08/gallery.html): all 20 captures, labeled with the observed state and relevant finding.
- [HTTP results](C:/GIT/music-league-stats/docs/audit-2026-10-08/http-measurements.json) and [measurement script](C:/GIT/music-league-stats/docs/audit-2026-10-08/measure-http.mjs): production localhost measurements.
- [Uncached query results](C:/GIT/music-league-stats/docs/audit-2026-10-08/query-measurements.json) and [measurement script](C:/GIT/music-league-stats/docs/audit-2026-10-08/measure-analytics.ts): actual application functions in a PostgreSQL read-only transaction.
- [Profile query comparison and execution plans](C:/GIT/music-league-stats/docs/audit-2026-10-08/profile-query-comparison.json) and [prototype](C:/GIT/music-league-stats/docs/audit-2026-10-08/measure-profile-query.mjs): isolated grouped calculation, exact equality for the inspected player and all-leagues scope.
- [Chunking comparison](C:/GIT/music-league-stats/docs/audit-2026-10-08/chunking-comparison.json) and [prototype](C:/GIT/music-league-stats/docs/audit-2026-10-08/measure-chunking.mjs): synthetic CPU benchmark with equivalence checks.
- [Dependency audit](C:/GIT/music-league-stats/docs/audit-2026-10-08/dependency-audit.json): npm production dependency audit as of 8 October 2026.

Run the .mjs scripts from the repository root using Node. The HTTP script expects the production server on 127.0.0.1:3001. The query scripts load the existing local environment and require database access; both enforce read-only transactions and a statement timeout. They add read load and should be run deliberately. The TypeScript query harness can run through tsx; this Windows sandbox required bundling it with the installed esbuild before execution because tsx's user-info lookup failed. Synthetic chunking requires no database.

The browser review covered the ready state and real interactions, not a full accessibility certification or every failed-import scenario. No live import, enrichment, refresh, schema change, or load test was performed. The only repository additions are this audit, screenshots, and measurement artifacts.
