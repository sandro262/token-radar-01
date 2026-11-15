# Token Radar — make.fun bounty token-radar-01

A web dashboard that ranks **all 758 protocols** in the sealed DefiLlama
snapshot (as of 2026-11-14) by implied launch value, with a farm plan for
every one. Built for the bounty at
https://make.fun/bounty/token-radar-01 (submit at
https://make.fun/bounty/token-radar-01/submit).

Deadline: **Dec 14, 2026, 12:57 AM America/New_York**.
Development Nov 14–Dec 14, 2026; final Dec 14–15, 2026.
Reward: $1,325 total, $1,000 for 1st place, paid in USDC on Solana.

## The model (radar-2)

One function in `lib/model.ts` scores every protocol; no name is
special-cased, no live data is used, the reference date is the snapshot's
`as_of` (2026-11-14):

```
implied = round( tvl_usd x categoryMultiple x growthMult x maturityMult x statusFactor )
categoryMultiple = median(mcap / TVL) of tokened protocols in the same
  category, computed from this snapshot (overall median when a category
  has fewer than 3), clamped to [0.05, 1.20]
growthMult     = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
maturityMult   = 0.6 + min(age_days, 1095) / 1095 x 0.4
  age_days = as_of - listed_at (365 when listed_at is null)
statusFactor   = 1.00 pre-token | 0.02 token already trades |
                 0.01 wrapped / bridged product
```

Token status follows the watchlist's own exclusion rule: a protocol
records no token when `mcap_usd`, `gecko_id` and `symbol` are all null,
and it is a wrapped / staked / bridged product when its category is
Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
or CEX, its name ends in a version marker, carries a whole word wrapped /
staked / staking, or starts with an exchange name.

A tokened protocol is kept on the board as the market's own comparison,
with its real market cap shown beside its discounted implied value, and
its farm plan is honest: it says the token already trades and covers
using / LP-ing / staking that token. A wrapped / bridged row says there
is no new token to farm. Implied values are this entry's own claim, not
a prediction of whether or when a token is issued.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts \
  --input /path/to/snapshot.json
```

Node 22.18+ (tested on Node 24.22.1), standard library only, no network.
The program reads the snapshot, writes `out/board.json` (758 rows),
`out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and
writes `out/dossier.json` via `vendor/makefun-board.ts`. It is
deterministic: two runs write identical bytes.

## Dashboard

`dashboard/` is a static page (no network, no framework): sortable board,
search, category / chain / min-TVL filters, pre-token / token-live /
wrapped tabs, a detail view per protocol with the model's full working
and its farm plan, and a model panel that writes the formula down so a
judge can follow it.

## Submission (not done here)

Needs, from the entrant: a public GitHub repo created after the
competition opened, at one commit, holding this entry under an
OSI-approved license; the transcript of the agent session that built it;
sign-in with the Solana wallet that gets paid. Do not submit from this
workspace — create the repo and submit via the bounty page.
