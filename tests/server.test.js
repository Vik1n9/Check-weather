import test from "node:test";
import assert from "node:assert/strict";

import { buildWaterVisual, parseWaterRows } from "../server.js";

test("parseWaterRows keeps station data needed by the water visual panel", () => {
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

test("buildWaterVisual returns bounded numeric data for an embedded water-level image", () => {
  const visual = buildWaterVisual({
    station: "新街橋",
    stream: "老街溪",
    waterLevel: "0.75m",
    leftBankHeight: "4.25m",
    rightBankHeight: "3.88m",
  });

  assert.equal(visual.title, "新街橋");
  assert.equal(visual.stream, "老街溪");
  assert.equal(visual.waterLevel, "0.75m");
  assert.equal(visual.waterLevelM, 0.75);
  assert.equal(visual.leftBankHeight, "4.25m");
  assert.equal(visual.rightBankHeight, "3.88m");
  assert.equal(visual.maxHeightM, 4.25);
  assert.equal(visual.sourceKind, "embedded-water-level-diagram");
});
