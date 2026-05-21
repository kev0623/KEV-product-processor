# mixxin-batch-upload

商品資料轉換引擎 — 把品牌 Excel 轉成各電商平台上架格式。

## 架構

```
品牌 Excel (seed)
      ↓
Input Adapter   — reference/brand/{brand}.json 定義輸入格式與品牌常數
      ↓
Order[]         — 標準中間格式
      ↓
Engine          — Table Driven，吃 platform JSON 腳本
      ↓
Output Adapter  — reference/platform/{platform}.json 定義輸出欄位
      ↓
平台上架 Excel
```

全部在瀏覽器執行，資料不離開本機。

## 開始使用

```bash
npm install
npm run dev
```

打開 http://localhost:3000，上傳三個檔案即可：

1. 商品 Excel
2. 品牌腳本 `reference/brand/{brand}.json`
3. 平台腳本 `reference/platform/{platform}.json`

## 測試

```bash
npm test
```

## 目錄結構

```
src/
  engine/
    types.ts        — 所有型別定義
    functions.ts    — DSL 函式庫
    engine.ts       — Layer 2 執行器
    adapter-in.ts   — Excel → Order[]
    adapter-out.ts  — rows → Excel 下載
reference/
  brand/            — 品牌腳本（輸入格式 + 品牌常數）
  platform/         — 平台腳本（輸出欄位定義）
```
