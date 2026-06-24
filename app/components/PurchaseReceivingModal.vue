<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalCloseButton, MpModalOverlay,
  MpButton, MpRadio, MpCheckbox,
  MpFormControl, MpFormLabel,
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpSelect, css,
} from '@mekari/pixel3'
import type { Receipt } from '~/data/receipts'
import { lineItemsForReceipt, type ReceiptLineItem } from '~/data/receiptLineItems'

const props = defineProps<{ receipt: Receipt | null; open: boolean }>()
const emit = defineEmits<{ close: []; created: [] }>()

const ASSIGNEES = [
  { id: 'u01', name: 'Budi Santoso',    initials: 'BS', hue: 210 },
  { id: 'u02', name: 'Dewi Rahayu',     initials: 'DR', hue: 145 },
  { id: 'u03', name: 'Rizki Pratama',   initials: 'RP', hue: 30  },
  { id: 'u04', name: 'Agus Firmansyah', initials: 'AF', hue: 280 },
  { id: 'u05', name: 'Sari Indah',      initials: 'SI', hue: 320 },
  { id: 'u06', name: 'Hendra Wijaya',   initials: 'HW', hue: 170 },
  { id: 'u07', name: 'Citra Kusuma',    initials: 'CK', hue: 55  },
  { id: 'u08', name: 'Galih Nugraha',   initials: 'GN', hue: 100 },
]

