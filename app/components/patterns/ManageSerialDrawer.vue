<script setup lang="ts">
import { ref, computed, watch, reactive, nextTick } from 'vue'
import { MpIcon, MpBadge, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ScanBar from '~/components/patterns/ScanBar.vue'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, scanRequiredForQty } from '~/data/warehouseConfig'
import { resolveScan, notifyScanError, sameCode, normalizeCode } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'

export interface CommittedSerial {
  serial: string
  destLocationId?: string
}

interface SerialRow {
  serial: string
  counted: boolean
  reserved?: boolean
  /** Held for THIS task (prevents oversell) but not yet actually scanned — shows
   *  "Reserved" until the operator scans it, at which point counted flips true and
   *  the badge becomes "Picked". Being reserved is not the same as being picked. */
  plannedOwn?: boolean
  originLocation?: string
  destLocId?: string
  fromPriorTask?: boolean
  /** Picking only — an available (non-reserved) unit not part of this order's
   *  original plan, hidden from the table until the operator scans that
   *  specific unit's barcode to bring it into view. Never set for put-away —
   *  a received serial is a fixed fact and always stays visible there; put-away
   *  only ever clears `destLocId` to undo a bin assignment, never hides a row. */
  removed?: boolean
}

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  targetCount: number
  modelValue: CommittedSerial[]
  /** 'count' (default) = stock count; 'in-out' = stock in/out; 'transfer' = warehouse transfer; 'receiving' = PO receiving; 'put-away' = assign received serials to bins; 'picking' = pick serials for an outbound order */
  kind?: 'count' | 'in-out' | 'transfer' | 'receiving' | 'put-away' | 'picking'
  /** Signed delta for in-out mode (e.g. +2 stock in, -5 stock out). */
  delta?: number
  /**
   * When counting inside a storage location, pass the bin-level on-hand.
   * 0 means the SKU has no stock at this bin → start empty instead of
   * pre-seeding from the warehouse-wide serial list.
   */
  locationOnHand?: number
  /** Bins in origin warehouse where this SKU has stock — for read-only "From bin" display */
  originLocationPaths?: string[]
  /** All bins available in destination warehouse — for "To bin" picker */
  destLocationPaths?: string[]
  /** SNs already received in prior tasks for the same PO — cannot be added again. */
  blockedSerials?: string[]
  /** Receiving only — the real ceiling (Purchase qty) a scan/paste may not
   *  exceed, which may be HIGHER than targetCount (targetCount is now "Expected
   *  qty" — a softer target, not a hard cap). Falls back to targetCount when
   *  not given, so every other kind is unaffected. */
  maxCount?: number
  /** Picking only — the sales order's full demand for this SKU, shown as a stat
   *  alongside Qty to pick (only when passed, so other kinds are unaffected). */
  orderQty?: number
  /** Picking only — true once picking is actually being executed (PickItemsPage),
   *  as opposed to just being set up (CreatePickingPage). At creation time there's
   *  nothing picked yet, so no "Picked qty" stat is shown — only Qty to pick. */
  executionMode?: boolean
  /** Picking + execution mode only — serials already reserved for THIS task (holds
   *  them against oversell) but not yet actually scanned. Shown as normal, selectable
   *  "Reserved" rows (not blocked like a genuinely foreign claim) — but unlike
   *  modelValue, being here does NOT count them as picked; only actually scanning
   *  (or toggling) one moves it into modelValue / counted. */
  plannedSerials?: string[]
  /** Put-away only — the bin currently active on the page-level scan bar, if any,
   *  inherited as this drawer's own active bin when it opens, so the operator
   *  doesn't have to rescan a bin they already scanned on the page. */
  initialActiveBin?: string | null
  /** Count mode only — a batch/serial barcode that triggered this drawer to
   *  auto-open (page-level scan of a tracked SKU's specific code) is replayed
   *  here on open, so that first scan isn't lost/needs re-scanning inside. */
  initialScan?: string | null
  /** Count mode only — the bin this row is being counted at. A serial is a
   *  single physical unit, so one that's stocked in a different bin can't also
   *  be counted here; passing the bin lets the scan say which one it's in. */
  countLocation?: string | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'save': [serials: CommittedSerial[]]
}>()

const { t } = useLocale()

const PAGE_SIZE = 20

const rows = ref<SerialRow[]>([])
const inputText = ref('')
const addError = ref('')
const search = ref('')
const page = ref(1)
const saveError = ref('')
const isSaving = ref(false)

// Put-away only — the bin scanned most recently, which subsequent serial scans
// assign to. Declared here (before seedRows() is first invoked by the props.open
// watcher below) since seedRows() seeds it from props.initialActiveBin on every open.
const activeBin = ref<string | null>(null)

const locActiveKey = ref<string | null>(null)
const locSearches = reactive<Record<string, string>>({})
const hasOriginLoc = computed(() => (props.originLocationPaths?.length ?? 0) > 0)
const hasDestLoc = computed(() => (props.destLocationPaths?.length ?? 0) > 0)

