# Compact VPLAY layout correction

The dual-league working tree inserted `.league-schedule` between `.market-layout`
and `.match-list`. `.odds-area` still declared
`grid-template-rows: 145px minmax(0, 1fr)` (124px summary below 820px viewport
height). CSS auto-placement assigned the flexible second row to the queue and
created an implicit third row for the fixtures. This caused the oversized gap;
it was not caused by countdowns, API data, flex growth, or absolute positioning.
The committed `96d64fa` component had no queue element in this position.

Remove the queue element and its padding/overflow rule from normal rendering.
The `useLeagueFeed` implementation and all internal queues are unchanged.

Two existing geometry rules compounded the appearance:

- `.market-tab` combined equal-width tracks with nowrap, hidden overflow and
  ellipsis. MAIN now receives a smaller share, longer names can wrap, and tab
  minimum height accommodates two lines including the bundled font's metrics.
- Fixture metadata tracks could total 378px, while headers began after a
  responsive panel plus a 20px gap (410px at 1600px width). The rows now calculate
  their team tracks from that same panel width. Outcome headers and prices also
  share the same gap and right padding. Outcome counts remain market-specific.

The league panel now includes its borders in the summary height and allows its
brand column to shrink. The status text wraps within the timer panel. The
320px betslip, competition selector/underline, feed cache, countdowns, sockets,
retries, stale-response protection and betslip clearing remain intact. No API
contracts or SQL were changed by this correction.

## Reproduction and verification

`npm run build`, then `npm run test:layout`. Install Chromium with
`npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an
existing Chromium executable. The tests serve the production build on loopback
port 3107 and intercept HTTP with deterministic ten-fixture boards and nonempty
queues for both leagues. No live bets are made.

The four browser cases cover 1600x900 and 1920x1080, each at 100% and 110% desktop
zoom geometry. Zoom is emulated with the reduced CSS viewport and increased
device scale together, including height media-query transitions; it is not a
manual browser-menu zoom check. Each case switches Champions to EPL and exercises
all six tabs, for 48 layout checks. Assertions cover zero header-to-first-row
gap, ten rows above the footer, aligned outcome/price tracks, full navigation
text bounds, no raw queue text, active red underline, and 320px betslip width.

Local before/after PNGs and measured JSON are under `.tmp/layout-screenshots`.
Before captures use the pre-fix local production bundle preserved in
`.tmp/layout-before-build`. They are **not screenshots of the live production
site**. The production URL was requested but was not available during this work;
the source comparison uses the committed component and pre-fix local bundle.

| Resolution | Zoom geometry | Before gap (CSS px) | After gap |
| --- | --- | --- | --- |
| 1600x900 | 100% | 162 | 0 |
| 1600x900 | 110% | 231.5625 | 0 |
| 1920x1080 | 100% | 342 | 0 |
| 1920x1080 | 110% | 244 | 0 |

All four browser cases pass (48 league/market/layout combinations). The full
Jest suite has 19 suites / 119 passing tests. The production build
compiles successfully. Existing tooling reports an outdated Browserslist DB,
Node deprecation notices, and React act warnings in the league tests.
