<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalCloseButton, MpModalOverlay,
  MpButton, MpFormControl, MpFormLabel, MpTooltip, MpSpinner, MpAutocomplete,
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpSelect, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import type { Receipt } from '~/data/receipts'
import { lineItemsForReceipt, BINS, type ReceiptLineItem } from '~/data/receiptLineItems'
import { addPurchaseReceiving } from '~/data/purchaseReceivings'
import { getWarehouseOperators } from '~/data/warehouseTeam'

const props = defineProps<{ receipt: Receipt | null; open: boolean }>()
const emit = defineEmits<{ close: []; created: [] }>()

// ─── Form state ────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
// Assignee can only be an operator of the receipt's warehouse.
const ASSIGNEES = computed(() => getWarehouseOperators(props.receipt?.warehouseId ?? ''))
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

// SKU scope = whatever stays in the table. Removing a row narrows the scope.
const removed = ref(new Set<string>())
const search  = ref('')

const lineItems = computed<ReceiptLineItem[]>(() =>
  props.receipt ? lineItemsForReceipt(props.receipt) : [],
)
const keptItems = computed<ReceiptLineItem[]>(() =>
  lineItems.value.filter(i => !removed.value.has(i.productId)),
)
// What the table renders — kept items narrowed by the search box.
const visibleItems = computed<ReceiptLineItem[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return keptItems.value
  return keptItems.value.filter(i =>
    i.productName.toLowerCase().includes(q) ||
    i.sku.toLowerCase().includes(q) ||
    i.productDesc.toLowerCase().includes(q),
  )
})
const hasRemoved = computed(() => removed.value.size > 0)

// ─── Progressive pagination — auto lazy-load on scroll (matches Sales Order detail) ──
const PAGE_SIZE   = 10
const shownCount  = ref(PAGE_SIZE)            // show 10 by default
const loadingMore = ref(false)
const pagedItems  = computed<ReceiptLineItem[]>(() => visibleItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < visibleItems.value.length)

function loadMoreItems(): void {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  // brief loading state before the next batch appends
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, visibleItems.value.length)
    loadingMore.value = false
  }, 500)
}

