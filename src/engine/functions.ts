import type { Order } from './types'

type FuncFn = (
  value: unknown,
  order: Order,
  body: Record<string, unknown>,
) => unknown

// 支援 "name"、"skus[0].color" 兩種路徑格式
function getPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  return parts.reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return ''
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

export const FUNCTIONS: Record<string, FuncFn> = {
  // 從 Order 取值，path 支援 "name"、"skus[0].color"
  get: (_, order, body) =>
    getPath(order, body.path as string) ?? '',

  // 數值運算
  multiply: (val, _, body) =>
    String(Number(val) * Number(body.factor)),
  add: (val, _, body) =>
    String(Number(val) + Number(body.value)),
  round: (val, _, body) =>
    String(Number(Number(val).toFixed(Number(body.decimals ?? 0)))),

  // 字串處理
  upper:   (val) => String(val).toUpperCase(),
  lower:   (val) => String(val).toLowerCase(),
  trim:    (val) => String(val).trim(),
  replace: (val, _, body) =>
    String(val).replaceAll(body.from as string, body.to as string),
  split: (val, _, body) =>
    String(val).split(body.sep as string)[Number(body.idx)] ?? '',

  // 字串組合
  prefix: (val, _, body) =>
    `${body.text}${val}`,
  suffix: (val, _, body) =>
    `${val}${body.text}`,
  floor: (val) =>
    String(Math.floor(Number(val))),

  // 空值處理
  default: (val, _, body) =>
    val === '' || val == null ? body.value : val,

  // 固定字串（不依賴前一步的值）
  literal: (_, __, body) =>
    body.value,
}
