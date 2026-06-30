<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpCheckbox, MpAutocomplete,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css,
} from '@mekari/pixel3'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { getPickingTask } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import { outgoingOrders, skuLineQty } from '~/data/outgoing'
import { CATALOG } from '~/data/catalog'

const router = useRouter()
const route  = useRoute()

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

// ─── Source picking task ────────────────────────────────────────────────────────
const pickingId = route.query.pickingId as string | undefined
const pick = computed(() => (pickingId ? getPickingTask(pickingId) : undefined))
const warehouseName = computed(() => pick.value?.warehouseName ?? '')
// Display-only warehouse autocomplete (locked to the picking task's warehouse)
const warehouseAc = computed(() =>
  pick.value ? [{ id: pick.value.warehouseId, name: pick.value.warehouseName }] : [],
)
const warehouseId = ref(pick.value?.warehouseId ?? '')

// ─── Assignee ───────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
const assigneeLabel = computed(() => ASSIGNEES.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Picked items per sales order (what's available to pack) ─────────────────────
function seedNum(id: string): number { return Number(id.replace(/\D/g, '')) || 0 }
interface PackLine { key: string; sku: string; product: string; desc: string; img: string; unit: string; order: number; picked: number }
interface OrderTable { orderId: string; salesNo: string; customer: string; lines: PackLine[] }

const orderTables = computed<OrderTable[]>(() => {
  const p = pick.value
  if (!p) return []
  // Picking may have been short — only what was picked can be packed. Scale each
  // SKU's order qty by the picking task's pick ratio.
  const pickRatio = p.toPickQty > 0 ? p.pickedQty / p.toPickQty : 1
  return p.salesOrderIds.map((orderId, oi) => {
    const o = outgoingOrders.find(x => x.id === orderId)
    const n = Math.min(o?.skuQty ?? 0, CATALOG.length)
    const base = seedNum(orderId)
    const lines: PackLine[] = []
    for (let i = 0; i < n; i++) {
      const item = CATALOG[(base * 7 + i * 13) % CATALOG.length]!
      const order = skuLineQty(base, i)
      lines.push({
        key: `${orderId}::${item.sku}`,
        sku: item.sku, product: item.name, desc: item.desc, img: item.img,
        unit: item.unit, order, picked: Math.min(order, Math.round(order * pickRatio)),
      })
    }
    return {
      orderId,
      salesNo: p.salesNos[oi] ?? o?.salesNo ?? orderId,
      customer: o?.customer ?? '',
      lines,
    }
  })
})

// ─── Supervisor edits: include/exclude a SKU / a whole sales order (default on) ──
// Packed qty is NOT editable — packing packs exactly what was picked; any shortfall
// already happened at picking. The supervisor only chooses WHAT to pack.
const excludedKeys = ref(new Set<string>())
function isSelected(key: string) { return !excludedKeys.value.has(key) }
function toggleLine(key: string) {
  const s = new Set(excludedKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  excludedKeys.value = s
}
function tableKeys(t: OrderTable) { return t.lines.map(l => l.key) }
function allSel(t: OrderTable) { return t.lines.length > 0 && tableKeys(t).every(isSelected) }
function someSel(t: OrderTable) {
  const sel = tableKeys(t).filter(isSelected).length
  return sel > 0 && sel < t.lines.length
}
function toggleTable(t: OrderTable) {
  const s = new Set(excludedKeys.value)
  if (allSel(t)) tableKeys(t).forEach(k => s.add(k))
  else tableKeys(t).forEach(k => s.delete(k))
  excludedKeys.value = s
}

const orderError = ref(false)
const selectedTotals = computed(() => {
  let skus = 0, qty = 0, orders = 0
  for (const t of orderTables.value) {
    const sel = t.lines.filter(l => isSelected(l.key))
    if (sel.length) orders++
    skus += sel.length
    qty += sel.reduce((a, l) => a + l.picked, 0)
  }
  return { skus, qty, orders }
})

// ─── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goPacking() {
  router.push({ path: '/barang-keluar', query: { tab: 'Packing' } })
}

function handleCreate() {
  const p = pick.value
  if (!p) return
  let valid = true
  if (!assigneeId.value) { assigneeError.value = true; valid = false }
  if (selectedTotals.value.orders === 0) { orderError.value = true; valid = false }
  if (!valid) return

  // One packing task per sales order that has at least one selected SKU.
  for (const t of orderTables.value) {
    const sel = t.lines.filter(l => isSelected(l.key))
    if (!sel.length) continue
    addPackingTask({
      salesOrderId:  t.orderId,
      salesNo:       t.salesNo,
      pickingTaskId: p.id,
      pickingTaskNo: p.taskNo,
      warehouseId:   p.warehouseId,
      warehouseName: p.warehouseName,
      assignee:      assigneeLabel.value,
      skuQty:        sel.length,
      toPackQty:     sel.reduce((a, l) => a + l.picked, 0),
    })
  }

  router.push({ path: '/barang-keluar', query: { tab: 'Packing', saved: '1' } })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPacking">Packing</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New packing</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Not found -->
      <div v-if="!pick" class="pk-empty">
        <p class="pk-empty-title">Picking task not found</p>
        <p class="pk-empty-desc">This packing task must be created from a completed picking task.</p>
      </div>

      <template v-else>
        <!-- Source + Warehouse + Assignee -->
        <p class="pk-source">From <strong>{{ pick.taskNo }}</strong></p>
        <div class="pk-section pk-grid">
          <MpFormControl id="pc-warehouse" :class="css({ gridColumn: 'span 3' })">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete
              id="pc-warehouse-ac"
              v-model="warehouseId"
              :data="warehouseAc"
              label-prop="name"
              value-prop="id"
              placeholder="Warehouse"
              use-portal is-full-width is-disabled
            />
          </MpFormControl>

          <MpFormControl id="pc-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpAutocomplete
              id="pc-assignee-ac"
              v-model="assigneeId"
              :data="ASSIGNEES"
              label-prop="name"
              value-prop="id"
              placeholder="Select assignee"
              is-searchable is-clearable use-portal is-full-width
              :is-invalid="assigneeError"
            >
              <template #default="{ item }">
                <div class="pk-assignee-opt">
                  <span
                    class="pk-assignee-avatar"
                    :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                  >{{ item.initials }}</span>
                  {{ item.name }}
                </div>
              </template>
            </MpAutocomplete>
            <MpFormErrorMessage>You must select an assignee</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- Items to pack, per sales order -->
        <div class="pk-sku-section">
          <h2 class="pk-section-title">Items to pack</h2>
          <p class="pk-section-desc">One packing task is created per sales order. Adjust quantities or remove SKUs as needed.</p>
          <p v-if="orderError" class="pk-tasks-error">Select at least one SKU to pack.</p>

          <div v-for="t in orderTables" :key="t.orderId" class="pk-order-block">
            <div class="pk-order-head">
              <span @click.stop>
                <MpCheckbox
                  :id="`pc-ord-${t.orderId}`"
                  :is-checked="allSel(t)"
                  :is-indeterminate="someSel(t)"
                  @change="toggleTable(t)"
                />
              </span>
              <span class="pk-order-no">{{ t.salesNo }}</span>
              <span v-if="t.customer" class="pk-order-cust">{{ t.customer }}</span>
            </div>
            <section class="pk-items-section pk-items-section--bordered">
              <div class="pk-items-scroll">
                <table class="pk-items">
                  <colgroup>
                    <col style="width: 42%" />
                    <col style="width: 22%" />
                    <col style="width: 14%" />
                    <col style="width: 14%" />
                    <col style="width: 8%" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pk-th">Product</th>
                      <th class="pk-th">SKU</th>
                      <th class="pk-th pk-th--num">Order qty</th>
                      <th class="pk-th pk-th--num">Picked qty</th>
                      <th class="pk-th">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in t.lines"
                      :key="row.key"
                      class="pk-item-row"
                      :class="{ 'pk-item-row--off': !isSelected(row.key) }"
                    >
                      <td class="pk-td">
                        <div class="pk-cell-check">
                          <span @click.stop>
                            <MpCheckbox
                              :id="`pc-line-${row.key}`"
                              :is-checked="isSelected(row.key)"
                              @change="toggleLine(row.key)"
                            />
                          </span>
                          <ProductCell :name="row.product" :desc="row.desc" :image="row.img" />
                        </div>
                      </td>
                      <td class="pk-td"><span class="pk-sku-text">{{ row.sku }}</span></td>
                      <td class="pk-td pk-td--num">{{ formatNum(row.order) }}</td>
                      <td class="pk-td pk-td--num">{{ formatNum(row.picked) }}</td>
                      <td class="pk-td">{{ row.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <p v-if="selectedTotals.orders" class="pk-selection-summary">
            {{ selectedTotals.orders }} packing task{{ selectedTotals.orders > 1 ? 's' : '' }}
            &nbsp;·&nbsp;
            {{ formatNum(selectedTotals.skus) }} SKU{{ selectedTotals.skus !== 1 ? 's' : '' }}
            &nbsp;·&nbsp;
            {{ formatNum(selectedTotals.qty) }} to pack
          </p>
        </div>
      </template>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goPacking">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="!pick" @click="handleCreate">Save</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Source + form grid ──────────────────────────────────────────────────────── */
.pk-source { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pk-source strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.pk-section { margin-bottom: var(--mp-spacing-6); }
.pk-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.pk-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pk-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title ───────────────────────────────────────────────────────────── */
.pk-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.pk-section-desc { margin: 0 0 var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.pk-sku-section { margin-bottom: var(--mp-spacing-6); }
.pk-tasks-error { margin: 0 0 var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b); }

/* ── Per-order blocks ────────────────────────────────────────────────────────── */
.pk-order-block { margin-bottom: var(--mp-spacing-5); }
.pk-order-head { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.pk-order-no { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-order-cust { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Items table (form-table look) ───────────────────────────────────────────── */
.pk-items-section { display: flex; flex-direction: column; }
.pk-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pk-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pk-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.pk-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.pk-items thead .pk-th { position: sticky; top: 0; z-index: 1; }
.pk-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pk-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pk-th--check { width: var(--mp-sizes-12, 48px); }
.pk-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.pk-item-row:last-child .pk-td { border-bottom: none; }
.pk-item-row--off { opacity: 0.45; }
.pk-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.pk-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.pk-selection-summary { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Empty state ─────────────────────────────────────────────────────────────── */
.pk-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pk-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
