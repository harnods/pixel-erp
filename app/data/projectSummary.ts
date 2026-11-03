/**
 * Portfolio-level rollup per project (Story 15): budget, committed, actual,
 * % complete, billed, WIP position, over-budget flag, change-order exposure.
 */
import { getProject, projectWorkPackages, type Project } from './projects'
import { projectBudgetTotal, wpBudget } from './projectBudgets'
import { projectActual, projectCommitted, wpActual, wpCommitted } from './projectTransactions'
import { percentComplete, billedToDate, recognisedToDate, wipPosition } from './projectRecognition'
import { coExposure, pendingChanges } from './projectChanges'
import { pendingApprovals } from './projectApprovals'

export interface ProjectSummary {
  project: Project
  budget: number | undefined
  committed: number
  actual: number
  /** committed + actual */
  consumed: number
  percentComplete: number | undefined
  recognised: number
  billed: number
  wip: number
  overBudgetNodes: { wpId: string; label: string; budget: number; consumed: number }[]
  coExposure: number
  pendingCount: number
}

export function overBudgetNodes(projectId: string) {
  return projectWorkPackages(projectId)
    .map(w => ({ wpId: w.id, label: `${w.code} ${w.name}`, budget: wpBudget(w.id), consumed: wpActual(w.id) + wpCommitted(w.id) }))
    .filter(x => x.budget !== undefined && x.consumed > x.budget)
    .map(x => ({ ...x, budget: x.budget! }))
}

export function projectSummary(projectId: string): ProjectSummary | undefined {
  const project = getProject(projectId)
  if (!project) return undefined
  const committed = projectCommitted(projectId)
  const actual = projectActual(projectId)
  const { vos, ecos } = pendingChanges(projectId)
  return {
    project,
    budget: projectBudgetTotal(projectId),
    committed,
    actual,
    consumed: committed + actual,
    percentComplete: percentComplete(project),
    recognised: recognisedToDate(projectId),
    billed: billedToDate(projectId),
    wip: wipPosition(projectId),
    overBudgetNodes: overBudgetNodes(projectId),
    coExposure: coExposure(projectId),
    pendingCount: vos.length + ecos.length + pendingApprovals(projectId).length,
  }
}
