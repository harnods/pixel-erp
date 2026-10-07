/**
 * PRD US-021 AC-05 — the daily replenishment reminder: an Inbox notification summarising
 * what needs ordering, with a link to the worklist.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { replenishmentReminder } from '~/data/replenishmentReminder'
import { replenishmentWorklist } from '~/data/replenishment'
import { getReplenishmentConfig, saveReplenishmentConfig, resetReplenishmentConfig, REPL_DEFAULTS } from '~/data/replenishmentConfig'

const t = (s: string) => s
const tf = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

describe('daily replenishment reminder', () => {
  afterEach(() => resetReplenishmentConfig())

  it('is on by default', () => {
    expect(REPL_DEFAULTS.dailyReminder).toBe(true)
  })

  it('summarises the live To order list and links to the worklist', () => {
    const n = replenishmentReminder(t, tf)!
    expect(n).toBeTruthy()
    const wl = replenishmentWorklist('all')
    const products = new Set(wl.rows.map((r) => r.sku)).size
    expect(n.title).toBe(`${products} products to order`)
    expect(n.unread).toBe(true)
    const go = n.detail.actions.find((a) => a.primary)!
    expect(go.to).toBe('/replenishment')
    // The numbers it quotes are the worklist's own.
    expect(n.detail.fields.find((f) => f.label === 'Stocks out before resupply')!.value).toBe(String(wl.totals.belowLeadTime))
    expect(n.detail.fields.find((f) => f.label === 'Covered by inbound')!.value).toBe(String(new Set(wl.coveredByInbound.map((r) => r.sku)).size))
  })

  it('is absent when the reminder is switched off', () => {
    saveReplenishmentConfig({ ...getReplenishmentConfig(), dailyReminder: false })
    expect(replenishmentReminder(t, tf)).toBeNull()
  })
})
