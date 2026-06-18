// Prefetch script — runs in GitHub Actions (or locally with `npm run prefetch`).
// Fetches the three data sources and writes static artifacts into docs/data/
// for GitHub Pages.
//
// Water: the 新街橋 river-stage station is read straight off the Taoyuan map
// home page (Default.aspx) via a plain HTTP GET — no headless browser. The
// official cross-section popup cannot be embedded on github.io (the source
// sends X-Frame-Options: SAMEORIGIN), so the page links out to it live.
//
// Each source is isolated: a failure in one degrades gracefully and never
// blanks out the previously-good summary.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getWeather,
  getRadar,
  getRiverStation,
  getWaterStationPOI,
  getTodayRainProbability,
  computeTodayHighLow,
  RIVER_URL,
  TARGET_STATION,
} from "./sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "docs", "data");

const RADAR_PNG = path.join(dataDir, "radar.png");
const SUMMARY_JSON = path.join(dataDir, "summary.json");

function taipeiNow(now = new Date()) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

// ---- Weather --------------------------------------------------------------
async function prefetchWeather() {
  const weather = await getWeather();
  const today = computeTodayHighLow(weather);
  // Today's rain probability is a separate module; never let it sink the whole
  // weather card if it's momentarily unavailable.
  try {
    const pop = await getTodayRainProbability();
    today.rainProbabilityPercent = pop.probabilityPercent;
  } catch (error) {
    console.warn(`[weather] rain probability unavailable: ${error.message}`);
    today.rainProbabilityPercent = null;
  }
  return {
    station: weather.station,
    observedAt: weather.observedAt,
    current: weather.current,
    today,
    source: weather.source,
  };
}

// ---- Radar ----------------------------------------------------------------
async function prefetchRadar() {
  const radar = await getRadar();
  let imageSaved = false;
  try {
    const response = await fetch(radar.imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 watcher", Referer: "https://www.cwa.gov.tw/" },
    });
    if (!response.ok) throw new Error(`radar image ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());
    await writeFile(RADAR_PNG, buf);
    imageSaved = true;
  } catch (error) {
    console.warn(`[radar] image download failed, will hotlink: ${error.message}`);
  }
  return {
    observedAt: radar.observedAt,
    caption: `${radar.mode}，${radar.area}，靜止圖`,
    imageFile: imageSaved ? "radar.png" : null,
    imageUrl: imageSaved ? null : radar.imageUrl,
    source: radar.source,
  };
}

// ---- Water (新街橋 river-stage station, plain HTTP) ------------------------
// Two complementary官方 sources: the Default.aspx repeater (溪流 + level) and the
// map POI feed (bank height, observed time, and the live station image the map
// popup shows). The image is a plain <img>, so — unlike the X-Frame-Options
// guarded map page — it can be embedded / opened directly.
async function prefetchWater() {
  const [riverR, poiR] = await Promise.allSettled([
    getRiverStation(TARGET_STATION),
    getWaterStationPOI(TARGET_STATION),
  ]);
  const river = riverR.status === "fulfilled" ? riverR.value : { found: false };
  const poi = poiR.status === "fulfilled" ? poiR.value : { found: false };
  if (poiR.status === "rejected") console.warn(`[water] POI feed: ${poiR.reason?.message}`);

  if (!river.found && !poi.found) {
    return {
      found: false,
      station: TARGET_STATION,
      source: river.source || poi.source,
      liveUrl: RIVER_URL,
      note: `來源頁暫無「${TARGET_STATION}」水位資料。`,
    };
  }
  return {
    found: true,
    station: poi.station || river.station,
    stream: river.stream || "",
    level: poi.level || river.waterLevel || "",
    bankHeight: poi.bankHeight || "",
    observedAt: poi.observedAt || "",
    lat: poi.lat || river.lat || "",
    lon: poi.lon || river.lon || "",
    // Live station image — embedded / opened directly (a plain <img>, so the
    // map page's X-Frame-Options does not apply). null when the feed had none.
    imageUrl: poi.imageUrl || null,
    // Official map (fallback link, e.g. when the live image is offline).
    liveUrl: RIVER_URL,
    source: poi.source || river.source,
  };
}

// ---- Main -----------------------------------------------------------------
async function main() {
  await mkdir(dataDir, { recursive: true });

  // Keep last-good summary so partial failures don't blank out the UI.
  let previous = {};
  try {
    previous = JSON.parse(await readFile(SUMMARY_JSON, "utf-8"));
  } catch {
    previous = {};
  }

  const [weatherR, radarR, waterR] = await Promise.allSettled([
    prefetchWeather(),
    prefetchRadar(),
    prefetchWater(),
  ]);

  const summary = {
    weather: weatherR.status === "fulfilled" ? weatherR.value : previous.weather ?? null,
    radar: radarR.status === "fulfilled" ? radarR.value : previous.radar ?? null,
    // On a transient water failure keep the last-good reading so the card
    // doesn't blank out (the site is occasionally unreachable from runners).
    water: waterR.status === "fulfilled"
      ? waterR.value
      : previous.water ?? { found: false, station: TARGET_STATION, liveUrl: RIVER_URL, note: "暫時無法取得水位資料。" },
    generatedAt: new Date().toISOString(),
    generatedAtTaipei: taipeiNow(),
  };

  if (weatherR.status === "rejected") console.error(`[weather] ${weatherR.reason?.message}`);
  if (radarR.status === "rejected") console.error(`[radar] ${radarR.reason?.message}`);
  if (waterR.status === "rejected") console.error(`[water] ${waterR.reason?.message}`);

  await writeFile(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${SUMMARY_JSON}`);
  console.log(`  weather: ${weatherR.status}, radar: ${radarR.status}, water: ${summary.water?.found ? "found" : "missing"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
