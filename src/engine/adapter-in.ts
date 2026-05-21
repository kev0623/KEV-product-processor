import * as XLSX from 'xlsx'
import type { InputScript, Order, SKU } from './types'

// Excel buffer → 第一個 sheet 的 rows
export function parseExcel(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
}

// rows + 品牌腳本 → 標準 Order[]（含品牌常數）
export function normalize(
  rows: Record<string, string>[],
  script: InputScript,
): Order[] {
  const constants = script.constants ?? {}

  let orders: Order[] = []

  if (script.input_format === 'single_row') {
    orders = rows.map(row => toOrder(row, script))
  } else if (script.input_format === 'multi_row') {
    const groups = new Map<string, Record<string, string>[]>()
    for (const row of rows) {
      const key = row[script.group_by!] ?? ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    orders = Array.from(groups.values()).map(group =>
      toOrderFromGroup(group, script),
    )
  } else if (script.input_format === 'sku_string') {
    orders = rows.map(row => toOrderFromSkuString(row, script))
  }

  // 把品牌常數 merge 進每一筆 Order（欄位名衝突時 Order 資料優先）
  return orders.map(order => ({ ...constants, ...order }))
}

// ── 內部輔助 ──────────────────────────────────────────────

function toOrder(row: Record<string, string>, script: InputScript): Order {
  const order: Order = { skus: [] }
  for (const [key, def] of Object.entries(script.fields)) {
    if (def.kind === 'col') order[key] = row[def.col] ?? ''
  }
  return order
}

function toOrderFromGroup(
  group: Record<string, string>[],
  script: InputScript,
): Order {
  const order: Order = { skus: [] }
  for (const [key, def] of Object.entries(script.fields)) {
    if (def.kind === 'col') {
      order[key] = group[0][def.col] ?? ''
    } else if (def.kind === 'aggregate') {
      order.skus = group.map(row => {
        const sku: SKU = {}
        for (const [field, fieldDef] of Object.entries(def.fields)) {
          sku[field] = row[fieldDef.col] ?? ''
        }
        return sku
      })
    }
  }
  return order
}

function toOrderFromSkuString(
  row: Record<string, string>,
  script: InputScript,
): Order {
  const order: Order = { skus: [] }
  for (const [key, def] of Object.entries(script.fields)) {
    if (def.kind === 'col') {
      order[key] = row[def.col] ?? ''
    } else if (def.kind === 'parse_string') {
      const raw = row[def.col] ?? ''
      order.skus = raw.split(def.separator).map(part => {
        const values = part.split(def.field_separator)
        const sku: SKU = {}
        def.fields.forEach((field, i) => {
          sku[field] = values[i] ?? ''
        })
        return sku
      })
    }
  }
  return order
}
