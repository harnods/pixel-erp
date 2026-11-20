/**
 * Scan guidance — the live hint under every WMS scan bar and the
 * "How scanning works" tooltip next to it.
 *
 * One place for this copy so every step explains its scan flow the same way.
 * The hint follows the step's state (e.g. "scan a location first" → "scan the
 * SKU to pick from A-01-02" once a location is active), and the tips spell out
 * the rules that otherwise only surface as error toasts.
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
}

export interface ScanGuidance {
  hint: string
  tips: string[]
}

type T = (key: string) => string

const withBin = (t: T, key: string, bin: string) => t(key).replace('{bin}', bin)

export function scanGuidance(step: ScanStep, state: ScanGuidanceState, t: T): ScanGuidance {
  const bin = state.activeBin ?? null
  const trackedOpens = t('Scanning a batch- or serial-tracked SKU opens its details, where you scan each batch or serial number.')

  switch (step) {
    case 'receive':
      return {
        hint: t('Scan the SKU or batch number to receive items.'),
        tips: [
          t('Each scan adds 1 to the received qty.'),
          trackedOpens,
          t('You can\'t receive more than the expected qty.'),
        ],
      }

    case 'put-away':
      return {
        hint: bin
          ? withBin(t, 'Scan the SKU to put it away in {bin}.', bin)
          : t('Scan the storage location first, then scan the SKU.'),
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
        hint: bin
          ? withBin(t, 'Scan the SKU, batch number, or serial number to pick from {bin}.', bin)
          : t('Scan the storage location first, then scan the SKU.'),
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
        hint: t('Scan the SKU, or the picked batch or serial number, to pack items.'),
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
          : t('Scan the tracking number, packing number, or order number to add a delivery.'),
        tips: [
          t('Only deliveries ready to ship from this warehouse can be added.'),
          t('Each delivery can be added once.'),
        ],
      }

    case 'stock-count':
      return {
        hint: bin
          ? withBin(t, 'Scan the SKU to count items in {bin}.', bin)
          : t('Scan the storage location first, then scan the SKU.'),
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
      if (kind === 'put-away' || kind === 'picking') {
        const verb = kind === 'picking' ? 'Scan the {code} to pick from {bin}.' : 'Scan the {code} to put it away in {bin}.'
        return {
          hint: bin
            ? t(verb).replace('{code}', code).replace('{bin}', bin)
            : t('Scan the storage location first, then scan the {code}.').replace('{code}', code),
          tips: [
            t('Scanning a storage location makes it the active location.'),
            t('Each scan assigns 1 unit to the active location.'),
            ...(kind === 'picking' ? [t('The {code} must be stored in the active location.').replace('{code}', code)] : []),
            t('To switch location, scan another storage location.'),
          ],
        }
      }
      return {
        hint: t('Scan the {code} to add it.').replace('{code}', code),
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
