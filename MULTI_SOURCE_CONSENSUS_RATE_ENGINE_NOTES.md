# Abby Freight Calculator — Multi-Source Consensus Rate Engine

This patch upgrades the public-data rate model from a simple weekly/semi-weekly updater to a 3-day multi-source consensus updater.

## Files changed

Replace/add these files in the GitHub repository:

```text
index.html
.github/workflows/update-lane-rates.yml
scripts/update-lane-rates.mjs
data/lane-rates.json
data/lane-rates-history.json
MULTI_SOURCE_CONSENSUS_RATE_ENGINE_NOTES.md
```

## What changed

- The GitHub Action now runs daily, but the updater only writes a new snapshot when at least 72 hours have passed, unless the workflow is manually dispatched.
- The calculator UI now says `3-Day Multi-Source Lane Market Estimate`.
- The market panel now shows:
  - Market Direction
  - Diesel Adjustment
  - Source Count
- The updater now tries to combine multiple public sources:
  - DAT Trendlines Flatbed National Rates
  - DAT Trendlines
  - Scale Funding Current Freight Rates
  - FTR / Truckstop Spot Market Insights
  - EIA Weekly Diesel Fuel Update
  - C.H. Robinson Freight Market Update
  - ACT Research Freight Trucking Rates
- Numeric rate sources are treated as the primary anchors.
- FTR/Truckstop, C.H. Robinson, and ACT are treated as trend/pressure modifiers, not exact rate tables.
- EIA diesel is treated as a mild fuel-cost pressure adjustment, capped so it does not distort the quote.
- Extreme numeric outliers are filtered before the weighted average is calculated.
- Tycon Systems remains controlled separately by the Customer Name profile in the calculator. This patch does not remove Tycon Win Mode.

## Important limitation

This is closer to a paid API methodology, but it is not the same as DAT RateView, Truckstop Rate Insights, SONAR/TRAC, or any paid lane-level transactional API. Public pages may change layout, block parsing, or publish only directional information. When parsing fails, the script keeps the last good internal values instead of inventing nonsense, because fake precision is how spreadsheets become haunted.

## GitHub Action behavior

The workflow cron runs every day:

```yaml
- cron: "15 13 * * *"
```

The script checks `UPDATE_INTERVAL_HOURS=72`. If the last successful update is less than 72 hours old, it exits without changing files. Manual `workflow_dispatch` forces a refresh.

## After upload

Use cache busting after replacing the files:

```text
https://abbytransport.github.io/Freight-calculator/?v=10
```
