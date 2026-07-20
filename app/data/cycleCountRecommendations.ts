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
import { getWarehouseConfig } from './warehouseConfig'

export const MIN_STOCK_LIMIT = 10 // mirrors the existing "Min. stock" trigger threshold

export const ALL_REASONS = ['Negative stock', 'Min. stock', 'Variance signal'] as const
export type Reason = typeof ALL_REASONS[number]

export function hashStr(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export function recommendationReasons(cfg: ReturnType<typeof getWarehouseConfig>, warehouseId: string, stock: WarehouseStockItem): Reason[] {
  const varianceNorm = (hashStr(stock.sku + warehouseId + 'variance') % 101) / 100
  const reasons: Reason[] = []
  if (cfg.cycleCountRuleNeg && stock.onHand === 0) reasons.push('Negative stock')
  if (cfg.cycleCountRuleMin && stock.onHand > 0 && stock.onHand < MIN_STOCK_LIMIT) reasons.push('Min. stock')
  if (cfg.cycleCountRuleVar && varianceNorm > 0.8) reasons.push('Variance signal')
  return reasons
}

/** Count of SKUs currently flagged for a cycle count recommendation, across warehouses that have it enabled. */
export function recommendationCount(): number {
  let count = 0
  for (const wh of warehouses.filter((w) => w.status === 'active' && !w.isDefault)) {
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
