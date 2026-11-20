/**
 * Scan guidance — the live hint under every WMS scan bar and the
 * "How scanning works" tooltip next to it.
 *
 * One place for this copy so every step explains its scan flow the same way.
 * The hint is ONE line that always says what the operator needs to do next:
 *   no location yet      → "Scan the storage location first, then scan the SKU."
 *   just scanned an item → "Coffee Grinder: 2 of 4 picked. Scan the next unit."
 *   that item is done    → "Coffee Grinder is fully picked. Scan the next SKU."
 *   everything is done   → "All items picked. Click Finish picking."
 * The tips are the step's general scan rules (the "How scanning works" tooltip),
 * which otherwise only surface as error toasts.
 *
 * Strings are English keys of `app/data/translations.ts`; pass the page's `t()`.
 */

export type ScanStep =
  | 'receive'
  | 'put-away'
  | 'pick'
  | 'pack'
  | 'handover'
  | 'new-shipment'
  | 'stock-count'
  /** Manage batch / serial drawers, by the drawer's `kind`. */
  | 'batch-drawer'
  | 'serial-drawer'
  /** Read-only View batch / serial drawers used to verify at packing. */
  | 'batch-verify'
  | 'serial-verify'

export type DrawerKind = 'count' | 'in-out' | 'transfer' | 'receiving' | 'put-away' | 'picking' | 'purchase-delivery'

export interface ScanGuidanceState {
  /** The active storage location, for steps that scan a location first. */
  activeBin?: string | null
  /** New shipment only — false until a warehouse is selected. */
  hasWarehouse?: boolean
  /** Manage batch / serial drawers only. */
  kind?: DrawerKind
  /** The item the operator scanned last, with its progress on this step.
   *  `total` omitted = no target (stock counting). Ignored while `done` is 0,
   *  e.g. right after Reset count. */
  last?: { name: string; done: number; total?: number } | null
  /** Every line is fully handled — the next step is the finish/save button. */
  allDone?: boolean
  /** Handover / New shipment — deliveries already in this transaction. */
  count?: number
  /** Manage batch / serial drawers — units scanned vs. the target, when there is one. */
  progress?: { done: number; total: number } | null
}

export interface ScanGuidance {
  hint: string
  tips: string[]
}

type T = (key: string) => string

const withBin = (t: T, key: string, bin: string) => t(key).replace('{bin}', bin)
const fill = (t: T, key: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), t(key))

/** Copy for the steps that work through a list of items toward a target qty. */
const PROGRESS_COPY = {
  'receive':  { partial: '{name}: {done} of {total} received. Scan the next unit.', full: '{name} is fully received. Scan the next SKU.', allDone: 'All items received. Click Finish receiving.' },
  'put-away': { partial: '{name}: {done} of {total} put away. Scan the next unit.', full: '{name} is fully put away. Scan the next SKU.', allDone: 'All items have a storage location. Click Finish put-away.' },
  'pick':     { partial: '{name}: {done} of {total} picked. Scan the next unit.', full: '{name} is fully picked. Scan the next SKU.', allDone: 'All items picked. Click Finish picking.' },
  'pack':     { partial: '{name}: {done} of {total} packed. Scan the next unit.', full: '{name} is fully packed. Scan the next SKU.', allDone: 'All items packed. Click Finish packing.' },
} as const

/** The next-step line for a list step, or null to fall back to the step's base hint. */
function progressHint(step: keyof typeof PROGRESS_COPY, state: ScanGuidanceState, t: T): string | null {
  const copy = PROGRESS_COPY[step]
  if (state.allDone) return t(copy.allDone)
  const last = state.last
  if (!last || last.done <= 0 || last.total === undefined) return null
  return last.done >= last.total
    ? fill(t, copy.full, { name: last.name })
    : fill(t, copy.partial, { name: last.name, done: last.done, total: last.total })
}

