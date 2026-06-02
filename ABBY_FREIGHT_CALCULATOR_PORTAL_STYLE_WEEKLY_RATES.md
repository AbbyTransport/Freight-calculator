# Abby Freight Calculator — Portal Style + Weekly Lane Rates

This patch updates the Abby Transport Freight Quote Calculator with two changes:

1. A PortalAdmin-style visual skin: navy Abby header, compact cards, operational form styling, portal-like buttons, and a cleaner internal quote layout.
2. A semi-dynamic weekly lane-rate model that does **not** require a paid API.

## Files to replace

Upload/replace these files in the GitHub repository:

- `index.html`
- `data/lane-rates.json`
- `data/lane-rates-history.json`
- `scripts/update-lane-rates.mjs`
- `.github/workflows/update-lane-rates.yml`

## What changed in the calculator

The calculator now has a **Weekly Lane Market Estimate** panel inside **More Options**.

It uses:

- origin state;
- destination state;
- Abby regional matrix;
- weekly public freight-rate update saved in `data/lane-rates.json`;
- selected market rate class: Flatbed, Step deck, Dry van, Reefer, Hotshot, or RGN/Specialized;
- confidence indicator: High, Medium, or Low.

The calculated lane estimate automatically fills the `Cost Per Mile ($)` field, but the user can still manually override it.

## Important limitation

This is a **semi-real estimating model**, not a paid lane-level benchmark like DAT RateView, Truckstop, or SONAR. It gives a useful weekly market reference without exposing API keys or requiring a subscription. In other words, it is honest instead of pretending to be a crystal ball with a login screen.

## GitHub Actions setup

The workflow runs every Monday at 13:15 UTC and can also be started manually from GitHub Actions.

Make sure the repository has write permission for GitHub Actions:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Go to **Actions** → **General**.
4. Under **Workflow permissions**, choose **Read and write permissions**.
5. Save.

## Optional extra public sources

You can add extra public pages later by creating a repository variable:

- Name: `EXTRA_RATE_SOURCE_URLS`
- Value: comma-separated URLs

Example:

```text
https://example.com/freight-rates,https://another-example.com/market-rates
```

The parser will try those pages in addition to the default public pages.

## Deployment

After replacing the files, commit and push to GitHub. GitHub Pages will serve the updated calculator normally.

No Firebase changes are needed.
No API key is needed.
No paid service is required.