// Builds rows from scratch, straight off props — the drawer's initial state on
// open, and also what "Reset" restores back to (undoing every scan/toggle without
// touching props). Kept as its own function so both callers share one source of
// truth for what "the starting point" is, per mode.
function seedRows(): void {
  activeBin.value = props.initialActiveBin ?? null
  const wh = getWarehouseDetail(props.warehouseId)
  const sr = wh?.stock.find(s => s.sku === props.sku)?.serials
  const availableUnits = sr?.available ?? []
  const reservedUnits = sr?.reserved ?? []
  const availableSerials: string[] = availableUnits.map(u => u.serial)
  const warehouseSerials: string[] = [
    ...availableSerials,
    ...reservedUnits.map(u => u.serial),
  ]

  if (props.kind === 'transfer' || props.kind === 'picking') {
    const selectedSet = new Set(props.modelValue.map(cs => cs.serial))
    const selectedDestLoc = new Map(props.modelValue.map(cs => [cs.serial, cs.destLocationId ?? '']))
    const plannedSet = new Set(props.plannedSerials ?? [])
    // Picking: a "reserved" unit already claimed by THIS order — whether actually
    // scanned (in modelValue) or merely held against oversell (in plannedSerials,
    // execution mode only) — is this pick's own claim, not another order's — show
    // it as a normal selected/toggleable row, not the read-only "Reserved" row a
    // genuinely foreign claim gets. Only modelValue membership counts as picked;
    // a merely-planned unit starts unscanned until the operator scans/toggles it.
    const mineSet = new Set([...selectedSet, ...plannedSet])
    const ownReservedUnits = props.kind === 'picking' ? reservedUnits.filter(u => mineSet.has(u.serial)) : []
    const foreignReservedUnits = props.kind === 'picking' ? reservedUnits.filter(u => !mineSet.has(u.serial)) : reservedUnits
    rows.value = [
      ...availableUnits.map(u => ({
        serial: u.serial,
        counted: selectedSet.has(u.serial),
        reserved: false as const,
        // Picking only — an available (non-reserved) unit is hidden until the
        // operator scans that specific unit's barcode: the table should default
        // to just the pre-reserved plan, and scanning a substitute reveals it as
        // Picked. Already-confirmed picks from a prior save stay visible on reopen.
        removed: props.kind === 'picking' ? !selectedSet.has(u.serial) : false,
        originLocation: hasOriginLoc.value ? u.location : undefined,
        destLocId: selectedDestLoc.get(u.serial) ?? '',
      })),
      ...ownReservedUnits.map(u => ({
        serial: u.serial,
        counted: selectedSet.has(u.serial),
        reserved: false as const,
        plannedOwn: !selectedSet.has(u.serial),
        originLocation: hasOriginLoc.value ? u.location : undefined,
        destLocId: selectedDestLoc.get(u.serial) ?? '',
      })),
      ...foreignReservedUnits.map(u => ({
        serial: u.serial,
        counted: false,
        reserved: true as const,
        originLocation: hasOriginLoc.value ? u.location : undefined,
        destLocId: '',
      })),
    ]
  } else if (props.kind === 'put-away') {
    // Fixed set of serials received for this SKU — none addable/removable here,
    // the operator just assigns each one a destination bin.
    rows.value = props.modelValue.map(cs => ({
      serial: cs.serial,
      counted: true,
      destLocId: cs.destLocationId ?? '',
      removed: false,
    }))
  } else if (props.kind === 'receiving') {
    // Receiving has no pre-existing warehouse serial pool to pick from — these are
    // brand-new units. Show only what's actually been scanned/entered so far (this
    // task's own modelValue); never mix in unrelated already-in-stock serials.
    rows.value = props.modelValue.map(cs => ({ serial: cs.serial, counted: true }))
  } else if (!props.kind || props.kind === 'count') {
    // Blind count: the operator never sees the expected/system serial list —
    // only serials actually scanned (or previously confirmed, on reopening a
    // draft) ever appear. There is no "not counted" row to surface; a serial
    // that hasn't been scanned yet simply isn't in the list at all.
    rows.value = props.modelValue.map(cs => ({ serial: cs.serial, counted: true }))
  } else if (props.modelValue.length > 0) {
    const countedSet = new Set(props.modelValue.map(cs => cs.serial))
    const seen = new Set<string>()
    const result: SerialRow[] = warehouseSerials.map(s => {
      seen.add(s)
      return { serial: s, counted: countedSet.has(s) }
    })
    for (const cs of props.modelValue) {
      if (!seen.has(cs.serial)) result.push({ serial: cs.serial, counted: true })
    }
    rows.value = result
  } else if (props.locationOnHand === 0) {
    rows.value = []
  } else {
    // stock in/out: pre-populate all existing SNs as counted=true
    rows.value = warehouseSerials.map(s => ({ serial: s, counted: true }))
  }

  // For receiving: prepend prior-task SNs as read-only Counted rows
  if (props.kind === 'receiving' && props.blockedSerials?.length) {
    const existingSerials = new Set(rows.value.map(r => r.serial))
    const priorRows: SerialRow[] = props.blockedSerials
      .filter(sn => !existingSerials.has(sn))
      .map(sn => ({ serial: sn, counted: true, fromPriorTask: true }))
    rows.value = [...priorRows, ...rows.value]
  }

  inputText.value = ''
  search.value = ''
  page.value = 1
  saveError.value = ''
  locActiveKey.value = null
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  seedRows()
  // Deferred: handleDrawerScan closes over consts (flashScanned's lastScannedKey,
  // etc.) declared further down the script — calling it synchronously from this
  // {immediate:true} watcher (which fires mid-setup, on first open) would hit
  // those before their declarations run and throw a TDZ ReferenceError.
  if (props.initialScan) nextTick(() => handleDrawerScan(props.initialScan!))
}, { immediate: true })

const product = computed(() => productBySku(props.sku))
const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})
const productImg = computed(() => product.value?.img ?? '')
const productName = computed(() => warehouseStock.value?.name ?? product.value?.name ?? props.sku)
const onHandCount = computed(() =>
  props.locationOnHand ?? (isTransfer.value ? warehouseStock.value?.available : warehouseStock.value?.onHand) ?? 0
)
// countedCount = rows currently marked as counted (for table X/Y indicator + validation)
const countedCount = computed(() => rows.value.filter(r => r.counted && !r.fromPriorTask).length)
const putAwayCount = computed(() => rows.value.filter(r => r.destLocId).length)
// Info bar stats are driven by targetCount (what user entered in the form), not table
// state — except count mode's own Counted/Difference, which must track the live
// blind-count tally (countedCount), since targetCount there is just the system's
// prior on-hand figure passed through for the "On hand" stat, not a real count.
const isInOut = computed(() =>
  props.kind === 'in-out' || props.kind === 'transfer' || props.kind === 'receiving' || props.kind === 'put-away' || props.kind === 'picking',
)
const isCountMode = computed(() => !props.kind || props.kind === 'count')
const isTransfer = computed(() => props.kind === 'transfer')
const isReceiving = computed(() => props.kind === 'receiving')
const isPutAway = computed(() => props.kind === 'put-away')
const isPicking = computed(() => props.kind === 'picking')
const hideStockStats = computed(() => isReceiving.value || isPutAway.value)
// Below the warehouse's scan threshold, the bulk-paste textarea is disabled —
// otherwise it'd let someone type in real serial numbers by hand without ever
// physically scanning them, defeating the point of a low-qty scan requirement.
// Receiving only: it's the only kind in scope (picking/put-away/transfer never
// show this textarea in the first place; count/in-out are a different feature).
const scanRequiredForLine = computed(() =>
  isReceiving.value && scanRequiredForQty(getWarehouseConfig(props.warehouseId), props.targetCount ?? 0),
)
// Modes where a genuinely unrecognized scanned serial is a NEW one worth adding
// (matching the textarea's "Add to list" behavior) rather than an error — receiving
// and stock in/out both exist to register serials the system doesn't know yet;
// count can likewise turn up more than expected. Transfer/picking/put-away only
// ever move or assign EXISTING, already-known stock.
const acceptsNewSerials = computed(() => isCountMode.value || isReceiving.value || props.kind === 'in-out')
const qtyLabel = computed(() => {
  if (props.kind === 'transfer') return 'Transfer qty'
  if (props.kind === 'receiving') return 'Expected qty'
  if (props.kind === 'put-away') return 'Received qty'
  if (props.kind === 'picking') return 'Picked qty'
  return 'Stock in/out qty'
})
// Receiving only — the real ceiling a scan/paste may not exceed.
const receivingMaxCount = computed(() => props.maxCount ?? props.targetCount)
const signedDelta = computed(() => props.delta ?? 0)
const newOnHand = computed(() => onHandCount.value + signedDelta.value)
// for in-out/receiving, target = new on-hand (e.g. 20 ± delta); validation counts checked rows
const effectiveTargetCount = computed(() =>
  (props.kind === 'in-out' || props.kind === 'receiving') ? newOnHand.value : props.targetCount
)
const afterTransferCount = computed(() => onHandCount.value - countedCount.value)

