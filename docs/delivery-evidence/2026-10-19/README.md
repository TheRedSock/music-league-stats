# Relative mutual support and timing verification

Screenshots use disposable synthetic fixtures, not production data. Desktop captures are 1920×1080; mobile captures are 390×844. Player 3 intentionally has four missed ballots in sixteen entered rounds. Its Order, Window and Combined averages are 42%, 40% and 41% respectively. The fixture's strongest mutual pair is Player 0 / Player 5 at 1.67× expected support (33.3% raw ballot share).

- `timing-table-desktop.png`: missed-ballot percentage sorted descending and all timing measures.
- `profile-timing-{desktop,mobile}.png`: selectable averages, missed fraction and estimated-window coverage.
- `mutual-table-desktop.png`: relative mutual support as the primary table measure.
- `mutual-matrix-{desktop,mobile}.png`: relative units, expected-support color center and contained mobile scrolling.
- `mutual-groups-desktop.png`: groups and connection weights using relative mutual support.
- `admin-voting-window-mobile.png`: a saved exact window on the local fixture. Overrides were subsequently cleared and analytics refreshed.
- `migration-upgrade.json`: additive migration preserves populated legacy values.
- `window-coverage.json`: approved read-only aggregate counts from configured Neon data; no source rows exported. Coverage does not verify actual official deadlines.

See [the delivery log](../../DELIVERY.md#stage-8--relative-mutual-support-and-timing-2026-10-19) for calculation rules, test coverage and deployment sequencing.
