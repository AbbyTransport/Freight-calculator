# Abby Freight Calculator - Broker Guardrails & Accessorials Patch

This patch changes only the files needed for the next stage.

## Replace

- `index.html`

## Add

- `PRICING_GUARDRAILS_ACCESSORIALS_NOTES.md`

## What changed

### 1. Quote Results now shows a stronger broker breakdown

Internal view now separates:

- Linehaul
- Accessorials / risk
- Profit
- Quote rate
- Carrier estimate
- FTL benchmark
- Deck share
- Weight factor
- Weekly market basis
- Broker guardrail notes

Customer view still shows only the customer-facing quote information. Carrier estimate and profit stay hidden.

### 2. Accessorial/risk fields added under More Options

New optional internal fields:

- Extra Stop Fee ($ each)
- Tarp / Special Handling ($)
- Permits / Oversize Reserve ($)
- Detention / Risk Reserve ($)
- Expedited / Tight Lane Surcharge (%)

The system calculates:

`carrier estimate = linehaul + accessorials + expedited surcharge`

Then:

`quote rate = carrier estimate + desired profit`

### 3. Partial-load guardrails added

For partial/shared deck quotes, the system now checks:

- 24+ linear feet: large partial warning
- 30+ linear feet: near-FTL warning
- 20,000+ lb: medium-heavy partial warning
- 30,000+ lb: heavy partial warning
- extra stops with no stop fee
- height/width situations that need operational verification

### 4. Partial cap against FTL benchmark

The partial estimate now compares itself to the FTL benchmark.

If a partial estimate becomes too close to or higher than FTL logic, the linehaul can be capped at:

- 88% of FTL benchmark for regular partials
- 95% of FTL benchmark for near-FTL/heavy partials

This prevents absurd partial outputs that exceed a dedicated truck estimate, because apparently math sometimes needs adult supervision.

### 5. PDF updated

Internal PDF now includes:

- cost breakdown
- broker pricing guardrails
- FTL benchmark
- deck share
- accessorials/risk
- expedited surcharge

Customer PDF still hides internal carrier/profit details.

## Important operational note

This remains an estimating tool. It does not replace calling carriers, checking DAT/Truckstop, confirming equipment availability, or applying broker judgment. It now behaves more like a broker worksheet instead of a decorative calculator with optimism issues.