function fmtSerial(n: number): string {
  return n.toLocaleString('id-ID') + ' serial number' + (n !== 1 ? 's' : '')
}
function fmtDiff(n: number): string {
  const abs = Math.abs(n)
  return (n >= 0 ? '+' : '−') + fmtSerial(abs)
}

function parseInput(): string[] {
  return inputText.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
}

function addToList() {
  if (scanRequiredForLine.value) {
    notifyScanError('Qty at or below the scan threshold — scan each serial’s barcode instead of typing')
    return
  }
  const parsed = parseInput()
  if (!parsed.length) return
  if (!props.kind || props.kind === 'count') {
    // Count mode: scan each SN — mark existing rows as counted, add unknown SNs as counted
    const idxMap = new Map(rows.value.map((r, i) => [normalizeCode(r.serial), i]))
    const toAdd: SerialRow[] = []
    for (const sn of parsed) {
      const idx = idxMap.get(normalizeCode(sn))
      if (idx !== undefined) {
        rows.value[idx]!.counted = true
      } else {
        toAdd.push({ serial: sn, counted: true })
      }
    }
    if (toAdd.length) rows.value.push(...toAdd)
  } else {
    const existing = new Set(rows.value.map(r => normalizeCode(r.serial)))
    const blocked = new Set((props.blockedSerials ?? []).map(normalizeCode))
    const dupes = parsed.filter(s => existing.has(normalizeCode(s)))
    const alreadyReceived = parsed.filter(s => !existing.has(normalizeCode(s)) && blocked.has(normalizeCode(s)))
    let newOnes = parsed.filter(s => !existing.has(normalizeCode(s)) && !blocked.has(normalizeCode(s)))
    // Receiving only: never let a paste push the total past Purchase qty — add
    // as many as still fit (same "add what's valid, report what's skipped"
    // pattern as the dupes/already-received cases below), not a hard all-or-nothing block.
    let overLimit: string[] = []
    if (isReceiving.value) {
      const budget = Math.max(0, (props.targetCount ?? 0) - existing.size)
      if (newOnes.length > budget) {
        overLimit = newOnes.slice(budget)
        newOnes = newOnes.slice(0, budget)
      }
    }
    if (alreadyReceived.length) {
      addError.value = `Already received in a prior task: ${alreadyReceived.join(', ')}`
    } else if (dupes.length) {
      addError.value = `Already in list: ${dupes.join(', ')}`
    } else if (overLimit.length) {
      addError.value = `Exceeds expected qty, not added: ${overLimit.join(', ')}`
    } else {
      addError.value = ''
    }
    if (!newOnes.length) return
    rows.value.push(...newOnes.map(s => ({ serial: s, counted: true })))
  }
  inputText.value = ''
  saveError.value = ''
}

// Only clears on the user actually typing something new — addToList() itself
// resets inputText to '' after a successful add, which must NOT wipe out the
// "added what fit, skipped the rest" message it just set (e.g. an over-limit
// paste in receiving mode: some serials add, the skipped ones still need to
// stay visible instead of vanishing the instant the textarea clears).
watch(inputText, (val) => { if (val) addError.value = '' })

function toggleRow(row: SerialRow) {
  if (row.reserved) return
  if ((isTransfer.value || isPicking.value) && !row.counted && countedCount.value >= props.targetCount) return
  // Receiving and blind count never show a "not counted" row — undoing one
  // removes it from the list outright instead of flipping a flag that would
  // otherwise have nothing to render.
  if ((isReceiving.value || isCountMode.value) && row.counted) {
    rows.value = rows.value.filter(r => r.serial !== row.serial)
    saveError.value = ''
    return
  }
  row.counted = !row.counted
  saveError.value = ''
}

const lastScannedKey = ref<string | null>(null)
let scannedTimer: ReturnType<typeof setTimeout> | null = null
async function flashScanned(key: string) {
  if (scannedTimer) clearTimeout(scannedTimer)
  if (lastScannedKey.value === key) {
    lastScannedKey.value = null
    await nextTick()
  }
  lastScannedKey.value = key
  scannedTimer = setTimeout(() => { lastScannedKey.value = null }, 1000)
}

