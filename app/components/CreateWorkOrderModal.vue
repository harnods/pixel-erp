<script setup lang="ts">
/**
 * CreateWorkOrderModal — "Create bulk work order" (from a product) or "Create work
 * order" (from a single production request). Lists the production requests (grouped
 * by sales order) with a per-request checkbox and an editable "qty to produce", plus
 * a running total. Self-contained Teleport overlay (this Pixel build ships no MpModal
 * structural CSS — see the pixel-overlay memory).
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  MpCheckbox, MpButton, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import { formatDate } from '~/utils/date'
import type { PrProduct, PrSource } from '~/data/productionRequests'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'

const props = defineProps<{ open: boolean; product: PrProduct | null; sources: PrSource[] | null }>()
const emit = defineEmits<{ close: [] }>()

// Bulk = launched from a product (all its sales orders); single = one request.
const isBulk = computed(() => props.sources == null)
const title = computed(() => (isBulk.value ? 'Bulk create work order' : 'Create work order'))

const shownSources = computed<PrSource[]>(() => props.sources ?? props.product?.sources ?? [])
const allRequests = computed(() => shownSources.value.flatMap(s => s.requests))

// Bill of materials — a work order can only be raised from an already-created BOM.
// Prefer BOMs that actually produce this product (matched by SKU); if none exist yet
// (this product has no BOM), fall back to the full BOM catalog so the flow never
// dead-ends — the user picks whichever BOM is the closest fit.
const bomOptions = computed(() => {
  const sku = props.product?.sku
  const matching = sku ? billOfMaterials.filter(b => catalogProduct(b.finishedGoodId)?.sku === sku) : []
  return (matching.length ? matching : billOfMaterials).map(b => ({ id: b.id, name: b.name }))
})
const bom = ref('')
const bomLabel = computed(() => bomOptions.value.find(o => o.id === bom.value)?.name ?? '')

// Per-request selection + per-request "qty to produce".
const selected = ref<Set<string>>(new Set())
const qtyToProduce = ref<Record<string, number>>({})

watch(() => props.open, (o) => {
  if (!o) return
  bom.value = bomOptions.value[0]?.id ?? ''
  selected.value = new Set(allRequests.value.map(r => r.requestNo))
  const q: Record<string, number> = {}
  for (const r of allRequests.value) q[r.requestNo] = r.requestedQty
  qtyToProduce.value = q
}, { immediate: true })

const allSelected = computed(() =>
  allRequests.value.length > 0 && allRequests.value.every(r => selected.value.has(r.requestNo)),
)
const someSelected = computed(() => selected.value.size > 0 && !allSelected.value)

function toggleRequest(requestNo: string) {
  const s = new Set(selected.value)
  s.has(requestNo) ? s.delete(requestNo) : s.add(requestNo)
  selected.value = s
}

// Qty to produce — clamp to [0, requested] on input (mirrors the put-away pattern).
function onQtyInput(requestNo: string, max: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > max) n = max
  qtyToProduce.value = { ...qtyToProduce.value, [requestNo]: n }
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(allRequests.value.map(r => r.requestNo))
}

const totalQty = computed(() =>
  allRequests.value.reduce((t, r) =>
    selected.value.has(r.requestNo) ? t + (Number(qtyToProduce.value[r.requestNo]) || 0) : t, 0),
)
const canContinue = computed(() => selected.value.size > 0 && totalQty.value > 0 && !!bom.value)

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))

const router = useRouter()
function handleContinue() {
  // Continue into the work order creation form, pre-set to the production-request
  // flow with the chosen (real, already-created) Bill of Materials prefilled.
  emit('close')
  const prNumber = allRequests.value.find(r => selected.value.has(r.requestNo))?.requestNo
  const prQuery = prNumber ? `&prNumber=${encodeURIComponent(prNumber)}` : ''
  router.push(`/work-orders/new?source=pr&bomId=${encodeURIComponent(bom.value)}${prQuery}`)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cwo-fade">
      <div v-if="open" class="cwo-scrim" @click="emit('close')">
        <div class="cwo-modal" role="dialog" :aria-label="title" @click.stop>
          <header class="cwo-header">
            <h2 class="cwo-header-title">{{ title }}</h2>
            <button class="cwo-close" aria-label="Close" @click="emit('close')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div v-if="product" class="cwo-body">
            <h3 class="cwo-product">{{ product.productName }}</h3>
            <p class="cwo-sku">SKU: {{ product.sku }}</p>

            <label class="cwo-field-label">Bill of materials</label>
            <div class="cwo-bom-field">
              <MpPopover id="cwo-bom" is-close-on-select>
                <MpPopoverTrigger>
                  <MpSelect id="cwo-bom-select" :model-value="bom" placeholder="Select bill of materials" is-full-width @mousedown.prevent>
                    <option :value="bom">{{ bomLabel }}</option>
                  </MpSelect>
                </MpPopoverTrigger>
                <MpPopoverContent>
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="opt in bomOptions" :key="opt.id"
                      :is-active="opt.id === bom" @click="bom = opt.id"
                    >{{ opt.name }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>

            <div class="cwo-table-wrap">
              <table class="cwo-table">
                <colgroup>
                  <col style="width: 260px" />
                  <col style="width: 220px" />
                  <col style="width: 130px" />
                  <col style="width: 150px" />
                  <col style="width: 90px" />
                  <col style="width: 150px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="cwo-th">
                      <span class="cwo-check-cell">
                        <MpCheckbox id="cwo-all" :is-checked="allSelected" :is-indeterminate="someSelected" @change="toggleAll" />
                        <span>Production request no.</span>
                      </span>
                    </th>
                    <th class="cwo-th">Sales order no.</th>
                    <th class="cwo-th cwo-th--right">Requested qty</th>
                    <th class="cwo-th">Qty to produce</th>
                    <th class="cwo-th">Unit</th>
                    <th class="cwo-th">Due date</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="src in shownSources" :key="src.sourceNo">
                    <tr v-for="(r, ri) in src.requests" :key="r.requestNo" class="cwo-tr">
                      <td class="cwo-td">
                        <span class="cwo-check-cell">
                          <MpCheckbox
                            :id="`cwo-r-${r.requestNo}`"
                            :is-checked="selected.has(r.requestNo)"
                            @change="toggleRequest(r.requestNo)"
                          />
                          <span>{{ r.requestNo }}</span>
                        </span>
                      </td>
                      <td v-if="ri === 0" class="cwo-td cwo-td--so" :rowspan="src.requests.length">
                        {{ src.sourceNo }}
                      </td>
                      <td class="cwo-td cwo-td--right">{{ r.requestedQty }}</td>
                      <td class="cwo-td cwo-td--input" :class="{ 'cwo-td--input-disabled': !selected.has(r.requestNo) }">
                        <input
                          class="cwo-qty-input"
                          type="number" min="0" :max="r.requestedQty"
                          :value="qtyToProduce[r.requestNo]"
                          :disabled="!selected.has(r.requestNo)"
                          :aria-label="`Qty to produce for ${r.requestNo}`"
                          @input="onQtyInput(r.requestNo, r.requestedQty, $event)"
                        />
                      </td>
                      <td class="cwo-td">Pcs</td>
                      <td class="cwo-td">{{ r.dueDate ? formatDate(r.dueDate) : '—' }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <div class="cwo-total">
              <span class="cwo-total-label">Total qty to produce</span>
              <span class="cwo-total-value">{{ totalQty }}</span>
            </div>
          </div>

          <footer class="cwo-footer">
            <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
            <MpButton variant="primary" is-rounded :is-disabled="!canContinue" @click="handleContinue">Proceed</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cwo-scrim {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(20, 23, 28, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: var(--mp-spacing-6);
}
.cwo-modal {
  width: min(1100px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

/* Header — 56px bar, title left + close right, divider below (Pixel modal pattern) */
.cwo-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
}
.cwo-header-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.cwo-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.cwo-close:hover { background: var(--mp-background-neutral-hovered); }

