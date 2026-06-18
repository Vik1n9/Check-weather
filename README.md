# Check-weather

農工中心氣象、新街橋水位與雷達回波整合頁面。

## 線上瀏覽

👉 **https://vik1n9.github.io/Check-weather/**

頁面為純靜態網站，資料由 GitHub Actions 每 2 小時自動預抓更新。

## 資料內容

- **中央氣象署農業氣象站 M024（農工中心）**：目前氣象，以及「今日 24 小時最高/最低溫」
- **桃園市水情資訊網 — 新街橋**：從地圖首頁 `Default.aspx` 直接讀取新街橋即時水位（單純 HTTP，不需瀏覽器）。
  官網的水位剖面圖禁止被其他網站內嵌（伺服器送 `X-Frame-Options: SAMEORIGIN`），
  因此頁面以「即時連結」在新分頁開啟官方剖面圖，而非內嵌截圖。
- **中央氣象署雷達回波**：無地形、臺灣鄰近區域的最新靜止圖

## 架構

```
GitHub Actions（每 2 小時／可手動）
  └─ scripts/prefetch.mjs
       ├─ 氣象署 .js → 今日最高/最低溫              → docs/data/summary.json
       ├─ 雷達 .js + 下載圖                          → docs/data/radar.png
       └─ 桃園 Default.aspx → 新街橋即時水位          → docs/data/summary.json
  └─ commit docs/data/* 回 repo
GitHub Pages（main /docs）→ 顯示靜態頁面（讀 ./data/summary.json）
  └─ 剖面圖以連結即時開啟官方頁（無法內嵌）
```

- `docs/` — 靜態站台（`index.html` / `app.js` / `styles.css`）與預抓產物 `docs/data/`
- `scripts/sources.mjs` — 共用的資料抓取與解析邏輯
- `scripts/prefetch.mjs` — 預抓腳本（唯一寫入 `docs/data/` 的程式）
- `.github/workflows/prefetch.yml` — 定時排程與部署
- `server.js` — **僅供本地開發**的靜態伺服器

## 首次啟用需在 GitHub 上設定（一次性）

1. **Settings → Pages → Build and deployment → Source =「Deploy from a branch」**，
   branch 選 `main`、資料夾選 `/docs`。
2. **Settings → Actions → General → Workflow permissions =「Read and write permissions」**
   （Action 需要把更新後的 `docs/data/` commit 回 repo）。
3. 到 **Actions** 分頁手動執行一次「Prefetch dashboard data」（workflow_dispatch），
   產生第一份資料後網站即可顯示。

> 排程 cron 為 UTC（`0 */2 * * *`，約每 2 小時一次）；GitHub 排程為盡力而為，可能略有延遲。

## 本地開發

```bash
npm run prefetch                  # 抓資料寫進 docs/data/（需可連外，無第三方相依套件）
npm start                         # 開 http://localhost:4173
npm test                          # 解析邏輯單元測試
```

若無法連外，`docs/data/` 已附一份範例資料，可直接 `npm start` 預覽版面。
