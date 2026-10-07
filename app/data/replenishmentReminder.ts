/**
 * The daily replenishment reminder (PRD US-021 AC-05): a summary in the Inbox when
 * products have reached their reorder point, with a link to the worklist. Derived from
 * the live worklist, so it never disagrees with the To order count; absent when the
 * reminder is off or nothing needs ordering.
 *
 * Email delivery is not built in the prototype — the in-app notification is the whole
 * reminder.
 */
import { replenishmentWorklist } from './replenishment'
import { getReplenishmentConfig } from './replenishmentConfig'
import type { Notification } from './notifications'

type T = (en: string) => string
type TF = (en: string, vars: Record<string, string | number>) => string

/** The notifications' "today" (their seed is dated 29 Jul 2026). */
const TODAY_LABEL = '29 Jul 2026, 07:00'

export function replenishmentReminder(t: T, tf: TF): Notification | null {
  if (!getReplenishmentConfig().dailyReminder) return null
  const wl = replenishmentWorklist('all')
  const due = wl.rows
  if (!due.length) return null

  const products = new Set(due.map((r) => r.sku)).size
  const byWarehouse = new Map<string, number>()
  for (const r of due) byWarehouse.set(r.warehouseName, (byWarehouse.get(r.warehouseName) ?? 0) + 1)
  const warehouses = byWarehouse.size
  const [topName, topCount] = [...byWarehouse.entries()].sort((a, b) => b[1] - a[1])[0]!

  const summary = tf('{n} products in {m} warehouses are at or below their reorder point.', { n: products, m: warehouses })
  return {
    id: 'n-replenishment-daily',
    title: tf('{n} products to order', { n: products }),
    preview: summary,
    group: 'Today',
    timeLabel: '07:00',
    timestamp: TODAY_LABEL,
    unread: true,
    detail: {
      heading: t('Replenishment: products to order'),
      description: summary,
      fields: [
        { label: t('To order'), value: tf('{n} of {total} stocked products', { n: products, total: wl.totals.skus }) },
        { label: t('Most to order'), value: topName, sub: tf('{n} products', { n: topCount }) },
        { label: t('Stocks out before resupply'), value: String(wl.totals.belowLeadTime), danger: wl.totals.belowLeadTime > 0 },
        // Counted in products, exactly as the worklist's Covered by inbound card does.
        { label: t('Covered by inbound'), value: String(new Set(wl.coveredByInbound.map((r) => r.sku)).size) },
      ],
      actions: [{ label: t('View worklist'), primary: true, to: '/replenishment' }],
    },
  }
}
