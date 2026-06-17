const statusEl = document.querySelector("#status");
const refreshButton = document.querySelector("#refreshButton");

const fields = {
  currentTemp: document.querySelector("#currentTemp"),
  currentWeather: document.querySelector("#currentWeather"),
  currentAt: document.querySelector("#currentAt"),
  currentRh: document.querySelector("#currentRh"),
  currentRain: document.querySelector("#currentRain"),
  waterLevel: document.querySelector("#waterLevel"),
  waterStation: document.querySelector("#waterStation"),
  waterStream: document.querySelector("#waterStream"),
  waterTime: document.querySelector("#waterTime"),
  waterNote: document.querySelector("#waterNote"),
  waterVisual: document.querySelector("#waterVisual"),
  waterVisualTime: document.querySelector("#waterVisualTime"),
  forecastTime: document.querySelector("#forecastTime"),
  forecastList: document.querySelector("#forecastList"),
  tempChart: document.querySelector("#tempChart"),
  radarTime: document.querySelector("#radarTime"),
  radarImage: document.querySelector("#radarImage"),
  radarCaption: document.querySelector("#radarCaption"),
};

function fmtTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderWaterVisual(water) {
  fields.waterVisualTime.textContent = `資料時間 ${fmtTime(water.updatedAt)}`;

  if (!water.found || !water.visual || !Number.isFinite(water.visual.waterLevelM)) {
    fields.waterVisual.innerHTML = `<p class="empty-visual">目前沒有可顯示的水位圖。</p>`;
    return;
  }

  const visual = water.visual;
  const viewMax = Math.max(visual.maxHeightM || 0, visual.waterLevelM * 3, 1.5);
  const scaleY = (meters) => 294 - (Number(meters) / viewMax) * 182;
  const waterY = Math.max(102, Math.min(294, scaleY(visual.waterLevelM)));
  const leftBankY = Number.isFinite(visual.leftBankHeightM) ? scaleY(visual.leftBankHeightM) : 86;
  const rightBankY = Number.isFinite(visual.rightBankHeightM) ? scaleY(visual.rightBankHeightM) : 86;
  const leftBankLabel = visual.leftBankHeight || "";
  const rightBankLabel = visual.rightBankHeight || "";
  const leftBankText = leftBankLabel
    ? `<text x="32" y="${leftBankY - 8}" fill="#6a6f73" font-size="13" font-weight="700">${escapeHtml(leftBankLabel)}</text>`
    : "";
  const rightBankText = rightBankLabel
    ? `<text x="632" y="${rightBankY - 8}" fill="#6a6f73" font-size="13" font-weight="700" text-anchor="end">${escapeHtml(rightBankLabel)}</text>`
    : "";

  fields.waterVisual.innerHTML = `
    <svg viewBox="0 0 700 360" role="img" aria-labelledby="waterVisualTitle waterVisualDesc">
      <title id="waterVisualTitle">${escapeHtml(visual.title)}水位圖</title>
      <desc id="waterVisualDesc">目前水位 ${escapeHtml(visual.waterLevel)}</desc>
      <rect x="0" y="0" width="700" height="360" rx="6" fill="#ffffff"></rect>
      <rect x="18" y="18" width="664" height="48" rx="5" fill="#0876a8"></rect>
      <text x="350" y="43" text-anchor="middle" fill="#ffffff" font-size="18" font-weight="700">${escapeHtml(visual.title)}</text>
      <text x="350" y="60" text-anchor="middle" fill="#e7f7ff" font-size="14">${escapeHtml(visual.stream || "水位站")}（水位海拔高 ${escapeHtml(visual.waterLevel)}）</text>
      ${leftBankText}
      ${rightBankText}
      <text x="32" y="306" fill="#6a6f73" font-size="13" font-weight="700">0m</text>
      <polygon points="32,294 166,294 226,96 32,96" fill="url(#leftBankGradient)"></polygon>
      <polygon points="474,294 668,294 668,96 534,96" fill="url(#rightBankGradient)"></polygon>
      <polygon points="226,294 474,294 458,314 242,314" fill="#b8b2aa"></polygon>
      <polygon points="226,${waterY} 474,${waterY} 458,294 242,294" fill="#68ade3" opacity="0.95"></polygon>
      <path d="M226 ${waterY} C272 ${waterY - 7}, 310 ${waterY + 7}, 354 ${waterY} S428 ${waterY - 7}, 474 ${waterY}" fill="none" stroke="#8dcbf2" stroke-width="5"></path>
      <line x1="156" y1="${waterY}" x2="544" y2="${waterY}" stroke="#f39b2f" stroke-width="4"></line>
      <text x="350" y="${waterY - 14}" text-anchor="middle" fill="#0759bd" font-size="42" font-weight="800">${escapeHtml(visual.waterLevel)}</text>
      <defs>
        <linearGradient id="leftBankGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#888888"></stop>
          <stop offset="100%" stop-color="#c6c6c6"></stop>
        </linearGradient>
        <linearGradient id="rightBankGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#888888"></stop>
          <stop offset="100%" stop-color="#c6c6c6"></stop>
        </linearGradient>
      </defs>
    </svg>
  `;
}

