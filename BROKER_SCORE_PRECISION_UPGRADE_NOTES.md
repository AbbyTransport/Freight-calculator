# Abby Freight Calculator — Broker Score Precision Upgrade

This patch keeps the existing pricing calibration, including Tycon Win Mode, and improves only the Broker Score logic and display.

## What changed

The Broker Score now uses five weighted categories instead of a simple rough score:

1. Market Data, 20 points
2. Load Fit, 20 points
3. Mode Fit, 15 points
4. Price Health, 25 points
5. Risk Coverage, 20 points

The score now considers lane confidence, weekly data freshness, resolved origin/destination states, dimensions, oversize risk, weight, partial vs FTL fit, partial caps, profit vs minimum profit, markup vs target, sell rate versus market lane basis, Tycon-specific bid competitiveness, guardrail count, and whether risk/accessorial coverage exists.

## Tycon behavior

Tycon Systems remains calibrated in win-first mode. The score evaluates Tycon differently from normal customers by allowing a lower sell-rate-to-market ratio while still flagging quotes that become too aggressive to defend with carriers.

## UI change

Quote Results now includes Broker Score Intelligence with category-by-category points and the main reasons that support or lower the score.

## Files in this patch

- `index.html`
- `BROKER_SCORE_PRECISION_UPGRADE_NOTES.md`
