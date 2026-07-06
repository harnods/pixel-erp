<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon,
  MpInputTag, MpDatePicker,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
  type DataInterface,
} from '@mekari/pixel3'
import { warehouses } from '~/data/warehouses'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { addTransfer, updateTransfer, getTransfer, transferLineItems, transferMemo } from '~/data/warehouseTransfers'

// The catch-all route binds the id via the generic `orderId` prop. 'new' → create mode.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? getTransfer(props.orderId) : undefined))

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Warehouse options (all active, default included — a transfer can start anywhere) ─
const warehouseOptions = computed(() =>
  warehouses.filter(w => w.status === 'active').map(w => ({ id: w.id, name: w.name })),
)
const realWarehouses = warehouses.filter(w => w.status === 'active' && !w.isDefault)
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }

// ── Form state ───────────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const originId = ref(realWarehouses[0]?.id ?? '')
const destId = ref(realWarehouses[1]?.id ?? '')
const originError = ref(false)
const destError = ref(false)
const tags = ref<DataInterface[]>([])
const memo = ref('')

// ── Origin / destination stock (coherent with the warehouse detail pages) ──────────
const originStock = computed(() => (originId.value ? getWarehouseDetail(originId.value)?.stock ?? [] : []))
const destStock = computed(() => (destId.value ? getWarehouseDetail(destId.value)?.stock ?? [] : []))
const originStockMap = computed(() => new Map(originStock.value.map(s => [s.sku, s])))
const destStockMap = computed(() => new Map(destStock.value.map(s => [s.sku, s])))
const productOptions = computed(() => originStock.value.map(s => {
  const p = productBySku(s.sku)
  return { id: s.sku, name: s.name, desc: p?.desc ?? '', img: p?.img ?? s.photo, unit: s.unit }
}))
// Product picker: `activeRow` is the row whose picker is open (its trigger shows the
// search field); `prodSearch` is that field's text. Only one is open at a time.
const prodSearch = ref('')
const activeRow = ref<number | null>(null)
function closePicker(row: { id: number }) { if (activeRow.value === row.id) activeRow.value = null }

function availableFor(sku: string): number { return originStockMap.value.get(sku)?.available ?? 0 }
function onHandFor(sku: string): number | undefined { return destStockMap.value.get(sku)?.onHand }

// ── Product line rows ──────────────────────────────────────────────────────────────
interface LineRow { id: number; sku: string; productName: string; desc: string; img: string; unit: string; qty: string; qtyError: boolean }
let rowSeq = 0
function makeRow(): LineRow { return { id: rowSeq++, sku: '', productName: '', desc: '', img: '', unit: '', qty: '0', qtyError: false } }
const rows = ref<LineRow[]>([makeRow()])

function onProductSelect(row: LineRow, sku: string) {
  const p = productBySku(sku)
  if (!p) { row.productName = ''; row.desc = ''; row.img = ''; row.unit = ''; return }
  row.sku = sku
  row.productName = p.name
  row.desc = p.desc
  row.img = p.img
  row.unit = p.unit
  activeRow.value = null
  prodSearch.value = ''
  // Auto-append an empty row when the last row gets a product.
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter(r => r.id !== id)
}
function afterTransfer(row: LineRow): number { return (onHandFor(row.sku) ?? 0) + (Number(row.qty) || 0) }
// Origin stock left after this transfer — shown as a second line in the Available cell.
function originAfter(row: LineRow): number { return availableFor(row.sku) - (Number(row.qty) || 0) }

// Transfer qty is capped at the origin's available qty.
function setQty(row: LineRow, val: string) {
  const cap = availableFor(row.sku)
  let n = Math.max(0, Math.floor(Number(val) || 0))
  if (n > cap) n = cap
  row.qty = String(n)
  row.qtyError = false
}

