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
| 5 | Profile query grouping, import preparation, readiness reuse and retry behavior | Pending |
| 6 | On-demand details, maintained benchmarks, refresh instrumentation and measured optimization | Pending |

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
