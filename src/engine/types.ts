// 單一 SKU（顏色、尺寸等屬性的 key-value）
export type SKU = Record<string, string>

// 標準訂單物件（中間格式，Layer 1 輸出 / Layer 2 輸入）
export type Order = {
  skus: SKU[]
  [field: string]: string | SKU[]
}

// ── Layer 1：輸入腳本 ──────────────────────────────────────

// kind 是 discriminant，讓 TypeScript 可以精確 narrow 型別

type ColField = {
  kind: 'col'
  col: string
}

type AggregateField = {
  kind: 'aggregate'
  fields: Record<string, { col: string }>
}

type ParseStringField = {
  kind: 'parse_string'
  col: string
  separator: string
  fields: string[]       // SKU 物件的欄位名順序
  field_separator: string
}

export type FieldDef = ColField | AggregateField | ParseStringField

export type InputScript = {
  // single_row：一列一筆訂單，無 SKU 展開
  // multi_row ：多列 merge 成一筆訂單（如 Yahoo）
  // sku_string：一列一筆訂單，SKU 是字串組合（如 "紅/S,藍/M"）
  input_format: 'single_row' | 'multi_row' | 'sku_string'
  group_by?: string // multi_row 必填，用來決定哪些列屬於同一筆訂單
  fields: Record<string, FieldDef>
  // 品牌常數 — 會 merge 進每一筆 Order，platform JSON 用 get 取值
  constants?: Record<string, string>
}

// ── Layer 2：輸出腳本 ──────────────────────────────────────

export type Step = {
  func: string
  body?: Record<string, unknown>
}

// key = 輸出欄位名，value = 要依序執行的函式步驟
export type OutputScript = Record<string, Step[]>