// Scanning a serial inside the drawer selects it the same way clicking its toggle
// button would (picking/transfer), confirms it (count), or registers it as a new
// one if it's genuinely unrecognized (count/receiving/in-out — same as "Add to list").
// Put-away has its own dedicated active-bin scan model (handlePutAwayScan).
function handleDrawerScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v) return

  if (isPutAway.value) {
    handlePutAwayScan(v)
    return
  }

  // Picking: scan the bin barcode first to make it "active" — the reverse of
  // put-away's model, confirming which bin the operator is physically at
  // before any serial counts as picked out of it.
  if (isPicking.value) {
    const matchedBin = (props.originLocationPaths ?? []).find(p => sameCode(p, v))
    if (matchedBin) {
      activeBin.value = matchedBin
      playScanSuccessSound()
      return
    }
  }

  const row = rows.value.find(r => sameCode(r.serial, v))

  if (!row) {
    const resolved = resolveScan(props.warehouseId, v)
    if (resolved && resolved.sku !== props.sku) {
      notifyScanError(`"${v}" belongs to SKU ${resolved.sku}, not ${props.sku}`)
      return
    }
    // Receiving: a serial that already resolves to this SKU's real stock is one the
    // system already knows about — receiving it again would double-count an existing
    // unit, so reject it (error beep) instead of the misleading "not found" fallback.
    if (isReceiving.value && resolved?.kind === 'serial' && resolved.sku === props.sku) {
      notifyScanError(`"${v}" already exists in the system`)
      return
    }
    // Count: a serial the system already knows for this SKU. A blind count seeds
    // no rows, so every one of them arrives here rather than matching `row`.
    if (isCountMode.value && resolved?.kind === 'serial' && resolved.sku === props.sku) {
      // Stocked in a different bin. One serial number is exactly one unit, so
      // counting it here too would put the same unit in two bins at once — the
      // stock has to be moved before it can be counted at this bin.
      if (resolved.location && props.countLocation && !sameCode(resolved.location, props.countLocation)) {
        notifyScanError(
          `${v} ${t('is currently in')} ${resolved.location} — ${t('move it to')} ${props.countLocation} ${t('using warehouse transfer')}`,
        )
        return
      }
      rows.value.push({ serial: resolved.serial ?? v, counted: true })
      saveError.value = ''
      playScanSuccessSound()
      flashScanned(resolved.serial ?? v)
      return
    }
    if (acceptsNewSerials.value && !resolved) {
      const blocked = new Set((props.blockedSerials ?? []).map(normalizeCode))
      if (isReceiving.value && blocked.has(normalizeCode(v))) {
        notifyScanError(`"${v}" was already received in a prior task`)
        return
      }
      if (isReceiving.value && rows.value.length >= (props.targetCount ?? 0)) {
        notifyScanError(`"${v}": expected qty already fully received`)
        return
      }
      rows.value.push({ serial: v, counted: true })
      saveError.value = ''
      playScanSuccessSound()
      flashScanned(v)
      return
    }
    notifyScanError(`Serial number not found: "${v}"`)
    return
  }

  if (row.reserved) {
    notifyScanError(`"${v}" is already reserved for another order`)
    return
  }

  if (row.counted) {
    notifyScanError(`"${v}" is already selected`)
    return
  }

  // Picking: the serial must actually be sitting in the active bin — catches
  // an operator scanning the right unit but standing at the wrong location.
  if (isPicking.value) {
    if (!activeBin.value) {
      notifyScanError('Scan a bin first before scanning serial numbers')
      return
    }
    if (row.originLocation && !sameCode(row.originLocation, activeBin.value)) {
      notifyScanError(`"${v}" is stored in ${row.originLocation}, not ${activeBin.value}`)
      return
    }
  }

  if (countedCount.value >= props.targetCount) {
    notifyScanError('Qty to pick already fully selected')
    return
  }
  row.counted = true
  row.removed = false
  saveError.value = ''
  playScanSuccessSound()
  flashScanned(row.serial)
}

// Put-away: scan a bin barcode to make it "active", then scan a serial barcode to
// assign that serial to the active bin (also bringing it back if it was removed
// from the list) — same active-bin model as ManageBatchDrawer / the page-level
// scan bar in PutAwayItemsPage. Serials are a fixed, already-known set — never
// registers an unrecognized code as new.
function handlePutAwayScan(v: string) {
  const matchedBin = (props.destLocationPaths ?? []).find(p => sameCode(p, v))
  if (matchedBin) {
    activeBin.value = matchedBin
    playScanSuccessSound()
    return
  }

  const row = rows.value.find(r => sameCode(r.serial, v))
  if (!row) {
    const resolved = resolveScan(props.warehouseId, v)
    if (resolved && resolved.sku !== props.sku) {
      notifyScanError(`"${v}" belongs to SKU ${resolved.sku}, not ${props.sku}`)
      return
    }
    notifyScanError(`Serial number not found: "${v}"`)
    return
  }
  if (!activeBin.value) {
    notifyScanError('Scan a bin first before scanning serial numbers')
    return
  }
  row.removed = false
  row.destLocId = activeBin.value
  saveError.value = ''
  playScanSuccessSound()
  flashScanned(row.serial)
}

// Undo every scan/toggle by re-seeding from props — correct for every mode, unlike
// blanket-clearing `counted`, which would wipe real baseline state that isn't
// scan-driven (in-out/receiving's existing-stock rows start counted=true;
// put-away's rows are fixed facts, not a count at all).
//
// Put-away is the one exception: seedRows() re-derives destLocId from
// props.modelValue, which is whatever was already SAVED — re-seeding from it
// would just restore the same assignments, making Reset a no-op. The serial
// list itself is a fixed, already-received fact and never changes; instead,
// Reset just clears every row's bin assignment (same as clicking (-) on each
// one) — every serial stays visible ("Received"), never hidden, since there's
// no pool to re-select them from.
function resetPicked() {
  if (isPutAway.value) {
    rows.value = rows.value.map(r => ({ ...r, destLocId: '' }))
    // Restore the inherited page-level bin, not null it out — the operator's
    // physical location hasn't changed just because assignments are being redone.
    activeBin.value = props.initialActiveBin ?? null
    saveError.value = ''
    return
  }
  seedRows()
}

/** Put-away only — undo this serial's bin assignment, reverting its status
 *  badge from "Assigned" back to "Received". Unlike picking/transfer (where
 *  removing hides the row pending a rescan, since it's drawn from a shared
 *  pool), a put-away serial is a fixed, already-received fact that must
 *  always stay visible in the list — there's no pool to re-select it from,
 *  it just still needs a bin. Never sets `removed`. */
function removeSerialRow(row: SerialRow) {
  row.destLocId = ''
  saveError.value = ''
}

// Foreign-reserved (picking/transfer) units are never selectable — hidden from
// the table entirely rather than shown as a "Not available" row the operator
// can never act on. Kept in rows.value itself (never filtered there), so
// scanning one still resolves to it and gets the real rejection message
// ("already reserved for another order") instead of a misleading "not found".
const selectableRows = computed(() => rows.value.filter(r => !r.reserved && !r.removed))
// Picking only — true when at least one available (non-reserved) unit is
// hidden pending a scan, as opposed to genuinely zero stock being left at all
// (every existing unit already reserved by other orders) — the empty state
// needs different copy for these two cases.
const hasHiddenAvailablePicks = computed(() => isPicking.value && rows.value.some(r => r.removed && !r.reserved))
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return selectableRows.value
  return selectableRows.value.filter(r => r.serial.toLowerCase().includes(q))
})

const displayRows = computed(() => filtered.value.slice(0, page.value * PAGE_SIZE))
const hasMore = computed(() => page.value * PAGE_SIZE < filtered.value.length)

