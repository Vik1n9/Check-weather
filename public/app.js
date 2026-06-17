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
    return;
  }

  fields.waterLevel.textContent = water.waterLevel;
  fields.waterStation.textContent = water.station;
  fields.waterStream.textContent = water.stream || "--";
  fields.waterTime.textContent = fmtTime(water.updatedAt);
  fields.waterNote.textContent = water.fallbackUsed
    ? `來源目前沒有「${water.requestedStation}」，已顯示站名近似的「${water.station}」。`
    : "";
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
