# Champions and EPL display

The header offers Champions (`21`) and EPL (`78`) with the existing red active
underline. `virtualDisplayLeagueId` in local storage restores the selection;
missing, invalid, or inaccessible storage defaults to Champions.

## Previous cause and implementation

The previous display defaulted to league 21, relied on the available-leagues
response for its menu, and kept one shared display object. Its feed matching also
treated the provider season/league number as a competition identity. There was
no queue request or per-league cache. Existing local edits had started correcting
the labels and numeric matching; this implementation completes the isolation.

`useLeagueFeed` now owns board, queue, loading, and error state keyed by numeric
league ID. Switching requests both endpoints immediately and displays cached
state when available. Abort signals, effect lifetime checks, per-league request
sequences, and socket revisions prevent obsolete responses from being applied.
Socket events for an inactive league update only its cache. Both endpoints are
retried on the existing four-second interval and refreshed on connection and
reconnection. The API remains responsible for promoting queued boards.

Countdowns derive from the selected board's absolute deadline. Current and queued
boards are selectable using `WEEK {weekNumber}` buttons; raw event IDs stay
internal. A new event cannot inherit the previous event's odds from an empty
or timing-only update.

The existing ticket payload contains one `providerEventId` for the entire slip;
it does not explicitly support mixed-league betting. Switching clears picks and
shows a notification when picks were present. Switching is disabled during
submission. Internal pick identities include league and event, and placement is
stopped if the visible event changes while validation is pending. No placement
contract fields were added.

## Clickable weeks

Each league cache now contains the current board, latest queue, ordered `boards`,
`selectedWeekKey`, and selected `board`. Identity is `leagueId:providerEventId`.
The current board precedes upcoming boards in provider order. Repeated event IDs
are deduplicated; repeated week labels are retained, including wrapping sequences
such as 38, 1, 2. Queue current-board updates reconcile the authoritative current
board without changing a valid manually selected upcoming week.

Clicking a cached week updates fixtures, odds, panel week and countdown without
HTTP requests. Each league retains its own selection across league switches.
Selections are held in memory for this display session; the existing stored
league preference remains unchanged. A week click invalidates HTTP responses
started before the click. Existing abort, request sequence, timestamp, retry and
socket revision guards remain in effect.

Queue snapshots replace upcoming membership while merging updates only within
the same event. `virtual-display-updated` updates the current board and
`virtual-events-queue-updated` updates that league's collection. Completed
`resultsUpdated` boards expire only the matching numeric league/event identity;
expired identities cannot be reintroduced by an older display/queue response.
Result wrappers and `providerLeagueId` are accepted as on the results page.
Completion means an explicit terminal board status or all returned matches having
terminal status (or scores with no status). Partial/live results and countdown
zero alone do not expire weeks. A removed manual selection advances to the next
surviving event in its previous provider order, falling back to the current/first
available board. Other valid upcoming tabs remain available.

Switching weeks clears picks with the message “Bet slip cleared when switching
weeks.” Clicking the selected tab does nothing. Authoritative event changes clear
incompatible picks with the existing event-change message. Week and league
switches are disabled while ticket placement is pending; the existing validation
identity check still prevents placement after a socket-driven event change.

The selector is a dedicated 34px navigation row between the terminal header and
body. `.odds-area` still has exactly its summary and fixture-list rows. Five tabs
fit without scrolling at the requested resolutions; longer collections scroll
inside the week navigation. Outcome/fixture alignment and the 320px betslip are
unchanged.

## Contract inspected in the local API repository

Sources: `Virtual-Api/routes/virtual-events.js`,
`services/virtualEventStore.js`, `services/virtualEventSocketPublisher.js`,
`services/providerQueueImportService.js`, and
`providers/virtualhorizon/virtualHorizonImportController.js`.

All paths below are relative to the configured Virtual API base URL and retain
the existing terminal authentication headers.

| Use | Request |
| --- | --- |
| Current board | `GET /api/virtual/display?provider=VirtualHorizon&leagueId=21` or `leagueId=78` |
| Queue/weeks | `GET /api/virtual/display/queue?provider=VirtualHorizon&leagueId=21` or `leagueId=78` |
| Results | `GET /api/virtual/results/latest?leagueId=21` or `leagueId=78` |

The current-board request retains the existing `_` timestamp cache-buster.
Display response properties are `provider`, `leagueId`, `leagueNumber`,
`weekNumber`, `providerEventId`, `firstMatch`, `leagueName`, `lastUpdatedAt`,
`boardStartAt`, `boardEndAt`, `startAt`, `endAt`, `nextRefreshAt`,
`remainingSeconds`, `boardDurationSeconds`, `isStale`, and `events`.
Matches and market selections use the existing display normalizer.