// ─── Form state ────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const skuScope      = ref<'all' | 'specific'>('all')
const selectedIds   = ref(new Set<string>())
const assigneeLabel = computed(() => ASSIGNEES.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Line items ────────────────────────────────────────────────────────────────
const lineItems = computed<ReceiptLineItem[]>(() =>
  props.receipt ? lineItemsForReceipt(props.receipt) : [],
)

watch(() => props.open, (val) => {
  if (val) {
    assigneeId.value  = ''
    skuScope.value    = 'all'
    selectedIds.value = new Set(lineItems.value.map(i => i.productId))
  }
})

// ─── Select-all ───────────────────────────────────────────────────────────────
const allSelected  = computed(() =>
  lineItems.value.length > 0 && lineItems.value.every(i => selectedIds.value.has(i.productId)),
)
const someSelected = computed(() =>
  lineItems.value.some(i => selectedIds.value.has(i.productId)) && !allSelected.value,
)

function toggleAll(val: boolean): void {
  selectedIds.value = val
    ? new Set(lineItems.value.map(i => i.productId))
    : new Set()
}
function toggleItem(id: string, checked: boolean): void {
  const s = new Set(selectedIds.value)
  checked ? s.add(id) : s.delete(id)
  selectedIds.value = s
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

const canCreate = computed(() => {
  if (!assigneeId.value) return false
  if (skuScope.value === 'specific' && selectedIds.value.size === 0) return false
  return true
})

function handleCreate() {
  emit('created')
  emit('close')
}
</script>

<template>
  <MpModal
    id="pr-modal"
    :is-open="open"
    size="xxl"
    is-centered
    is-close-on-esc
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
        <!-- ── PO info strip ─────────────────────────────────────────────── -->
        <div v-if="receipt" class="pr-po-card">
          <div class="pr-po-field">
            <span class="pr-po-label">Purchase no.</span>
            <span class="pr-po-value pr-po-value--bold">{{ receipt.purchaseNo }}</span>
          </div>
          <div class="pr-po-divider" />
          <div class="pr-po-field pr-po-field--grow">
            <span class="pr-po-label">Description</span>
            <span class="pr-po-value">{{ receipt.memo ?? '—' }}</span>
          </div>
          <div class="pr-po-divider" />
          <div class="pr-po-field">
            <span class="pr-po-label">Tracking no.</span>
            <span v-if="receipt.trackingNos.length" class="pr-po-tracking">
              <code v-for="t in receipt.trackingNos" :key="t" class="pr-po-tracking-chip">{{ t }}</code>
            </span>
            <span v-else class="pr-po-value">—</span>
          </div>
        </div>

        <!-- ── Assignee ──────────────────────────────────────────────────── -->
        <div class="pr-section">
          <MpFormControl id="pr-assignee-ctrl" :class="css({ maxWidth: '360px' })">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpPopover id="pr-assignee-pop" is-close-on-select>
              <MpPopoverTrigger>
                <MpSelect
                  id="pr-assignee-select"
                  placeholder="Select assignee"
                  :model-value="assigneeId"
                  :class="css({ width: '100%' })"
                  @mousedown.prevent
                >
                  <option v-if="assigneeId" :value="assigneeId">{{ assigneeLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="u in ASSIGNEES" :key="u.id"
                    :is-active="u.id === assigneeId"
                    @click="assigneeId = u.id"
                  >
                    <div class="pr-assignee-opt">
                      <span
                        class="pr-assignee-avatar"
                        :style="{ background: `hsl(${u.hue},50%,88%)`, color: `hsl(${u.hue},55%,35%)` }"
                      >{{ u.initials }}</span>
                      {{ u.name }}
                    </div>
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </MpFormControl>
        </div>

        <!-- ── SKU scope ─────────────────────────────────────────────────── -->
        <div class="pr-section">
          <MpFormControl id="pr-sku-scope-ctrl">
            <MpFormLabel>SKU scope</MpFormLabel>
            <div class="pr-radio-stack">
              <div class="pr-radio-card" :class="{ 'pr-radio-card--active': skuScope === 'all' }">
                <MpRadio id="pr-scope-all" name="pr-scope" value="all" v-model="skuScope">
                  Receive all SKUs
                  <template #description>Task covers every item in this purchase order.</template>
                </MpRadio>
              </div>
              <div class="pr-radio-card" :class="{ 'pr-radio-card--active': skuScope === 'specific' }">
                <MpRadio id="pr-scope-specific" name="pr-scope" value="specific" v-model="skuScope">
                  Select specific SKUs
                  <template #description>Choose which items this task covers — useful for split receiving.</template>
                </MpRadio>
              </div>
            </div>
          </MpFormControl>
        </div>

        <!-- ── SKU table (specific mode only) ───────────────────────────── -->
        <div v-if="skuScope === 'specific'" class="pr-sku-section">
          <div class="pr-sku-header-row">
            <span class="pr-sku-section-label">Items</span>
            <span class="pr-sku-count">{{ selectedIds.size }} of {{ lineItems.length }} selected</span>
          </div>

          <div class="pr-sku-wrap">
            <table class="pr-sku-table">
              <thead>
                <tr>
                  <th class="pr-th pr-th--check">
                    <MpCheckbox
                      id="pr-cb-all"
                      :is-checked="allSelected"
                      :is-indeterminate="someSelected"
                      @change="toggleAll"
                    />
                  </th>
                  <th class="pr-th pr-th--product">Product</th>
                  <th class="pr-th pr-th--sku">SKU</th>
                  <th class="pr-th pr-th--qty">Purchase qty</th>
                  <th class="pr-th pr-th--loc">Storage location</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in lineItems"
                  :key="item.productId"
                  class="pr-tr"
                  :class="{ 'pr-tr--selected': selectedIds.has(item.productId) }"
                  @click="toggleItem(item.productId, !selectedIds.has(item.productId))"
                >
                  <td class="pr-td pr-td--check" @click.stop>
                    <MpCheckbox
                      :id="`pr-cb-${item.productId}`"
                      :is-checked="selectedIds.has(item.productId)"
                      @change="(val) => toggleItem(item.productId, val)"
                    />
                  </td>
                  <td class="pr-td pr-td--product">
                    <div class="pr-product">
                      <div
                        class="pr-product-thumb"
                        :style="{ background: `hsl(${item.colorHue},50%,90%)` }"
                        aria-hidden="true"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="18" height="18" rx="2"
                            :stroke="`hsl(${item.colorHue},45%,55%)`" stroke-width="1.5"/>
                          <path :d="`M3 9h18M9 9v12`"
                            :stroke="`hsl(${item.colorHue},45%,55%)`" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                      </div>
                      <div class="pr-product-info">
                        <span class="pr-product-name">{{ item.productName }}</span>
                        <span class="pr-product-desc">{{ item.productDesc }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="pr-td pr-td--sku">
                    <code class="pr-sku-code">{{ item.sku }}</code>
                  </td>
                  <td class="pr-td pr-td--qty">{{ formatNum(item.purchaseQty) }}</td>
                  <td class="pr-td pr-td--loc">
                    <span class="pr-bin">{{ item.storageLocation }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="pr-footer">
          <MpButton variant="ghost" @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" :is-disabled="!canCreate" @click="handleCreate">
            Create purchase receiving
          </MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── PO info card ──────────────────────────────────────────────────────────── */
.pr-po-card {
  display: flex; align-items: flex-start; gap: 0;
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle);
  border-radius: var(--mp-radii-lg); padding: var(--mp-spacing-4) var(--mp-spacing-5);
  margin-bottom: var(--mp-spacing-6);
}
.pr-po-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); flex-shrink: 0; }
.pr-po-field--grow { flex: 1; min-width: 0; }
.pr-po-label {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  font-weight: var(--mp-font-weights-medium); white-space: nowrap;
}
.pr-po-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pr-po-value--bold { font-weight: var(--mp-font-weights-semi-bold); }
.pr-po-divider {
  width: 1px; background: var(--mp-border-subtle); align-self: stretch;
  margin: 0 var(--mp-spacing-5); flex-shrink: 0;
}
.pr-po-tracking { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.pr-po-tracking-chip {
  font-family: monospace; font-size: var(--mp-font-sizes-sm);
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral-hovered); color: var(--mp-text-default);
  border: 1px solid var(--mp-border-bold);
}

/* ── Sections ─────────────────────────────────────────────────────────────── */
.pr-section { margin-bottom: var(--mp-spacing-6); }

/* ── Assignee option ──────────────────────────────────────────────────────── */
.pr-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pr-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Radio card wrappers ──────────────────────────────────────────────────── */
.pr-radio-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pr-radio-card {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
  cursor: pointer; transition: border-color 120ms, background 120ms;
}
.pr-radio-card:hover { background: var(--mp-background-neutral); }
.pr-radio-card--active {
  border-color: var(--mp-border-accent);
  background: var(--mp-background-accent-subtle, #f0f5ff);
}

/* ── SKU table section ────────────────────────────────────────────────────── */
.pr-sku-section { margin-top: calc(var(--mp-spacing-6) * -0.5); }
.pr-sku-header-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--mp-spacing-2);
}
.pr-sku-section-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default);
}
.pr-sku-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pr-sku-wrap {
  border: 1px solid var(--mp-border-subtle); border-radius: var(--mp-radii-lg);
  overflow: hidden; max-height: 360px; overflow-y: auto;
}

