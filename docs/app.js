const statusEl = document.querySelector("#status");
const refreshButton = document.querySelector("#refreshButton");

const fields = {
  currentTemp: document.querySelector("#currentTemp"),
  weatherObserved: document.querySelector("#weatherObserved"),
  todayHigh: document.querySelector("#todayHigh"),
  todayLow: document.querySelector("#todayLow"),
  todayPop: document.querySelector("#todayPop"),
  currentAt: document.querySelector("#currentAt"),
  currentRh: document.querySelector("#currentRh"),
  currentRain: document.querySelector("#currentRain"),
  waterLevel: document.querySelector("#waterLevel"),
  waterStation: document.querySelector("#waterStation"),
  waterStream: document.querySelector("#waterStream"),
  waterTime: document.querySelector("#waterTime"),
  waterNote: document.querySelector("#waterNote"),
  waterShotTime: document.querySelector("#waterShotTime"),
  waterShot: document.querySelector("#waterShot"),
  waterShotFallback: document.querySelector("#waterShotFallback"),
  waterLiveLink: document.querySelector("#waterLiveLink"),
  waterMapLink: document.querySelector("#waterMapLink"),
  waterEmbedLevel: document.querySelector("#waterEmbedLevel"),
  waterBankHeight: document.querySelector("#waterBankHeight"),
  waterObservedAt: document.querySelector("#waterObservedAt"),
  waterChart: document.querySelector("#waterChart"),
  waterChartTime: document.querySelector("#waterChartTime"),
  waterChartFallback: document.querySelector("#waterChartFallback"),
  radarTime: document.querySelector("#radarTime"),
  radarImage: document.querySelector("#radarImage"),
  radarCaption: document.querySelector("#radarCaption"),
};

function tempText(value) {
  return Number.isFinite(Number(value)) ? `${value}°C` : "--";
}

function popText(value) {
  return Number.isFinite(Number(value)) ? `${value}%` : "--";
}

function renderWeather(weather) {
  if (!weather) {
    fields.currentTemp.textContent = "--";
    fields.weatherObserved.textContent = "無資料";
    return;
  }
  const current = weather.current || {};
  const today = weather.today || {};
  fields.todayLow.textContent = tempText(today.lowC);
  fields.todayHigh.textContent = tempText(today.highC);
  fields.todayPop.textContent = popText(today.rainProbabilityPercent);
  fields.currentTemp.textContent = tempText(current.temperatureC);
  fields.weatherObserved.textContent = weather.observedAt ? `資料時間 ${weather.observedAt}` : "--";
  fields.currentAt.textContent = tempText(current.apparentTemperatureC);
  fields.currentRh.textContent = current.humidityPercent ? `${current.humidityPercent}%` : "--";
  fields.currentRain.textContent = current.hourlyRainMm ? `${current.hourlyRainMm} mm` : "--";
}

function showWaterShot(water, bust) {
  // Embed the live station image directly (a plain <img>, so the map page's
  // X-Frame-Options does not apply). The direct link opens the same image, and
  // the map remains as a fallback if the image is offline.
  const img = fields.waterShot;
  if (water && water.imageUrl) {
    fields.waterLiveLink.href = water.imageUrl;
    fields.waterShotFallback.hidden = true;
    img.hidden = false;
    img.onerror = () => {
      img.hidden = true;
      fields.waterShotFallback.hidden = false;
      // Fall back to opening the official map when the live image is down.
      if (water.liveUrl) fields.waterLiveLink.href = water.liveUrl;
    };
    img.src = `${water.imageUrl}${water.imageUrl.includes("?") ? "&" : "?"}t=${encodeURIComponent(bust)}`;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
    fields.waterShotFallback.hidden = false;
    if (water && water.liveUrl) fields.waterLiveLink.href = water.liveUrl;
  }
}

function renderWater(water, updatedAt, bust) {
  const refresh = updatedAt ? `更新 ${updatedAt}` : "";
  if (water && water.liveUrl) fields.waterMapLink.href = water.liveUrl;
  fields.waterShotTime.textContent = refresh;
  fields.waterBankHeight.textContent = (water && water.bankHeight) || "--";
  fields.waterObservedAt.textContent = water && water.observedAt ? `（觀測 ${water.observedAt}）` : "";

  if (!water || !water.found) {
    fields.waterLevel.textContent = "--";
    fields.waterStation.textContent = "找不到新街橋";
    fields.waterStream.textContent = "--";
    fields.waterTime.textContent = updatedAt || "--";
    fields.waterNote.textContent = (water && water.note) || "目前來源頁沒有回傳新街橋水位。";
    fields.waterEmbedLevel.textContent = "--";
    showWaterShot(water, bust);
    return;
  }

  fields.waterLevel.textContent = water.level || "--";
  fields.waterStation.textContent = water.station || "新街橋";
  fields.waterStream.textContent = water.stream || "--";
  fields.waterTime.textContent = updatedAt || "--";
  fields.waterNote.textContent = water.note || "";
  fields.waterEmbedLevel.textContent = water.level || "--";
  showWaterShot(water, bust);
}

