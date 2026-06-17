// Local development server only.
// Production is a static GitHub Pages site fed by scripts/prefetch.mjs (run in
// GitHub Actions). For local dev: `npm run prefetch` to populate docs/data,
// then `npm start` and open http://localhost:4173/.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getWeather, getWater, getRadar } from "./scripts/sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "docs");
const port = Number(process.env.PORT || 4173);

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
      ext === ".json" ? "application/json; charset=utf-8" :
      ext === ".png" ? "image/png" :
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
    // Legacy live API routes, kept for local debugging only.
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

server.listen(port, () => {
  console.log(`Watcher dashboard running at http://localhost:${port}`);
});
