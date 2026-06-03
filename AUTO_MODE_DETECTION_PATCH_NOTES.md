# Abby Freight Calculator — Auto Mode Detection Patch

This patch removes the manual **Truck Load (TL)** checkbox.

The calculator now detects the freight mode automatically from:

- Length
- Width
- Height
- Weight
- Equipment class
- Cargo type
- Effective deck share

## Automatic mode rules

The system can classify freight as:

- **LTL / Small Freight**: small palletized, crated, reefer, dry van, or box-truck sized freight.
- **Partial / Hotshot Candidate**: small-to-medium open deck freight, including Tycon-style cargo-space loads.
- **Partial / Shared Deck**: medium freight that does not justify dedicated FTL.
- **FTL / Dedicated Truck**: large, heavy, power-only, vehicle-truck, or near-full-deck freight.
- **Specialized / RGN**: oversize, over-height, over-width, over-length, RGN, or specialized freight.

## Pricing impact

- Tycon Systems Win Mode remains preserved.
- General customer pricing remains realistic-market-minus-small-discount.
- LTL now has its own estimate logic and profit targets.
- Partial/Hotshot/FTL logic still uses the calibrated broker engine.
- Broker Score, guardrails, Quote Results, history, and PDF now report the auto-detected mode.

## Files changed

Replace/add these files in GitHub:

- `index.html`
- `data/pricing-engine-config.json`
- `AUTO_MODE_DETECTION_PATCH_NOTES.md`

No API key or Firebase change is required.
