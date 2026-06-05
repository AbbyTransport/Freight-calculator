# Abby Freight Calculator — 3-Day Rate Update + Added Public Source

## Files in this patch

Replace/add only these files:

- `index.html`
- `.github/workflows/update-lane-rates.yml`
- `scripts/update-lane-rates.mjs`
- `data/lane-rates.json`
- `data/lane-rates-history.json`
- `THREE_DAY_RATE_SOURCE_UPGRADE_NOTES.md`

## What changed

1. The lane-rate update schedule was changed from weekly to about every 3 days.
2. The updater now uses a more precise public-source blend:
   - DAT Trendlines Flatbed National Rates direct regional page
   - Scale Funding Current Freight Rates
   - DAT Trendlines general page
   - ACT Research Flatbed Rates as a market-condition signal
3. DAT's direct regional flatbed page is now parsed for regional anchors when available:
   - West
   - Southeast
   - Northeast
   - Midwest
   - Southwest
4. The regional matrix uses those anchors instead of relying mostly on one national rate.
5. The calculator UI now says “3-Day Lane Market Estimate” instead of “Weekly Lane Market Estimate.”
6. Tycon Systems pricing mode is not changed by this patch.

## Important limitation

This is still not live city-to-city rate lookup. It is a public-source, regional, semi-dynamic estimate. The Calculate button uses the latest `data/lane-rates.json`; GitHub Actions refreshes that file on the schedule.

## GitHub Actions schedule

The workflow uses:

```yaml
- cron: "15 13 */3 * *"
```

That means it runs around every 3 days at 13:15 UTC. GitHub cron uses day-of-month stepping, so it is not a perfect 72-hour timer across month boundaries, but operationally it is the practical free GitHub Actions version.
