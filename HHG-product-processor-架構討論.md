# HHG Product Processor — 架構討論筆記

> 討論日期：2026-05-20
> 目的：評估現有系統架構，討論重構方向

---

## 系統本質

這是一個 **Excel → Excel 翻譯機**。

```
商品總檔 (Excel)  →  [轉換引擎]  →  平台上架檔 (Momo / Shopee / Yahoo / 91App…)
```

核心由兩個獨立服務組成：

- `product_builder` — 把品牌原始資料整理成標準商品總檔
- `batch_upload` — 把商品總檔翻譯成各平台要的格式（主要工作在這）

---

## 現有技術棧

| 層級 | 技術 | 用途 |
|------|------|------|
| UI | Streamlit | 內部工具 Web UI |
| 處理引擎 | Python + pandas | 資料轉換 |
| 設定格式 | YAML | 品牌規則（DSL） |
| Excel I/O | openpyxl | 讀寫 Excel 模板 |
| 外部整合 | BigQuery, gspread | 資料查詢與 Google Sheets |

---

## 為什麼不直接換 Next.js / Node.js

### 核心障礙：pandas

整個引擎圍繞 `pd.DataFrame` 設計，7000+ 行，涵蓋：
- 算術運算（`*`, `+`, `round`, `floor`）
- 字串操作（`replace`, `regex`, `truncate`, `upper`）
- 資料合併（`merge` — Momo 屬性對應）
- 樞紐轉置（`pivot_table` — Yahoo SKU 展開）
- 分類映射（`fnmatch` glob 模式）

Node.js 的 `danfojs` 只有 pandas 30-40% 的功能，遇到 multiindex、complex merge 就不夠用。

### Excel I/O 無論如何都需要一層程式碼

PostgreSQL、Node.js 都不讀寫 Excel。起點和終點都是 Excel 檔，這層省不掉。

### 最務實的中間方案

```
Next.js / 任何前端
        ↕ HTTP
FastAPI（薄 API 層，~200 行）
        ↕
現有 Python 引擎（engine/ + platforms/）← 完全不動
```

---

## 「向量化」是什麼，用在哪

**向量化 = 一次對整欄操作，不用寫 for 迴圈。**

```python
# 傳統逐行
for i in range(500):
    result[i] = product[i]["PriceSale"] * 0.85

# pandas 向量化（等價）
series * 0.85   # series = 500 筆商品的售價欄
```

### 在這個系統裡的角色

```
YAML 規則（讀一次）
"售價: {PriceSale:func::*0.85}"
        ↓ dsl_parser.py 解析（純 Python，不用 pandas）
    AST 節點：「取 PriceSale 欄，乘 0.85」
        ↓ 套用到 Excel 資料
[1200, 890, 3500, ...]  ← pandas Series（整欄）
        ↓ multiply(series, 0.85)
[1020, 756.5, 2975, ...] ← 結果欄
```

**YAML 是指令，pandas 只碰 Excel 資料那一側。**

向量化不是技術瓶頸（商品幾百筆，pandas 毫秒級），只是 pandas 內建的運作方式。

---

## 現有 DSL 設計的問題

### 現況：字串 DSL，需要自己的 Parser

```yaml
# rules/Levis/momo.yaml
售價: "{PriceSale:func::*0.85}"
規格: "{Size:func::upper:>>\"無\"}"
尺寸: "{Level7,Level8:\n配件,*>>規格\n_ELSE_>>尺寸}"
```

- 優點：緊湊、靈活
- 缺點：需要 `dsl_parser.py`（478 行）來解析，難讀，難移植

---

## 討論出的重構方向

### Table Driven + 結構化 YAML/JSON

把字串 DSL 改成明確的函式呼叫鏈：

```yaml
售價:
  - func: get_col
    body: {col: PriceSale}
  - func: multiply
    body: {factor: 0.85}

規格:
  - func: get_col
    body: {col: Size}
  - func: upper
  - func: default
    body: {value: "無"}

尺寸:
  - func: map_cols
    body:
      sources: [Level7, Level8]
      rules:
        - match: [配件, "*"]
          result: 規格
        - match: _ELSE_
          result: 尺寸
```

### Executor（任何語言都能實作，15 行以內）

```python
FUNCTION_REGISTRY = {
    'get_col':  lambda val, row, col:   row[col],
    'multiply': lambda val, factor:     float(val) * float(factor),
    'upper':    lambda val:             str(val).upper(),
    'trim':     lambda val:             str(val).strip(),
    'default':  lambda val, value:      value if not val else val,
    'split':    lambda val, sep, idx:   str(val).split(sep)[int(idx)],
    'map':      lambda val, table:      table.get(val, val),
}

def execute(row, steps):
    val = None
    for step in steps:
        fn = FUNCTION_REGISTRY[step['func']]
        val = fn(val, row=row, **step.get('body', {}))
    return val
```

