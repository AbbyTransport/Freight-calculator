#!/usr/bin/env node
/**
 * Abby Transport Freight Calculator — 3-day multi-source consensus updater.
 *
 * No paid API required. This is designed to get closer to paid-lane-rate logic
 * by combining several public signals:
 *  - DAT Trendlines / DAT flatbed public pages: numeric flatbed anchors when parseable.
 *  - Scale Funding Current Freight Rates: numeric national/regional flatbed anchors.
 *  - FTR / Truckstop public Spot Market Insights: spot-market pressure signal.
 *  - EIA weekly diesel data: fuel pressure adjustment.
 *  - C.H. Robinson market updates and ACT Research pages: macro trend modifiers.
 *
 * It is still not DAT RateView, Truckstop Rate Insights, SONAR TRAC, or any
 * paid transactional lane API. It is a public-data consensus model with audit trail.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "index.html");
const DATA_DIR = path.join(ROOT, "data");
const RATE_JSON_PATH = path.join(DATA_DIR, "lane-rates.json");
const HISTORY_JSON_PATH = path.join(DATA_DIR, "lane-rates-history.json");

const UPDATE_INTERVAL_HOURS = Number(process.env.UPDATE_INTERVAL_HOURS || 72);
const FORCE_RATE_UPDATE = /^(1|true|yes)$/i.test(String(process.env.FORCE_RATE_UPDATE || "")) || process.argv.includes("--force");
const OFFLINE_MODE = /^(1|true|yes)$/i.test(String(process.env.OFFLINE_MODE || ""));

const REGION_CODES = ["NOR", "SOU", "MID", "SPL", "TEX", "MTN", "SWE", "NWE"];
const BASE_NATIONAL_AVERAGE = 2.70;
const COMPETITIVE_MARKET_MULTIPLIER = 0.875;
const DIESEL_BENCHMARK = 3.80;

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
    id: "dat-flatbed-national",
    name: "DAT Trendlines Flatbed National Rates",
    url: "https://www.dat.com/trendlines/flatbed/national-rates",
    type: "freight-rate",
    weight: 3.5,
  },
  {
    id: "dat-trendlines",
    name: "DAT Trendlines",
    url: "https://www.dat.com/trendlines",
    type: "freight-rate",
    weight: 2.0,
  },
  {
    id: "scale-current-freight-rates",
    name: "Scale Funding Current Freight Rates",
    url: "https://getscalefunding.com/resources/current-freight-rates/",
    type: "freight-rate",
    weight: 3.0,
  },
  {
    id: "ftr-truckstop-current",
    name: "FTR / Truckstop Spot Market Insights",
    url: "https://spot.ftrintel.com/current",
    type: "market-pressure",
    weight: 2.5,
  },
  {
    id: "eia-diesel",
    name: "EIA Weekly Diesel Fuel Update",
    url: "https://www.eia.gov/petroleum/gasdiesel/",
    type: "diesel",
    weight: 2.5,
  },
  {
    id: "ch-robinson-market-update",
    name: "C.H. Robinson Freight Market Update",
    url: "https://www.chrobinson.com/en-us/resources/insights-and-advisories/north-america-freight-insights/",
    type: "market-pressure",
    weight: 1.0,
  },
  {
    id: "act-freight-rates",
    name: "ACT Research Freight Trucking Rates",
    url: "https://www.actresearch.net/resources/data-tracking/freight-trucking-rates",
    type: "market-pressure",
    weight: 1.0,
  },
];

function round2(value) { return Number(Number(value).toFixed(2)); }
function round3(value) { return Number(Number(value).toFixed(3)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function isUsableRate(value) { return Number.isFinite(Number(value)) && Number(value) >= 1.5 && Number(value) <= 8; }
function isUsableDiesel(value) { return Number.isFinite(Number(value)) && Number(value) >= 2.0 && Number(value) <= 8.5; }
function percent(value) { return round2(Number(value) * 100); }

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

function firstDiesel(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(String(match[1]).replace(/,/g, ""));
    if (isUsableDiesel(value)) return value;
  }
  return null;
}

function parsePublicFreightRates(html, source) {
  const text = htmlToText(html);

  const national = firstRate(text, [
    /national\s+average\s+flatbed\s+rates?\s+(?:are|is|at|averaged?)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /flatbed\s+freight\s+rates?[^$]{0,240}national\s+average[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /national\s+flatbed\s+(?:spot\s+)?(?:rate|rates|average)[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /flatbed\s*[:\-]\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+mile|\/mi|a\s+mile)/i,
    /flatbed\s+spot\s+rates?[^.]{0,220}(?:national\s+averages?\s+)?(?:exceeding|above|around|at|near)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ]);

  const midwest = firstRate(text, [
    /Midwest[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ]);

  const west = firstRate(text, [
    /lowest\s+rates?\s+are\s+in\s+the\s+West[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /West\s+flatbed[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /West[^$]{0,120}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ]);

  const southeast = firstRate(text, [
    /South\s*East[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /Southeast[^$]{0,160}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ]);

  const dryvan = firstRate(text, [
    /national\s+average\s+(?:dry\s+)?van\s+rates?\s+(?:are|is|at|averaged?)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /(?:dry\s+)?van\s*[:\-]\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+mile|\/mi|a\s+mile)/i,
  ]);

  const reefer = firstRate(text, [
    /national\s+average\s+reefer\s+rates?\s+(?:are|is|at|averaged?)\s+\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /reefer\s*[:\-]\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+mile|\/mi|a\s+mile)/i,
  ]);

  const rates = { national, midwest, west, southeast, dryvan, reefer };
  const hasAny = Object.values(rates).some(v => isUsableRate(v));
  if (!hasAny) return null;

  return { source: source.name, id: source.id, url: source.url, type: source.type, weight: source.weight, foundAt: new Date().toISOString(), rates };
}

function parseDiesel(html, source) {
  const text = htmlToText(html);
  const national = firstDiesel(text, [
    /U\.?S\.?\s+(?:No\.?\s*)?2\s+Diesel[^$0-9]{0,160}\$?\s*([0-9]+\.[0-9]{2,3})/i,
    /On-Highway\s+Diesel[^$0-9]{0,160}\$?\s*([0-9]+\.[0-9]{2,3})/i,
    /Diesel\s+Fuel[^$0-9]{0,160}\$?\s*([0-9]+\.[0-9]{2,3})/i,
    /U\.?S\.?\s+National\s+Average[^$0-9]{0,160}\$?\s*([0-9]+\.[0-9]{2,3})/i,
  ]);

  const eastCoast = firstDiesel(text, [/East\s+Coast[^$0-9]{0,120}\$?\s*([0-9]+\.[0-9]{2,3})/i]);
  const midwest = firstDiesel(text, [/Midwest[^$0-9]{0,120}\$?\s*([0-9]+\.[0-9]{2,3})/i]);
  const gulfCoast = firstDiesel(text, [/Gulf\s+Coast[^$0-9]{0,120}\$?\s*([0-9]+\.[0-9]{2,3})/i]);
  const rockyMountain = firstDiesel(text, [/Rocky\s+Mountain[^$0-9]{0,120}\$?\s*([0-9]+\.[0-9]{2,3})/i]);
  const westCoast = firstDiesel(text, [/West\s+Coast[^$0-9]{0,120}\$?\s*([0-9]+\.[0-9]{2,3})/i]);

  if (!isUsableDiesel(national) && ![eastCoast, midwest, gulfCoast, rockyMountain, westCoast].some(isUsableDiesel)) return null;

  return {
    source: source.name,
    id: source.id,
    url: source.url,
    type: source.type,
    weight: source.weight,
    foundAt: new Date().toISOString(),
    diesel: { national, eastCoast, midwest, gulfCoast, rockyMountain, westCoast },
  };
}

function scoreTextPressure(text) {
  const lower = String(text).toLowerCase();
  let score = 0;
  const positives = [
    [/record\s+high|near[- ]record|all[- ]time\s+high/g, 0.035],
    [/strongest\s+(?:week|increase|gain)|largest\s+(?:increase|gain)/g, 0.025],
    [/tight(?:en|ening)?\s+(?:capacity|market)|capacity\s+tight|carrier\s+attrition/g, 0.022],
    [/rates?\s+(?:are\s+)?(?:rising|rose|up|increased|higher)|rate\s+pressure|costs?\s+climb/g, 0.015],
    [/load[- ]to[- ]truck\s+ratio\s+(?:up|increased|higher)|demand\s+(?:up|strong)/g, 0.012],
  ];
  const negatives = [
    [/rates?\s+(?:are\s+)?(?:falling|fell|down|declined|lower)|retreated|soft(?:en|ening)?/g, 0.015],
    [/load\s+activity\s+declines|spot\s+volume\s+fell|volume\s+fell|postings\s+declined/g, 0.012],
    [/capacity\s+(?:loose|easing)|truck\s+postings\s+(?:rose|increased)|market\s+soft/g, 0.015],
  ];
  for (const [pattern, amount] of positives) {
    const count = lower.match(pattern)?.length || 0;
    score += amount * Math.min(count, 3);
  }
  for (const [pattern, amount] of negatives) {
    const count = lower.match(pattern)?.length || 0;
    score -= amount * Math.min(count, 3);
  }
  return clamp(score, -0.06, 0.08);
}

function parseMarketPressure(html, source) {
  const text = htmlToText(html);
  const pressure = scoreTextPressure(text);
  const direction = pressure > 0.015 ? "Rising" : pressure < -0.015 ? "Softening" : "Stable";
  return { source: source.name, id: source.id, url: source.url, type: source.type, weight: source.weight, foundAt: new Date().toISOString(), pressure, direction };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "AbbyTransportRateUpdater/3.0 (+https://www.abbytransport.com)",
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function collectSources() {
  const sources = [];
  const failures = [];
  const extraUrls = (process.env.EXTRA_RATE_SOURCE_URLS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map((url, i) => ({ id: `extra-public-source-${i + 1}`, name: `Extra public source ${i + 1}`, url, type: "freight-rate", weight: 1.0 }));

  if (OFFLINE_MODE) return { sources, failures: [{ source: "OFFLINE_MODE", error: "Fetch skipped by OFFLINE_MODE" }] };

  for (const source of [...DEFAULT_PUBLIC_SOURCES, ...extraUrls]) {
    try {
      const html = await fetchText(source.url);
      let parsed = null;
      if (source.type === "diesel") parsed = parseDiesel(html, source);
      else if (source.type === "market-pressure") parsed = parseMarketPressure(html, source);
      else parsed = parsePublicFreightRates(html, source);

      if (parsed) sources.push(parsed);
      else failures.push({ source: source.name, url: source.url, error: "No parseable freight, diesel, or trend signal found" });
    } catch (error) {
      failures.push({ source: source.name, url: source.url, error: error.message });
    }
  }
  return { sources, failures };
}

function weightedAverageRate(items, key) {
  const values = [];
  for (const item of items) {
    const value = item.rates?.[key];
    const weight = item.weight || 1;
    if (isUsableRate(value)) values.push({ value: Number(value), weight, source: item.source });
  }
  if (!values.length) return null;
  if (values.length === 1) return round2(values[0].value);
  const sorted = values.map(v => v.value).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = values.filter(v => Math.abs(v.value - median) / median <= 0.28);
  const usable = filtered.length ? filtered : values;
  const numerator = usable.reduce((sum, v) => sum + v.value * v.weight, 0);
  const denominator = usable.reduce((sum, v) => sum + v.weight, 0);
  return denominator ? round2(numerator / denominator) : null;
}

function weightedAveragePressure(items) {
  const trends = items.filter(item => Number.isFinite(Number(item.pressure)));
  if (!trends.length) return 0;
  const numerator = trends.reduce((sum, item) => sum + Number(item.pressure) * (item.weight || 1), 0);
  const denominator = trends.reduce((sum, item) => sum + (item.weight || 1), 0);
  return clamp(numerator / denominator, -0.055, 0.065);
}

function getMarketDirection(pressure) {
  if (pressure >= 0.025) return "Rising";
  if (pressure >= 0.008) return "Slightly rising";
  if (pressure <= -0.025) return "Softening";
  if (pressure <= -0.008) return "Slightly softening";
  return "Stable";
}

function buildDieselModel(dieselSources, existing) {
  const first = dieselSources.find(s => s.diesel);
  const existingDiesel = existing?.marketConsensus?.diesel || {};
  const national = isUsableDiesel(first?.diesel?.national) ? Number(first.diesel.national) : (isUsableDiesel(existingDiesel.nationalAverage) ? Number(existingDiesel.nationalAverage) : null);
  const benchmark = isUsableDiesel(existingDiesel.benchmark) ? Number(existingDiesel.benchmark) : DIESEL_BENCHMARK;
  const rawAdjustment = national ? (national - benchmark) * 0.018 : 0;
  const adjustment = clamp(rawAdjustment, -0.025, 0.055);

  const regionDiesel = first?.diesel || {};
  const regionFactors = Object.fromEntries(REGION_CODES.map(code => [code, 1]));
  if (national) {
    const regionMap = {
      NOR: regionDiesel.eastCoast,
      SOU: regionDiesel.eastCoast || regionDiesel.gulfCoast,
      MID: regionDiesel.midwest,
      SPL: regionDiesel.gulfCoast || regionDiesel.midwest,
      TEX: regionDiesel.gulfCoast,
      MTN: regionDiesel.rockyMountain,
      SWE: regionDiesel.westCoast || regionDiesel.rockyMountain,
      NWE: regionDiesel.westCoast,
    };
    for (const code of REGION_CODES) {
      const value = regionMap[code];
      if (isUsableDiesel(value)) {
        regionFactors[code] = clamp(1 + ((Number(value) - national) * 0.012), 0.965, 1.045);
      }
    }
  }

  return {
    nationalAverage: national ? round3(national) : null,
    benchmark: round3(benchmark),
    adjustmentMultiplier: round3(1 + adjustment),
    adjustmentPercent: percent(adjustment),
    regionFactors,
    source: first?.source || existingDiesel.source || null,
  };
}

async function readExistingData() {
  try { return JSON.parse(await fs.readFile(RATE_JSON_PATH, "utf8")); }
  catch { return null; }
}

function shouldSkipUpdate(existing) {
  if (FORCE_RATE_UPDATE) return false;
  const last = existing?.updatedAt ? new Date(existing.updatedAt) : null;
  if (!last || Number.isNaN(last.getTime())) return false;
  const ageHours = (Date.now() - last.getTime()) / 36e5;
  return ageHours < UPDATE_INTERVAL_HOURS;
}

function buildRegionFactors(rates, dieselModel) {
  const national = rates.modelNationalAverage || rates.national;
  const factors = Object.fromEntries(REGION_CODES.map(code => [code, 1]));

  if (isUsableRate(rates.midwest) && isUsableRate(national)) {
    const midwestFactor = rates.midwest / national;
    factors.MID = midwestFactor;
    factors.SPL = 1 + (midwestFactor - 1) * 0.45;
  }

  if (isUsableRate(rates.west) && isUsableRate(national)) {
    const westFactor = rates.west / national;
    factors.SWE = westFactor;
    factors.NWE = westFactor;
    factors.MTN = 1 + (westFactor - 1) * 0.40;
  }

  if (isUsableRate(rates.southeast) && isUsableRate(national)) {
    const southeastFactor = rates.southeast / national;
    factors.SOU = southeastFactor;
    factors.NOR = 1 + (southeastFactor - 1) * 0.35;
  }

  const dieselFactors = dieselModel?.regionFactors || {};
  for (const code of REGION_CODES) {
    if (Number.isFinite(Number(dieselFactors[code]))) {
      factors[code] *= Number(dieselFactors[code]);
    }
  }

  return factors;
}

function generateRegionRates(rates, dieselModel) {
  const national = rates.modelNationalAverage;
  const nationalScale = national / BASE_NATIONAL_AVERAGE;
  const regionFactors = buildRegionFactors(rates, dieselModel);
  const anchorStrength = 0.42;

  const output = {};
  for (const origin of REGION_CODES) {
    output[origin] = {};
    for (const destination of REGION_CODES) {
      const baseRate = BASE_REGION_RATES[origin][destination];
      const rawRegionFactor = Math.sqrt(regionFactors[origin] * regionFactors[destination]);
      const blendedFactor = 1 + (rawRegionFactor - 1) * anchorStrength;
      const adjusted = baseRate * nationalScale * blendedFactor * COMPETITIVE_MARKET_MULTIPLIER;
      output[origin][destination] = round2(clamp(adjusted, national * 0.69, national * 1.45));
    }
  }
  return output;
}

function maybeDeriveEquipmentProfiles(rates) {
  const profiles = JSON.parse(JSON.stringify(EQUIPMENT_PROFILES));
  if (isUsableRate(rates.dryvan) && isUsableRate(rates.national)) {
    profiles.dryvan.multiplier = round2(clamp(rates.dryvan / rates.national, 0.68, 1.02));
  }
  if (isUsableRate(rates.reefer) && isUsableRate(rates.national)) {
    profiles.reefer.multiplier = round2(clamp(rates.reefer / rates.national, 0.78, 1.18));
  }
  return profiles;
}

function formatObjectForIndex(obj, indent = 2) {
  return JSON.stringify(obj, null, indent)
    .replace(/"([A-Za-z0-9_]+)":/g, "$1:");
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

function patchIndexHtml(original, defaultCostPerMile, regionRates, equipmentProfiles) {
  let html = original;

  html = html.replace(
    /DEFAULT_COST_PER_MILE:\s*[0-9]+(?:\.[0-9]+)?\s*,[^\n\r]*/,
    `DEFAULT_COST_PER_MILE: ${defaultCostPerMile.toFixed(2)}, // auto-updated every 3 days; see data/lane-rates.json`
  );

  html = html.replace(
    /(<input\b[\s\S]{0,300}?id=["']costPerMile["'][\s\S]{0,300}?value=["'])[0-9]+(?:\.[0-9]+)?(["'])/,
    `$1${defaultCostPerMile.toFixed(2)}$2`
  );

  html = replaceObjectLiteral(html, "REGION_RATES", formatRegionRatesForIndex(regionRates));
  html = replaceObjectLiteral(html, "EQUIPMENT_PROFILES", formatObjectForIndex(equipmentProfiles, 4));

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

async function main() {
  const now = new Date().toISOString();
  const existing = await readExistingData();

  if (shouldSkipUpdate(existing)) {
    const last = new Date(existing.updatedAt);
    const ageHours = (Date.now() - last.getTime()) / 36e5;
    console.log(`Last valid update is ${ageHours.toFixed(1)} hours old. Target interval is ${UPDATE_INTERVAL_HOURS} hours. Skipping.`);
    return;
  }

  const collected = await collectSources();
  let sources = collected.sources;
  const failures = collected.failures;

  // If every public page fails or blocks parsing, keep the previous good source
  // metadata and last consensus. This prevents the calculator from looking
  // less confident simply because a public webpage changed its HTML again,
  // a deeply human contribution to software entropy.
  if (!sources.length && Array.isArray(existing?.sources) && existing.sources.length) {
    sources = existing.sources.map(source => ({ ...source, reusedFromPreviousSnapshot: true }));
    failures.push({ source: "Previous source snapshot", error: "All live public sources failed; reused previous good source metadata and consensus inputs" });
  }

  const freightSources = sources.filter(s => s.type === "freight-rate");
  const pressureSources = sources.filter(s => s.type === "market-pressure");
  const dieselSources = sources.filter(s => s.type === "diesel");

  let national = weightedAverageRate(freightSources, "national");
  let midwest = weightedAverageRate(freightSources, "midwest");
  let west = weightedAverageRate(freightSources, "west");
  let southeast = weightedAverageRate(freightSources, "southeast");
  let dryvan = weightedAverageRate(freightSources, "dryvan");
  let reefer = weightedAverageRate(freightSources, "reefer");

  if (!isUsableRate(national) && existing?.rawMarketNationalAverage) national = Number(existing.rawMarketNationalAverage);
  if (!isUsableRate(national) && existing?.marketConsensus?.rawMarketNationalAverage) national = Number(existing.marketConsensus.rawMarketNationalAverage);
  if (!isUsableRate(national) && existing?.defaultCostPerMile) national = Number(existing.defaultCostPerMile) / COMPETITIVE_MARKET_MULTIPLIER;
  if (!isUsableRate(midwest) && existing?.regionalAnchors?.midwest) midwest = Number(existing.regionalAnchors.midwest) / COMPETITIVE_MARKET_MULTIPLIER;
  if (!isUsableRate(west) && existing?.regionalAnchors?.west) west = Number(existing.regionalAnchors.west) / COMPETITIVE_MARKET_MULTIPLIER;
  if (!isUsableRate(southeast) && existing?.regionalAnchors?.southeast) southeast = Number(existing.regionalAnchors.southeast) / COMPETITIVE_MARKET_MULTIPLIER;
  if (!isUsableRate(national)) national = BASE_NATIONAL_AVERAGE;

  const dieselModel = buildDieselModel(dieselSources, existing);
  let marketPressure = weightedAveragePressure(pressureSources);
  if (!pressureSources.length && Number.isFinite(Number(existing?.marketConsensus?.marketPressure))) {
    marketPressure = Number(existing.marketConsensus.marketPressure);
  }
  marketPressure = clamp(marketPressure, -0.055, 0.065);

  const dieselMultiplier = Number(dieselModel.adjustmentMultiplier || 1);
  const pressureMultiplier = 1 + marketPressure;
  const modelNationalAverage = round2(Number(national) * pressureMultiplier * dieselMultiplier);
  const rates = {
    national: round2(national),
    modelNationalAverage,
    midwest: isUsableRate(midwest) ? round2(Number(midwest) * pressureMultiplier * dieselMultiplier) : null,
    west: isUsableRate(west) ? round2(Number(west) * pressureMultiplier * dieselMultiplier) : null,
    southeast: isUsableRate(southeast) ? round2(Number(southeast) * pressureMultiplier * dieselMultiplier) : null,
    dryvan: isUsableRate(dryvan) ? round2(dryvan) : null,
    reefer: isUsableRate(reefer) ? round2(reefer) : null,
  };

  const equipmentProfiles = maybeDeriveEquipmentProfiles({ ...rates, national: rates.national });
  const competitiveDefaultCostPerMile = round2(modelNationalAverage * COMPETITIVE_MARKET_MULTIPLIER);
  const regionRates = generateRegionRates(rates, dieselModel);

  const indexOriginal = await fs.readFile(INDEX_PATH, "utf8");
  await fs.writeFile(INDEX_PATH, patchIndexHtml(indexOriginal, competitiveDefaultCostPerMile, regionRates, equipmentProfiles), "utf8");

  const data = {
    schemaVersion: 5,
    updatedAt: now,
    updateCadence: "every-72-hours-when-public-sources-are-available",
    model: "3-day-multi-source-public-consensus-plus-realistic-abby-market-discount-matrix",
    equipment: "flatbed-base-with-equipment-multipliers",
    rateType: "estimated competitive broker booking target per mile based on public multi-source consensus; not a guaranteed live city-to-city lane average",
    defaultCostPerMile: competitiveDefaultCostPerMile,
    rawMarketNationalAverage: rates.national,
    modelNationalAverage,
    competitiveMarketMultiplier: COMPETITIVE_MARKET_MULTIPLIER,
    regionalAnchors: {
      midwest: rates.midwest ? round2(rates.midwest * COMPETITIVE_MARKET_MULTIPLIER) : null,
      west: rates.west ? round2(rates.west * COMPETITIVE_MARKET_MULTIPLIER) : null,
      southeast: rates.southeast ? round2(rates.southeast * COMPETITIVE_MARKET_MULTIPLIER) : null,
    },
    marketConsensus: {
      sourceCount: sources.length,
      numericSourceCount: freightSources.filter(s => Object.values(s.rates || {}).some(isUsableRate)).length,
      trendSourceCount: pressureSources.length,
      dieselSourceCount: dieselSources.length,
      rawMarketNationalAverage: rates.national,
      modelNationalAverage,
      marketPressure,
      marketPressurePercent: percent(marketPressure),
      marketDirection: getMarketDirection(marketPressure),
      diesel: dieselModel,
      weights: {
        numericRates: "DAT/Scale numeric anchors dominate when parseable; extreme outliers are filtered before averaging.",
        marketPressure: "FTR/Truckstop, C.H. Robinson, and ACT public text are used as small directional modifiers, not raw rate sources.",
        diesel: "EIA weekly diesel is used as a mild fuel-cost pressure adjustment, capped to avoid overreacting.",
      },
    },
    regionCodes: REGION_LABELS,
    regionRates,
    equipmentProfiles,
    display: {
      showConfidence: true,
      showLastUpdated: true,
      showMarketDirection: true,
      showDieselAdjustment: true,
      customerPdfHidesMarketBasis: true,
    },
    methodology: {
      baseNationalAverage: BASE_NATIONAL_AVERAGE,
      competitiveMarketMultiplier: COMPETITIVE_MARKET_MULTIPLIER,
      updateIntervalHours: UPDATE_INTERVAL_HOURS,
      note: "The updater now uses multiple public sources and a weighted consensus: numeric public freight-rate anchors, market-pressure text signals, and EIA diesel adjustment. It updates every 72 hours when scheduled by GitHub Actions. Tycon Systems remains handled separately by Customer Name in the calculator's pricing engine.",
    },
    sources: sources.map(s => ({
      source: s.source,
      id: s.id,
      url: s.url,
      type: s.type,
      weight: s.weight,
      foundAt: s.foundAt,
      rates: s.rates,
      diesel: s.diesel,
      pressure: Number.isFinite(Number(s.pressure)) ? round3(s.pressure) : undefined,
      direction: s.direction,
      reusedFromPreviousSnapshot: Boolean(s.reusedFromPreviousSnapshot),
    })),
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
    defaultCostPerMile: competitiveDefaultCostPerMile,
    rawMarketNationalAverage: rates.national,
    modelNationalAverage,
    marketDirection: data.marketConsensus.marketDirection,
    marketPressurePercent: data.marketConsensus.marketPressurePercent,
    dieselAdjustmentPercent: data.marketConsensus.diesel.adjustmentPercent,
    regionalAnchors: data.regionalAnchors,
    sourceSummary: summarizeSources(sources),
    sourceCount: sources.length,
    failures: failures.length,
  });
  history = history.slice(-160);
  await writeJson(HISTORY_JSON_PATH, history);

  console.log(`Updated 3-day consensus flatbed bid rate: $${competitiveDefaultCostPerMile.toFixed(2)}/mi`);
  console.log(`Raw numeric anchor: $${rates.national.toFixed(2)}/mi | model national: $${modelNationalAverage.toFixed(2)}/mi`);
  console.log(`Market direction: ${data.marketConsensus.marketDirection} (${data.marketConsensus.marketPressurePercent}%) | diesel adj: ${data.marketConsensus.diesel.adjustmentPercent}%`);
  console.log(`Sources: ${summarizeSources(sources)}`);
  if (failures.length) console.log(`Source failures: ${JSON.stringify(failures)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
