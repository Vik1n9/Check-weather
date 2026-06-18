// Shared data-source logic for Check-weather.
// Imported by both the local dev server (server.js) and the Actions prefetch
// script (scripts/prefetch.mjs) so parsing lives in one place.
import vm from "node:vm";

export const CWA_CHART_URL = "https://www.cwa.gov.tw/Data/js/3hr/ChartData_3hr_R_AgriM.js";
export const CWA_GT_URL = "https://www.cwa.gov.tw/Data/js/GT/TableData_GT_R_AgriM.js";
export const CWA_RADAR_LIST_URL = "https://www.cwa.gov.tw/Data/js/obs_img/Observe_radar.js";
export const CWA_RADAR_BASE_URL = "https://www.cwa.gov.tw/Data/radar/";
export const WATER_URL = "https://winfo.tycg.gov.tw/tysafep/Webpage/water.aspx";
// The 新街橋 river-stage station (level + cross-section popup) lives on the map
// home page, not water.aspx (which only lists reservoirs / 溪流水位站 без 新街橋).
export const RIVER_URL = "https://winfo.tycg.gov.tw/tysafep/Default.aspx";

export const TARGET_PID = "M024";
export const TARGET_STATION = "新街橋";
export const FALLBACK_STATIONS = ["觀新橋"];

const cache = new Map();

export function htmlText(input = "") {
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

export async function fetchText(url, options = {}, ttlMs = 60_000) {
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

export function runDataScript(script) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(script, context, { timeout: 1000 });
  return context;
}

export function parseCwaTime(label) {
  const clean = htmlText(label);
  const match = clean.match(/^(\d{2})\s+(\d{2}\/\d{2})\s*\(([^)]+)\)/);
  return {
    raw: clean,
    hour: match ? `${match[1]}:00` : clean,
    date: match ? match[2] : "",
    weekday: match ? match[3] : "",
  };
}

export async function getWeather() {
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

export function collectInputs(html) {
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

export async function fetchWaterPage(stationType = "2") {
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

export function parseWaterRows(html) {
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

export function findWaterStation(rows) {
  const exact = rows.find((row) => row.station === TARGET_STATION || row.text.includes(TARGET_STATION));
  if (exact) return { row: exact, fallback: false, requestedStation: TARGET_STATION };

  for (const fallbackName of FALLBACK_STATIONS) {
    const fallback = rows.find((row) => row.station === fallbackName || row.text.includes(fallbackName));
    if (fallback) return { row: fallback, fallback: true, requestedStation: TARGET_STATION };
  }
  return { row: null, fallback: false, requestedStation: TARGET_STATION };
}

export async function getWater() {
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
    found: true,
    source: WATER_URL,
    updatedAt: new Date().toISOString(),
  };
}

// ---- River-stage stations (Default.aspx map repeater) ---------------------
// Each station is an entry in the `repWater2` repeater, with fields split
// across spans/inputs sharing a numeric suffix (…_<index>). Stitch them back
// together by that index so field order on the page does not matter.
export function parseRiverStations(html) {
  const byIndex = new Map();
  const slot = (i) => {
    if (!byIndex.has(i)) byIndex.set(i, { index: i });
    return byIndex.get(i);
  };

  for (const m of html.matchAll(/repWater2_labSTREAM_(\d+)"[^>]*>([\s\S]*?)<\/span>/g))
    slot(m[1]).stream = htmlText(m[2]);
  for (const m of html.matchAll(/repWater2_hlkLocationTitle_(\d+)"[^>]*>([\s\S]*?)<\/a>/g))
    slot(m[1]).station = htmlText(m[2]);
  for (const m of html.matchAll(/repWater2_labWater2_(\d+)"[^>]*>([\s\S]*?)<\/span>/g))
    slot(m[1]).waterLevel = htmlText(m[2]);
  for (const m of html.matchAll(/repWater2_hidLat_(\d+)"[^>]*value="([^"]*)"/g))
    slot(m[1]).lat = m[2];
  for (const m of html.matchAll(/repWater2_hidLon_(\d+)"[^>]*value="([^"]*)"/g))
    slot(m[1]).lon = m[2];
  for (const m of html.matchAll(/repWater2_imgLevel_(\d+)"[^>]*src="([^"]*)"/g))
    slot(m[1]).levelImg = m[2];

  return [...byIndex.values()].filter((s) => s.station);
}

export async function getRiverStation(name = TARGET_STATION) {
  const html = await fetchText(RIVER_URL, {}, 60_000);
  const stations = parseRiverStations(html);
  const row =
    stations.find((s) => s.station === name) ||
    stations.find((s) => s.station.includes(name));
  if (!row) {
    return {
      station: name,
      found: false,
      source: RIVER_URL,
      candidates: stations.slice(0, 20).map((s) => s.station).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    station: row.station,
    stream: row.stream,
    waterLevel: row.waterLevel,
    lat: row.lat,
    lon: row.lon,
    levelImg: row.levelImg,
    found: true,
    source: RIVER_URL,
    updatedAt: new Date().toISOString(),
  };
}

export async function getRadar() {
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

// Compute today's (Asia/Taipei) high/low temperature from the 3-hourly forecast,
// folding in the current observed temperature so it reflects what already happened.
export function computeTodayHighLow(weather, now = new Date()) {
  const taipeiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const [, mm, dd] = taipeiDate.split("-");
  const todayMMDD = `${mm}/${dd}`;

  const temps = (weather.forecast || [])
    .filter((item) => item.date === todayMMDD)
    .map((item) => Number(item.temperatureC))
    .filter(Number.isFinite);

  const current = Number(weather.current?.temperatureC);
  if (Number.isFinite(current)) temps.push(current);

  if (!temps.length) return { highC: null, lowC: null };
  return { highC: Math.max(...temps), lowC: Math.min(...temps) };
}
