#!/usr/bin/env node
/**
 * Abby Transport Freight Calculator — 3-day semi-dynamic lane-rate updater
 *
 * No paid API required.
 *
 * What this does through GitHub Actions about every 3 days:
 *  1. Reads parseable public freight-rate pages when possible.
 *  2. Blends numeric sources using weights instead of trusting one webpage like it came down from Sinai.
 *  3. Uses previous good values if public pages fail.
 *  4. Rebuilds the Abby regional lane matrix.
 *  5. Writes data/lane-rates.json and data/lane-rates-history.json.
 *  6. Patches index.html fallback constants, so the calculator still works
 *     even if the JSON file cannot be loaded by the browser.
 *
 * This is an estimating model. It is not DAT RateView, Truckstop Rate Insights,
 * SONAR, or any paid lane-level product. It is a public-source regional model.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "index.html");
const DATA_DIR = path.join(ROOT, "data");
const RATE_JSON_PATH = path.join(DATA_DIR, "lane-rates.json");
const HISTORY_JSON_PATH = path.join(DATA_DIR, "lane-rates-history.json");

const REGION_CODES = ["NOR", "SOU", "MID", "SPL", "TEX", "MTN", "SWE", "NWE"];
const BASE_NATIONAL_AVERAGE = 2.70;
const COMPETITIVE_MARKET_MULTIPLIER = 0.875;

const REGION_LABELS = {
  NOR: "Northeast",
  SOU: "Southeast",
  MID: "Midwest",
  SPL: "South Plains",
  TEX: "Texas",
  MTN: "Mountain",
  SWE: "Southwest",
  NWE: "Northwest",
};

const EQUIPMENT_PROFILES = {
  flatbed:  { label: "Flatbed", multiplier: 1.00, confidenceBoost: 0 },
  stepdeck: { label: "Step deck", multiplier: 1.05, confidenceBoost: -1 },
  conestoga:{ label: "Conestoga", multiplier: 1.10, confidenceBoost: -1 },
  dryvan:   { label: "Dry van", multiplier: 0.82, confidenceBoost: -1 },
  reefer:   { label: "Reefer", multiplier: 0.94, confidenceBoost: -1 },
  hotshot:  { label: "Hotshot", multiplier: 0.78, confidenceBoost: -1 },
  boxtruck: { label: "Box Truck / Sprinter", multiplier: 0.68, confidenceBoost: -2 },
  poweronly:{ label: "Power Only", multiplier: 0.80, confidenceBoost: -2 },
  rgn:      { label: "RGN / Specialized", multiplier: 1.38, confidenceBoost: -2 },
};

const BASE_REGION_RATES = {
  NOR: { NOR: 2.75, SOU: 2.90, MID: 2.95, SPL: 3.05, TEX: 3.10, MTN: 3.15, SWE: 3.20, NWE: 3.25 },
  SOU: { NOR: 2.85, SOU: 2.70, MID: 2.80, SPL: 2.85, TEX: 2.75, MTN: 3.00, SWE: 3.05, NWE: 3.15 },
  MID: { NOR: 3.00, SOU: 2.90, MID: 2.80, SPL: 2.70, TEX: 2.85, MTN: 2.90, SWE: 3.00, NWE: 3.05 },
  SPL: { NOR: 3.00, SOU: 2.75, MID: 2.65, SPL: 2.55, TEX: 2.60, MTN: 2.70, SWE: 2.80, NWE: 2.90 },
  TEX: { NOR: 3.05, SOU: 2.65, MID: 2.70, SPL: 2.55, TEX: 2.45, MTN: 2.70, SWE: 2.65, NWE: 2.90 },
  MTN: { NOR: 3.10, SOU: 2.90, MID: 2.75, SPL: 2.65, TEX: 2.70, MTN: 2.45, SWE: 2.55, NWE: 2.55 },
  SWE: { NOR: 3.15, SOU: 3.00, MID: 2.85, SPL: 2.75, TEX: 2.65, MTN: 2.55, SWE: 2.40, NWE: 2.60 },
  NWE: { NOR: 3.25, SOU: 3.10, MID: 2.95, SPL: 2.90, TEX: 2.90, MTN: 2.60, SWE: 2.65, NWE: 2.50 },
};

const DEFAULT_PUBLIC_SOURCES = [
  {
    name: "DAT Trendlines Flatbed National Rates",
    url: "https://www.dat.com/trendlines/flatbed/national-rates",
    parser: "dat-regional-map",
    weight: 4.0,
  },
  {
    name: "Scale Funding Current Freight Rates",
    url: "https://getscalefunding.com/resources/current-freight-rates/",
    parser: "generic-flatbed-rates",
    weight: 3.0,
  },
  {
    name: "DAT Trendlines",
    url: "https://www.dat.com/trendlines",
    parser: "generic-flatbed-rates",
    weight: 1.25,
  },
  {
    name: "ACT Research Flatbed Rates",
    url: "https://www.actresearch.net/resources/data-tracking/flatbed-rates",
    parser: "market-signal",
    weight: 0.75,
  },
];

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function isUsableRate(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 1.5 && Number(value) <= 8;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;/g, "$" )
    .replace(/\s+/g, " ")
    .trim();
}

function firstRate(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(String(match[1]).replace(/,/g, ""));
    if (isUsableRate(value)) return value;
  }
  return null;
}

function findRawRegionRate(rawHtml, text, regionName) {
  const compact = String(rawHtml).replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
  const key = regionName.toLowerCase();
  const rawPatterns = [
    new RegExp(`['\"]${key}['\"]\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"),
    new RegExp(`\\b${key}\\b[^$0-9]{0,80}\\$?\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"),
  ];
  const valueFromRaw = firstRate(compact, rawPatterns);
  if (isUsableRate(valueFromRaw)) return valueFromRaw;

  const label = regionName.replace(/([a-z])([A-Z])/g, "$1 $2");
  return firstRate(text, [new RegExp(`${label}[^$0-9]{0,120}\\$?\\s*([0-9]+(?:\\.[0-9]+)?)`, "i")]);
}

function parseDatRegionalMap(html, sourceName, url, weight = 1) {
  const text = htmlToText(html);
  const rates = {
    west: findRawRegionRate(html, text, "west"),
    southeast: findRawRegionRate(html, text, "southeast"),
    northeast: findRawRegionRate(html, text, "northeast"),
    midwest: findRawRegionRate(html, text, "midwest"),
    southwest: findRawRegionRate(html, text, "southwest"),
  };

  const regionalValues = Object.values(rates).filter(isUsableRate).map(Number);
  const nationalFromText = firstRate(text, [
    /national\s+(?:average\s+)?flatbed\s+(?:spot\s+)?(?:rate|rates|average)[^$0-9]{0,140}\$?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /flatbed\s+(?:spot\s+)?(?:rates?|average)[^$0-9]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ]);

  const national = isUsableRate(nationalFromText)
    ? nationalFromText
    : regionalValues.length >= 3
      ? round2(regionalValues.reduce((sum, value) => sum + value, 0) / regionalValues.length)
      : null;

  if (!isUsableRate(national) && !regionalValues.length) return null;
  return {
    source: sourceName,
    url,
    type: "direct-regional-rate-map",
    weight,
    foundAt: new Date().toISOString(),
    rates: { national, ...rates },
  };
}

function parseGenericFlatbedRates(html, sourceName, url, weight = 1) {
  const text = htmlToText(html);

  const rates = {
    national: firstRate(text, [
      /national\s+average\s+flatbed\s+rates?\s+(?:are|is|at|averaged?)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /flatbed\s+freight\s+rates?[^$]{0,220}national\s+average[^$]{0,120}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /flatbed\s*[:\-]\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+mile|\/mi|a\s+mile)/i,
      /national\s+flatbed\s+(?:spot\s+)?(?:rate|rates|average)[^$]{0,140}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /flatbed\s+spot\s+rates?[^.]{0,200}(?:national\s+averages?\s+)?(?:exceeding|above|around|at|to)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    midwest: firstRate(text, [/Midwest[^$0-9]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i]),
    west: firstRate(text, [
      /lowest\s+rates?\s+are\s+in\s+the\s+West[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /West\s+flatbed[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /West[^$]{0,120}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    southeast: firstRate(text, [
      /South\s*East[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
      /Southeast[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    northeast: firstRate(text, [/Northeast[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i]),
    southwest: firstRate(text, [/Southwest[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i]),
  };

  const hasAny = Object.values(rates).some(isUsableRate);
  if (!hasAny) return null;

  return { source: sourceName, url, type: "public-current-rate-summary", weight, foundAt: new Date().toISOString(), rates };
}

function parseMarketSignal(html, sourceName, url, weight = 1) {
  const text = htmlToText(html);
  const lower = text.toLowerCase();
  const hasFlatbed = lower.includes("flatbed");
  const stronger = /(strengthened|tighter|moved higher|rate momentum|firmer|improved pricing|capacity reductions|supporting higher)/i.test(text);
  const softer = /(softened|weaker|rate relief|declined|looser|excess capacity)/i.test(text);
  if (!hasFlatbed || (!stronger && !softer)) return null;
  return {
    source: sourceName,
    url,
    type: "market-condition-signal",
    weight,
    foundAt: new Date().toISOString(),
    rates: {},
    trendSignal: stronger && !softer ? "firmer/tighter flatbed market" : softer && !stronger ? "softer flatbed market" : "mixed flatbed market",
  };
}

function parseSourceByType(html, source) {
  if (source.parser === "dat-regional-map") return parseDatRegionalMap(html, source.name, source.url, source.weight);
  if (source.parser === "market-signal") return parseMarketSignal(html, source.name, source.url, source.weight);
  return parseGenericFlatbedRates(html, source.name, source.url, source.weight);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "AbbyTransportRateUpdater/3.0 (+https://www.abbytransport.com)",
      "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function collectSources() {
  const sources = [];
  const failures = [];
  const extraUrls = (process.env.EXTRA_RATE_SOURCE_URLS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map((url, i) => ({ name: `Extra public source ${i + 1}`, url, parser: "generic-flatbed-rates", weight: 1.0 }));

  for (const source of [...DEFAULT_PUBLIC_SOURCES, ...extraUrls]) {
    try {
      const html = await fetchText(source.url);
      const parsed = parseSourceByType(html, source);
      if (parsed) sources.push(parsed);
      else failures.push({ source: source.name, error: "No parseable numeric rate or market signal found" });
    } catch (error) {
      failures.push({ source: source.name, error: error.message });
    }
  }
  return { sources, failures };
}

function weightedAverage(items, key) {
  let numerator = 0;
  let denominator = 0;
  for (const item of items) {
    const value = item.rates?.[key];
    const weight = item.weight || 1;
    if (!isUsableRate(value)) continue;
    numerator += Number(value) * weight;
    denominator += weight;
  }
  return denominator ? round2(numerator / denominator) : null;
}

function nationalFromRegionalAnchors(rates) {
  const values = [rates.midwest, rates.west, rates.southeast, rates.northeast, rates.southwest]
    .filter(isUsableRate)
    .map(Number);
  return values.length >= 3 ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

async function readExistingData() {
  try {
    return JSON.parse(await fs.readFile(RATE_JSON_PATH, "utf8"));
  } catch {
    return null;
  }
}

function buildRegionFactors(rates) {
  const national = rates.national;
  const factors = Object.fromEntries(REGION_CODES.map(code => [code, 1]));

  if (isUsableRate(rates.midwest)) factors.MID = rates.midwest / national;
  if (isUsableRate(rates.southeast)) factors.SOU = rates.southeast / national;
  if (isUsableRate(rates.northeast)) factors.NOR = rates.northeast / national;

  if (isUsableRate(rates.southwest)) {
    const southwestFactor = rates.southwest / national;
    factors.SWE = southwestFactor;
    factors.TEX = 1 + (southwestFactor - 1) * 0.55;
    factors.SPL = 1 + (southwestFactor - 1) * 0.30;
  }

  if (isUsableRate(rates.west)) {
    const westFactor = rates.west / national;
    factors.NWE = westFactor;
    factors.MTN = 1 + (westFactor - 1) * 0.45;
    if (!isUsableRate(rates.southwest)) factors.SWE = westFactor;
  }

  if (isUsableRate(rates.midwest) && isUsableRate(rates.southwest)) {
    factors.SPL = factors.MID * 0.45 + factors.SWE * 0.55;
  } else if (isUsableRate(rates.midwest)) {
    factors.SPL = 1 + (factors.MID - 1) * 0.45;
  }

  return factors;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function generateRegionRates(rates) {
  const national = rates.national;
  const nationalScale = national / BASE_NATIONAL_AVERAGE;
  const regionFactors = buildRegionFactors(rates);
  const anchorStrength = 0.42;

  const output = {};
  for (const origin of REGION_CODES) {
    output[origin] = {};
    for (const destination of REGION_CODES) {
      const baseRate = BASE_REGION_RATES[origin][destination];
      const rawRegionFactor = Math.sqrt(regionFactors[origin] * regionFactors[destination]);
      const blendedFactor = 1 + (rawRegionFactor - 1) * anchorStrength;
      const adjusted = baseRate * nationalScale * blendedFactor * COMPETITIVE_MARKET_MULTIPLIER;
      output[origin][destination] = round2(clamp(adjusted, national * 0.72, national * 1.42));
    }
  }
  return output;
}

function formatObjectForIndex(obj, indent = 2) {
  return JSON.stringify(obj, null, indent)
    .replace(/"([A-Z]{3}|flatbed|stepdeck|conestoga|dryvan|reefer|hotshot|boxtruck|poweronly|rgn)":/g, "$1:");
}

function formatRegionRatesForIndex(regionRates) {
  const lines = ["{", "    // NOR SOU MID SPL TEX MTN SWE NWE"];
  for (const origin of REGION_CODES) {
    const pairs = REGION_CODES
      .map(destination => `${destination}:${Number(regionRates[origin][destination]).toFixed(2)}`)
      .join(", ");
    lines.push(`    ${origin}: { ${pairs} },`);
  }
  lines.push("  }");
  return lines.join("\n");
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "/") { lineComment = true; i++; continue; }
    if (char === "/" && next === "*") { blockComment = true; i++; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Could not find matching brace.");
}

function replaceObjectLiteral(source, propertyName, replacementObjectLiteral) {
  const propertyIndex = source.indexOf(`${propertyName}:`);
  if (propertyIndex < 0) throw new Error(`Could not find ${propertyName}: in index.html`);
  const openIndex = source.indexOf("{", propertyIndex);
  if (openIndex < 0) throw new Error(`Could not find opening brace for ${propertyName}.`);
  const closeIndex = findMatchingBrace(source, openIndex);
  return source.slice(0, propertyIndex) + `${propertyName}: ${replacementObjectLiteral}` + source.slice(closeIndex + 1);
}

function patchIndexHtml(original, defaultCostPerMile, regionRates) {
  let html = original;

  html = html.replace(
    /DEFAULT_COST_PER_MILE:\s*[0-9]+(?:\.[0-9]+)?\s*,[^\n\r]*/,
    `DEFAULT_COST_PER_MILE: ${defaultCostPerMile.toFixed(2)}, // auto-updated about every 3 days; see data/lane-rates.json`
  );

  html = html.replace(
    /(<input\b[\s\S]{0,300}?id=["']costPerMile["'][\s\S]{0,300}?value=["'])[0-9]+(?:\.[0-9]+)?(["'])/,
    `$1${defaultCostPerMile.toFixed(2)}$2`
  );

  html = replaceObjectLiteral(html, "REGION_RATES", formatRegionRatesForIndex(regionRates));
  html = replaceObjectLiteral(html, "EQUIPMENT_PROFILES", formatObjectForIndex(EQUIPMENT_PROFILES, 4));

  return html;
}

function summarizeSources(sources) {
  if (!sources.length) return "Previous lane-rate data retained; no public source parsed successfully";
  return sources.map(s => s.source).join(" + ");
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function fallbackRate(existing, key) {
  if (isUsableRate(existing?.rawRegionalAnchors?.[key])) return Number(existing.rawRegionalAnchors[key]);
  if (isUsableRate(existing?.regionalAnchors?.[key])) return Number(existing.regionalAnchors[key]) / COMPETITIVE_MARKET_MULTIPLIER;
  return null;
}

async function main() {
  const now = new Date().toISOString();
  const existing = await readExistingData();
  const { sources, failures } = await collectSources();
  const effectiveSources = sources.length
    ? sources
    : Array.isArray(existing?.sources)
      ? existing.sources.map(s => ({ ...s, reusedFromPreviousUpdate: true }))
      : [];

  let rates = {
    national: weightedAverage(sources, "national"),
    midwest: weightedAverage(sources, "midwest"),
    west: weightedAverage(sources, "west"),
    southeast: weightedAverage(sources, "southeast"),
    northeast: weightedAverage(sources, "northeast"),
    southwest: weightedAverage(sources, "southwest"),
  };

  if (!isUsableRate(rates.national)) rates.national = nationalFromRegionalAnchors(rates);
  if (!isUsableRate(rates.national) && existing?.rawMarketNationalAverage) rates.national = Number(existing.rawMarketNationalAverage);
  if (!isUsableRate(rates.national) && existing?.defaultCostPerMile) rates.national = Number(existing.defaultCostPerMile) / COMPETITIVE_MARKET_MULTIPLIER;

  for (const key of ["midwest", "west", "southeast", "northeast", "southwest"]) {
    if (!isUsableRate(rates[key])) rates[key] = fallbackRate(existing, key);
  }
  if (!isUsableRate(rates.national)) rates.national = BASE_NATIONAL_AVERAGE;

  rates = Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, isUsableRate(value) ? round2(value) : null]));

  const competitiveDefaultCostPerMile = round2(rates.national * COMPETITIVE_MARKET_MULTIPLIER);
  const regionRates = generateRegionRates(rates);
  const indexOriginal = await fs.readFile(INDEX_PATH, "utf8");
  await fs.writeFile(INDEX_PATH, patchIndexHtml(indexOriginal, competitiveDefaultCostPerMile, regionRates), "utf8");

  const data = {
    schemaVersion: 5,
    updatedAt: now,
    updateCadence: "every-3-days",
    model: "three-day-public-update-plus-dat-regional-anchors-plus-realistic-abby-market-discount-matrix",
    equipment: "flatbed-base-with-equipment-multipliers",
    rateType: "estimated realistic broker booking target per mile with a small discount; updated every 3 days when GitHub Actions runs; not a guaranteed live lane average",
    defaultCostPerMile: competitiveDefaultCostPerMile,
    rawMarketNationalAverage: rates.national,
    competitiveMarketMultiplier: COMPETITIVE_MARKET_MULTIPLIER,
    regionalAnchors: Object.fromEntries(Object.entries(rates).filter(([key]) => key !== "national").map(([key, value]) => [key, isUsableRate(value) ? round2(value * COMPETITIVE_MARKET_MULTIPLIER) : null])),
    rawRegionalAnchors: Object.fromEntries(Object.entries(rates).filter(([key]) => key !== "national")),
    regionCodes: REGION_LABELS,
    regionRates,
    equipmentProfiles: EQUIPMENT_PROFILES,
    display: {
      showConfidence: true,
      showLastUpdated: true,
      customerPdfHidesMarketBasis: true,
    },
    methodology: {
      baseNationalAverage: BASE_NATIONAL_AVERAGE,
      competitiveMarketMultiplier: COMPETITIVE_MARKET_MULTIPLIER,
      note: "About every 3 days, public freight-rate data is parsed when available, blended by source weight, and discounted into a competitive Abby booking target. DAT direct regional anchors now influence the regional matrix more precisely than a single national average.",
      generalCalibration: "General customers remain realistic with a small Abby discount. Tycon Systems remains governed by its separate customer-profile Win Mode in pricing-engine-config.json and index.html.",
      liveLaneLimit: "This remains a semi-real public-source regional estimate, not live city-to-city DAT RateView or Truckstop Rate Insights.",
    },
    sources: effectiveSources.map(s => ({ source: s.source, url: s.url, type: s.type, weight: s.weight, foundAt: s.foundAt, rates: s.rates, trendSignal: s.trendSignal || undefined, reusedFromPreviousUpdate: s.reusedFromPreviousUpdate || undefined })),
    failures,
  };
  await writeJson(RATE_JSON_PATH, data);

  let history = [];
  try {
    history = JSON.parse(await fs.readFile(HISTORY_JSON_PATH, "utf8"));
    if (!Array.isArray(history)) history = [];
  } catch {}

  history.push({
    updatedAt: now,
    updateCadence: "every-3-days",
    defaultCostPerMile: competitiveDefaultCostPerMile,
    rawMarketNationalAverage: rates.national,
    regionalAnchors: data.regionalAnchors,
    rawRegionalAnchors: data.rawRegionalAnchors,
    sourceSummary: summarizeSources(effectiveSources),
    failures: failures.length,
  });
  history = history.slice(-180);
  await writeJson(HISTORY_JSON_PATH, history);

  console.log(`Updated 3-day competitive flatbed bid rate: $${competitiveDefaultCostPerMile.toFixed(2)}/mi (raw market anchor $${rates.national.toFixed(2)}/mi)`);
  console.log(`Sources: ${summarizeSources(effectiveSources)}`);
  if (failures.length) console.log(`Source failures: ${JSON.stringify(failures)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
