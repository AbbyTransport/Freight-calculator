# Abby Freight Calculator — Tycon Win Mode + Competitive Pricing Calibration

This patch changes the calculator from a safer/high-side estimating engine into a more aggressive broker-bid tool.

## Files in this patch

- `index.html` — replace the current file.
- `data/pricing-engine-config.json` — replace/add.
- `data/lane-rates.json` — replace/add.
- `data/lane-rates-history.json` — replace/add.
- `scripts/update-lane-rates.mjs` — replace so weekly updates stay calibrated lower.

## Main changes

### 1. Tycon removed from Cargo Type

Tycon Systems is a customer, not cargo. The `Tycon System` option was removed from `Cargo Type`.

### 2. Tycon Systems automatic aggressive pricing

When `Customer Name` is `Tycon Systems`, the calculator automatically applies **Tycon Win Mode**:

- forces aggressive strategy internally;
- reduces the weekly lane-rate basis by 12%;
- reduces partial premium;
- reduces auto buffer;
- uses lower minimum profit;
- uses a tighter suggested sell range.

This only activates from `Customer Name = Tycon Systems` or a close alias such as `Tycon`.

### 3. Global pricing calibrated lower

The general Abby pricing engine was lowered as well:

- lower default cost per mile basis;
- lower partial premiums;
- lower minimum charge;
- lower broker buffers;
- lower strategy margins and minimum profits;
- weekly updater now writes a competitive bid target, not a high-side market average.

## Example logic for the lost Tycon quote

For a long-haul light partial like:

- 10 ft cargo space;
- 1,650 lb;
- Tycon Systems;
- Mountain/Utah style origin to Virginia/Southeast style destination;

The previous engine could push too high because it treated the weekly lane rate as a strong market base and used a high partial premium. The new Tycon profile pushes the quote toward a leaner win-the-load band while still keeping a minimum long-haul partial floor so the result does not become fantasy freight math, mankind's least charming spreadsheet habit.

## Important operational note

Tycon Win Mode is intentionally aggressive. It is meant to help win bid-board freight. Confirm carrier coverage before locking the customer rate, especially on same-day/tomorrow pickup.
