import test from "node:test";
import assert from "node:assert/strict";

import {
  parseWaterRows,
  parseRiverStations,
  parseWStationDetail,
  parseWaterChart,
  parseRainProbability,
} from "../scripts/sources.mjs";

test("parseWaterRows extracts stream, station and bank heights from a row", () => {
  const html = `
    <tr>
      <td>老街溪</td>
      <td>新街橋</td>
      <td>0.75m</td>
      <td>4.25m</td>
      <td>3.88m</td>
    </tr>
  `;

  assert.deepEqual(parseWaterRows(html), [
    {
      text: "老街溪 新街橋 0.75m 4.25m 3.88m",
      stream: "老街溪",
      station: "新街橋",
      waterLevel: "0.75m",
      leftBankHeight: "4.25m",
      rightBankHeight: "3.88m",
    },
  ]);
});

test("parseRiverStations stitches Default.aspx repeater fields by index", () => {
  // Mirrors the real markup: fields share a numeric suffix but appear in a
  // fixed order (stream, location anchor, hidden lat/lon, level, alert image).
  const html = `
    <span id="CPH_Content_repWater2_labSTREAM_96">新街溪</span>
    <a id="CPH_Content_repWater2_hlkLocationTitle_96" onClick="Zoom(13,24.9628,121.23013);">新街橋</a>
    <input type="hidden" id="CPH_Content_repWater2_hidLon_96" value="121.23013" />
    <input type="hidden" id="CPH_Content_repWater2_hidLat_96" value="24.9628" />
    <span id="CPH_Content_repWater2_labWater2_96">0.75m</span>
    <img id="CPH_Content_repWater2_imgLevel_96" class="form_img_01" src="images/level5.png" />
    <span id="CPH_Content_repWater2_labSTREAM_3">新屋溪</span>
    <a id="CPH_Content_repWater2_hlkLocationTitle_3" onClick="Zoom(13,25.01137,121.05994);">觀新橋</a>
    <span id="CPH_Content_repWater2_labWater2_3">1.3m</span>
  `;

  const stations = parseRiverStations(html);
  const xinjie = stations.find((s) => s.station === "新街橋");

  assert.deepEqual(xinjie, {
    index: "96",
    stream: "新街溪",
    station: "新街橋",
    waterLevel: "0.75m",
    lat: "24.9628",
    lon: "121.23013",
    levelImg: "images/level5.png",
  });
  // The second (sparser) entry is still parsed by its own index.
  assert.equal(stations.find((s) => s.station === "觀新橋")?.waterLevel, "1.3m");
});

test("parseWStationDetail pulls level, bank height, time and live image from a POI item", () => {
  const item = {
    Type: "WSTATION",
    Status: "GREEN",
    Name: "新街橋",
    Longitude: 121.23013,
    Latitude: 24.9628,
    Description:
      "\r\n名稱：新街橋<br/>\r\n高度水位：0.75m<br/>\r\n河岸高度：3.88m<br/>\r\n" +
      "資料時間：2026/6/18 下午 06:50:00<br/>\r\n" +
      "<img class='map-inner-wstation-photo' src=\"https://video3.wrbtycg.tw/node/image/abc?live=1\"></img>\r\n",
  };

  assert.deepEqual(parseWStationDetail(item), {
    station: "新街橋",
    level: "0.75m",
    bankHeight: "3.88m",
    observedAt: "2026/6/18 下午 06:50:00",
    imageUrl: "https://video3.wrbtycg.tw/node/image/abc?live=1",
    lat: "24.9628",
    lon: "121.23013",
  });
});

test("parseWaterChart reads banks, alert levels and series from the D3 detail page", () => {
  // Mirrors the inline JS that D3_reservior_mountain.aspx embeds for a station.
  const html = `
    <div style="border-radius: 5px 5px 0 0;">新街橋</div>
    <div>(水位海拔高 124.65 m)</div>
    config1.noAlertLevel = "1.55";
    config1.yellowAlerLevel = "2.38";
    config1.redAlertLevel = "2.88";
    config1.maxValue = "3.88";
    config1.r_stopgo_m = "0";
    config1.RIGHTHEIGHT = "3.88";
    config1.LEFTHEIGHT = "4.25";
    //config1.station = "新街橋";
    var gauge2 = loadLiquidFillGauge("fillgauge2", "0.76", config1);
    var aHighChartsTime = "2026-06-18 16:30:00 ~ 2026-06-18 19:59:59";
    var yData = [0.75,0.76,0.76];
    var ABS_HEIGHTData = [124.643,124.653,124.653];
    var yRainData = [0,0,0];
  `;

  assert.deepEqual(parseWaterChart(html), {
    station: "新街橋",
    absoluteHeightM: 124.65,
    currentLevelM: 0.76,
    leftBankM: 4.25,
    rightBankM: 3.88,
    redAlertM: 2.88,
    yellowAlertM: 2.38,
    noAlertM: 1.55,
    stopgoM: 0,
    timeRange: "2026-06-18 16:30:00 ~ 2026-06-18 19:59:59",
    waterSeries: [0.75, 0.76, 0.76],
    absHeightSeries: [124.643, 124.653, 124.653],
    rainSeries: [0, 0, 0],
  });
});

test("parseRainProbability takes today's highest 12h PoP from the 3hr module", () => {
  // D1 = today, D2 = tomorrow. PoP cells reference a day column via `headers`.
  const html = `
    <th id="PC3_D1" headers="PC3_D" colspan="2">06/18<br>星期四</th>
    <th id="PC3_D2" headers="PC3_D" colspan="2">06/19<br>星期五</th>
    <td colspan="3" headers="PC3_Po PC3_D1 PC3_D1H18 PC3_D1H19 PC3_D1H20">20%</td>
    <td colspan="3" headers="PC3_Po PC3_D1 PC3_D1H21 PC3_D1H22 PC3_D1H23">60%</td>
    <td colspan="3" headers="PC3_Po PC3_D2 PC3_D2H00 PC3_D2H01 PC3_D2H02">10%</td>
  `;
  const now = new Date("2026-06-18T10:00:00Z"); // 2026/06/18 18:00 Asia/Taipei

  assert.deepEqual(parseRainProbability(html, now), {
    date: "06/18",
    probabilityPercent: 60,
  });
});

test("parseRainProbability returns null when today's date is absent", () => {
  const html = `
    <th id="PC3_D1" headers="PC3_D">06/19<br>星期五</th>
    <td headers="PC3_Po PC3_D1 PC3_D1H00">30%</td>
  `;
  const now = new Date("2026-06-18T10:00:00Z");
  assert.deepEqual(parseRainProbability(html, now), {
    date: "06/18",
    probabilityPercent: null,
  });
});
