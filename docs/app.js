const statusEl = document.querySelector("#status");
const refreshButton = document.querySelector("#refreshButton");

const fields = {
  currentTemp: document.querySelector("#currentTemp"),
  currentWeather: document.querySelector("#currentWeather"),
  todayHigh: document.querySelector("#todayHigh"),
  todayLow: document.querySelector("#todayLow"),
  currentAt: document.querySelector("#currentAt"),
  currentRh: document.querySelector("#currentRh"),
  currentRain: document.querySelector("#currentRain"),
  waterLevel: document.querySelector("#waterLevel"),
  waterStation: document.querySelector("#waterStation"),
  waterTime: document.querySelector("#waterTime"),
  waterNote: document.querySelector("#waterNote"),
  waterImage: document.querySelector("#waterImage"),
  waterShotTime: document.querySelector("#waterShotTime"),
  radarTime: document.querySelector("#radarTime"),
  radarImage: document.querySelector("#radarImage"),
  radarCaption: document.querySelector("#radarCaption"),
};

function tempText(value) {
  return Number.isFinite(Number(value)) ? `${value}°C` : "--";
}

function renderWeather(weather) {
  if (!weather) {
    fields.currentTemp.textContent = "--";
    fields.currentWeather.textContent = "無資料";
    return;
  }
  const current = weather.current || {};
  const today = weather.today || {};
  fields.currentTemp.textContent = tempText(current.temperatureC);
  fields.currentWeather.textContent = weather.observedAt ? `資料時間 ${weather.observedAt}` : "--";
  fields.todayHigh.textContent = tempText(today.highC);
  fields.todayLow.textContent = tempText(today.lowC);
  fields.currentAt.textContent = tempText(current.apparentTemperatureC);
  fields.currentRh.textContent = current.humidityPercent ? `${current.humidityPercent}%` : "--";
  fields.currentRain.textContent = current.hourlyRainMm ? `${current.hourlyRainMm} mm` : "--";
}

function renderWater(water, bust) {
  if (!water || !water.found) {
    fields.waterLevel.textContent = "--";
    fields.waterStation.textContent = "找不到新街橋";
    fields.waterTime.textContent = "--";
    fields.waterNote.textContent = (water && water.note) || "目前來源頁沒有回傳新街橋水位。";
    if (!water || !water.imageFile) {
      fields.waterImage.removeAttribute("src");
      fields.waterShotTime.textContent = "--";
    }
    return;
  }

  fields.waterLevel.textContent = water.level || "--";
  fields.waterStation.textContent = water.station || "新街橋";
  fields.waterTime.textContent = water.observedAt || "--";
  fields.waterNote.textContent = water.note || "";

  if (water.imageFile) {
    fields.waterImage.src = `./data/${water.imageFile}?t=${encodeURIComponent(bust)}`;
    fields.waterShotTime.textContent = water.observedAt ? `資料時間 ${water.observedAt}` : "";
  } else {
    fields.waterImage.removeAttribute("src");
    fields.waterShotTime.textContent = "尚無截圖";
  }
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
    renderWater(data.water, bust);
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
