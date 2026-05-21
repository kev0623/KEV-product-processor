# TODO

## Engine 補完（對齊舊系統邏輯）

### functions.ts
- [ ] `replace_regex` — 正規表達式取代，用於牛仔褲尺寸格式轉換（`2530` → `25腰30褲長`）
- [ ] `date_offset` — 動態日期，支援 `+1y` / `+10y`，用於開始時間 / 結束時間

### levis-yahoo/output.json
- [ ] 補 `開始時間` / `結束時間`（用 `date_offset`）
- [ ] 補 `屬性項目1:第一層名稱` 套用 `replace_regex` 轉換尺寸格式
- [ ] 補 `商品規格1~N:項目名稱` / `商品規格1~N:項目內容`（attribute specs，約 40 欄）
- [ ] 補空白欄位：`交貨期限`、`保固範圍`、`保固來源`、`保固說明`、`供應商商品料號`

---

## Engine 功能擴充

- [ ] 排序支援 — 目前按 Excel 原始順序，舊系統依 `sort.yaml` 排序
- [ ] 映射表函式 `map` — 多對一條件映射（用於顏色系、分類、版型等 attribute_rules）
- [ ] 多欄條件映射 `map_cols` — 依多個欄位組合決定輸出值（如 `Level4,Level5 >> 版型`）

---

## UI 功能

- [ ] 執行後在頁面預覽輸出表格（前 10 列）
- [ ] 顯示處理進度 / 每個函式步驟的執行狀態
- [ ] 腳本編輯器：在 UI 直接修改 input.json / output.json

---

## 測試補完

- [ ] `replace_regex` 函式測試
- [ ] `date_offset` 函式測試
- [ ] `map` / `map_cols` 函式測試
- [ ] 端對端測試：新系統輸出 vs 舊系統輸出，逐欄比對

---

## 品牌 / 平台腳本

- [ ] Levis × Yahoo — 補完 attribute specs（商品規格欄位）
- [ ] Levis × Momo
- [ ] Levis × Shopee
