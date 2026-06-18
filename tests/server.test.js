import test from "node:test";
import assert from "node:assert/strict";

import { parseWaterRows, parseRiverStations } from "../scripts/sources.mjs";

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