function loadMore() {
  page.value++
}

function locOptions(search: string): string[] {
  const q = search.trim().toLowerCase()
  return (props.destLocationPaths ?? []).filter(p => !q || p.toLowerCase().includes(q))
}
// First 3 options surface as "Recommended locations"; the rest sit below a divider.
function recommendedLocOptions(search: string) { return locOptions(search).slice(0, 3) }
function otherLocOptions(search: string) { return locOptions(search).slice(3) }
function setDestLoc(row: SerialRow, locId: string) {
  row.destLocId = locId
  locActiveKey.value = null
}
// Count mode: blind count only ever lists rows that are counted (an uncounted
// serial is simply absent, never shown), so a Status column would just repeat
// "Counted" on every row — pure noise. Other kinds always show it.
const showStatusColumn = computed(() => !isCountMode.value || rows.value.some(r => !r.counted))
const colspanCount = computed(() =>
  2 + (showStatusColumn.value ? 1 : 0) + (hasOriginLoc.value ? 1 : 0) + (hasDestLoc.value ? 1 : 0),
)

function handleCancel() {
  emit('update:open', false)
}

async function handleSave() {
  if (isPicking.value) {
    if (countedCount.value > effectiveTargetCount.value) {
      saveError.value = `${countedCount.value} of ${effectiveTargetCount.value} serial numbers selected — that's more than the qty to pick.`
      return
    }
  } else if (!isReceiving.value && !isCountMode.value && countedCount.value !== effectiveTargetCount.value) {
    saveError.value = `${countedCount.value} of ${effectiveTargetCount.value} serial numbers specified. Add or remove serial numbers to match the counted quantity.`
    return
  }
  // Put-away: an operator can freely bounce between SKUs mid-task — scan this
  // one, move to another, come back later — so Save here must never block on
  // "every serial has a bin yet". That completeness check belongs at the task
  // level (PutAwayItemsPage.vue's findIncompleteSku, enforced only on Finish
  // put-away, never on Save draft) — not this drawer's own per-SKU Save.
  if (hasDestLoc.value && !isPutAway.value) {
    const missing = rows.value.filter(r => r.counted && !r.removed && !r.destLocId)
    if (missing.length > 0) {
      saveError.value = `${missing.length} selected serial number${missing.length !== 1 ? 's' : ''} don't have a destination bin assigned.`
      return
    }
  }
  saveError.value = ''
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  emit('save', rows.value.filter(r => r.counted && !r.fromPriorTask).map(r => ({
    serial: r.serial,
    destLocationId: r.destLocId || undefined,
  })))
  emit('update:open', false)
}
</script>

