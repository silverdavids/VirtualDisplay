# Raw queue market normalization

The local Virtual API has two representations of the same event's markets:

- `/api/virtual/display` expands provider markets into objects such as
  `homeOverUnder` and `resultOverUnder15` using `transformEventForDisplay`.
- `/api/virtual/display/queue` returns the raw market arrays on current and
  upcoming boards. Socket queue updates use this representation too.

When the queue response replaces a display response, the frontend must accept
the raw groups. `normalizeEventMarkets` now splits `TEAM_GOALS_HOME_AWAY` into
home and away totals, and `OVER_UNDER_1X2` into result/totals markets for each
line. For example, `OVER_1.5_DRAW` becomes `X+OV1.5` under `1X2_OU_1.5`.
It preserves each outcome's odd, line, identity, and suspension flags. No odds
are copied from another week or league.

The regression fixture in `src/testFixtures/providerMarkets.js` follows the
raw contract inspected in the sibling API and scraper sources. UI tests cover
expanded REST display data being replaced by raw REST queue data, future week
selection, raw socket refreshes, and switching between Champions and EPL.
Earlier expanded-only fixtures did not cover this failure mode.
