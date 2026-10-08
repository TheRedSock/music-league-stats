# Repository improvements delivery

Branch: `codex/repository-improvements`. All implementation commits stay on this branch. No push, pull request, merge, or deployment is part of this delivery.

The baseline and detailed acceptance criteria are in [the audit](audit-2026-10-08/REVIEW.md). This log records implementation and verification as each stage is completed.

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Patched dependencies, bounded sign-in attempts and scope generation | Complete |
| 1 | Responsive navigation, accessible dialogs/popovers, accurate ranks and formatting | Complete |
| 2 | Homepage and Songs visual and editorial reference | Pending |
| 3 | Players, profiles, Facts, Compare, methodology, admin hierarchy | Pending |
| 4 | Graph defaults, legends, keyboard/touch details and URL state | Pending |
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
