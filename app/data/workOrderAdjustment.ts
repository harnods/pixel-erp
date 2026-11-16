import type { BomOtherOutput, BomProductionWaste } from './billOfMaterials'
import type { WorkOrder } from './workOrders'

/**
 * Field differences recorded on Adjust work order. A work order reads its lines
 * from its BOM; these override them for that work order only, so the BOM (and any
 * other work order raised from it) stays untouched.
 */
export interface WorkOrderAdjustment {
  /** Needed qty per raw material, keyed by productId. */
  rawNeeded: Record<string, number>
  /** Production cost multiplier, keyed by cost group (Labor / Overhead / Other). */
  costMultipliers: Record<string, number>
  otherOutputs: BomOtherOutput[]
  productionWaste: BomProductionWaste[]
  mainPercentage: number
}

export function neededQtyFor(wo: Pick<WorkOrder, 'adjustment'> | undefined, productId: string, bomNeeded: number): number {
  return wo?.adjustment?.rawNeeded[productId] ?? bomNeeded
}

export interface AllocationInput {
  percentage: number
  /** Waste allocated by a fixed amount instead of a share of the total. */
  fixedAmount?: number
}

/**
 * Splits the total production cost across outputs: other outputs and waste take
 * their percentage (or fixed amount), and the main output absorbs the remainder.
 */
export function allocateProductionCost(total: number, others: AllocationInput[], waste: AllocationInput[]) {
  const amountOf = (a: AllocationInput) => a.fixedAmount ?? Math.round(total * a.percentage / 100)
  const shareOf = (a: AllocationInput) => a.fixedAmount === undefined ? a.percentage : (total ? a.fixedAmount / total * 100 : 0)
  const otherAmounts = others.map(amountOf)
  const wasteAmounts = waste.map(amountOf)
  const allocated = [...otherAmounts, ...wasteAmounts].reduce((s, n) => s + n, 0)
  const allocatedShare = [...others, ...waste].reduce((s, a) => s + shareOf(a), 0)
  return {
    otherAmounts,
    wasteAmounts,
    mainAmount: total - allocated,
    mainPercentage: Math.round((100 - allocatedShare) * 100) / 100,
  }
}
