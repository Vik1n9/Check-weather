# Check-weather

農工中心氣象、新街橋水位與雷達回波整合頁面。

## 線上瀏覽

👉 **https://vik1n9.github.io/Check-weather/**

頁面為純靜態網站，資料由 GitHub Actions 每 2 小時自動預抓更新。

## 資料內容

- **中央氣象署農業氣象站 M024（農工中心）**：以「今日最低／最高溫」為主要大字顯示，其次才是目前溫度；
  並抓取農工中心今日降雨機率（逐三小時預報模組的 12 小時 PoP，取當日最大值）顯示在最低／最高溫旁。
- **桃園市水情資訊網 — 新街橋**：從地圖 POI 來源（`proxy.ashx?op=GetAlertInfoPOI&type=WStation`）
  讀取新街橋即時水位、河岸高度、觀測時間與「官方測站即時影像」。該影像是純 `<img>`，
  不受地圖頁 `X-Frame-Options` 限制，因此直接內嵌在頁面顯示，並可點擊直接開啟正確的測站影像；
  影像離線時自動退回官方地圖連結。即時水位另以 `Default.aspx` 取得溪流名稱與備援水位。
- **新街橋水位圖（剖面圖）**：水情網「詳細資訊」彈窗的剖面圖由
  `TYSAMOBILE/DataReview/D3_reservior_mountain.aspx?no=<測站編號>` 提供（新街橋編號
  `20160519140201`，取自 `water.aspx` 本局列管水位站清單的「詳細資訊」連結）。該頁把海拔高、
  左右岸高度、黃／紅警戒水位、封橋警戒線、目前水位與三小時水位／雨量歷線都以行內 JS 變數內嵌，
  預抓時直接解析。頁面以行內 SVG 重繪此剖面圖，顯示在即時水位影像上方。
- **中央氣象署雷達回波**：無地形、臺灣鄰近區域的最新靜止圖

## 架構

```
GitHub Actions（每 2 小時／可手動）
  └─ scripts/prefetch.mjs
       ├─ 氣象署 .js → 今日最高/最低溫              → docs/data/summary.json
       ├─ 氣象署 3hr 模組 → 今日降雨機率(PoP)        → docs/data/summary.json
       ├─ 雷達 .js + 下載圖                          → docs/data/radar.png
       └─ 桃園 POI/Default.aspx → 新街橋水位+即時影像          → docs/data/summary.json
       └─ 桃園 D3_reservior_mountain.aspx → 新街橋剖面圖資料   → docs/data/summary.json
  └─ commit docs/data/* 回 repo
GitHub Pages（main /docs）→ 顯示靜態頁面（讀 ./data/summary.json）
  └─ 水位圖以行內 SVG 重繪剖面圖（海拔高／左右岸／黃紅警戒／目前水位）
  └─ 測站即時影像直接內嵌（純 <img>），離線時退回官方地圖連結
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