Queue responses contain `currentBoard`, `nextBoards`, `lastUpdatedAt`, and
`lastRotationAt`. Each board carries `provider`, `leagueId`, `leagueNumber`,
`leagueName`, `providerEventId`, `weekNumber`, `firstMatch`, `startAt`, `endAt`,
`nextRefreshAt`, and `events`. An empty queue can have `currentBoard: null`.
Its league is then known only from the HTTP request; an unqualified empty socket
message cannot clear either league.

Socket.IO uses the existing `/socket.io` path and default namespace. The API
broadcasts rather than requiring league rooms/subscription messages:

| Event | Payload and routing |
| --- | --- |
| `virtual-display-updated` | Display object; route by `provider` and `leagueId` |
| `virtual-events-queue-updated` | Queue object; route by `currentBoard.provider` and `currentBoard.leagueId` |
| `resultsUpdated` | Result board; filter by `provider` and `leagueId` (fallback `providerLeagueId`) |

Results REST wraps the board as `{ok, latestResult}`. The Results button and F10
open `/results?leagueId=<selected ID>` and use that ID for REST and socket
filtering. Provider league numbers and display names are never identity filters.

## Verification evidence

`src/components/GridLeagueSelection.test.js` renders both competitions and checks
their active buttons, league-specific requests, team rows, odds, provider league
numbers, weeks, absence of queue debug text, availability states, and betslip behavior.
Its fixtures intentionally reuse match/event identifiers across competitions.

`src/hooks/useLeagueFeed.test.js` verifies default/persisted selection, separate
boards and queues, inactive rollover, different countdown deadlines, delayed HTTP
responses, socket-vs-HTTP races, reconnect, numeric identity rejection, and
four-second failure recovery. `src/services/virtualApi.test.js` verifies exact
endpoint paths, query parameters, cancellation signals, and authentication.
`src/components/ResultsDisplay.test.js` additionally verifies EPL result filtering.

Run the complete suite with `CI=true npm test -- --watchAll=false --runInBand`;
build with `CI=true npm run build`. The final run's machine-readable evidence is
stored locally in `.tmp/week-test-results.json`.

Final unit verification: **19 suites / 127 tests passed**; production build compiled
successfully; `git diff --check` passed. Build tooling reported its existing
outdated Browserslist database and Node `fs.F_OK` deprecation notices.

Week browser verification: **4 cases passed**, covering 1600x900 and 1920x1080 at
100% and 110% desktop zoom emulation (reduced CSS viewport plus device scale).
Every case clicks all five weeks for both leagues, checks all six markets, and
then checks navigation overflow with 30 weeks. All ten fixtures fit above the
footer, the outcome-to-first-row gap is 0px, and the betslip measures 320px.
Screenshots use deterministic intercepted API data in the production build.

- [Champions, 1600x900 at 110%](../.tmp/layout-screenshots/weeks-1600x900-110-Champions-MAIN.png)
- [EPL, 1600x900 at 110%](../.tmp/layout-screenshots/weeks-1600x900-110-EPL-MAIN.png)
- [Champions, 1920x1080 at 100%](../.tmp/layout-screenshots/weeks-1920x1080-100-Champions-MAIN.png)
- [EPL, 1920x1080 at 100%](../.tmp/layout-screenshots/weeks-1920x1080-100-EPL-MAIN.png)

Run `npm run test:layout` after the production build. An installed Chromium can
be supplied using `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; otherwise install it with
`npx playwright install chromium`. Detailed layout measurements and PNGs are in
`.tmp/layout-screenshots/weeks-*`.

Changed files:

- `src/App.js`
- `src/components/Grid.js`
- `src/components/GridLeagueSelection.test.js`
- `src/components/ResultsDisplay.js`
- `src/components/ResultsDisplay.test.js`
- `src/hooks/useLeagueFeed.js`
- `src/hooks/useLeagueFeed.test.js`
- `src/services/virtualApi.js`
- `src/services/virtualApi.test.js`
- `src/services/virtualResultsApi.js`
- `docs/league-display.md`

The pre-existing default stake change to 500 is preserved.

## SQL deployment limitation

No SQL was executed, migrated, or deployed. The scraper and API were read only.
Display verification uses mocked HTTP and Socket.IO data and makes no live bets.

The pending `Virtual-Api/scripts/virtualdb_data_virtual_horizon_leagues.sql`
migration changes `VirtualCurrentBoard` to a `(Provider, ProviderLeagueId)` key
and board uniqueness to `(Provider, ProviderLeagueId, ProviderEventId)`.
Production persistence of simultaneous league boards and end-to-end betting or
result verification against those persisted boards remain dependent on that
migration and the corresponding backend deployment. In-memory display/queue
rendering is verified independently; this task does not claim live SQL-backed
placement, settlement, or results verification.
