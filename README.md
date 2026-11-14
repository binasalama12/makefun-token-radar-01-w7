# Chain Spread Radar — multi-chain board

A token launch radar: it ranks pre-token protocols by an implied value the entry
derives from the sealed snapshot, and gives every ranked protocol a five-step farm
plan with a cost and a time for each step.

## The model

```
implied = round( TVL x 0.24 x sqrt(chains)
               x (1 + clamp(change_7d, -60, 120) / 100 x 0.55)
               x (0.6 + 0.4 x min(age_days, 1095) / 1095) )
```

- **TVL** — the protocol's size, from the snapshot.
- **sqrt(chains)** — the spread: a protocol live on more chains earns a higher
  multiple, because a launch would reach more ecosystems at once.
- **Seven-day growth** — clamped to -60%..+120%, weighted 0.55.
- **Age** — days since first listing against the snapshot's `as_of`; an unknown
  age counts as 365 days. Older with no token means a longer track record.
- No protocol name is special-cased. Protocols whose token already trades are
  set aside at their recorded market cap and never ranked.

## The board

220 rows: all 40 watchlist protocols (TVL >= $50M, no token on record) plus the
180 biggest pre-token protocols below the floor, by TVL. Ranks are exactly 1..220
and implied value never rises with rank.

## The dashboard

A static page, no network. `index.html` loads `data.js` (written by `main.ts`
from the same board) and `app.js` renders three views by URL:

- `?view=board` — the sortable, filterable board with a chain-filter chip row.
- `?view=detail&slug=<slug>` — one protocol's model inputs and farm plan.
- `?view=filtered&f=<text>` — the board filtered by that text.

Click a column header to sort; click a row to open its detail view.

## How to run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json or its directory>
```

Node 22, standard library only. The run writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` (last, via the vendored
`vendor/makefun-board.ts`). It is deterministic: run it twice and the outputs
are byte-identical.
