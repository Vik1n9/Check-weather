// Prefetch script — runs in GitHub Actions (or locally with `npm run prefetch`).
// Fetches the three data sources, screenshots the 新街橋 water popup with
// Playwright, and writes static artifacts into docs/data/ for GitHub Pages.
//
// Each source is isolated: a failure in one degrades gracefully and never
// overwrites a previously-good artifact (especially water.png).
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getWeather,
  getRadar,
  getWater,
  computeTodayHighLow,
  WATER_URL,
  TARGET_STATION,
} from "./sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "docs", "data");

const WATER_PNG = path.join(dataDir, "water.png");
const WATER_DEBUG_PNG = path.join(dataDir, "..", "..", "water-debug.png"); // not committed
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

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---- Weather --------------------------------------------------------------
async function prefetchWeather() {
  const weather = await getWeather();
  const today = computeTodayHighLow(weather);
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

// ---- Water (Playwright) ---------------------------------------------------
async function prefetchWater() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("playwright not installed; run `npm i -D playwright` and `npx playwright install chromium`");
  }

  const browser = await chromium.launch();
  const result = { found: false, station: TARGET_STATION, source: WATER_URL };
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) watcher dashboard",
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  try {
    await page.goto(WATER_URL, { waitUntil: "networkidle", timeout: 60_000 });

    // Make sure the 溪流水位站 category is selected, then submit.
    try {
      await page.selectOption("select#ctl00_CPH_Content_ddlStation", "2", { timeout: 5_000 });
      await Promise.all([
        page.waitForLoadState("networkidle", { timeout: 30_000 }),
        page.click("#ctl00_CPH_Content_btnSearch"),
      ]);
    } catch {
      // Dropdown/button selectors may differ; continue with default view.
    }

    // Click the 新街橋 trigger (text-based, robust to layout changes).
    const trigger = page.getByText(TARGET_STATION, { exact: false }).first();
    await trigger.waitFor({ state: "visible", timeout: 30_000 });
    await trigger.click();

    // Wait for the popup cross-section: its title reads「新街橋（水位海拔高 …」.
    const popup = page
      .locator("div", { hasText: /新街橋（水位海拔高/ })
      .last();
    await popup.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800); // let the diagram finish rendering

    await popup.screenshot({ path: WATER_PNG });

    const popupText = await popup.innerText();
    const levelMatch = popupText.match(/(-?\d+(?:\.\d+)?)\s*m(?![^（]*）)/); // first standalone "x.xx m"
    const timeMatch = popupText.match(/資料時間[:：]?\s*([\d/\-\s:]+)/);
    const seaLevelMatch = popupText.match(/水位海拔高\s*(-?\d+(?:\.\d+)?)\s*m/);

    result.found = true;
    result.level = levelMatch ? `${levelMatch[1]}m` : null;
    result.seaLevelHeight = seaLevelMatch ? `${seaLevelMatch[1]}m` : null;
    result.observedAt = timeMatch ? timeMatch[1].trim() : null;
    result.imageFile = "water.png";
  } catch (error) {
    // Save a full-page debug shot (uploaded as an Actions artifact, not committed)
    // so the 新街橋 selectors can be tuned against the real site.
    try {
      await page.screenshot({ path: WATER_DEBUG_PNG, fullPage: true });
      console.warn(`[water] saved debug screenshot to ${WATER_DEBUG_PNG}`);
    } catch {
      // ignore debug-capture failures
    }
    throw error;
  } finally {
    await browser.close();
  }
  return result;
}

// Numeric-only fallback via the HTML table parser (no screenshot).
async function prefetchWaterFallback() {
  const water = await getWater();
  if (!water.found) return { found: false, station: TARGET_STATION, source: WATER_URL };
  return {
    found: true,
    station: water.station,
    level: water.waterLevel,
    fallbackUsed: true,
    note: water.fallbackUsed
      ? `來源彈窗擷取失敗，且來源沒有「${TARGET_STATION}」，改顯示近似站「${water.station}」。`
      : "來源彈窗擷取失敗，改用表格數值。",
    imageFile: (await fileExists(WATER_PNG)) ? "water.png" : null,
    source: WATER_URL,
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
    water: null,
    generatedAt: new Date().toISOString(),
    generatedAtTaipei: taipeiNow(),
  };

  if (weatherR.status === "rejected") console.error(`[weather] ${weatherR.reason?.message}`);
  if (radarR.status === "rejected") console.error(`[radar] ${radarR.reason?.message}`);

  if (waterR.status === "fulfilled") {
    summary.water = waterR.value;
  } else {
    console.error(`[water] popup failed: ${waterR.reason?.message}`);
    try {
      summary.water = await prefetchWaterFallback();
    } catch (error) {
      console.error(`[water] fallback failed: ${error.message}`);
      summary.water = previous.water ?? { found: false, station: TARGET_STATION, note: "暫時無法取得水位資料。" };
    }
  }

  await writeFile(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${SUMMARY_JSON}`);
  console.log(`  weather: ${weatherR.status}, radar: ${radarR.status}, water: ${summary.water?.found ? "found" : "missing"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