// Auto-load the next batch when the user scrolls near the bottom of the table
// (IntersectionObserver on a sentinel inside the table's own scroll container).
const itemsScrollEl   = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver(): void {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onUnmounted(() => itemsObserver?.disconnect())

// Reset the rendered slice + re-arm the observer when the modal opens or search changes.
watch([() => props.open, search], () => {
  shownCount.value = PAGE_SIZE
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

watch(() => props.open, (val) => {
  if (val) {
    assigneeId.value = ''
    removed.value = new Set()
    search.value = ''
    locationOverrides.value = {}
    editingLocId.value = null
  }
})

function removeItem(id: string): void {
  const s = new Set(removed.value)
  s.add(id)
  removed.value = s
}
function resetItems(): void { removed.value = new Set() }

// Per-SKU storage-location overrides (editable from the hover edit button).
const STORAGE_BINS = BINS as readonly string[]
const locationOverrides = ref<Record<string, string>>({})
const editingLocId = ref<string | null>(null)
function locationOf(item: ReceiptLineItem): string {
  return locationOverrides.value[item.productId] ?? item.storageLocation
}
function startEditLoc(id: string): void {
  editingLocId.value = id
  nextTick(() => {
    document.querySelector<HTMLInputElement>(`#pr-loc-ac-${id} input`)?.focus()
  })
}
function commitLoc(id: string, bin: string | null | undefined): void {
  if (bin) locationOverrides.value = { ...locationOverrides.value, [id]: bin }
  editingLocId.value = null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

const canCreate = computed(() => !!assigneeId.value && keptItems.value.length > 0)

function handleCreate() {
  if (props.receipt) {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10)
    const skuCount = keptItems.value.length
    const totalSkuQty = props.receipt.skuQty
    addPurchaseReceiving({
      receiptId: props.receipt.id,
      date: dateStr,
      assignee: assigneeLabel.value,
      skuScope: String(skuCount),
      purchaseQty: keptItems.value.reduce((s, i) => s + i.purchaseQty, 0),
      receivedQty: keptItems.value.reduce((s, i) => s + i.purchaseQty, 0),
      skuCount,
      status: 'completed',
      startDate: dateStr,
      endDate: dateStr,
    })
  }
  toast.notify({ variant: 'success', title: 'Purchase receiving saved' , maxWidth: 'max-content'})
  emit('created')
  emit('close')
}
</script>

<template>
  <MpModal
    id="pr-modal"
    :is-open="open"
    size="xl"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        Create purchase receiving
        <MpModalCloseButton />
      </MpModalHeader>

      <MpModalBody>
        <!-- ── PO content list (header) ──────────────────────────────────── -->
        <div v-if="receipt" class="pr-header">
          <ContentList label="Purchase no." :value="receipt.purchaseNo" />
          <ContentList label="Description" :value="receipt.memo ?? '—'" />
          <ContentList
            label="Tracking no."
            :value="receipt.trackingNos.length ? receipt.trackingNos.join(', ') : '—'"
          />
        </div>

        <!-- ── Assignee — spans 3 of a 12-col grid ──────────────────────── -->
        <div class="pr-section pr-grid">
          <div class="pr-assignee-field" :class="css({ gridColumn: 'span 3' })">
            <label class="pr-field-label" for="pr-assignee-ac">Assignee</label>
            <MpAutocomplete
              id="pr-assignee-ac"
              v-model="assigneeId"
              :data="ASSIGNEES"
              label-prop="name"
              value-prop="id"
              placeholder="Select assignee"
              is-searchable is-clearable use-portal
              :class="css({ width: '100%' })"
            >
              <template #default="{ item }">
                <div class="pr-assignee-opt">
                  <span
                    class="pr-assignee-avatar"
                    :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                  >{{ item.initials }}</span>
                  {{ item.name }}
                </div>
              </template>
            </MpAutocomplete>
          </div>
        </div>

        <!-- ── SKU table — scope is whatever stays here ─────────────────── -->
        <div class="pr-sku-section">
          <h2 class="pr-section-title">SKUs to receive</h2>

          <!-- Filter bar: scope count (left) + search (always right) -->
          <div class="pr-filter-bar">
            <div class="pr-filter-left">
              <span class="pr-sku-count">{{ keptItems.length }} of {{ lineItems.length }} included</span>
              <MpButton v-if="hasRemoved" variant="textLink" size="sm" @click="resetItems">Reset</MpButton>
            </div>
            <div class="pr-filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input v-model="search" class="pr-filter-search-input" type="text" placeholder="Search SKU or product" />
            </div>
          </div>

          <!-- Empty — scope emptied -->
          <div v-if="!keptItems.length" class="pr-empty">
            <p class="pr-empty-title">No SKUs included</p>
            <p class="pr-empty-desc">You removed every SKU. Reset to include them again.</p>
            <MpButton variant="textLink" size="sm" @click="resetItems">Reset SKUs</MpButton>
          </div>

          <!-- Empty — search matched nothing -->
          <div v-else-if="!visibleItems.length" class="pr-empty">
            <p class="pr-empty-title">No results found</p>
            <p class="pr-empty-desc">No SKU matches your search. Try a different keyword.</p>
          </div>

          <!-- Table — bordered, internally-scrolling panel past the default page -->
          <section v-else class="pr-items-section pr-items-section--bordered">
            <div ref="itemsScrollEl" class="pr-items-scroll">
              <table class="pr-items">
                <colgroup>
                  <col />
                  <col style="width: 140px" />
                  <col style="width: 110px" />
                  <col style="width: 80px" />
                  <col style="width: 140px" />
                  <col style="width: 56px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pr-th">Product</th>
                    <th class="pr-th">SKU</th>
                    <th class="pr-th pr-th--num">Purchase qty</th>
                    <th class="pr-th">Unit</th>
                    <th class="pr-th">Storage location</th>
                    <th class="pr-th pr-th--action" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="it in pagedItems" :key="it.productId" class="pr-item-row">
                    <td class="pr-td">
                      <div class="pr-product">
                        <img
                          class="pr-product-thumb"
                          :src="it.image" :alt="it.productName"
                          loading="lazy" width="40" height="40"
                        />
                        <div class="pr-product-info">
                          <span class="pr-product-name">{{ it.productName }}</span>
                          <span class="pr-product-desc">{{ it.productDesc }}</span>
                        </div>
                      </div>
                    </td>
                    <td class="pr-td"><span class="pr-sku-text">{{ it.sku }}</span></td>
                    <td class="pr-td pr-td--num">{{ formatNum(it.purchaseQty) }}</td>
                    <td class="pr-td">{{ it.unit }}</td>
                    <td class="pr-td">
                      <!-- Click edit → searchable select to change the bin -->
                      <MpAutocomplete
                        v-if="editingLocId === it.productId"
                        :id="`pr-loc-ac-${it.productId}`"
                        :data="STORAGE_BINS"
                        :placeholder="locationOf(it)"
                        is-searchable use-portal
                        :class="css({ width: '100%' })"
                        @update:model-value="(v: string) => commitLoc(it.productId, v)"
                      />
                      <div v-else class="pr-loc-cell">
                        <span class="pr-bin">{{ locationOf(it) }}</span>
                        <MpButton
                          class="pr-loc-edit"
                          :aria-label="`Edit storage location for ${it.productName}`"
                          variant="ghost" size="sm" left-icon="edit"
                          @click="startEditLoc(it.productId)"
                        />
                      </div>
                    </td>
                    <td class="pr-td pr-td--action">
                      <MpTooltip :id="`pr-rm-${it.productId}`" label="Remove" placement="left" use-portal>
                        <MpButton
                          :aria-label="`Remove ${it.productName}`"
                          variant="ghost" size="sm" left-icon="minus-circular"
                          @click="removeItem(it.productId)"
                        />
                      </MpTooltip>
                    </td>
                  </tr>
                </tbody>
              </table>
              <!-- sentinel observed for auto lazy-load + inline loading row -->
              <div ref="itemsSentinelEl" class="pr-items-sentinel" aria-hidden="true" />
              <div v-if="loadingMore" class="pr-loading pr-items-loading">
                <MpSpinner size="sm" /> Loading SKUs…
              </div>
            </div>
            <div class="pr-items-count">
              <span>Showing {{ pagedItems.length }} of {{ visibleItems.length }} SKUs</span>
            </div>
          </section>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="pr-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded :is-disabled="!canCreate" @click="handleCreate">
            Create purchase receiving
          </MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── PO content list (header) — flush, no side padding, border-bottom divider ── */
.pr-header {
  display: flex; gap: var(--mp-spacing-10);
  padding: 0 0 var(--mp-spacing-4) 0;
  margin-bottom: var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
/* both lines (label + value) identical: 14px regular, same color */
.pr-header :deep(.content-list) { padding-top: 0; }
.pr-header :deep(.content-list__label) {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
}

/* ── Section / assignee grid ──────────────────────────────────────────────── */
.pr-section { margin-bottom: var(--mp-spacing-6); }
.pr-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--mp-spacing-4); }
.pr-assignee-field { display: flex; flex-direction: column; }
.pr-field-label {
  display: block; margin-bottom: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default);
}
.pr-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pr-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title (h2) ───────────────────────────────────────────────────── */
.pr-section-title {
  margin: 0 0 var(--mp-spacing-4) 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}

/* ── Filter bar (scope count left, search always right) ─────────────────────── */
.pr-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);   /* 20px gap to table */
}
.pr-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-sku-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pr-filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.pr-filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.pr-filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Items table — ERP table spec + progressive internal scroll ─────────────── */
.pr-items-section { display: flex; flex-direction: column; }
/* progressive case → contained panel with a 1px bold outer border */
.pr-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-lg);
  overflow: hidden;
}
.pr-items-section--bordered .pr-items-count {
}
/* table scrolls internally at ~10 rows so 25+ SKUs don't grow the modal */
.pr-items-scroll { max-height: 638px; overflow-y: auto; overflow-x: hidden; }
.pr-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
/* header stays visible while the body scrolls */
.pr-items thead .pr-th { position: sticky; top: 0; z-index: 1; }

.pr-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pr-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
.pr-th--action { width: 56px; }

.pr-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pr-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
}
.pr-td--action { text-align: right; padding-right: var(--mp-spacing-2); }

/* Product cell — real photo + name + description */
.pr-product { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-subtle);
}
.pr-product-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.pr-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-product-desc {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pr-bin {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); letter-spacing: 0.02em;
}
/* Storage location — edit button reveals on row hover */
.pr-loc-cell { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.pr-loc-edit { visibility: hidden; }
.pr-item-row:hover .pr-loc-edit { visibility: visible; }

/* Sentinel + inline loading row (inside the scroll) */
.pr-items-sentinel { height: 1px; }
.pr-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pr-loading {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md);
}

/* Progressive count row */
.pr-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Empty states ─────────────────────────────────────────────────────────── */
.pr-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pr-empty-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pr-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.pr-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
