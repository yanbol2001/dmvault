# DMVault Platform

DMVault 是怪獸對打機資料庫與育成攻略平台。此 Repository 僅保存 Hub、共用 Core、PWA 及作品入口 metadata，不放置原始試算表或可直接重建來源資料的檔案。

## 版本規範

### Platform Version
管理 Hub、Core、共用 UI、PWA、Analytics 與跨作品功能。

### Content Version
每個作品各自管理內容資料、圖片、文字與作品限定功能。

全部採用 `MAJOR.MINOR.PATCH`：
- MAJOR：重大架構或不相容變更
- MINOR：新增功能或大量內容
- PATCH：錯字、資料與顯示修正

開發版可使用 `1.0.0-dev26`，正式發布時移除 `-dev1`。

## Sprint 1

- JSON 驅動首頁
- 三個作品卡
- 統一 Platform / Content 版本顯示
- 集中更新紀錄
- PWA 與 GA4 基礎
- GitHub Pages `/DMVault/` 路徑

## 修改作品資訊

編輯 `projects/*.json`。新增作品時：
1. 新增作品 JSON。
2. 將檔案路徑加入 `projects/index.json`。
3. 更新 `projects/updates.json`。


## Sprint 1 完成

Platform v1.0.0-dev26 完成首頁平台骨架、JSON 驅動作品卡、更新紀錄、PWA 基礎與響應式介面。


## Sprint 2
- PWA 安裝提示與執行狀態
- 在線／離線狀態
- Service Worker 快取策略強化
- GA4 互動事件追蹤
- 精簡 PWA 操作，只保留安裝、更新、網路與離線狀態
- 強化快取策略、版本偵測與部署後內容更新可靠性

## Sprint 2 完成基線

Platform v1.0.0-dev26 完成 PWA 安裝、離線快取、更新檢查、版本一致性、錯誤復原與手機導覽基礎。
