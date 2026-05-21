import { describe, it, expect } from 'vitest'
import { transform } from '../engine'
import { normalize } from '../adapter-in'
import type { Order, OutputScript, InputScript } from '../types'

// ── 1. 基本函式測試 ──────────────────────────────────────────

describe('engine: 基本函式', () => {
  const order: Order = {
    name: 'Pride短Tee',
    price: '1290',
    skus: [
      { size: 'S', partsNo: 'AAA0001S-' },
      { size: 'M', partsNo: 'AAA0001M-' },
    ],
  }

  it('get — 取頂層欄位', () => {
    const result = transform([order], { 賣場名稱: [{ func: 'get', body: { path: 'name' } }] })
    expect(result[0]['賣場名稱']).toBe('Pride短Tee')
  })

  it('get — 取 skus[0].size', () => {
    const result = transform([order], { 尺寸1: [{ func: 'get', body: { path: 'skus[0].size' } }] })
    expect(result[0]['尺寸1']).toBe('S')
  })

  it('get — skus[2] 不存在時回空字串', () => {
    const result = transform([order], {
      尺寸3: [
        { func: 'get',     body: { path: 'skus[2].size' } },
        { func: 'default', body: { value: '' } },
      ],
    })
    expect(result[0]['尺寸3']).toBe('')
  })

  it('multiply + floor — 進貨成本', () => {
    const result = transform([order], {
      進貨成本: [
        { func: 'get',      body: { path: 'price' } },
        { func: 'multiply', body: { factor: 0.874 } },
        { func: 'floor' },
      ],
    })
    expect(result[0]['進貨成本']).toBe('1127')  // floor(1290 * 0.874) = floor(1127.46) = 1127
  })

  it('literal — 固定字串', () => {
    const result = transform([order], { 品牌: [{ func: 'literal', body: { value: 'Levis' } }] })
    expect(result[0]['品牌']).toBe('Levis')
  })

  it('prefix — 前綴', () => {
    const result = transform([order], {
      商品詳情: [
        { func: 'get',    body: { path: 'name' } },
        { func: 'prefix', body: { text: '貨號:' } },
      ],
    })
    expect(result[0]['商品詳情']).toBe('貨號:Pride短Tee')
  })

  it('replace — 去除 ®™', () => {
    const o: Order = { skus: [], name: 'Levi\'s® Pride™ Tee' }
    const result = transform([o], {
      賣場名稱: [
        { func: 'get',     body: { path: 'name' } },
        { func: 'replace', body: { from: '®', to: '' } },
        { func: 'replace', body: { from: '™', to: '' } },
      ],
    })
    expect(result[0]['賣場名稱']).toBe("Levi's Pride Tee")
  })
})

// ── 2. engine 防禦性測試 ──────────────────────────────────────

describe('engine: 防禦性', () => {
  const order: Order = { skus: [], name: 'test' }

  it('未知函式應 throw 清楚錯誤', () => {
    expect(() =>
      transform([order], { col: [{ func: 'nonExistentFunc' }] })
    ).toThrow('未知函式: "nonExistentFunc"')
  })

  it('output script 有 _comment key 應被忽略，不報錯', () => {
    const script = {
      _comment: '這是備註，不是欄位',
      名稱: [{ func: 'get', body: { path: 'name' } }],
    } as unknown as OutputScript
    expect(() => transform([order], script)).not.toThrow()
    const result = transform([order], script)
    expect(result[0]['名稱']).toBe('test')
    expect('_comment' in result[0]).toBe(false)
  })
})

// ── 3. adapter-in: multi_row normalize 測試 ────────────────────

describe('adapter-in: multi_row', () => {
  const rows = [
    { Level1: 'AAA-001', PartsDescription: 'Pride Tee', PriceSale: '1290', Level15: 'S', PartsNo: 'AAA0001S-' },
    { Level1: 'AAA-001', PartsDescription: 'Pride Tee', PriceSale: '1290', Level15: 'M', PartsNo: 'AAA0001M-' },
    { Level1: 'AAA-001', PartsDescription: 'Pride Tee', PriceSale: '1290', Level15: 'L', PartsNo: 'AAA0001L-' },
    { Level1: 'BBB-002', PartsDescription: 'Slim Jeans', PriceSale: '2490', Level15: '30', PartsNo: 'BBB0002_30-' },
  ]

  const script: InputScript = {
    input_format: 'multi_row',
    group_by: 'Level1',
    fields: {
      level1:           { kind: 'col', col: 'Level1' },
      partsDescription: { kind: 'col', col: 'PartsDescription' },
      priceSale:        { kind: 'col', col: 'PriceSale' },
      skus: {
        kind: 'aggregate',
        fields: {
          size:    { col: 'Level15' },
          partsNo: { col: 'PartsNo' },
        },
      },
    },
  }

  it('4 列 → 2 個 Order（依 Level1 分組）', () => {
    const orders = normalize(rows, script)
    expect(orders).toHaveLength(2)
  })

  it('第一個 Order 有 3 個 SKU', () => {
    const orders = normalize(rows, script)
    expect(orders[0].skus).toHaveLength(3)
    expect(orders[0].skus[0]).toEqual({ size: 'S', partsNo: 'AAA0001S-' })
    expect(orders[0].skus[2]).toEqual({ size: 'L', partsNo: 'AAA0001L-' })
  })

  it('頂層欄位正確帶入', () => {
    const orders = normalize(rows, script)
    expect(orders[0]['partsDescription']).toBe('Pride Tee')
    expect(orders[1]['priceSale']).toBe('2490')
  })
})

// ── 4. adapter-in: constants merge 測試 ───────────────────────

describe('adapter-in: constants', () => {
  const rows = [
    { Level1: 'AAA-001', PartsNo: 'AAA0001S-', Level15: 'S' },
  ]

  const script: InputScript = {
    input_format: 'single_row',
    fields: {
      level1:   { kind: 'col', col: 'Level1' },
      partsNo:  { kind: 'col', col: 'PartsNo' },
    },
    constants: {
      brand:       'Levis',
      contactName: '李傳玲',
    },
  }

  it('constants 被 merge 進 Order', () => {
    const orders = normalize(rows, script)
    expect(orders[0]['brand']).toBe('Levis')
    expect(orders[0]['contactName']).toBe('李傳玲')
  })

  it('Order 欄位優先於 constants（同名時不被覆蓋）', () => {
    const scriptWithConflict: InputScript = {
      ...script,
      constants: { level1: '被覆蓋的值', brand: 'Levis' },
    }
    const orders = normalize(rows, scriptWithConflict)
    expect(orders[0]['level1']).toBe('AAA-001') // Order 資料優先
  })

  it('platform JSON 可以用 get 取 constants 的值', () => {
    const orders = normalize(rows, script)
    const result = transform(orders, {
      品牌:   [{ func: 'get', body: { path: 'brand' } }],
      提案人: [{ func: 'get', body: { path: 'contactName' } }],
    })
    expect(result[0]['品牌']).toBe('Levis')
    expect(result[0]['提案人']).toBe('李傳玲')
  })
})
