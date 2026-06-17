import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const modulePath = fileURLToPath(import.meta.url);
const __dirname = path.dirname(modulePath);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

const CWA_CHART_URL = "https://www.cwa.gov.tw/Data/js/3hr/ChartData_3hr_R_AgriM.js";
const CWA_GT_URL = "https://www.cwa.gov.tw/Data/js/GT/TableData_GT_R_AgriM.js";
const CWA_RADAR_LIST_URL = "https://www.cwa.gov.tw/Data/js/obs_img/Observe_radar.js";
const CWA_RADAR_BASE_URL = "https://www.cwa.gov.tw/Data/radar/";
const WATER_URL = "https://winfo.tycg.gov.tw/tysafep/Webpage/water.aspx";

const TARGET_PID = "M024";
const TARGET_STATION = "新街橋";
const FALLBACK_STATIONS = ["觀新橋"];

let cache = new Map();

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  setCors(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function htmlText(input = "") {
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&le;/g, "<=")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, options = {}, ttlMs = 60_000) {
  const key = `${options.method || "GET"}:${url}:${options.body || ""}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < ttlMs) return cached.text;

  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": "Mozilla/5.0 watcher local dashboard",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  const text = await response.text();
  cache.set(key, { time: Date.now(), text });
  return text;
}

function runDataScript(script) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(script, context, { timeout: 1000 });
  return context;
}

function parseCwaTime(label) {
  const clean = htmlText(label);
  const match = clean.match(/^(\d{2})\s+(\d{2}\/\d{2})\s*\(([^)]+)\)/);
  return {
    raw: clean,
    hour: match ? `${match[1]}:00` : clean,
    date: match ? match[2] : "",
    weekday: match ? match[3] : "",
  };
}

async function getWeather() {
  const [chartScript, gtScript] = await Promise.all([
    fetchText(CWA_CHART_URL),
    fetchText(CWA_GT_URL),
  ]);
  const chart = runDataScript(chartScript);
  const gt = runDataScript(gtScript);
  const station = chart.TempArray_3hr?.[TARGET_PID];
  if (!station) throw new Error(`CWA station ${TARGET_PID} not found`);

  const times = chart.Time_3hr?.C || [];
  const items = times.map((label, index) => {
    const wx = station.Wx.C[index] || ["", "無資料"];
    return {
      ...parseCwaTime(label),
      temperatureC: station.C.T[index],
      apparentTemperatureC: station.C.AT[index],
      weather: wx[1],
      weatherCode: wx[0],
    };
  });

  const now = gt.GT?.[TARGET_PID] || {};
  return {
    station: "農工中心",
    pid: TARGET_PID,
    source: CWA_CHART_URL,
    observedAt: htmlText(gt.GT_Time?.C || ""),
    current: {
      temperatureC: now.C_T,
      apparentTemperatureC: now.C_AT,
      humidityPercent: now.RH,
      hourlyRainMm: now.Rain,
      sunrise: now.Sunrise,
      sunset: now.Sunset,
    },
    forecast: items,
    updatedAt: new Date().toISOString(),
  };
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)`, "i"));
  return match ? match[1] : "";
}

function collectInputs(html) {
  const params = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = attr(tag, "name");
    if (!name) continue;
    const type = attr(tag, "type").toLowerCase();
    if (["submit", "button", "image"].includes(type)) continue;
    params.set(name, attr(tag, "value"));
  }
  return params;
}

async function fetchWaterPage(stationType = "2") {
  const firstHtml = await fetchText(WATER_URL, {}, 30_000);
  const params = collectInputs(firstHtml);
  params.set("__EVENTTARGET", "");
  params.set("__EVENTARGUMENT", "");
  params.set("__LASTFOCUS", "");
  params.set("ctl00$CPH_Content$ddlStation", stationType);
  params.set("ctl00$CPH_Content$btnSearch", "查詢");
  params.set("ctl00$CPH_Content$hidField", "");
  params.set("ctl00$CPH_Content$hidSequence", "ASC");

  const body = params.toString();
  return fetchText(
    WATER_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(body)),
        Origin: "https://winfo.tycg.gov.tw",
        Referer: WATER_URL,
      },
      body,
    },
    30_000,
  );
}

function parseWaterRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const rowHtml = match[0];
    const text = htmlText(rowHtml);
    if (!text || text.includes("查詢類別") || text.includes("溪流 水位站")) continue;
    const meters = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*m/g)].map((m) => `${m[1]}m`);
    if (!meters.length) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => htmlText(m[1]));
    const stationCell = cells.find((cell) => /橋|站|水位|水門|滯洪池/.test(cell) && !/^\d/.test(cell));
    rows.push({
      text,
      stream: cells[0] || "",
      station: stationCell || "",
      waterLevel: meters[0],
      leftBankHeight: meters[1] || "",
      rightBankHeight: meters[2] || "",
    });
  }

  const sidePattern =
    /<span id="repWater2_labSTREAM_(\d+)">([\s\S]*?)<\/span>[\s\S]*?<span id="repWater2_labLocationTitle_\1">([\s\S]*?)<\/span>[\s\S]*?<span id="repWater2_labWater2_\1">([\s\S]*?)<\/span>/g;
  for (const match of html.matchAll(sidePattern)) {
    rows.push({
      text: `${htmlText(match[2])} ${htmlText(match[3])} ${htmlText(match[4])}`,
      stream: htmlText(match[2]),
      station: htmlText(match[3]),
      waterLevel: htmlText(match[4]),
      leftBankHeight: "",
      rightBankHeight: "",
    });
  }
  return rows;
}

function meterNumber(value = "") {
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function buildWaterVisual(row) {
  const waterLevelM = meterNumber(row.waterLevel);
  const leftBankHeightM = meterNumber(row.leftBankHeight);
  const rightBankHeightM = meterNumber(row.rightBankHeight);
  const heights = [waterLevelM, leftBankHeightM, rightBankHeightM].filter(Number.isFinite);

  return {
    sourceKind: "embedded-water-level-diagram",
    title: row.station || TARGET_STATION,
    stream: row.stream || "",
    waterLevel: row.waterLevel || "",
    waterLevelM,
    leftBankHeight: row.leftBankHeight || "",
    leftBankHeightM,
    rightBankHeight: row.rightBankHeight || "",
    rightBankHeightM,
    maxHeightM: heights.length ? Math.max(...heights) : null,
  };
}

function findWaterStation(rows) {
  const exact = rows.find((row) => row.station === TARGET_STATION || row.text.includes(TARGET_STATION));
  if (exact) return { row: exact, fallback: false, requestedStation: TARGET_STATION };

  for (const fallbackName of FALLBACK_STATIONS) {
    const fallback = rows.find((row) => row.station === fallbackName || row.text.includes(fallbackName));
    if (fallback) return { row: fallback, fallback: true, requestedStation: TARGET_STATION };
  }
  return { row: null, fallback: false, requestedStation: TARGET_STATION };
}

async function getWater() {
  const html = await fetchWaterPage("2");
  const rows = parseWaterRows(html);
  const match = findWaterStation(rows);
  if (!match.row) {
    return {
      station: TARGET_STATION,
      found: false,
      source: WATER_URL,
      candidates: rows.slice(0, 20).map((row) => row.station).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    station: match.row.station,
    requestedStation: match.requestedStation,
    fallbackUsed: match.fallback,
    stream: match.row.stream,
    waterLevel: match.row.waterLevel,
    leftBankHeight: match.row.leftBankHeight,
    rightBankHeight: match.row.rightBankHeight,
    visual: buildWaterVisual(match.row),
    found: true,
    source: WATER_URL,
    updatedAt: new Date().toISOString(),
  };
}

async function getRadar() {
  const script = await fetchText(CWA_RADAR_LIST_URL, {}, 30_000);
  const radar = runDataScript(script);
  const latest = radar.RadarImg?.Tab0?.Area1?.size1?.[0];
  if (!latest) throw new Error("CWA radar image list missing Tab0 Area1 size1");
  return {
    title: "雷達回波",
    area: "臺灣鄰近區域",
    mode: "無地形",
    imageUrl: `${CWA_RADAR_BASE_URL}${latest.img}`,
    imageFile: latest.img,
    observedAt: latest.text,
    source: CWA_RADAR_LIST_URL,
    updatedAt: new Date().toISOString(),
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".js" ? "text/javascript; charset=utf-8" :
      "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/weather") return json(res, 200, await getWeather());
    if (url.pathname === "/api/water") return json(res, 200, await getWater());
    if (url.pathname === "/api/radar") return json(res, 200, await getRadar());
    if (url.pathname === "/api/summary") {
      const [weather, water, radar] = await Promise.all([getWeather(), getWater(), getRadar()]);
      return json(res, 200, { weather, water, radar, updatedAt: new Date().toISOString() });
    }
    return serveStatic(req, res);
  } catch (error) {
    return json(res, 500, {
      error: error.message,
      updatedAt: new Date().toISOString(),
    });
  }
});

if (process.argv[1] === modulePath) {
  server.listen(port, () => {
    console.log(`Watcher dashboard running at http://localhost:${port}`);
  });
}

export {
  buildWaterVisual,
  parseWaterRows,
};