// A product already chosen in another row is hidden from a row's picker.
const usedSkus = computed(() => new Set(rows.value.filter(r => r.sku).map(r => r.sku)))
function optionsForRow(row: LineRow) {
  const q = prodSearch.value.trim().toLowerCase()
  return productOptions.value.filter(o => {
    if (o.id !== row.sku && usedSkus.value.has(o.id)) return false
    return !q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
  })
}

const filledRows = computed(() => rows.value.filter(r => r.sku))

// ── Search over added products (add-row always stays) ───────────────────────────────
const search = ref('')
const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => !r.sku || r.productName.toLowerCase().includes(q))
})
function importProducts() { /* bulk import — not built in this prototype */ }

// ── Tags ─────────────────────────────────────────────────────────────────────────
function onTagsChange(data: DataInterface[]) { tags.value = data }
function tagStrings(): string[] {
  return tags.value.map(t => String(t.text ?? t.value ?? '')).map(s => s.trim()).filter(Boolean)
}

// ── Attachment ─────────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) for (const f of Array.from(input.files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Prefill (edit mode) ──────────────────────────────────────────────────────────
function prefill() {
  const t = editing.value
  if (!t) return
  transactionDate.value = toDisplayDate(t.date)
  originId.value = t.originId
  destId.value = t.destinationId
  memo.value = transferMemo(t)
  tags.value = t.tags.map(tag => ({ text: tag, id: `tag-${tag}`, value: tag }))
  const lines = transferLineItems(t)
  rows.value = lines.length
    ? [...lines.map(l => ({ id: rowSeq++, sku: l.sku, productName: l.product.name, desc: l.product.desc, img: l.product.img, unit: l.unit, qty: String(l.qty), qtyError: false })), makeRow()]
    : [makeRow()]
}
onMounted(() => { if (isEdit.value) prefill() })

// ── Navigation + save ──────────────────────────────────────────────────────────────
function goBack() {
  if (isEdit.value) router.push(`/warehouse-transfers/${props.orderId}`)
  else router.push('/warehouse-transfers')
}
const formError = ref('')
function handleSave() {
  let valid = true
  formError.value = ''
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!originId.value) { originError.value = true; valid = false }
  if (!destId.value) { destError.value = true; valid = false }
  if (originId.value && destId.value && originId.value === destId.value) {
    destError.value = true; valid = false
    formError.value = 'Origin and destination warehouse must be different.'
  }
  const filled = filledRows.value
  if (!filled.length) { formError.value = formError.value || 'Add at least one product to transfer.'; valid = false }
  for (const row of filled) {
    const qty = Number(row.qty)
    if (!qty || qty < 1) { row.qtyError = true; valid = false }
    else if (qty > availableFor(row.sku)) { row.qtyError = true; valid = false; formError.value = formError.value || 'Transfer qty cannot exceed available stock.' }
    else row.qtyError = false
  }
  if (!valid) return

  const input = {
    date: toISODate(transactionDate.value),
    originId: originId.value,
    originName: warehouseName(originId.value),
    destinationId: destId.value,
    destinationName: warehouseName(destId.value),
    tags: tagStrings(),
    memo: memo.value.trim() || undefined,
    lines: filled.map(r => ({ sku: r.sku, qty: Number(r.qty) })),
  }

  if (isEdit.value) {
    updateTransfer(props.orderId, input)
    toast.notify({ variant: 'success', title: 'Warehouse transfer updated' })
    router.push(`/warehouse-transfers/${props.orderId}`)
  } else {
    const t = addTransfer(input)
    toast.notify({ variant: 'success', title: 'Warehouse transfer created' })
    router.push('/warehouse-transfers')
  }
}