.cwo-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-6); }
.cwo-product { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cwo-sku { margin: var(--mp-spacing-0\.5) 0 var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cwo-field-label { display: block; margin-bottom: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* BOM select — constrain the select root so the chevron stays inside the field */
.cwo-bom-field { width: 280px; }
.cwo-bom-field :deep(.mp-select__root) { width: 280px; }

.cwo-table-wrap { margin-top: var(--mp-spacing-4); overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cwo-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cwo-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); text-align: left; white-space: nowrap;
}
.cwo-th:last-child { border-right: none; }
.cwo-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
/* Read-only ("disabled") columns — gray fill so the editable column stands out */
.cwo-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  white-space: nowrap; vertical-align: middle;
}
.cwo-td:last-child { border-right: none; }
.cwo-tr:last-child .cwo-td { border-bottom: none; }
.cwo-td--right { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.cwo-td--so { vertical-align: top; padding-top: var(--mp-spacing-3); }
.cwo-check-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* Editable column (Qty to produce) — white cell + in-cell focus ring, borderless
   full-cell input (mirrors the put-away "qty to store" pattern) */
.cwo-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.cwo-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.cwo-td--input-disabled { background: var(--mp-background-neutral-hovered); }
.cwo-qty-input {
  display: block; width: 100%; box-sizing: border-box; height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.cwo-qty-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; }

.cwo-total {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4) var(--mp-spacing-2);
}
.cwo-total-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cwo-total-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 32px; text-align: right; }

.cwo-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  flex-shrink: 0; padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}

.cwo-fade-enter-active, .cwo-fade-leave-active { transition: opacity 200ms ease; }
.cwo-fade-enter-from, .cwo-fade-leave-to { opacity: 0; }
</style>
