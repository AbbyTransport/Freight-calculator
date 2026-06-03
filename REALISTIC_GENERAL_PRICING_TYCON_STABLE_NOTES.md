# Abby Freight Calculator — Realistic General Pricing + Tycon Stable Mode

This patch recalibrates the calculator after the Tycon-specific aggressive update.

## Main goal

- Keep **Tycon Systems** in the same aggressive win-first posture.
- Raise the **general customer** pricing back into a realistic market range.
- Avoid returning to the earlier high-side model.
- Keep a small Abby discount so quotes are still competitive.

## Files changed

- `index.html`
- `data/pricing-engine-config.json`
- `data/lane-rates.json`
- `data/lane-rates-history.json`
- `scripts/update-lane-rates.mjs`

## What changed

### General customers

General customer pricing was raised by roughly 16% versus the previous bargain matrix.
The new posture is market-realistic with a small discount, not the ultra-low Tycon model.

Key changes:

- Default flatbed market basis changed to about `$3.15/mile`.
- General regional lane matrix was raised.
- Balanced Broker margins were raised moderately.
- Partial floors, caps, and premiums were raised moderately.
- Auto buffer values were restored closer to real broker risk.
- Equipment multipliers were recalibrated for dry van, reefer, hotshot, step deck, conestoga, and RGN.

### Tycon Systems

Tycon is still controlled only by **Customer Name = Tycon Systems**.
It is not a Cargo Type.

Tycon keeps a separate customer profile:

- forced aggressive strategy;
- lower market-rate multiplier;
- reduced partial premium;
- reduced auto buffer;
- lower minimum profit;
- narrower sell range.

The internal Tycon market multiplier was adjusted only to offset the general matrix increase, so Tycon remains effectively in the same win-first zone.

## Weekly updater

The weekly updater now writes a general-market matrix using a realistic discounted anchor instead of the bargain matrix. If the public source parser fails, it keeps the previous good values.

## Practical broker note

Use Tycon Win Mode only for Tycon. For everyone else, Balanced Broker should now be the default. Aggressive is still available, but it is no longer as low as Tycon.