// Build the official-style 水位剖面圖 (cross-section) as an inline SVG from the
// prefetched detail data: sloped gray banks framing a channel, the blue water
// filled to the current level, and the 黃/紅 warning lines drawn across it.
function waterChartSvg(c) {
  const W = 760;
  const plotTop = 64;
  const plotBottom = 392;
  const fmt = (v) => `${Number(v)}m`;

  // Channel geometry (outer bank → inner top → channel floor), mirrored.
  const xLO = 40, xLTI = 250, xLBI = 300;
  const xRBI = 460, xRTI = 510, xRO = 720;

  const left = Number(c.leftBankM) || 0;
  const right = Number(c.rightBankM) || 0;
  const level = Number(c.currentLevelM) || 0;
  const red = Number(c.redAlertM);
  const yellow = Number(c.yellowAlertM);
  const scaleMax = Math.max(left, right, red || 0, yellow || 0, level) || 1;

  const yOf = (v) => plotBottom - (Math.min(v, scaleMax) / scaleMax) * (plotBottom - plotTop);
  const yLeftTop = yOf(left);
  const yRightTop = yOf(right);

  // x on the (sloped) inner channel wall at a given y.
  const leftWallX = (y) => xLBI + (xLTI - xLBI) * ((plotBottom - y) / (plotBottom - yLeftTop || 1));
  const rightWallX = (y) => xRBI + (xRTI - xRBI) * ((plotBottom - y) / (plotBottom - yRightTop || 1));

  const leftBank = `${xLO},${plotBottom} ${xLO},${yLeftTop} ${xLTI},${yLeftTop} ${xLBI},${plotBottom}`;
  const rightBank = `${xRO},${plotBottom} ${xRO},${yRightTop} ${xRTI},${yRightTop} ${xRBI},${plotBottom}`;

  const yLevel = yOf(level);
  const water = `${xLBI},${plotBottom} ${leftWallX(yLevel).toFixed(1)},${yLevel.toFixed(1)} ` +
    `${rightWallX(yLevel).toFixed(1)},${yLevel.toFixed(1)} ${xRBI},${plotBottom}`;

  // Warning lines run full width at their height; labels sit at the right end.
  const warnLine = (v, cls) => {
    if (!Number.isFinite(v)) return "";
    const y = yOf(v);
    return `<line class="${cls}" x1="${xLO}" y1="${y.toFixed(1)}" x2="${xRO}" y2="${y.toFixed(1)}" />` +
      `<text class="${cls}-label" x="${xRO}" y="${(y - 8).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  };

  return `
    <svg viewBox="0 0 ${W} ${plotBottom + 44}" role="img" preserveAspectRatio="xMidYMid meet">
      <text class="wc-abs" x="${W / 2}" y="34" text-anchor="middle">水位海拔高 ${
        c.absoluteHeightM != null ? `${c.absoluteHeightM} m` : "--"
      }</text>
      <polygon class="wc-bank" points="${leftBank}" />
      <polygon class="wc-bank" points="${rightBank}" />
      <polygon class="wc-water" points="${water}" />
      <line class="wc-base" x1="${xLBI}" y1="${plotBottom}" x2="${xRBI}" y2="${plotBottom}" />
      ${warnLine(red, "wc-red")}
      ${warnLine(yellow, "wc-yellow")}
      <text class="wc-bank-label" x="${xLO + 8}" y="${(yLeftTop + 22).toFixed(1)}" text-anchor="start">${fmt(left)}</text>
      <text class="wc-bank-label" x="${xRO - 8}" y="${(yRightTop + 22).toFixed(1)}" text-anchor="end">${fmt(right)}</text>
      <text class="wc-zero" x="${xLBI - 8}" y="${plotBottom - 8}" text-anchor="end">0m</text>
      <text class="wc-level" x="${(xLBI + xRBI) / 2}" y="${(plotTop + plotBottom) / 2 + 14}" text-anchor="middle">${fmt(level)}</text>
    </svg>`;
}

function renderWaterChart(chart, updatedAt) {
  const hasChart = chart && chart.found !== false && chart.currentLevelM != null;
  if (!hasChart) {
    fields.waterChart.innerHTML = "";
    fields.waterChart.hidden = true;
    fields.waterChartFallback.hidden = false;
    fields.waterChartTime.textContent = "";
    return;
  }
  fields.waterChartFallback.hidden = true;
  fields.waterChart.hidden = false;
  fields.waterChart.innerHTML = waterChartSvg(chart);
  fields.waterChartTime.textContent = chart.timeRange
    ? `資料時間 ${chart.timeRange}`
    : updatedAt
      ? `更新 ${updatedAt}`
      : "";
}

function renderRadar(radar, bust) {
  if (!radar) return;
  const src = radar.imageFile ? `./data/${radar.imageFile}` : radar.imageUrl;
  if (src) fields.radarImage.src = `${src}?t=${encodeURIComponent(radar.observedAt || bust)}`;
  fields.radarTime.textContent = radar.observedAt ? `觀測時間 ${radar.observedAt}` : "--";
  if (radar.caption) fields.radarCaption.textContent = radar.caption;
}

async function loadData() {
  refreshButton.disabled = true;
  statusEl.textContent = "正在載入最新預抓資料...";
  try {
    const response = await fetch("./data/summary.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(response.status === 404 ? "資料尚未產生（等待第一次自動更新）" : `資料載入失敗 ${response.status}`);
    }
    const data = await response.json();
    const bust = data.generatedAt || Date.now();
    renderWeather(data.weather);
    renderWaterChart(data.water && data.water.chart, data.generatedAtTaipei || data.generatedAt);
    renderWater(data.water, data.generatedAtTaipei || data.generatedAt, bust);
    renderRadar(data.radar, bust);
    statusEl.textContent = `資料更新時間：${data.generatedAtTaipei || data.generatedAt || "--"}`;
  } catch (error) {
    statusEl.textContent = `錯誤：${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadData);
loadData();
