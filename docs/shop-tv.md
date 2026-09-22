# Virtual Horizon Shop TV / WebViewer

## Routes and operation

- `/tv`: four-channel selector, browser fullscreen request, rotation settings.
- `/tv/21/standard`, `/tv/21/correct-score`: Champions.
- `/tv/78/standard`, `/tv/78/correct-score`: EPL.

TV routes are separate public, read-only viewers of the same public Virtual API
responses verified below. They do not mount cashier controls or submit tickets.
If a terminal session exists, requests include its existing authorization header.
The cashier authentication and routes remain unchanged.

Default rotation is 25 seconds per supported view. `?seconds=40` changes this
within a 15–120 second range; `?rotate=0` fixes the selected channel. Additional
markets rotate as separate readable pages. Correct Score shows the available
outcomes grouped by home wins, draws, and away wins across all ten fixtures.

Each channel owns a league-qualified cache. Four-second REST polling continues
through socket disconnections; reconnect triggers refresh. Source timestamps,
lifecycle ranks and socket/request revision checks reject stale replacements.
Provider queue order is authoritative; the first fresh usable upcoming board is
selected without week-number sorting. Upcoming boards without usable odds are
skipped; kickoff deadlines advance the selection even without a socket event.
Live scores have a separate results view
and ticker, so upcoming odds can advance independently.

Odds/live content expires after 45 seconds without fresh evidence (including
repeated old responses). Completed results expire 15 minutes after their source
timestamp. Explicit unavailable/suspended odds render as dashes. Missing views
do not enter rotation. No odds, scores, standings or form are manufactured.

## Real feed verification

Captured directly from `http://45.77.54.107:10006` starting
2026-09-18 14:00:51 UTC. The unmodified REST payloads and representative socket
payloads are in `src/tv/fixtures/real-feed.json`, together with URLs, receive
timestamps, observation end time and counts. `scripts/capture-tv-feed.cjs`
repeats the read-only collection. No credentials are stored in the fixture.

All four requested HTTP endpoints returned 200. Champions' queue order was
`28, 24, 29, 30, 25, 31, 26` (28 live, 24 first usable upcoming). EPL's was
`11, 12, 13`. Each captured board contained ten matches.

| Requested data | Real market ID / field | Champions | EPL |
| --- | --- | --- | --- |
| Winner | `1X2` / `WINNER`: 1, X, 2 | Present | Present |
| Double Chance | `DC` / `DOUBLE_CHANCE`: 1X, 12, X2 | Present | Present |
| Goal / No Goal | `BTS` / `GOAL_NO_GOAL`: GG, NG | Present | Present |
| Over / Under 2.5 | `OU` / `OVER_UNDER`: OV 2.5, UN 2.5 | Present | Present |
| Home / Away totals | `TEAM_GOALS_HOME_AWAY` | Present | Present |
| Result + totals 1.5 / 2.5 | `OVER_UNDER_1X2` | Present | Present |
| Correct Score | `CS` / `SCORE`: 28 outcomes per match | Present | Present |
| Completed scores | latest results `matches[].homeScore/awayScore` | Present | Present |
| Changing live scores / minute | queue/display match scores and `minute` | Not supplied | Not supplied |
| Standings | `standings` | Not supplied | Not supplied |
| Official logos / team form | league/team logo and form fields | Not supplied | Not supplied |

There are **no wholly missing requested odds markets** in this capture. Individual
outcomes can be absent: Champions week 24 RMA–ZEN has no `DC` outcome `1X`.
Team-total gaps include `UNDER_2.5_AWAY` and
`UNDER_3.5_AWAY` on Champions MUN–PSV); these stay unavailable, not inferred.

Socket observations: Champions emitted 12 queue and 12 display events; EPL
emitted 14 queue, 15 display and one `resultsUpdated` event. No Champions
`resultsUpdated` event arrived during this observation window. The EPL result
event uses `receivedAt` / `receivedByApiAt` rather than `completedAtUtc` and can
omit week metadata; the viewer supports that actual shape.

## Upstream gaps

Both feeds have `LIVE` lifecycle signals but the captured live queue/display
events contain no score/progress fields. The local scraper already implements
`provider-live-state.js` and the local API `providerLiveStateService.js` already
projects scores and minutes. Their deployed publication path needs investigation;
the capture does not establish that the deployed services run that code. This
frontend change does not deploy or repair those external services.

EPL standings, team form, and official logos are absent from both inspected API
contracts and captures. No verified source field/market IDs for them are known.
The viewer supports explicitly supplied `standings` rows (teamName, played,
goalDifference, points), `leagueLogo`, `homeLogo`/`awayLogo`, and
`homeForm`/`awayForm`; they require an upstream capture/API contract before they
can appear on the live deployment. Initial badges are text fallbacks, not official
club logos. The EPL standings page/panel stays hidden until rows are supplied.

`docs/tv-market-gaps.json` lists every absent outcome in the two selected captured
weeks, including the league, event, match, market ID and exact outcome name.
Each league has 17 absent individual outcomes across its ten matches. Regenerate
this report with `node scripts/audit-tv-markets.cjs`. These are absences in the
real API responses, not proof of a scraper defect or permission to invent odds.

## Validation and screenshots

TV unit and rendering tests use the captured REST/socket fixture. Wraparound,
live-score deltas, missing markets, and optional standings are explicit synthetic
mutations of captured fixtures; they are not represented as observations of the
live provider. Browser tests replay captured responses at their capture time.
Screenshots in `docs/screenshots/tv-*.png` are those reproducible captured-data
renders, not claims about the current live feed or deployed UI.

Changed files for this feature: `src/App.js` (TV routing),
`src/components/Grid.js` (shared Correct Score alias/label normalization),
`src/tv/ShopTV.js`, `src/tv/ShopTV.css`, `src/tv/tvData.js`,
`src/tv/useTVFeed.js`, their three TV test files, the real-feed fixture,
`scripts/capture-tv-feed.cjs`, `scripts/audit-tv-markets.cjs`,
`tests/layout/tv.spec.js`, and `tests/layout/board.spec.js` (replaces its obsolete
30-tab assertion with the existing five-tab requirement), plus this report,
the market-gap JSON and four screenshots.

Validation: 169 Jest tests across 24 suites passed, including 25 TV tests.
All 10 Playwright tests passed (five cashier layout/lifecycle checks and five TV
checks). Browser tests used installed Chromium 1223 via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`; Playwright's default browser was not installed.
The production build compiled successfully. The browser tests required an
elevated process launch after Windows returned `spawn EPERM` in the sandbox.
