import { FUNCTIONS } from './functions'
import type { Order, OutputScript, Step } from './types'

function runSteps(order: Order, steps: Step[]): string {
  let value: unknown = ''
  for (const step of steps) {
    const fn = FUNCTIONS[step.func]
    if (!fn) throw new Error(`未知函式: "${step.func}"`)
    value = fn(value, order, step.body ?? {})
  }
  return String(value ?? '')
}

// Layer 2：Order[] + 輸出腳本 → 輸出列陣列
export function transform(
  orders: Order[],
  script: OutputScript,
): Record<string, string>[] {
  return orders.map(order => {
    const row: Record<string, string> = {}
    for (const [col, steps] of Object.entries(script)) {
      // _ 開頭的 key（如 _comment）視為備註，略過
      if (col.startsWith('_') || !Array.isArray(steps)) continue
      row[col] = runSteps(order, steps)
    }
    return row
  })
}