### 優點

- `dsl_parser.py` 478 行整個刪掉
- 任何語言都能跑（Node.js / Go / Python）
- YAML 本身就是結構化，JSON Schema 可直接驗證
- 新增函式只加一行 registry

### 代價

- 現有 18 個品牌的 YAML 全部要改寫（純工時）
- 比字串 DSL 更冗長

---

## YAML vs JSON 的選擇

| | YAML | JSON |
|--|------|------|
| 可以寫註解 | ✅ | ❌ |
| Node.js 原生支援 | ❌ 需要 `js-yaml` | ✅ `JSON.parse()` |
| Python 原生支援 | ❌ 需要 `pyyaml` | ✅ `json.load()` |
| 人工編輯友善度 | 較高 | 較低 |

**結論：** 格式選擇是小事。若目標是 Node.js，用 JSON 更自然；若要人工維護品牌規則，YAML 更好讀。

---

## 各方案的組合與取捨

| 方案 | 移除 parser | 可移植 | 遷移成本 |
|------|------------|--------|---------|
| 現況不動 | ❌ | ❌ | 無 |
| 只換 JSON（不改結構） | ❌ | 小幅改善 | 低 |
| Table Driven + YAML | ✅ | ✅ | 高（18 品牌改寫） |
| Table Driven + JSON + Node.js | ✅ | ✅ | 最高（含 Excel I/O 層） |

---

## 還沒解決的問題（無論哪個方向都要面對）

1. **Yahoo SKU pivot** — 多列轉多欄，需要資料處理邏輯
2. **Momo 屬性 merge** — 兩個表的 JOIN 對齊
3. **Excel 讀寫** — 需要套件（Python: openpyxl / Node.js: exceljs）
4. **18 個品牌的遷移工時**

---

## 複雜點的本質（Excel I/O、Yahoo、Momo）

### Excel I/O

不是單純讀寫，而是：
- 複製平台模板（保留格式、樣式）再寫入資料到指定位置
- Momo 模板有**雙列表頭**（兩列合併才是一個欄位名），需要特殊處理
- 換語言就要換套件，細節要重新實作

### Yahoo SKU Pivot

輸入（一 SKU 一列）：
```
商品A | 紅 | S | 1200
商品A | 紅 | M | 1200
商品A | 藍 | S | 1300
```
輸出（一商品一列，SKU 橫展）：
```
商品A | 屬性1:顏色=紅 | 屬性1:尺寸=S | 屬性2:顏色=藍 | 屬性2:尺寸=M
```
欄位數量不固定，有幾個 SKU 就展幾組。這是業務邏輯，不是 pandas 特有，換語言要自己實作。

### Momo 屬性 Merge

Momo 有一份從平台匯出的屬性框架，要和商品總檔做 JOIN。
難點：兩邊的商品名稱格式不同（一邊有 `【品牌】` 前綴），要先去掉再對齊。

---

## 兩層 Table Driven 架構（新設計方向）

### 核心概念

> **引擎是通用的，JSON 是品牌/平台的知識，Excel 是資料。三者分離。**

### 觀察到的兩種 Excel 輸入格式

**Format A：多列 merge 成一筆訂單**
```
商品A | 紅 | S | 1200
商品A | 紅 | M | 1200   ← 三列是同一商品
商品A | 藍 | S | 1300
```

**Format B：一列一筆訂單，SKU 是字串組合**
```
商品A | 紅/S,紅/M,藍/S | 1200,1200,1300
```

### 架構：兩層處理

```
Excel (seed)
     ↓
[ Layer 1：讀入正規化 ]  ← JSON 腳本定義輸入格式與欄位對應
  Format A → group by + aggregate
  Format B → parse string + expand
     ↓
  標準 Order Array（中間格式）
  [{ name, price, skus: [{color, size}, ...] }, ...]
     ↓
[ Layer 2：輸出轉換 ]   ← JSON 腳本定義平台欄位的函式鏈（Table Driven）
     ↓
平台上架 Excel
```

### Layer 1 腳本範例

Format A（multi_row）：
```json
{
  "input_format": "multi_row",
  "group_by": "商品編號",
  "fields": {
    "name":  { "col": "商品名稱" },
    "price": { "col": "售價" },
    "skus": {
      "type": "aggregate",
      "fields": {
        "color": { "col": "顏色" },
        "size":  { "col": "尺寸" }
      }
    }
  }
}
```

Format B（sku_string）：
```json
{
  "input_format": "sku_string",
  "fields": {
    "name":  { "col": "商品名稱" },
    "price": { "col": "售價" },
    "skus": {
      "type": "parse_string",
      "col": "規格字串",
      "separator": ",",
      "fields": ["color", "size"],
      "field_separator": "/"
    }
  }
}
```