function renderWeather(weather) {
  const first = weather.forecast[0];
  fields.currentTemp.textContent = `${weather.current.temperatureC || first.temperatureC}°C`;
  fields.currentWeather.textContent = first.weather;
  fields.currentAt.textContent = `${weather.current.apparentTemperatureC || first.apparentTemperatureC}°C`;
  fields.currentRh.textContent = weather.current.humidityPercent ? `${weather.current.humidityPercent}%` : "--";
  fields.currentRain.textContent = weather.current.hourlyRainMm ? `${weather.current.hourlyRainMm} mm` : "--";
  fields.forecastTime.textContent = `資料時間 ${weather.observedAt || fmtTime(weather.updatedAt)}`;

  const next = weather.forecast.slice(0, 12);
  const temps = next.map((item) => Number(item.temperatureC)).filter(Number.isFinite);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  fields.tempChart.innerHTML = next
    .map((item) => {
      const height = 30 + ((Number(item.temperatureC) - min) / Math.max(1, max - min)) * 125;
      return `<div class="bar" style="height:${height}px"><span>${item.temperatureC}°</span></div>`;
    })
    .join("");

  fields.forecastList.innerHTML = next
    .map(
      (item) => `
        <article class="forecast-item">
          <time>${item.date} ${item.hour}</time>
          <strong>${item.temperatureC}°C</strong>
          <span>${item.weather}，體感 ${item.apparentTemperatureC}°C</span>
        </article>
      `,
    )
    .join("");
}

function renderWater(water) {
  if (!water.found) {
    fields.waterLevel.textContent = "--";
    fields.waterStation.textContent = "找不到新街橋";
    fields.waterStream.textContent = "--";
    fields.waterTime.textContent = fmtTime(water.updatedAt);
    fields.waterNote.textContent = "目前來源頁沒有回傳新街橋水位。";
    renderWaterVisual(water);
    return;
  }

  fields.waterLevel.textContent = water.waterLevel;
  fields.waterStation.textContent = water.station;
  fields.waterStream.textContent = water.stream || "--";
  fields.waterTime.textContent = fmtTime(water.updatedAt);
  fields.waterNote.textContent = water.fallbackUsed
    ? `來源目前沒有「${water.requestedStation}」，已顯示站名近似的「${water.station}」。`
    : "";
  renderWaterVisual(water);
}

function renderRadar(radar) {
  fields.radarImage.src = `${radar.imageUrl}?t=${encodeURIComponent(radar.observedAt || radar.updatedAt)}`;
  fields.radarTime.textContent = `觀測時間 ${radar.observedAt || fmtTime(radar.updatedAt)}`;
  fields.radarCaption.textContent = `${radar.mode}，${radar.area}，靜止圖`;
}

async function loadData() {
  refreshButton.disabled = true;
  statusEl.textContent = "正在抓取中央氣象署與桃園市水情資料...";
  try {
    const response = await fetch("/api/summary", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "資料抓取失敗");
    renderWeather(data.weather);
    renderWater(data.water);
    renderRadar(data.radar);
    statusEl.textContent = `更新完成：${fmtTime(data.updatedAt)}`;
  } catch (error) {
    statusEl.textContent = `錯誤：${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadData);
loadData();