// ── Sticky footer divider ────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkStageOverflow()
  stageObserver = new ResizeObserver(checkStageOverflow)
  if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
}))
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">All warehouse transfers</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? 'Edit warehouse transfer' : 'New warehouse transfer' }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="wtf-body">

        <!-- Header fields — 3 columns -->
        <div class="wtf-form-grid">
          <MpFormControl id="wtf-txdate" class="wtf-f-date" is-required :is-invalid="transactionDateError">
            <MpFormLabel>Transaction date</MpFormLabel>
            <div class="wtf-datepicker">
              <MpDatePicker
                id="wtf-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format"
                use-portal @update:model-value="transactionDateError = false"
              />
            </div>
            <MpFormErrorMessage>Please enter a transaction date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="wtf-transno" class="wtf-f-transno">
            <div class="wtf-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="wtf-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="wtf-transno-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl id="wtf-tags" class="wtf-f-tags">
            <MpFormLabel>Tags</MpFormLabel>
            <MpInputTag
              id="wtf-tags-input" placeholder="Select tag" :data="tags"
              :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange"
            />
          </MpFormControl>

          <MpFormControl id="wtf-origin" class="wtf-f-origin" is-required :is-invalid="originError">
            <MpFormLabel>Origin warehouse</MpFormLabel>
            <MpAutocomplete
              id="wtf-origin-ac" v-model="originId" :data="warehouseOptions" label-prop="name" value-prop="id"
              is-searchable use-portal is-full-width :is-invalid="originError"
              @update:model-value="originError = false"
            />
            <MpFormErrorMessage>Please select an origin warehouse</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="wtf-dest" class="wtf-f-dest" is-required :is-invalid="destError">
            <MpFormLabel>Destination warehouse</MpFormLabel>
            <MpAutocomplete
              id="wtf-dest-ac" v-model="destId" :data="warehouseOptions" label-prop="name" value-prop="id"
              is-searchable use-portal is-full-width :is-invalid="destError"
              @update:model-value="destError = false"
            />
            <MpFormErrorMessage>Please select a destination warehouse</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- Product table toolbar -->
        <div class="wtf-table-toolbar">
          <div class="wtf-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="wtf-search-input" type="text" placeholder="Search..." />
          </div>
          <button class="wtf-import-btn" type="button" @click="importProducts">Import</button>
        </div>

        <!-- Product table -->
        <div class="wtf-table-section">
          <div class="wtf-table-scroll">
            <table class="wtf-table">
              <colgroup>
                <col class="wtf-col-prod" />
                <col class="wtf-col-sku" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-unit" />
                <col class="wtf-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wtf-th" rowspan="2">Product</th>
                  <th class="wtf-th" rowspan="2">SKU</th>
                  <th class="wtf-th wtf-th--group" colspan="2">Origin</th>
                  <th class="wtf-th wtf-th--group" colspan="2">Destination</th>
                  <th class="wtf-th" rowspan="2">Unit</th>
                  <th class="wtf-th wtf-th--del" rowspan="2" />
                </tr>
                <tr>
                  <th class="wtf-th wtf-th--num">Available qty</th>
                  <th class="wtf-th wtf-th--num">Transfer qty</th>
                  <th class="wtf-th wtf-th--num">On hand qty</th>
                  <th class="wtf-th wtf-th--num">After transfer qty</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayRows" :key="row.id" class="wtf-tr">
                  <td class="wtf-td wtf-td--prod">
                    <MpPopover :id="`wtf-prod-${row.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closePicker(row)">
                      <MpPopoverTrigger>
                        <div class="wtf-prod-trigger">
                          <img v-if="row.sku" class="wtf-prod-thumb" :src="row.img" :alt="row.productName" loading="lazy" />
                          <span class="wtf-prod-field">
                            <input
                              :id="`wtf-prod-input-${row.id}`" class="wtf-prod-input" type="text" autocomplete="off"
                              :value="activeRow === row.id ? prodSearch : row.productName"
                              :placeholder="row.sku ? 'Search product…' : 'Select product'"
                              @focus="activeRow = row.id; prodSearch = ''"
                              @input="activeRow = row.id; prodSearch = ($event.target as HTMLInputElement).value"
                            />
                            <span v-if="row.sku && activeRow !== row.id" class="wtf-prod-desc">{{ row.desc }}</span>
                          </span>
                          <svg class="wtf-prod-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '360px', maxHeight: '360px', overflowY: 'auto', padding: '0' })">
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="opt in optionsForRow(row)" :key="opt.id"
                            :is-active="opt.id === row.sku" @click="onProductSelect(row, opt.id)"
                          >
                            <span class="wtf-prod-opt">
                              <img class="wtf-prod-thumb" :src="opt.img" :alt="opt.name" loading="lazy" />
                              <span class="wtf-prod-info">
                                <span class="wtf-prod-name">{{ opt.name }}</span>
                                <span class="wtf-prod-desc wtf-prod-desc--one">{{ opt.desc }}</span>
                              </span>
                            </span>
                          </MpPopoverListItem>
                          <p v-if="!optionsForRow(row).length" class="wtf-prod-none">No products found.</p>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <!-- Chosen product → full set of columns. Empty add-row → one filler
                       cell spanning to the right edge (product column keeps its width). -->
                  <template v-if="row.sku">
                    <td class="wtf-td wtf-td--muted">{{ row.sku }}</td>
                    <td class="wtf-td wtf-td--num">
                      <span class="wtf-avail">
                        <span>{{ availableFor(row.sku).toLocaleString('id-ID') }}</span>
                        <span v-if="Number(row.qty) > 0" class="wtf-avail-after" title="Available after transfer">→ {{ originAfter(row).toLocaleString('id-ID') }}</span>
                      </span>
                    </td>
                    <td class="wtf-td wtf-td--input">
                      <input
                        :id="`wtf-qty-${row.id}`" class="wtf-qty-input" type="number" min="0" :max="availableFor(row.sku)"
                        :value="row.qty"
                        @input="setQty(row, ($event.target as HTMLInputElement).value)"
                      />
                    </td>
                    <td class="wtf-td wtf-td--num">
                      {{ onHandFor(row.sku) === undefined ? '—' : onHandFor(row.sku)!.toLocaleString('id-ID') }}
                    </td>
                    <td class="wtf-td wtf-td--num">{{ afterTransfer(row).toLocaleString('id-ID') }}</td>
                    <td class="wtf-td wtf-td--muted">{{ row.unit }}</td>
                    <td class="wtf-td wtf-td--del">
                      <button class="wtf-del-btn" type="button" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </button>
                    </td>
                  </template>
                  <td v-else class="wtf-td wtf-td--empty" colspan="7" />
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wtf-count">Showing {{ filledRows.length }} of {{ filledRows.length }} products</div>
          <p v-if="formError" class="wtf-form-error">{{ formError }}</p>
        </div>

        <!-- Memo -->
        <div class="wtf-section wtf-section--gap-top">
          <MpFormControl id="wtf-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="wtf-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="wtf-helper-text">Only visible to you and your team</p>
        </div>

        <!-- Attachment -->
        <div class="wtf-section wtf-section--last">
          <div class="wtf-section-label">Attachment</div>
          <div class="wtf-attachment">
            <input
              ref="fileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="wtf-file-hidden" @change="onFileChange"
            />
            <div class="wtf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="wtf-attach-or">or drag and drop here</span>
            </div>
            <p class="wtf-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="attachedFiles.length" class="wtf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="wtf-file-item">
                <span class="wtf-file-name">{{ f.name }}</span>
                <button class="wtf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ isEdit ? 'Save changes' : 'Save' }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; transition: border-top-color 0.15s; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.wtf-body { display: flex; flex-direction: column; }

