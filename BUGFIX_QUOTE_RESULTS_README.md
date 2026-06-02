# Bugfix - Quote Results invisible

Date: 2026-06-02

## Problem
After applying the Portal-style Freight Calculator update, clicking **Calculate** saved the quote in **Calculation History**, but the values did not appear visibly in **Quote Results**.

## Cause
The calculator still had the original `.result-text` CSS using white text. The Portal-style update changed the Quote Results card to a white background. The value was being written correctly by JavaScript, but it was white text on a white panel.

## Fix
`index.html` was updated with a CSS override for:

- `.results .result-text`
- `.results .result-text:not(:empty)`
- `#trailerRecommendation.result-text`

## What to replace
Replace the current `index.html` with the one in this package.

The other files are included only so this patch can fully replace the previous patch package if needed.
