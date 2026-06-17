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
const repoRoot = path.join(dataDir, "..", "..");
const WATER_DEBUG_PNG = path.join(repoRoot, "water-debug.png"); // not committed
const WATER_DEBUG_HTML = path.join(repoRoot, "water-debug.html"); // not committed
const RADAR_PNG = path.join(dataDir, "radar.png");
const SUMMARY_JSON = path.join(dataDir, "summary.json");

// Always dump what the browser is looking at, so the 新街橋 selectors can be
// tuned against the real site (uploaded as Actions artifacts, never committed).
async function saveWaterDebug(page, label) {
  try {
    await page.screenshot({ path: WATER_DEBUG_PNG });
  } catch {
    /* page may be mid-navigation */
  }
  try {
    await writeFile(WATER_DEBUG_HTML, await page.content());
  } catch {
    /* ignore */
  }
  console.warn(`[water] saved debug artifacts (${label})`);
}

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
    viewport: { width: 1440, height: 1200 },
    locale: "zh-TW",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    // The ASP.NET site keeps long-lived connections open, so "networkidle"
    // never settles (that caused a 60s goto timeout). Wait for the DOM instead.
    await page.goto(WATER_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });

    // Make sure the 溪流水位站 category (value "2") is shown, then search.
    try {
      await page.selectOption("#ctl00_CPH_Content_ddlStation", "2", { timeout: 5_000 });
      await page.click("#ctl00_CPH_Content_btnSearch", { timeout: 5_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
    } catch {
      // Dropdown/button ids may differ across versions; continue with default view.
    }

    // Click the 新街橋 entry (text-based, robust to layout changes).
    const trigger = page.getByText(TARGET_STATION, { exact: false }).first();
    await trigger.waitFor({ state: "visible", timeout: 30_000 });
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click();

    // The popup title reads「新街橋（水位海拔高 124.64 m）」. Wait for it to appear.
    const title = page.getByText(/新街橋（水位海拔高/).first();
    await title.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1_200); // let the SVG cross-section finish rendering

    // Screenshot the dialog container; fall back to the title's nearest sized
    // ancestor, then to the viewport, so we always capture something useful.
    const dialog = page
      .locator(".modal, .ui-dialog, [role=dialog], .popup, .layui-layer, .fancybox-content, .modal-content")
      .filter({ hasText: /新街橋（水位海拔高/ })
      .first();

    let captured = false;
    let scope = page.locator("body");
    if (await dialog.count()) {
      try {
        await dialog.screenshot({ path: WATER_PNG });
        scope = dialog;
        captured = true;
      } catch {
        /* try next strategy */
      }
    }
    if (!captured) {
      const ancestor = title.locator("xpath=ancestor::div[1]");
      try {
        await ancestor.screenshot({ path: WATER_PNG });
        scope = ancestor;
        captured = true;
      } catch {
        /* try next strategy */
      }
    }
    if (!captured) {
      await page.screenshot({ path: WATER_PNG });
    }

    const text = (await scope.innerText().catch(() => "")) || "";
    const timeMatch = text.match(/資料時間[:：]?\s*([\d/\-\s:]+)/);
    const seaLevelMatch = text.match(/水位海拔高\s*(-?\d+(?:\.\d+)?)\s*m/);

    result.found = true;
    result.seaLevelHeight = seaLevelMatch ? `${seaLevelMatch[1]}m` : null;
    result.observedAt = timeMatch ? timeMatch[1].trim() : null;
    result.imageFile = "water.png";

    // Keep a debug copy of the successful capture for inspection too.
    await saveWaterDebug(page, "success");
  } catch (error) {
    await saveWaterDebug(page, "failure");
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
