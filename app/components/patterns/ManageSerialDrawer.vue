<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { MpIcon, MpBadge, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

export interface CommittedSerial {
  serial: string
  destLocationId?: string
}

interface SerialRow {
  serial: string
  counted: boolean
  reserved?: boolean
  originLocation?: string
  destLocId?: string
  fromPriorTask?: boolean
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
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'save': [serials: CommittedSerial[]]
}>()

const PAGE_SIZE = 20

const rows = ref<SerialRow[]>([])
const inputText = ref('')
const addError = ref('')
const search = ref('')
const page = ref(1)
const saveError = ref('')

const locActiveKey = ref<string | null>(null)
const locSearches = reactive<Record<string, string>>({})
const hasOriginLoc = computed(() => (props.originLocationPaths?.length ?? 0) > 0)
const hasDestLoc = computed(() => (props.destLocationPaths?.length ?? 0) > 0)

watch(() => props.open, (isOpen) => {
  if (!isOpen) return

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
    rows.value = [
      ...availableUnits.map(u => ({
        serial: u.serial,
        counted: selectedSet.has(u.serial),
        reserved: false as const,
        originLocation: hasOriginLoc.value ? u.location : undefined,
        destLocId: selectedDestLoc.get(u.serial) ?? '',
      })),
      ...reservedUnits.map(u => ({
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
    }))
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
  } else if (!props.kind || props.kind === 'count') {
    // Stock count: pre-populate all warehouse SNs as not-counted; user scans to confirm each
    rows.value = warehouseSerials.map(s => ({ serial: s, counted: false }))
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
// Info bar stats are driven by targetCount (what user entered in the form), not table state
const difference = computed(() => props.targetCount - onHandCount.value)
const isInOut = computed(() =>
  props.kind === 'in-out' || props.kind === 'transfer' || props.kind === 'receiving' || props.kind === 'put-away' || props.kind === 'picking',
)
const isCountMode = computed(() => !props.kind || props.kind === 'count')
const isTransfer = computed(() => props.kind === 'transfer')
const isReceiving = computed(() => props.kind === 'receiving')
const isPutAway = computed(() => props.kind === 'put-away')
const isPicking = computed(() => props.kind === 'picking')
const hideStockStats = computed(() => isReceiving.value || isPutAway.value)
const qtyLabel = computed(() => {
  if (props.kind === 'transfer') return 'Transfer qty'
  if (props.kind === 'receiving') return 'Purchase qty'
  if (props.kind === 'put-away') return 'Received qty'
  if (props.kind === 'picking') return 'Picked qty'
  return 'Stock in/out qty'
})
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
  const parsed = parseInput()
  if (!parsed.length) return
  if (!props.kind || props.kind === 'count') {
    // Count mode: scan each SN — mark existing rows as counted, add unknown SNs as counted
    const idxMap = new Map(rows.value.map((r, i) => [r.serial, i]))
    const toAdd: SerialRow[] = []
    for (const sn of parsed) {
      const idx = idxMap.get(sn)
      if (idx !== undefined) {
        rows.value[idx]!.counted = true
      } else {
        toAdd.push({ serial: sn, counted: true })
      }
    }
    if (toAdd.length) rows.value.push(...toAdd)
  } else {
    const existing = new Set(rows.value.map(r => r.serial))
    const blocked = new Set(props.blockedSerials ?? [])
    const dupes = parsed.filter(s => existing.has(s))
    const alreadyReceived = parsed.filter(s => !existing.has(s) && blocked.has(s))
    const newOnes = parsed.filter(s => !existing.has(s) && !blocked.has(s))
    if (alreadyReceived.length) {
      addError.value = `Already received in a prior task: ${alreadyReceived.join(', ')}`
    } else if (dupes.length) {
      addError.value = `Already in list: ${dupes.join(', ')}`
    } else {
      addError.value = ''
    }
    if (!newOnes.length) return
    rows.value.push(...newOnes.map(s => ({ serial: s, counted: true })))
  }
  inputText.value = ''
  saveError.value = ''
}

watch(inputText, () => { addError.value = '' })

function toggleRow(row: SerialRow) {
  if (row.reserved) return
  if ((isTransfer.value || isPicking.value) && !row.counted && countedCount.value >= props.targetCount) return
  if (isReceiving.value && row.counted) {
    rows.value = rows.value.filter(r => r.serial !== row.serial)
    saveError.value = ''
    return
  }
  row.counted = !row.counted
  saveError.value = ''
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.serial.toLowerCase().includes(q))
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
const colspanCount = computed(() =>
  (isPutAway.value ? 2 : 3) + (hasOriginLoc.value ? 1 : 0) + (hasDestLoc.value ? 1 : 0),
)

function handleCancel() {
  emit('update:open', false)
}

function handleSave() {
  if (isPicking.value) {
    if (countedCount.value > effectiveTargetCount.value) {
      saveError.value = `${countedCount.value} of ${effectiveTargetCount.value} serial numbers selected — that's more than the qty to pick.`
      return
    }
  } else if (!isReceiving.value && countedCount.value !== effectiveTargetCount.value) {
    saveError.value = `${countedCount.value} of ${effectiveTargetCount.value} serial numbers specified. Add or remove serial numbers to match the counted quantity.`
    return
  }
  if (hasDestLoc.value) {
    const missing = rows.value.filter(r => r.counted && !r.destLocId)
    if (missing.length > 0) {
      saveError.value = `${missing.length} selected serial number${missing.length !== 1 ? 's' : ''} don't have a destination bin assigned.`
      return
    }
  }
  saveError.value = ''
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
              <div class="msn-stat">
                <span class="msn-stat-label">{{ qtyLabel }}</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
              </div>
              <div v-if="isReceiving" class="msn-stat">
                <span class="msn-stat-label">Received qty</span>
                <span class="msn-stat-value">{{ fmtSerial(countedCount) }}</span>
              </div>
              <div v-if="isReceiving" class="msn-stat">
                <span class="msn-stat-label">Outstanding qty</span>
                <span class="msn-stat-value">{{ fmtSerial(Math.max(0, targetCount - countedCount)) }}</span>
              </div>
              <div v-if="isPutAway" class="msn-stat">
                <span class="msn-stat-label">Put away qty</span>
                <span class="msn-stat-value">{{ fmtSerial(putAwayCount) }}</span>
              </div>
            </template>
            <!-- stock count stats -->
            <template v-else-if="!isInOut">
              <div class="msn-stat">
                <span class="msn-stat-label">Counted qty</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
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
              <div class="msn-stat">
                <span class="msn-stat-label">Picked qty</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
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

        <div v-if="!isTransfer && !isPicking" class="msn-form-section">
          <!-- Serials are a fixed fact from receiving for put-away — no adding, just assign bins. -->
          <template v-if="!isPutAway">
            <label class="msn-form-label">Serial number</label>
            <textarea
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

        <template v-if="rows.length === 0">
          <div class="msn-empty">
            <img src="/illustrations/empty-folder.png" alt="" width="120" height="100" />
            <p class="msn-empty-title">No serial numbers yet</p>
            <p class="msn-empty-desc">Add serial numbers using the input above.</p>
          </div>
        </template>

        <template v-else>
        <div class="msn-filter-bar">
          <div class="msn-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input v-model="search" class="msn-search-input" type="text" placeholder="Search..." />
          </div>
        </div>

        <div class="msn-table-wrap">
          <table class="msn-table" :class="{ 'msn-table--locs': hasOriginLoc || hasDestLoc, 'msn-table--form': hasDestLoc }">
            <colgroup>
              <col class="msn-col-serial" />
              <col v-if="hasOriginLoc" class="msn-col-from-bin" />
              <col v-if="hasDestLoc" class="msn-col-to-bin" />
              <col class="msn-col-status" />
              <col v-if="!isPutAway" class="msn-col-toggle" />
            </colgroup>
            <thead>
              <tr>
                <th class="msn-th">SERIAL NUMBER ({{ countedCount }} / {{ effectiveTargetCount }})</th>
                <th v-if="hasOriginLoc" class="msn-th">ORIGIN LOCATION</th>
                <th v-if="hasDestLoc" class="msn-th">STORAGE LOCATION</th>
                <th class="msn-th">STATUS</th>
                <th v-if="!isPutAway" class="msn-th msn-th--del" />
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
                :class="(isTransfer || isPicking)
                  ? { 'msn-tr--selected': row.counted, 'msn-tr--reserved': row.reserved }
                  : isCountMode
                    ? { 'msn-tr--selected': row.counted }
                    : { 'msn-tr--removed': !row.counted }"
              >
                <td class="msn-td" :class="{ 'msn-td--strike': !isCountMode && !(isTransfer || isPicking) && !row.counted }">{{ row.serial }}</td>
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
                <td class="msn-td msn-td--status">
                  <template v-if="isTransfer || isPicking">
                    <MpBadge v-if="row.reserved" type="warning">Reserved</MpBadge>
                    <MpBadge v-else-if="row.counted" type="success">Selected</MpBadge>
                  </template>
                  <template v-else-if="isPutAway">
                    <MpBadge v-if="row.destLocId" type="success">Assigned</MpBadge>
                    <MpBadge v-else type="warning">Unassigned</MpBadge>
                  </template>
                  <template v-else>
                    <MpBadge v-if="row.counted" type="success">Counted</MpBadge>
                    <MpBadge v-else type="danger">Not counted</MpBadge>
                  </template>
                </td>
                <td v-if="!isPutAway" class="msn-td msn-td--del">
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
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="handleSave">Save</button>
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
  width: min(80vw, calc(100% - 24px));
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
.msn-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.msn-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
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

/* Column borders — added whenever a location column is present, regardless of
   whether it's an editable picker (form) or a plain read-only display. */
.msn-table--locs .msn-th { border-right: 1px solid var(--mp-border-default); }
.msn-table--locs .msn-th:last-child { border-right: none; }

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
.msn-tr--selected .msn-td { background: var(--mp-background-success-subtle, #f0fdf4); }
.msn-tr--reserved .msn-td { background: var(--mp-background-warning-subtle, #fffbeb); color: var(--mp-text-secondary); }

/* Form-table rules — only when INTO LOCATION is a real editable picker (transfer/
   put-away's destination bin). Read-only location display (picking) stays plain:
   white rows, gray header, like any other non-form table. */
.msn-table--form .msn-th { background: var(--mp-background-neutral, #fff); }
.msn-table--form .msn-td { background: var(--mp-background-neutral-subtle); }
.msn-table--form .msn-td--to-bin { background: var(--mp-background-neutral, #fff); }
.msn-table--form .msn-tr--selected .msn-td--to-bin,
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