export function scanGuidance(step: ScanStep, state: ScanGuidanceState, t: T): ScanGuidance {
  const bin = state.activeBin ?? null
  const trackedOpens = t('Scanning a batch- or serial-tracked SKU opens its details, where you scan each batch or serial number.')

  switch (step) {
    case 'receive':
      return {
        hint: progressHint('receive', state, t) ?? t('Scan the SKU or batch number to receive items.'),
        tips: [
          t('Each scan adds 1 to the received qty.'),
          trackedOpens,
          t('You can\'t receive more than the expected qty.'),
        ],
      }

    case 'put-away':
      return {
        hint: progressHint('put-away', state, t) ?? (bin
          ? withBin(t, 'Scan the SKU to put it away in {bin}.', bin)
          : t('Scan the storage location first, then scan the SKU.')),
        tips: [
          t('Scanning a storage location makes it the active location.'),
          t('Each SKU scan assigns 1 unit to the active location.'),
          t('Without an active location, a SKU scan fills the row that has no storage location yet.'),
          trackedOpens,
          t('To switch location, scan another storage location.'),
        ],
      }

    case 'pick':
      return {
        // A location must be active before anything can be picked, so that comes
        // first even mid-task (e.g. after the operator cleared the active location).
        hint: !bin && !state.allDone
          ? t('Scan the storage location first, then scan the SKU.')
          : progressHint('pick', state, t) ?? withBin(t, 'Scan the SKU, batch number, or serial number to pick from {bin}.', bin!),
        tips: [
          t('Scan the storage location you\'re picking from before scanning items.'),
          t('Each scan adds 1 to the picked qty.'),
          t('A serial number must be stored in the active location.'),
          trackedOpens,
          t('To switch location, scan another storage location.'),
        ],
      }

    case 'pack':
      return {
        hint: progressHint('pack', state, t) ?? t('Scan the SKU, or the picked batch or serial number, to pack items.'),
        tips: [
          t('Each scan adds 1 to the packed qty.'),
          t('For batch- or serial-tracked items, scan the batch or serial number picked for this order.'),
          t('Scanning a batch- or serial-tracked SKU opens its details, where you can scan from there.'),
        ],
      }

    case 'handover':
    case 'new-shipment':
      return {
        hint: step === 'new-shipment' && !state.hasWarehouse
          ? t('Select a warehouse first, then scan the tracking number, packing number, or order number.')
          : state.count
            ? fill(t, state.count === 1 ? '1 delivery added. Scan the next delivery, or click Save.' : '{count} deliveries added. Scan the next delivery, or click Save.', { count: state.count })
            : t('Scan the tracking number, packing number, or order number to add a delivery.'),
        tips: [
          t('Only deliveries ready to ship from this warehouse can be added.'),
          t('Each delivery can be added once.'),
        ],
      }

    case 'stock-count':
      return {
        hint: !bin
          ? t('Scan the storage location first, then scan the SKU.')
          : state.last && state.last.done > 0
            ? fill(t, '{name}: {done} counted in {bin}. Scan the next unit, or the next SKU.', { name: state.last.name, done: state.last.done, bin })
            : withBin(t, 'Scan the SKU to count items in {bin}.', bin),
        tips: [
          t('Scan the storage location you\'re counting before scanning items.'),
          t('Each SKU scan adds 1 to the counted qty.'),
          t('A product that isn\'t on the count list is added when you scan it.'),
          trackedOpens,
        ],
      }

    case 'batch-drawer':
    case 'serial-drawer': {
      const isBatch = step === 'batch-drawer'
      const code = isBatch ? t('batch number') : t('serial number')
      const kind = state.kind ?? 'count'
      const prog = state.progress
      const progressLine = prog && prog.done >= prog.total && prog.total > 0
        ? t('All qty scanned. Click Save.')
        : prog && prog.done > 0
          ? fill(t, '{done} of {total} scanned. Scan the next {code}.', { done: prog.done, total: prog.total, code })
          : null
      if (kind === 'put-away' || kind === 'picking') {
        const verb = kind === 'picking' ? 'Scan the {code} to pick from {bin}.' : 'Scan the {code} to put it away in {bin}.'
        return {
          hint: !bin && !(prog && prog.done >= prog.total && prog.total > 0)
            ? t('Scan the storage location first, then scan the {code}.').replace('{code}', code)
            : progressLine ?? t(verb).replace('{code}', code).replace('{bin}', bin ?? ''),
          tips: [
            t('Scanning a storage location makes it the active location.'),
            t('Each scan assigns 1 unit to the active location.'),
            ...(kind === 'picking' ? [t('The {code} must be stored in the active location.').replace('{code}', code)] : []),
            t('To switch location, scan another storage location.'),
          ],
        }
      }
      return {
        hint: progressLine ?? t('Scan the {code} to add it.').replace('{code}', code),
        tips: isBatch
          ? [
              t('Each scan adds 1 to that batch\'s qty.'),
              t('A batch number that isn\'t listed yet is added as a new batch.'),
            ]
          : [
              t('Each serial number is scanned once.'),
              kind === 'receiving'
                ? t('A serial number that already exists in the system can\'t be received.')
                : t('The serial number must belong to this SKU.'),
            ],
      }
    }

    case 'batch-verify':
      return {
        hint: t('Scan the batch number to verify it against what was picked.'),
        tips: [
          t('Each scan verifies 1 unit.'),
          t('Only batches picked for this order can be verified.'),
        ],
      }

    case 'serial-verify':
      return {
        hint: t('Scan the serial number to verify it against what was picked.'),
        tips: [
          t('Each serial number is verified once.'),
          t('Only serial numbers picked for this order can be verified.'),
        ],
      }
  }
}