/* ── Header field grid (3 × 318px, responsive shrink) ─────────────────────── */
.wtf-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 318px));
  column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4);
  align-items: start;
}
.wtf-f-date    { grid-column: 1; grid-row: 1; }
.wtf-f-transno { grid-column: 2; grid-row: 1; }
.wtf-f-tags    { grid-column: 3; grid-row: 1; }
.wtf-f-origin  { grid-column: 1; grid-row: 2; }
.wtf-f-dest    { grid-column: 1; grid-row: 3; }
.wtf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.wtf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.wtf-datepicker { width: 100%; }
.wtf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Table toolbar (search + import, right-aligned) ───────────────────────── */
.wtf-table-toolbar { margin-top: 32px; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
.wtf-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.wtf-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wtf-search-input::placeholder { color: var(--mp-text-placeholder); }
.wtf-import-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4); border: 1px solid var(--mp-background-inverse, #080d0e); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-inverse, #080d0e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.wtf-import-btn:hover { opacity: 0.9; }

/* ── Table ─────────────────────────────────────────────────────────────────── */
.wtf-table-section { margin-top: var(--mp-spacing-5); }
.wtf-table-scroll { overflow-x: auto; }
.wtf-table { width: 100%; table-layout: auto; border-collapse: collapse; border-spacing: 0; min-width: 860px; }
/* Proportional column widths; the remove column hugs its icon button (width:1px →
   shrinks to min-content in auto layout) and sits at the right edge. */
.wtf-col-prod { width: 24%; }
.wtf-col-sku  { width: 12%; }
.wtf-col-num  { width: 14%; }
.wtf-col-unit { width: 8%; }
.wtf-col-del  { width: 44px; }
/* Form-row table: header + editable cells are white; read-only cells are grey
   (matches the picking / packing creation form-table look). */
.wtf-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.wtf-th:last-child { border-right: none; }
.wtf-th--group { text-align: center; padding: var(--mp-spacing-1) var(--mp-spacing-2); }
.wtf-th--num { text-align: center; padding: var(--mp-spacing-1) var(--mp-spacing-2); }
.wtf-th--del { padding: 0; }
.wtf-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default);
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.wtf-td:last-child { border-right: none; }
.wtf-td--muted { color: var(--mp-text-secondary); }
/* Empty add-row filler — plain white, spans to the right edge */
.wtf-td--empty { background: var(--mp-background-neutral, #fff); }
.wtf-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
/* Available qty cell — current available + (muted) available-after-transfer */
.wtf-avail { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.wtf-avail-after { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
/* Editable cells — white, control fills edge-to-edge, focus ring */
.wtf-td--input { padding: 0; vertical-align: middle; background: var(--mp-background-neutral, #fff); }
/* Native qty input fills the cell; the cell's focus ring is the ONLY border. */
.wtf-qty-input {
  width: 100%; text-align: right;
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none;
}
/* Strip the Pixel control's own border + focus ring so it doesn't double up with the
   cell ring — single gray focus border (same grey as the search input), full row height. */
.wtf-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; box-shadow: none !important; }
.wtf-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }

/* Product cell — a changeable combobox: rich trigger [photo | name/desc | chevron]. */
.wtf-td--prod { padding: 0; background: var(--mp-background-neutral, #fff); vertical-align: middle; }
.wtf-td--prod:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.wtf-prod-trigger {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%;
  min-height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: none; border: none; cursor: text; text-align: left;
}
.wtf-prod-field { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); flex: 1; min-width: 0; }
.wtf-prod-input {
  width: 100%; border: none; outline: none; background: none; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  overflow: hidden; text-overflow: ellipsis;
}
.wtf-prod-input::placeholder { color: var(--mp-text-placeholder); }
.wtf-prod-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.wtf-prod-thumb { width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px); border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.wtf-prod-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.wtf-prod-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtf-prod-desc {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wtf-prod-desc--one { -webkit-line-clamp: 1; }
/* Dropdown list */
.wtf-prod-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.wtf-prod-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wtf-td--del { padding: 0; text-align: center; }
.wtf-del-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.wtf-del-btn:hover { background: var(--mp-background-neutral); color: var(--mp-text-danger, #dc2626); }
.wtf-count { padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wtf-form-error { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* ── Memo + Attachment ───────────────────────────────────────────────────── */
.wtf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-6) 0; }
.wtf-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.wtf-section--last { padding-top: 20px; }
.wtf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.wtf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.wtf-file-hidden { display: none; }
.wtf-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wtf-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.wtf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wtf-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.wtf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.wtf-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.wtf-file-remove:hover { color: var(--mp-text-default); }
</style>
