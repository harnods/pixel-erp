import type { BillOfMaterials } from './billOfMaterials'
import type { WorkOrder, WorkOrderRoutingProgress } from './workOrders'

/**
 * Routing tracker logic (Work order detail → Track routing). A step's status is
 * derived from its actual dates, never stored: no start = not started, start only
 * = in progress, start + end = completed. Steps are keyed by their index in the
 * BOM's routing list.
 */
export type RoutingStepStatus = 'not started' | 'in progress' | 'completed'

export interface WorkOrderRoutingStep {
  index: number
  process: string
  description: string
  accountMapping: string
  amount: number
  planStart: string
  planEnd: string
  startDate?: string
  endDate?: string
  status: RoutingStepStatus
}

type RoutingWorkOrder = Pick<WorkOrder, 'status' | 'planStartDate' | 'planEndDate' | 'routingProgress'>

const DAY_MS = 86_400_000

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** The local calendar date as ISO — the upper bound for actual routing dates. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function routingStepStatus(p?: WorkOrderRoutingProgress): RoutingStepStatus {
  if (p?.endDate) return 'completed'
  return p?.startDate ? 'in progress' : 'not started'
}

/**
 * The work order's routing steps. The plan range is split evenly across the steps
 * (each one starts the day the previous one ends). A closed work order predating
 * tracking has no recorded dates, so its steps read as done on their plan dates.
 */
export function routingStepsFor(
  wo: RoutingWorkOrder,
  bom: Pick<BillOfMaterials, 'routing'> | undefined,
  progress: Record<string, WorkOrderRoutingProgress> | undefined = wo.routingProgress,
): WorkOrderRoutingStep[] {
  const routing = bom?.routing ?? []
  const days = Math.max(0, Math.round((new Date(wo.planEndDate).getTime() - new Date(wo.planStartDate).getTime()) / DAY_MS))
  const closed = wo.status === 'completed' || wo.status === 'partially completed'
  return routing.map((r, index) => {
    const planStart = addDays(wo.planStartDate, Math.floor(days * index / routing.length))
    const planEnd = addDays(wo.planStartDate, Math.floor(days * (index + 1) / routing.length))
    const p = progress?.[index]
    const dates = closed
      ? { startDate: p?.startDate ?? planStart, endDate: p?.endDate ?? planEnd }
      : { startDate: p?.startDate, endDate: p?.endDate }
    return {
      index, process: r.process, description: r.description, accountMapping: r.accountMapping, amount: r.amount,
      planStart, planEnd, ...dates, status: routingStepStatus(dates),
    }
  })
}

/** Whether the tracker is reachable: a started, still-open work order with Track routing on. */
export function canTrackRouting(wo: Pick<WorkOrder, 'trackRouting' | 'status'>): boolean {
  return wo.trackRouting && (wo.status === 'in progress' || wo.status === 'partially produced')
}

/** Every step completed. A BOM with no routing has nothing to track, so it counts as complete. */
export function isRoutingComplete(steps: WorkOrderRoutingStep[]): boolean {
  return steps.every(s => s.status === 'completed')
}

/** Actual start window: from the day the work order started until today. */
export function routingStartWindow(wo: Pick<WorkOrder, 'startDate' | 'planStartDate'>, today: string = todayIso()) {
  return { min: wo.startDate ?? wo.planStartDate, max: today }
}

/** Actual end window: from the day the process started until today. */
export function routingEndWindow(step: Pick<WorkOrderRoutingStep, 'startDate' | 'planStart'>, today: string = todayIso()) {
  return { min: step.startDate ?? step.planStart, max: today }
}

export function isWithinWindow(iso: string, window: { min: string; max: string }): boolean {
  return iso >= window.min && iso <= window.max
}

/** Moves a step one column back: completed → in progress, in progress → not started. */
export function undoRoutingStep(progress: Record<string, WorkOrderRoutingProgress>, index: number): void {
  const p = progress[index]
  if (!p) return
  if (p.endDate) progress[index] = { startDate: p.startDate }
  else delete progress[index]
}

/** Actual work order end window: from the day the last process finished until today. */
export function workOrderEndWindow(
  wo: Pick<WorkOrder, 'startDate' | 'planStartDate'>,
  steps: Pick<WorkOrderRoutingStep, 'endDate'>[],
  today: string = todayIso(),
) {
  const min = steps.reduce((latest, s) => s.endDate && s.endDate > latest ? s.endDate : latest, wo.startDate ?? wo.planStartDate)
  return { min, max: today }
}