<template>
  <Transition name="msn">
  <div v-if="open" class="msn-overlay" @click.self="handleCancel">
    <div class="msn-panel" role="dialog" aria-label="Manage serial number">

      <header class="msn-header">
        <h2 class="msn-title">Manage serial number</h2>
        <button class="msn-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="msn-content">

        <div class="msn-info-bar">
          <div class="msn-info-product">
            <img v-if="productImg" class="msn-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="msn-info-thumb msn-info-thumb--empty" />
            <div class="msn-info-names">
              <span class="msn-info-name">{{ productName }}</span>
              <span class="msn-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="msn-info-stats">
            <div v-if="!hideStockStats && isInOut" class="msn-stat">
              <span class="msn-stat-label">{{ (isTransfer || isPicking) ? 'Available qty' : 'On hand qty' }}</span>
              <span class="msn-stat-value">{{ fmtSerial(onHandCount) }}</span>
            </div>
            <!-- receiving / put-away stats -->
            <template v-if="hideStockStats">
              <div v-if="isReceiving" class="msn-stat">
                <span class="msn-stat-label">Purchase qty</span>
                <span class="msn-stat-value">{{ fmtSerial(receivingMaxCount) }}</span>
              </div>
              <div class="msn-stat">
                <span class="msn-stat-label">{{ qtyLabel }}</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
              </div>
              <div v-if="isReceiving" class="msn-stat">
                <span class="msn-stat-label">Received qty</span>
                <span class="msn-stat-value">{{ fmtSerial(countedCount) }}</span>
              </div>
              <div v-if="isReceiving" class="msn-stat">
                <span class="msn-stat-label">Remaining qty to receive</span>
                <span class="msn-stat-value">{{ fmtSerial(Math.max(0, targetCount - countedCount)) }}</span>
              </div>
              <div v-if="isPutAway" class="msn-stat">
                <span class="msn-stat-label">Put away qty</span>
                <span class="msn-stat-value">{{ fmtSerial(putAwayCount) }}</span>
              </div>
            </template>
            <!-- stock count stats — a cycle count is blind: the operator sees only
                 what they've scanned. On hand (and the difference it implies) would
                 tell them the answer, so both are withheld until manager review. -->
            <template v-else-if="!isInOut">
              <div class="msn-stat">
                <span class="msn-stat-label">Counted</span>
                <span class="msn-stat-value">{{ fmtSerial(countedCount) }}</span>
              </div>
            </template>
            <!-- transfer stats -->
            <template v-else-if="isTransfer">
              <div class="msn-stat">
                <span class="msn-stat-label">Transfer qty</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
              </div>
              <div class="msn-stat">
                <span class="msn-stat-label">After transfer qty</span>
                <span class="msn-stat-value">{{ fmtSerial(afterTransferCount) }}</span>
              </div>
            </template>
            <!-- picking stats -->
            <template v-else-if="isPicking">
              <div v-if="props.orderQty !== undefined" class="msn-stat">
                <span class="msn-stat-label">Order qty</span>
                <span class="msn-stat-value">{{ fmtSerial(props.orderQty) }}</span>
              </div>
              <div class="msn-stat">
                <span class="msn-stat-label">Qty to pick</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
              </div>
              <div v-if="executionMode" class="msn-stat">
                <span class="msn-stat-label">Picked qty</span>
                <span class="msn-stat-value">{{ fmtSerial(countedCount) }}</span>
              </div>
            </template>
            <!-- stock in/out stats -->
            <template v-else>
              <div class="msn-stat" :class="{ 'msn-stat--pos': signedDelta > 0, 'msn-stat--neg': signedDelta < 0 }">
                <span class="msn-stat-label">{{ qtyLabel }}</span>
                <span class="msn-stat-value">{{ fmtDiff(signedDelta) }}</span>
              </div>
              <div class="msn-stat">
                <span class="msn-stat-label">New on hand qty</span>
                <span class="msn-stat-value">{{ fmtSerial(newOnHand) }}</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="!isTransfer && !isPicking && !isCountMode" class="msn-form-section">
          <!-- Serials are a fixed fact from receiving for put-away — no adding, just assign bins.
               Also hidden for count (blind count): every serial must come from an actual scan —
               a typed/pasted list would let the operator register one they never physically
               checked, defeating the point of a blind count. -->
          <template v-if="!isPutAway">
            <label class="msn-form-label">Serial number</label>
            <MpTooltip
              v-if="scanRequiredForLine"
              id="msn-tt-scan-textarea"
              label="Qty at or below the scan threshold — scan each serial's barcode instead of typing"
              placement="top"
              use-portal
            >
              <textarea
                class="msn-textarea"
                placeholder="Scan barcodes below to add serial numbers."
                disabled
              />
            </MpTooltip>
            <textarea
              v-else
              v-model="inputText"
              class="msn-textarea"
              placeholder="Paste or type serial numbers here. Supports comma-separated or one per line."
            />
            <p v-if="addError" class="msn-add-error">{{ addError }}</p>
            <div class="msn-form-action">
              <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="addToList">Add to list</button>
            </div>
          </template>
          <p v-if="saveError" class="msn-save-error">{{ saveError }}</p>
        </div>

        <div class="msn-filter-bar">
          <div class="msn-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input v-model="search" class="msn-search-input" type="text" placeholder="Search..." />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Scan bar — every mode, same position as outbound (picking), and always
             rendered even when rows.length is 0 — that's the normal starting state
             for receiving/in-out (nothing scanned yet), not an edge case, so scanning
             must work from the very first serial. Reset re-seeds from props (not a
             blanket counted=false) for every OTHER mode — it undoes scans/toggles
             without touching real baseline state (in-out/receiving's existing-stock
             rows). Put-away instead uses an active-bin scan model: scan a bin barcode
             to make it active, then scan a serial barcode to assign it to that bin —
             same model as ManageBatchDrawer / the page-level scan bar. -->
        <ScanBar placeholder="Scan barcode..." @scan="handleDrawerScan">
          <div v-if="(isPutAway || isPicking) && activeBin" class="msn-active-bin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{{ activeBin }}</span>
            <button class="msn-active-bin-clear" type="button" aria-label="Clear active bin" @click="activeBin = null">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button
            class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
            type="button"
            @click="resetPicked"
          >Reset count</button>
        </ScanBar>
        <p v-if="isPutAway || isPicking" class="msn-scan-caption">Scan the storage location first before scanning the serial number.</p>

        <template v-if="rows.length === 0">
          <div class="msn-empty">
            <img src="/illustrations/empty-folder.png" alt="" width="120" height="100" />
            <p class="msn-empty-title">No serial numbers yet</p>
            <p v-if="isCountMode" class="msn-empty-desc">Scan a barcode to add a serial number.</p>
            <p v-else class="msn-empty-desc">Add serial numbers using the input above, or scan a barcode.</p>
          </div>
        </template>

        <!-- Every unit for this SKU exists, but all of it is either reserved by
             other orders (transfer), removed from the list pending a rescan
             (put-away), or a not-yet-scanned available substitute (picking) —
             distinct from "no search results", which suggests adjusting the
             search when that's not actually the problem. -->
        <template v-else-if="selectableRows.length === 0 && !search.trim()">
          <div class="msn-empty">
            <img src="/illustrations/empty-folder.png" alt="" width="120" height="100" />
            <template v-if="isPutAway">
              <p class="msn-empty-title">No serial numbers to assign</p>
              <p class="msn-empty-desc">Every serial number was removed from the list. Scan a barcode to bring one back.</p>
            </template>
            <template v-else-if="hasHiddenAvailablePicks">
              <p class="msn-empty-title">No serial numbers picked yet</p>
              <p class="msn-empty-desc">Scan a barcode to pick one — available units only appear here once scanned.</p>
            </template>
            <template v-else>
              <p class="msn-empty-title">No serial numbers available</p>
              <p class="msn-empty-desc">Every serial number for this SKU is already reserved by other orders.</p>
            </template>
          </div>
        </template>

        <template v-else>
        <div class="msn-table-wrap">
          <table class="msn-table" :class="{ 'msn-table--locs': hasOriginLoc || hasDestLoc, 'msn-table--form': hasDestLoc }">
            <colgroup>
              <col class="msn-col-serial" />
              <col v-if="hasOriginLoc" class="msn-col-from-bin" />
              <col v-if="hasDestLoc" class="msn-col-to-bin" />
              <col v-if="showStatusColumn" class="msn-col-status" />
              <col class="msn-col-toggle" />
            </colgroup>
            <thead>
              <tr>
                <!-- Blind count: no "/ target" — the operator is only ever told how
                     many they've scanned, never how many the system expects. -->
                <th v-if="isCountMode" class="msn-th">SERIAL NUMBER ({{ countedCount }})</th>
                <th v-else class="msn-th">SERIAL NUMBER ({{ countedCount }} / {{ effectiveTargetCount }})</th>
                <th v-if="hasOriginLoc" class="msn-th">ORIGIN LOCATION</th>
                <th v-if="hasDestLoc" class="msn-th">STORAGE LOCATION</th>
                <th v-if="showStatusColumn" class="msn-th">STATUS</th>
                <th class="msn-th msn-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-if="displayRows.length === 0" class="msn-tr msn-tr--empty">
                <td :colspan="colspanCount" class="msn-td msn-td--empty">
                  <div class="msn-empty">
                    <p class="msn-empty-title">No serial numbers found</p>
                    <p class="msn-empty-desc">Try adjusting your search.</p>
                  </div>
                </td>
              </tr>
              <tr
                v-for="row in displayRows" :key="row.serial" class="msn-tr"
                :class="[(isTransfer || isPicking)
                  ? {
                      'msn-tr--confirmed': row.counted && isPicking && executionMode,
                      'msn-tr--own-reserved': row.plannedOwn || (row.counted && !(isPicking && executionMode)),
                      'msn-tr--reserved': row.reserved,
                    }
                  : { 'msn-tr--removed': !row.counted },
                  { 'msn-tr--scanned': lastScannedKey === row.serial }]"
              >
                <td class="msn-td" :class="{ 'msn-td--strike': !(isTransfer || isPicking) && !row.counted }">{{ row.serial }}</td>
                <td v-if="hasOriginLoc" class="msn-td msn-td--from-bin">
                  <span class="msn-bin-text" :title="row.originLocation">{{ row.originLocation ?? '—' }}</span>
                </td>
                <td v-if="hasDestLoc" class="msn-td msn-td--to-bin">
                  <template v-if="row.reserved || !row.counted">
                    <span class="msn-bin-empty">—</span>
                  </template>
                  <template v-else>
                    <MpPopover use-portal is-close-on-select :is-open="locActiveKey === row.serial" @update:is-open="(v: boolean) => { if (!v) locActiveKey = null }">
                      <MpPopoverTrigger as-child>
                        <div class="msn-bin-trigger">
                          <input
                            class="msn-bin-input"
                            type="text"
                            :placeholder="row.destLocId ? '' : 'Select storage location'"
                            :value="locActiveKey === row.serial ? (locSearches[row.serial] ?? '') : (row.destLocId ?? '')"
                            @focus="locActiveKey = row.serial; locSearches[row.serial] = ''"
                            @input="locSearches[row.serial] = ($event.target as HTMLInputElement).value; locActiveKey = row.serial"
                          />
                          <svg class="msn-bin-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '280px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                        <template v-if="locOptions(locSearches[row.serial] ?? '').length">
                          <p class="msn-loc-section-heading">Recommended locations</p>
                          <MpPopoverList>
                            <MpPopoverListItem
                              v-for="opt in recommendedLocOptions(locSearches[row.serial] ?? '')"
                              :key="opt"
                              :is-active="opt === row.destLocId"
                              @click="setDestLoc(row, opt)"
                            >{{ opt }}</MpPopoverListItem>
                          </MpPopoverList>
                          <template v-if="otherLocOptions(locSearches[row.serial] ?? '').length">
                            <div class="msn-loc-divider" />
                            <MpPopoverList>
                              <MpPopoverListItem
                                v-for="opt in otherLocOptions(locSearches[row.serial] ?? '')"
                                :key="opt"
                                :is-active="opt === row.destLocId"
                                @click="setDestLoc(row, opt)"
                              >{{ opt }}</MpPopoverListItem>
                            </MpPopoverList>
                          </template>
                        </template>
                        <p v-else class="msn-loc-none">No locations found.</p>
                      </MpPopoverContent>
                    </MpPopover>
                  </template>
                </td>
                <td v-if="showStatusColumn" class="msn-td msn-td--status">
                  <template v-if="isTransfer || isPicking">
                    <MpTooltip
                      v-if="row.reserved"
                      :id="`msn-status-tt-${row.serial}`"
                      label="Not available — already reserved for another order"
                      placement="top"
                      use-portal
                    >
                      <MpBadge for="tableStatus" type="announcement">Not available</MpBadge>
                    </MpTooltip>
                    <MpBadge v-else-if="row.counted" for="tableStatus" type="success">{{ (isPicking && executionMode) ? 'Picked' : 'Reserved' }}</MpBadge>
                    <MpBadge v-else-if="row.plannedOwn" for="tableStatus" type="warning">Reserved</MpBadge>
                  </template>
                  <template v-else-if="isPutAway">
                    <MpBadge v-if="row.destLocId" for="tableStatus" type="success">Assigned</MpBadge>
                    <MpBadge v-else for="tableStatus" type="warning">Received</MpBadge>
                  </template>
                  <template v-else-if="isCountMode">
                    <span v-if="row.counted" class="msn-status-text msn-status-text--success">Counted</span>
                    <span v-else class="msn-status-text msn-status-text--danger">Not counted</span>
                  </template>
                  <template v-else>
                    <MpBadge v-if="row.counted" for="tableStatus" type="success">Counted</MpBadge>
                    <MpBadge v-else for="tableStatus" type="danger">Not counted</MpBadge>
                  </template>
                </td>
                <td v-if="isPutAway" class="msn-td msn-td--del">
                  <button
                    class="msn-toggle-btn msn-toggle-btn--remove"
                    type="button"
                    aria-label="Remove storage location"
                    @click="removeSerialRow(row)"
                  >
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
                <td v-else class="msn-td msn-td--del">
                  <button
                    v-if="!row.fromPriorTask"
                    class="msn-toggle-btn"
                    :class="[
                      row.counted ? 'msn-toggle-btn--remove' : 'msn-toggle-btn--restore',
                      (row.reserved || ((isTransfer || isPicking) && !row.counted && countedCount >= targetCount)) ? 'msn-toggle-btn--disabled' : ''
                    ]"
                    type="button"
                    :aria-label="row.counted
                      ? (isPicking ? 'Remove from pick' : isTransfer ? 'Remove from transfer' : 'Mark as not counted')
                      : (isPicking ? 'Select for picking' : isTransfer ? 'Select for transfer' : 'Mark as counted')"
                    @click="toggleRow(row)"
                  >
                    <MpIcon :name="row.counted ? 'minus-circular' : 'add'" size="sm" />
                  </button>
                </td>
              </tr>

            </tbody>
          </table>
          <div class="msn-pagination">
            <span>Showing {{ displayRows.length }} of {{ filtered.length }} serial numbers</span>
            <button v-if="hasMore" class="msn-load-more" type="button" @click="loadMore">Load more</button>
          </div>
        </div>

        <p v-if="(isTransfer || isPicking) && saveError" class="msn-save-error msn-save-error--transfer">{{ saveError }}</p>

        </template>

      </div>

      <footer class="msn-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</button>
      </footer>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
