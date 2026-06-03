# Abby Freight Calculator — Ideal Broker Pricing Engine

This patch adds the "Free Broker Mode" pricing layer to the existing Abby Freight Calculator.

## Files in this patch

- `index.html` — replace the existing file.
- `data/pricing-engine-config.json` — add this new file.
- `IDEAL_BROKER_PRICING_ENGINE_NOTES.md` — add this note file if you want documentation in the repository.

## What changed

### 1. Strategy-based broker pricing

A new **Pricing Strategy** control was added:

- **Balanced Broker** — default everyday setting.
- **Aggressive / Win the Load** — lower margin when winning the customer matters.
- **Protective / Tight Market** — higher margin/reserve for hard freight or hard lanes.
- **Expedited / Urgent** — higher margin plus automatic expedited percentage.
- **Strategic Customer** — slightly leaner margin for recurring accounts.

If **Desired Profit Override** is blank or zero, the calculator now recommends profit automatically based on:

- pricing strategy;
- pricing mode;
- carrier estimate;
- minimum broker profit;
- optional target margin override;
- optional minimum profit override.

Manual profit still wins when entered.

### 2. Better partial vs FTL logic

The partial model now uses **effective linear feet**, not only raw length:

`effective linear feet = length × max(1, width / 8.5)`

Then it compares that against a 48 ft deck. This is more realistic for wide freight because width consumes deck capacity. Apparently freight occupies space in two dimensions. Revolutionary.

The system also applies:

- weight factor;
- partial premium by load size;
- FTL benchmark cap;
- near-FTL warning;
- large partial warning;
- heavy partial warning.

### 3. Auto Broker Buffer

A new checkbox, enabled by default, adds internal reserve for common quote risks:

- extra stops without a manually entered stop fee;
- tall freight;
- wide/oversize freight;
- long freight;
- heavy freight;
- low-confidence lane estimate;
- near-FTL partials;
- RGN/specialized freight.

The buffer is visible in internal Quote Results and internal PDF. Customer PDF still only shows the final customer quote.

### 4. Better Quote Results UI

Quote Results now shows:

- final customer quote as the main hero number;
- broker score;
- suggested sell range;
- linehaul;
- accessorials/buffer;
- profit;
- carrier estimate;
- target margin;
- pricing strategy;
- FTL benchmark;
- effective deck usage;
- weight factor;
- partial premium;
- market basis;
- auto buffer detail;
- broker guardrails;
- broker action plan.

### 5. External pricing config

`data/pricing-engine-config.json` lets you tune margins, minimum profits, partial premiums, caps, and risk buffers without digging through the whole `index.html` swamp. The `index.html` still has embedded fallback values, so the calculator works even if the JSON cannot be loaded locally.

## Suggested deployment

Upload these files to the repository:

```text
index.html
data/pricing-engine-config.json
IDEAL_BROKER_PRICING_ENGINE_NOTES.md
```

Then open the GitHub Pages URL with cache busting:

```text
https://abbytransport.github.io/Freight-calculator/?v=4
```

## Operational warning

This is an estimating tool, not a paid DAT/Truckstop lane-level replacement. It is designed to make Abby faster, more consistent, and less dependent on rate guesses performed by staring into the abyss.

## Additional list improvements in this patch

Cargo Type now includes operational categories such as machinery/equipment, construction materials, palletized freight, pipe/steel, lumber/trusses, crated/fragile, and oversize/permit load.

Market Rate Class now includes Conestoga, Box Truck/Sprinter, and Power Only in addition to flatbed, step deck, dry van, reefer, hotshot, and RGN/specialized.

Dimension entry limits were expanded so the calculator can accept oversized freight and then flag it properly instead of blocking the quote before the broker can even think. A rare mercy from software.
