# Upcoming betting availability

The closure originated in the API's `providerLiveStateService.lifecycle` fallback:
queue boards without a separate live-state record were assigned
`bettingAllowed: false` because `available`, `suspended`, and
`sourceUpdatedAtUtc` were missing. The display already ignored an absent flag,
but honored that explicit false value even with a positive countdown.

The API display decorator now publishes `BettingOpen` (and the existing
`bettingAllowed` alias) for verified upcoming queue boards. Verification requires
membership in the current stored league queue, a fresh queue receipt and provider
capture timestamp (30 seconds), a future start, available selections, and no
explicit suspension, unavailability or stale marker. Existing live-state records
still obey their source freshness and lifecycle restrictions. REST display,
queue boards and display socket messages carry the same permission semantics.

This flag is a display projection, not authorization to place a ticket. The
strict lifecycle validator, SQL import, SQL-before-ack behavior and ticket
placement checks were not relaxed or modified. Unverified queue-only data still
fails the strict lifecycle gate in the API regression test.

The display accepts omitted optional permission flags for a valid upcoming board
with positive time and usable odds. Explicit false flags, LIVE/FINISHED, kickoff,
missing timing, stale data and unavailable selections remain closed. Messages:

- Upcoming and open: enabled odds, no closure banner.
- At kickoff/live: `Betting closed – games in progress`.
- No available board: `Waiting for the next virtual event`.
- Existing upcoming board with another closure reason: `Betting temporarily unavailable`.

API projections publish `serverTimeUtc`. REST clock measurements use the request
midpoint; socket measurements use receipt time. Countdown and kickoff evaluation
use the measured offset, and the displayed target time uses that same deadline.
No fixed 17-second correction is applied. The observed production discrepancy
was not independently measured; tests simulate a 17-second client/API difference.

Verification includes the complete display Jest suite, complete API suite,
production build, four browser layout cases (1600x900 and 1920x1080 at 100%/110%
desktop zoom emulation), and a browser transition from 00:16 to kickoff to no
available board. The browser uses intercepted data and does not place live bets.
The API tests also cover missing verification, stale snapshots, unavailable odds,
explicit closure, lifecycle boundaries and unchanged strict validation.

Both the API changes in the sibling `Virtual-Api` repository and the display
bundle need deployment. This work does not deploy or change SQL.

Results: 134 display tests passed (21 suites); the final targeted rerun passed
14 tests; the complete API suite and all 5 browser cases passed. The final
production build compiled successfully and matches the final component source.
The Jest rerun used a 30-second test timeout after two existing tests timed out
during concurrent compilation. Existing React act, Browserslist and Node
deprecation warnings remain.

[Enabled odds at 00:16](../.tmp/layout-screenshots/upcoming-positive16.png)
