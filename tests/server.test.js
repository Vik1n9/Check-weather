import test from "node:test";
import assert from "node:assert/strict";

import { parseWaterRows } from "../scripts/sources.mjs";

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
