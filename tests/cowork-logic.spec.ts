/**
 * Cowork — task/schedule logic regression tests.
 *
 * A schedule is a property of a task (there is no separate schedule store), so the
 * Schedule page is a derived view of tasks that have one. Key invariants:
 *   • deleting a task removes its schedule from the Schedule view automatically;
 *   • toggling / unscheduling operate on the owning task;
 *   • every task's module(s) are valid CoworkModules.
 */
import { describe, it, expect } from 'vitest'
import {
  coworkTasks, addTask, deleteTask, getTask,
  setTaskScheduleEnabled, unscheduleTask,
  COWORK_MODULES, type CoworkModule,
} from '~/data/cowork'

const scheduled = () => coworkTasks.filter((t) => t.schedule)

describe('Cowork — schedule is derived from tasks', () => {
  it('every scheduled row is a real task in the tasks list', () => {
    for (const t of scheduled()) expect(coworkTasks.includes(t)).toBe(true)
  })
  it('scheduled tasks have a valid cadence + time', () => {
    for (const t of scheduled()) {
      expect(['Daily', 'Weekly', 'Monthly']).toContain(t.schedule!.cadence)
      expect(t.schedule!.time, `${t.id} time`).toMatch(/^\d{2}:\d{2}$/)
    }
  })
  it('every task module (and multi-modules) is a valid CoworkModule', () => {
    const valid = new Set<CoworkModule>(COWORK_MODULES)
    for (const t of coworkTasks) {
      expect(valid.has(t.module), `${t.id} module`).toBe(true)
      for (const m of t.modules ?? []) expect(valid.has(m), `${t.id} modules`).toBe(true)
    }
  })
})

describe('Cowork — deleting a task removes its schedule', () => {
  it('a deleted scheduled task disappears from the schedule view', () => {
    const created = addTask({
      title: 'Temp scheduled task', prompt: 'temp', module: 'Finance', modules: ['Finance'],
      status: 'scheduled', createdAt: '2026-08-20T10:00:00',
      schedule: { cadence: 'Daily', time: '09:00', nextRun: 'Tomorrow · 09:00', enabled: true },
    })
    expect(scheduled().some((t) => t.id === created.id)).toBe(true)
    deleteTask(created.id)
    expect(getTask(created.id)).toBeUndefined()
    expect(scheduled().some((t) => t.id === created.id)).toBe(false)
  })
})

describe('Cowork — schedule mutations act on the task', () => {
  it('setTaskScheduleEnabled toggles the owning task', () => {
    const t = addTask({
      title: 'Toggle me', prompt: 'toggle', module: 'HR', modules: ['HR'],
      status: 'scheduled', createdAt: '2026-08-20T10:00:00',
      schedule: { cadence: 'Weekly', time: '08:00', enabled: true },
    })
    setTaskScheduleEnabled(t.id, false)
    expect(getTask(t.id)!.schedule!.enabled).toBe(false)
    deleteTask(t.id)
  })
  it('unscheduleTask removes the schedule but keeps the task', () => {
    const t = addTask({
      title: 'Unschedule me', prompt: 'unschedule', module: 'WMS', modules: ['WMS'],
      status: 'scheduled', createdAt: '2026-08-20T10:00:00',
      schedule: { cadence: 'Daily', time: '07:30', enabled: true },
    })
    unscheduleTask(t.id)
    expect(getTask(t.id)).toBeDefined()
    expect(getTask(t.id)!.schedule).toBeUndefined()
    deleteTask(t.id)
  })
})