### Layer 2 腳本範例（輸出欄位函式鏈）

```json
{
  "商品名稱": [
    { "func": "get", "body": { "path": "name" } }
  ],
  "售價": [
    { "func": "get",      "body": { "path": "price" } },
    { "func": "multiply", "body": { "factor": 0.85 } }
  ],
  "屬性項目1:顏色": [
    { "func": "get", "body": { "path": "skus[0].color" } }
  ],
  "屬性項目2:顏色": [
    { "func": "get", "body": { "path": "skus[1].color" } }
  ]
}
```

### 這個架構解決了什麼

| 現在的問題 | 新架構的解法 |
|-----------|------------|
| Yahoo pivot 硬編碼在 Python | Layer 1 腳本定義 `multi_row`，引擎統一處理 |
| DSL 字串需要 parser（478 行） | Layer 2 直接是結構化 JSON，不需要 parser |
| 換語言要重寫業務邏輯 | 業務邏輯在 JSON，引擎只是執行器 |
| 新品牌要改 Python code | 只要寫新的 JSON 腳本 |

---

## 引擎放前端：完全可行

### 核心概念

Engine 的本質是純函式：
```
f(inputJSON, scriptJSON) → outputJSON
```

純計算，沒有 I/O，沒有網路。天生適合跑在瀏覽器。

### 完整架構

```
瀏覽器（全部客戶端）
  Input Adapter   ← SheetJS 讀任何格式 → JSON
       ↓
  Engine          ← 純 JS，吃 JSON 腳本，產出 output JSON
       ↓
  Output Adapter  ← JSON → Excel / CSV / 用戶選的格式

後端（可選，很薄）
  - BigQuery 查詢（需要憑證，不能暴露在前端）
  - Google Sheets 同步
  - JSON 腳本的儲存和版本管理
```

### 前端套件

| 需求 | 套件 |
|------|------|
| 讀 Excel → JSON | SheetJS |
| 寫 JSON → Excel | SheetJS / ExcelJS |
| Engine 本身 | 純 JavaScript，不需要套件 |

### 額外好處

- 資料不離開用戶電腦（商品資料敏感）
- 可以離線使用
- 不需要 server 基礎設施（部署只是靜態檔案）
- 用戶可選輸出格式：Output Adapter 換一個，Engine 不動
- JSON 腳本可放 GitHub / CDN，或讓用戶在 UI 直接編輯

---

## 要改現有專案還是用 Next.js 重建？

### 改現有專案的問題

- 系統是別人 vibe coding 的，看不懂就不知道改一個地方會不會壞掉另一個
- 新架構（瀏覽器 JS 引擎）和現有架構（Python pandas 後端）根本不同，無法漸進式遷移，不是重構，是兩個不同的東西

### 重建的問題

- 18 個品牌的商業邏輯已在現有 YAML 裡
- Yahoo pivot、Momo merge 等細節是真實業務知識，重建時要翻譯成 JSON 腳本

### 結論：重建，但有策略

**理由：** 你繼承了你看不懂的系統，這本身就是風險。你設計的新架構你看得懂，因為是你想出來的。你能理解的系統比你不能理解的系統更有價值，即使後者功能更完整。

> 改現有系統是在別人的地基上蓋房子。重建是你自己的地基，你知道每一根柱子在哪裡。

**現有系統最大的價值不是程式碼，是 YAML 裡的品牌知識。** 這些知識可以帶走，程式碼不需要帶走。

### 建議的遷移策略

```
Week 1-2：只建引擎核心
  - Next.js 專案
  - Input Adapter（SheetJS 讀 Excel）
  - Engine（Table Driven，10 個基本函式）
  - Output Adapter（寫 Excel）

Week 3：選最簡單的一個品牌一個平台做 proof of concept
  - 把現有 YAML 翻譯成 JSON 腳本
  - 跑出來的結果和現有系統對比

之後：確認 OK 再逐步加品牌和平台
  - 舊系統繼續跑，當參考實作
  - 新系統穩定後再切換
```

---

## 檔案快速導覽

| 想改什麼 | 看哪個檔案 |
|---------|-----------|
| 某欄位計算錯了 | `rules/{品牌}/{平台}.yaml` |
| 新增品牌 | 複製 `rules/{其他品牌}/`，改 YAML |
| 分類對應錯了 | `rules/{品牌}/category.yaml` |
| Momo 特殊行為 | `platforms/momo.py` |
| 欄位格式驗證失敗 | `schema/{平台}.json` |
| 整個流程當掉 | `pipeline.py` 從 `run()` 往下追 |