/* ── Table ────────────────────────────────────────────────────────────────── */
.pr-sku-table { width: 100%; border-collapse: collapse; }
.pr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border-bottom: 1px solid var(--mp-border-subtle);
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
  position: sticky; top: 0; z-index: 1;
}
.pr-th--check { width: 44px; }
.pr-th--qty { text-align: right; width: 110px; }
.pr-th--sku { width: 140px; }
.pr-th--loc { width: 140px; }

.pr-tr {
  cursor: pointer; border-bottom: 1px solid var(--mp-border-subtle);
  transition: background 80ms;
}
.pr-tr:last-child { border-bottom: none; }
.pr-tr:hover { background: var(--mp-background-neutral); }
.pr-tr--selected { background: var(--mp-background-accent-subtle, #f0f5ff); }
.pr-tr--selected:hover { background: var(--mp-background-accent-subtle); }

.pr-td {
  padding: var(--mp-spacing-3) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle;
}
.pr-td--check { width: 44px; }
.pr-td--qty { text-align: right; }

/* ── Product cell ─────────────────────────────────────────────────────────── */
.pr-product { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-product-thumb {
  width: 44px; height: 44px; border-radius: var(--mp-radii-md); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
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
.pr-sku-code {
  font-family: monospace; font-size: var(--mp-font-sizes-sm);
  padding: 1px var(--mp-spacing-1\.5); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral-hovered); color: var(--mp-text-secondary);
  border: 1px solid var(--mp-border-subtle);
}
.pr-bin {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); letter-spacing: 0.02em;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.pr-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
