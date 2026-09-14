// Shared scoring logic for cycle count recommendations — used by both the
// Recommendations table (CycleCountRecommendationPage.vue) and the tab badge
// count in [...slug].vue, so the two never drift apart.
//
// Formula per "[WMS PRD 2] Cycle Count Recommendation — Basic (MVP)":
//   CountPriorityScore = W_neg × NegativeStockFlag + W_min × MinStockProximity + W_var × VarianceSignal
//   Weights derive from the active-signal count + order (cycleCountRuleOrder):
//   3 active → 0.5/0.3/0.2, 2 active → 0.6/0.4, 1 active → 1.0

import { warehouses } from './warehouses'
import { getWarehouseDetail, type WarehouseStockItem } from './warehouseDetails'
import { getWarehouseConfig, type WarehouseConfig } from './warehouseConfig'

export const MIN_STOCK_LIMIT = 10 // mirrors the existing "Min. stock" trigger threshold

export const ALL_REASONS = ['Negative stock', 'Min. stock', 'Variance signal'] as const
export type Reason = typeof ALL_REASONS[number]

export function hashStr(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export function recommendationReasons(cfg: WarehouseConfig, warehouseId: string, stock: WarehouseStockItem): Reason[] {
  const varianceNorm = (hashStr(stock.sku + warehouseId + 'variance') % 101) / 100
  const reasons: Reason[] = []
  if (cfg.cycleCountRuleNeg && stock.onHand === 0) reasons.push('Negative stock')
  if (cfg.cycleCountRuleMin && stock.onHand > 0 && stock.onHand < MIN_STOCK_LIMIT) reasons.push('Min. stock')
  if (cfg.cycleCountRuleVar && varianceNorm > 0.8) reasons.push('Variance signal')
  return reasons
}

/** Count of SKUs currently flagged for a cycle count recommendation — each warehouse's own config decides whether it's in scope at all.
 *  Pass a warehouseId to count just that one: the Recommendations tab shows a
 *  single warehouse at a time, and its badge has to match what the table lists. */
export function recommendationCount(warehouseId?: string): number {
  let count = 0
  for (const wh of warehouses.filter((w) => w.status === 'active' && !w.isDefault)) {
    if (warehouseId && wh.id !== warehouseId) continue
    const cfg = getWarehouseConfig(wh.id)
    if (!cfg.cycleCountRec) continue
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue
    for (const stock of detail.stock) {
      if (recommendationReasons(cfg, wh.id, stock).length) count++
    }
  }
  return count
}

const WEIGHT_TABLE: Record<number, number[]> = { 3: [0.5, 0.3, 0.2], 2: [0.6, 0.4], 1: [1] }
const RULE_KEY = { neg: 'cycleCountRuleNeg', min: 'cycleCountRuleMin', var: 'cycleCountRuleVar' } as const

/** Highest-priority recommended product names — mirrors the Recommendations table's
 *  own score/sort so the "N recommended for counting today" summary (e.g. a daily
 *  banner on the Cycle counts index) never drifts from what that table shows first.
 *  Each warehouse has its own rule order/weights, so these are recomputed per warehouse. */
export function topRecommendedProductNames(limit = 3, warehouseIds?: string[]): string[] {
  const scored: { name: string; score: number }[] = []
  // Recommendations are computed per warehouse, so the summary has to be too:
  // pass the warehouse(s) on screen and it names only their SKUs. No filter set
  // → every warehouse the user can see, same as the Recommendations tab.
  const scope = warehouseIds?.length ? new Set(warehouseIds) : null
  for (const wh of warehouses.filter((w) => w.status === 'active' && !w.isDefault)) {
    if (scope && !scope.has(wh.id)) continue
    const cfg = getWarehouseConfig(wh.id)
    if (!cfg.cycleCountRec) continue
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue

    const activeOrder = cfg.cycleCountRuleOrder.filter((r) => cfg[RULE_KEY[r]])
    const weights = WEIGHT_TABLE[activeOrder.length] ?? []
    const weightFor = (rule: 'neg' | 'min' | 'var') => {
      const i = activeOrder.indexOf(rule)
      return i === -1 ? 0 : (weights[i] ?? 0)
    }

    for (const stock of detail.stock) {
      const reasons = recommendationReasons(cfg, wh.id, stock)
      if (!reasons.length) continue

      const varianceNorm = (hashStr(stock.sku + wh.id + 'variance') % 101) / 100
      const negativeStockFlag = reasons.includes('Negative stock') ? 1 : 0
      const minStockProximity = reasons.includes('Min. stock')
        ? Math.max(0, (MIN_STOCK_LIMIT - stock.onHand) / MIN_STOCK_LIMIT)
        : 0
      const score = weightFor('neg') * negativeStockFlag + weightFor('min') * minStockProximity + weightFor('var') * varianceNorm
      scored.push({ name: stock.name, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  // One product can be recommended in several warehouses; the summary is a list
  // of products, so keep each name once (its highest score) rather than spending
  // a slot naming the same thing twice.
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of scored) {
    if (seen.has(r.name)) continue
    seen.add(r.name)
    names.push(r.name)
    if (names.length === limit) break
  }
  return names
}