/* ── Transitions ─────────────────────────────────────────────────────────────── */
.msn-enter-active,
.msn-leave-active { transition: background-color 250ms ease; }
.msn-enter-from, .msn-leave-to { background-color: transparent; }
.msn-enter-active :deep(.msn-panel) { transition: transform 350ms ease-out; }
.msn-leave-active :deep(.msn-panel) { transition: transform 250ms ease-in; }
.msn-enter-from :deep(.msn-panel),
.msn-leave-to :deep(.msn-panel) { transform: translateX(calc(100% + 12px)); }

.msn-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.msn-panel {
  margin: var(--mp-spacing-3);
  width: min(1400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.msn-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.msn-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.msn-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.msn-close:hover { background: var(--mp-background-neutral-hovered); }

.msn-content {
  flex: 1; min-height: 0; overflow: hidden;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.msn-content > * { flex-shrink: 0; }

.msn-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.msn-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.msn-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.msn-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.msn-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.msn-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msn-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.msn-info-stats { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10); }
.msn-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; min-width: 160px; }
.msn-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.msn-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.msn-stat--pos .msn-stat-value { color: var(--mp-text-success, #18794e); }
.msn-stat--neg .msn-stat-value { color: var(--mp-text-danger, #a8352d); }

.msn-form-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.msn-form-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.msn-textarea {
  width: 100%; height: 80px; resize: vertical;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16));
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral, #fff);
  outline: none; font-family: inherit; box-sizing: border-box;
}
.msn-textarea::placeholder { color: var(--mp-text-placeholder); }
.msn-textarea:focus { border-color: var(--mp-border-bold); }
.msn-form-action { display: flex; justify-content: flex-end; }
.msn-add-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.msn-save-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

.msn-save-error--transfer { margin-top: -12px; }

.msn-filter-bar { display: flex; justify-content: flex-end; }
.msn-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 240px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-icon-default);
}
.msn-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.msn-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.msn-table-wrap {
  flex: 0 1 auto; min-height: 0;
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: auto;
}
.msn-table {
  width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
/* Serial/origin/dest columns have no explicit width — under table-layout:fixed they
   split whatever space is left after the fixed-width Status/toggle columns equally,
   so the toggle ("Add") column always lands flush against the table's right edge. */
.msn-col-serial { /* fills remaining */ }
.msn-col-status { width: 120px; }
.msn-status-text { font-size: var(--mp-font-sizes-sm); }
.msn-status-text--success { color: var(--mp-text-success, #18794e); }
.msn-status-text--danger { color: var(--mp-text-danger, #a8352d); }
.msn-col-toggle { width: 44px; }
.msn-col-from-bin { /* fills remaining, alongside serial */ }
.msn-col-to-bin { /* fills remaining, alongside serial */ }
.msn-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.msn-th--del { padding: 0; }

/* Body cells carry the right dividers (see .msn-td). The form-table header stays
   white with border-bottom only — no side borders on th. */

.msn-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral, #fff);
}
.msn-td:last-child { border-right: none; }
.msn-td--strike { text-decoration: line-through; color: var(--mp-text-secondary); }
.msn-tr--removed .msn-td { background: var(--mp-background-danger-subtle, #fff5f5); }
.msn-tr--confirmed .msn-td { background: var(--mp-background-success-subtle, #f0fdf4); }
.msn-tr--own-reserved .msn-td { background: var(--mp-background-warning-subtle, #fffbeb); }
.msn-tr--reserved .msn-td { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }

@keyframes msn-scan-flash {
  0%   { background: var(--mp-background-success-subtle, #f0fdf4); }
  20%  { background: var(--mp-background-success-subtle, #f0fdf4); }
  100% { background: var(--mp-background-neutral, #fff); }
}
.msn-tr--scanned .msn-td { animation: msn-scan-flash 1s ease-out forwards; }

.msn-active-bin {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-2\.5);
  background: #e6f7ef; border: 1px solid #029861;
  border-radius: var(--mp-radii-full); white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: #027a4e; flex-shrink: 0;
}
.msn-active-bin-clear {
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; display: flex; align-items: center; opacity: 0.7; line-height: 1;
}
.msn-active-bin-clear:hover { opacity: 1; }
.msn-scan-caption { margin: calc(var(--mp-spacing-1) - var(--mp-spacing-4) - 20px) 0 calc(var(--mp-spacing-4) - 20px); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-secondary); }

/* Form-table rules — only when INTO LOCATION is a real editable picker (transfer/
   put-away's destination bin). Read-only location display (picking) stays plain:
   white rows, gray header, like any other non-form table. */
.msn-table--form .msn-th { background: var(--mp-background-neutral, #fff); }
.msn-table--form .msn-td { background: var(--mp-background-neutral-subtle); }
.msn-table--form .msn-td--to-bin { background: var(--mp-background-neutral, #fff); }
.msn-table--form .msn-tr--confirmed .msn-td--to-bin,
.msn-table--form .msn-tr--own-reserved .msn-td--to-bin,
.msn-table--form .msn-tr--removed .msn-td--to-bin { background: var(--mp-background-neutral, #fff); }

.msn-td--status { padding: 8px var(--mp-spacing-2); vertical-align: middle; }
.msn-td--del {
  padding: 0; text-align: center; background: inherit;
}
.msn-td--from-bin { padding: 10px var(--mp-spacing-2); }
.msn-td--to-bin { padding: 0; vertical-align: middle; }
.msn-td--to-bin:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.msn-bin-text {
  display: block; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  white-space: normal; word-break: break-word;
}
.msn-bin-empty { padding: 10px var(--mp-spacing-2); display: block; font-size: var(--mp-font-sizes-md); color: var(--mp-text-placeholder); }
.msn-bin-trigger {
  display: flex; align-items: center;
  width: 100%; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
}
.msn-bin-input {
  flex: 1; min-width: 0; height: 100%; padding: 0;
  border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  outline: none; font-family: inherit;
}
.msn-bin-input::placeholder { color: var(--mp-text-placeholder); }
.msn-bin-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.msn-loc-none { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.msn-loc-section-heading { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.msn-loc-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

.msn-toggle-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: var(--mp-sizes-10, 40px);
  border: none; background: none; cursor: pointer;
  visibility: hidden;
}
.msn-tr:hover .msn-toggle-btn { visibility: visible; }
/* Reserved-but-unscanned rows: always show the toggle — a visible manual way to
   mark it picked without scanning, not just a hover-reveal easy to miss. */
.msn-tr--own-reserved .msn-toggle-btn { visibility: visible; }
.msn-toggle-btn--remove { color: var(--mp-text-secondary); visibility: visible; }
.msn-toggle-btn--remove:hover { color: var(--mp-text-danger, #dc2626); }
.msn-toggle-btn--restore { color: var(--mp-text-secondary); }
.msn-toggle-btn--restore:hover { color: var(--mp-text-success, #18794e); }
.msn-toggle-btn--disabled { opacity: 0.3; cursor: not-allowed; }
.msn-toggle-btn--disabled:hover { color: var(--mp-text-secondary); }

.msn-pagination {
  position: sticky; bottom: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  background: var(--mp-background-default, #fff);
}
.msn-load-more {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
}
.msn-load-more:hover { text-decoration: underline; text-underline-offset: 2px; }

.msn-td--empty { border-bottom: none; }
.msn-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: var(--mp-spacing-10, 40px) var(--mp-spacing-4);
  gap: var(--mp-spacing-2);
  flex: 1;
}
.msn-empty-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-align: center;
}
.msn-empty-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }

.msn-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
</style>
