<!-- prod-parity-aligned: jurnal-transaction-frontend/src/modules/sales/deliveries/views/SalesDeliveryCreateView.vue -->
<script setup lang="ts">
/**
 * "Create sales delivery" form (adapted from the sales invoice form) — Sales ▸ Sales invoices ▸ New sales invoice
 * (Figma: Sales - Sales Invoices node 9152-107281).
 *
 * Page shell / header grid / footer follow PurchaseOrderFormPage.vue; the
 * line-items table, its prefix-suffix cells and its error treatment follow
 * NewExpensePage.vue, which is the ERP's reference implementation for all
 * three (see the ERP line-items + transaction-error pattern notes).
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea,
  MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpDatePicker, MpInputTag, MpCheckbox, MpUpload, MpUploadList,
  MpAutocomplete, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, MpTextlink, toast, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import type { DataInterface } from '@mekari/pixel3'
import {
  customers, products, salesDeliveries,
  PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS, TAX_OPTIONS,
} from '~/data'
import { salesOrders } from '~/data/salesOrders'
import { deliveredByLine, derivedQty, orderLock, releaseInputBasis, canReleaseInputBasis, isInClosedPeriod, isFullyDelivered } from '~/data/salesDeliveries'
import { lockDate } from '~/data/closeBooks'
import ReleaseInputBasisModal from '~/components/patterns/ReleaseInputBasisModal.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { useSalesDeliveryViewAs } from '~/composables/useSalesDeliveryViewAs'
import { takePendingAttachments } from '~/data/fileAttachmentHandoff'
import type { SalesDelivery } from '~/data/types'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

/**
 * A delivery raised from a sales order (`?order=SO101`) draws down that order's
 * lines, so the form carries the ordered quantity and how much of it has already
 * gone out. Without the order there is nothing to take a percentage OF, which is
 * why this link is Wave 0 of docs/plans/percentage-based-sales-delivery.md.
 * Deliveries created straight from the list keep working with no order.
 */
/**
 * OD-010. `/sales-deliveries/:id/edit` reuses this form; the router passes the
 * delivery id as `orderId` (its generic id prop), `'new'` on create. An edit of a
 * contract delivery takes its order from the delivery itself, not the query.
 */
const props = defineProps<{ orderId?: string }>()
const editing = computed(() => {
  const id = props.orderId && props.orderId !== 'new' ? props.orderId : null
  return id ? salesDeliveries.find(d => d.id === id) ?? null : null
})
/** A delivery inside a closed accounting period cannot be edited (R-19). */
const editLocked = computed(() => !!editing.value && isInClosedPeriod(editing.value, lockDate()))

/**
 * Nothing left to deliver on the source order — every line at 100%. A NEW delivery
 * has nothing to draw down, so the table gives way to an empty state (PRD UX flow ›
 * Empty state). An edit is unaffected: it re-checks against everything else.
 */
const nothingLeft = computed(() => !editing.value && !!sourceOrder.value && isFullyDelivered(sourceOrder.value))

const sourceOrder = computed(() => {
  const id = editing.value?.orderId ?? String(route.query.order ?? '')
  return id ? salesOrders.find(o => o.id === id) ?? null : null
})
// On edit, everything ELSE delivered against the order — the limit re-check must
// not count the delivery being edited against itself (R-17).
const deliveredSoFar = computed(() =>
  sourceOrder.value ? deliveredByLine(sourceOrder.value.id, editing.value?.id) : {})

function todayISO() { return new Date().toISOString().slice(0, 10) }
function isoToDMY(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function dmyToIso(dmy: string) {
  if (!dmy) return todayISO()
  const [d, m, y] = dmy.split('/')
  return `${y}-${m}-${d}`
}
function toTagData(values: string[]): DataInterface[] {
  return values.map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false }))
}

// ── Header fields ─────────────────────────────────────────────────────────────
const customerId      = ref('')
const customerError   = ref(false)
const customerOptions = customers.map(c => ({ id: c.id, name: c.name }))

const emailTags      = ref<DataInterface[]>([])
const billingAddress = ref('')
const shipTo         = ref('')
const txDate         = ref(isoToDMY(todayISO()))
const shipDate       = ref('')
const shipVia        = ref('')
const paymentTerms   = ref('')
const trackingNo     = ref('')
const referenceNo    = ref('')
const warehouse      = ref('')
const tagsList       = ref<DataInterface[]>([])

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Sales Delivery #${nextDeliveryNumber()}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// Both default on so the form opens in the state the design documents.
const requiresShipping = ref(true)
const shipToDifferent  = ref(true)
const priceIncludesTax = ref(false)

function onEmailChange(data: DataInterface[]) { emailTags.value = data }
function onTagsChange(data: DataInterface[])  { tagsList.value = data }

// Picking a customer seeds the email chip list — the only header field the
// customer master actually carries (there's no address on the record).
function onCustomerChange(id: unknown) {
  customerError.value = false
  const c = customers.find(x => x.id === id)
  if (c?.email && !emailTags.value.length) emailTags.value = toTagData([c.email])
}

// ── Line items ────────────────────────────────────────────────────────────────
interface LineItem {
  _key: number
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  taxLabel: string
  productError: boolean
  qtyError: boolean
  /** A hand-added line in Percentage: the base quantity typed in Qty ordered is missing. */
  baseQtyError: boolean
  /** Set only on an order-sourced line: which order line it draws down, and that
   *  line's ordered quantity. `null` on a free-standing delivery. */
  orderLineIndex: number | null
  orderedQty: number | null
  /**
   * OD-001. `qty` above is always the posting basis (R-03). In percent mode the
   * user types `inputValue` and `qty` is derived from it; in qty mode the two are
   * the same number. Both are saved, so the document can show what was typed.
   */
  inputMode: 'qty' | 'percent'
  inputValue: number
  /** A hand-added line has no ordered quantity, so in Percentage the user types
   *  the base the percentage applies to (in the Qty ordered cell). */
  baseQty: number
}

/** What a percentage is taken of: the ordered qty, or a hand-added line's typed base. */
function basisOf(item: LineItem): number | null {
  if (item.orderedQty !== null) return item.orderedQty
  return item.baseQty > 0 ? item.baseQty : null
}

/**
 * Re-derives `qty` from whatever the user typed. Percent is always against the
 * ORDERED quantity, never the remaining balance (R-02), so a second tranche of
 * 33% means the same number of units as the first.
 */
function applyInput(item: LineItem, value: number) {
  item.inputValue = Number.isFinite(value) ? value : 0
  const basis = basisOf(item)
  item.qty = item.inputMode === 'percent'
    ? (basis === null ? 0 : derivedQty(basis, item.inputValue))
    : item.inputValue
  item.qtyError = false
}

/** A hand-added line's base changed — re-derive what its percentage produces. */
function setBaseQty(item: LineItem, value: number) {
  item.baseQty = Number.isFinite(value) ? value : 0
  item.baseQtyError = false
  applyInput(item, item.inputValue)
}

/**
 * OD-001. One input method for the whole delivery, set above the table — every
 * line is entered the same way. Quantity is preselected unless the order is
 * locked to Percentage (see orderLockInfo).
 */
const inputMode = ref<'qty' | 'percent'>('qty')

function setInputMode(mode: unknown) {
  const next = mode === 'percent' ? 'percent' : 'qty'
  if (next === inputMode.value) return
  // Belt and braces: the dropdown is disabled while locked, but the lock is a
  // rule, not a UI state (R-09).
  if (next === 'qty' && orderLockInfo.value) return
  inputMode.value = next
  // Switching method clears every figure rather than reinterpreting it: 5 units
  // and 5 percent are different claims, and silently converting one into the
  // other is exactly the unrecorded arithmetic this feature removes.
  for (const it of items.value) {
    it.inputMode = next
    applyInput(it, 0)
  }
}

// "Percentage", not "Percent" — the BOM form's Allocation method already uses it.
const MODE_OPTIONS = computed(() => [
  { value: 'qty', label: t('Quantity') },
  { value: 'percent', label: t('Percentage') },
])

/**
 * OD-003. An order first delivered by percent is locked to percent: two people
 * must not record progress on the same order on different bases. `lockBump`
 * re-reads the lock after a release, which mutates module state the template
 * cannot track on its own.
 */
const lockBump = ref(0)
/** Who is acting — the prototype's View as switch in the header (R-16). */
const { currentUser: actingUser } = useSalesDeliveryViewAs()
const mayRelease = computed(() => canReleaseInputBasis(actingUser.value))
const orderLockInfo = computed(() => {
  void lockBump.value
  return sourceOrder.value ? orderLock(sourceOrder.value.id) : null
})

const releaseOpen = ref(false)
const releaseLabel = computed(() => (sourceOrder.value ? `${t('Sales Order')} #${sourceOrder.value.number}` : ''))
const releaseLockedBy = computed(() => (orderLockInfo.value ? `${t('Sales Delivery')} #${orderLockInfo.value.number}` : ''))
function doRelease(reason: string) {
  if (!sourceOrder.value) return
  if (!releaseInputBasis(sourceOrder.value.id, actingUser.value, reason)) return
  lockBump.value += 1
  toast.notify({ variant: 'success', title: t('Input method released'), rootProps: { class: 'toast-enterprise' } })
}
let _seq = 0
const items = ref<LineItem[]>([])

/** Delivered to date on this line, in the order's units (PRD R-05). */
function deliveredQtyOf(item: LineItem): number {
  return item.orderLineIndex === null ? 0 : (deliveredSoFar.value[item.orderLineIndex] ?? 0)
}
/** What is still owed on the line — the ceiling the over-delivery check uses (R-06). */
function remainingQtyOf(item: LineItem): number {
  if (item.orderedQty === null) return 0
  return Math.max(0, item.orderedQty - deliveredQtyOf(item))
}

/**
 * OD-004. The same progress as a percentage of the ordered quantity. Users think
 * in cumulative contract percentage but entry is per-document and incremental, so
 * both numbers are shown beside the increment being typed (R-05) — that pairing
 * is half the control against double-delivering the same progress.
 */
function pctOf(qty: number, ordered: number | null): number | null {
  return ordered && ordered > 0 ? (qty / ordered) * 100 : null
}
/** Percent for display — up to two decimals, trailing zeros trimmed. */
function formatPct(n: number): string {
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
}
function pctText(qty: number, ordered: number | null): string {
  const p = pctOf(qty, ordered)
  return p === null ? '' : formatPct(p)
}

/**
 * The order's progress as one figure, or `Mixed` when its lines disagree (E-01).
 * A single number would hide that one line is at 50% and another at nothing —
 * exactly the state a return leaves behind — so the per-line figures above stay
 * visible either way and this only summarises when it honestly can.
 */
const orderProgress = computed<string | null>(() => {
  const o = sourceOrder.value
  if (!o) return null
  const pcts = items.value
    .filter(it => it.orderedQty !== null)
    .map(it => pctOf(deliveredQtyOf(it), it.orderedQty))
    .filter((p): p is number => p !== null)
  if (!pcts.length) return null
  const first = pcts[0]!
  // Tolerance, not equality: these are derived from six-decimal quantities.
  return pcts.every(p => Math.abs(p - first) < 0.005) ? formatPct(first) : t('Mixed')
})

// Prefill every order line, so the user draws the order down rather than
// retyping it. Customer comes from the order too — it cannot differ.
watch(sourceOrder, (o) => {
  if (!o) return
  customerId.value = o.customer.id
  onCustomerChange(o.customer.id)
  if (editing.value) txDate.value = isoToDMY(editing.value.date)
  // An edit keeps the method it was saved in (R-17 — "uses the locked basis").
  // Otherwise a locked order opens in Percentage; a free one defaults to Quantity
  // (PRD: "Quantity is preselected when nothing has been delivered").
  inputMode.value = editing.value?.items?.[0]?.inputMode ?? (orderLock(o.id) ? 'percent' : 'qty')
  items.value = o.items.map((it, i) => {
    // What this delivery recorded on the line, when editing (mode, typed figure, qty).
    const mine = editing.value?.items?.find(l => l.orderLineIndex === i)
    return {
    _key: ++_seq,
    product: it.product,
    sku: it.sku,
    description: mine?.description ?? it.description,
    qty: mine?.qty ?? 0,
    unit: it.unit,
    unitPrice: it.unitPrice,
    discountPct: it.discountPct,
    taxLabel: 'PPN 11%',
    productError: false,
    qtyError: false,
    baseQtyError: false,
    orderLineIndex: i,
    orderedQty: it.qty,
    inputMode: inputMode.value,
    inputValue: mine?.inputValue ?? 0,
    baseQty: 0,
  } as LineItem
  })
}, { immediate: true })

function removeItem(key: number) { items.value = items.value.filter(it => it._key !== key) }
function lineAmount(item: LineItem) {
  return Math.round(item.qty * item.unitPrice * (1 - item.discountPct / 100))
}

/**
 * OD-002. What the typed percentage produces, shown while it is typed so the
 * figure can be checked against the BAST before saving — "5,28 unit ·
 * Rp132.000.000". Only in percent mode: in quantity mode the number typed IS
 * the quantity, so there is no derivation to preview.
 */
function showPreview(item: LineItem): boolean {
  return item.inputMode === 'percent' && basisOf(item) !== null
}

/** Up to six decimals, trailing zeros trimmed, decimal comma (PRD R-03). */
function formatQty(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

function productMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return products
  return products.filter(p => p.name.toLowerCase().includes(q))
}

const NEW_ROW_KEY = -1
const openProductRow = ref<number | null>(null)

function selectProduct(item: LineItem, p: typeof products[number]) {
  item.product = p.name
  item.sku = p.code
  item.unit = p.unit
  item.unitPrice = p.price
  item.productError = false
  openProductRow.value = null
}

const newRowSearch = ref('')
function onProductAdd(_search?: string) { /* open create-product flow here (rule/select-quick-add) */ void _search }
function selectNewProduct(p: typeof products[number]) {
  items.value.push({
    _key: ++_seq,
    product: p.name,
    sku: p.code,
    description: '',
    qty: 1,
    unit: p.unit,
    unitPrice: p.price,
    discountPct: 0,
    taxLabel: 'PPN 11%',
    productError: false,
    qtyError: false,
    baseQtyError: false,
    // An ad-hoc row draws down no order line, so there is no ordered quantity —
    // in Percentage the user types a base for it instead (1, at 100%, by default).
    orderLineIndex: null,
    orderedQty: null,
    inputMode: inputMode.value,
    inputValue: inputMode.value === 'percent' ? 100 : 1,
    baseQty: 1,
  })
  newRowSearch.value = ''
  openProductRow.value = null
}

// Drag-and-drop row reorder — same pattern as NewExpensePage's line-item table.
const dragSrcIndex  = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
function onDragStart(ev: DragEvent, idx: number) {
  dragSrcIndex.value = idx
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(idx)) }
}
function onDragOver(ev: DragEvent, idx: number) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}
function onDrop(ev: DragEvent, toIdx: number) {
  ev.preventDefault()
  const fromIdx = dragSrcIndex.value
  if (fromIdx === null || fromIdx === toIdx) { dragSrcIndex.value = null; dragOverIndex.value = null; return }
  const arr = [...items.value]
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved!)
  items.value = arr
  dragSrcIndex.value = null
  dragOverIndex.value = null
}
function onDragEnd() { dragSrcIndex.value = null; dragOverIndex.value = null }

const unitOptions = computed(() => Array.from(new Set([...UNIT_OPTIONS, ...items.value.map(i => i.unit)])))
const taxOptions  = computed(() => Array.from(new Set([...TAX_OPTIONS, ...items.value.map(i => i.taxLabel)])))

// Banner above the table whenever any line cell is flagged — same convention as
// NewExpensePage's line-items error banner.
const hasLineItemErrors = computed(() => items.value.some(it => it.productError || it.qtyError || it.baseQtyError))
const noItemsError = ref(false)   // set on save attempt with zero line items (inline, not a toast)

/**
 * OD-005. Cumulative delivered may not exceed the ordered quantity (R-06). The
 * check runs on SAVE, not on every keystroke: a user mid-way through typing 40
 * has momentarily typed 4, and flagging that would be noise.
 *
 * The whole document is rejected even when only one line is over (E-02), and the
 * entry is never silently adjusted (R-07) — the user fixes the number, because a
 * system that quietly trims a figure is how revenue stops matching the contract.
 */
const overDeliveryErrors = ref<string[]>([])

/**
 * OD-006. Fills every order line with exactly what is left (R-14). A balance after
 * several rounded tranches is rarely a round percentage (E-03), so this is the
 * intended way to close a contract — no subtraction, no figure to land on.
 *
 * `qty` is set to the remaining balance DIRECTLY rather than re-derived from a
 * percentage, so it cannot overshoot by a truncation hair and can never breach
 * R-06. A percent-locked line stays in percent (R-09): its typed figure becomes the
 * percentage that balance represents, so the audit trail still reads truthfully.
 */
const hasRemaining = computed(() => items.value.some(it => it.orderedQty !== null && remainingQtyOf(it) > 1e-6))
function fillRemaining() {
  for (const it of items.value) {
    if (it.orderedQty === null) continue
    const rem = remainingQtyOf(it)
    it.qty = rem
    it.inputValue = it.inputMode === 'percent'
      ? Math.round((rem / it.orderedQty) * 100 * 1e6) / 1e6
      : rem
    it.qtyError = false
  }
  overDeliveryErrors.value = []
}

function overDeliveryMessage(item: LineItem): string | null {
  if (item.orderedQty === null || !(item.qty > 0)) return null
  const remaining = remainingQtyOf(item)
  // Tolerance: both sides come from six-decimal arithmetic, so a line landing
  // exactly on its balance must not fail by a float hair.
  if (item.qty <= remaining + 1e-6) return null
  const asked = item.inputMode === 'percent'
    ? `${formatPct(item.inputValue)}`
    : `${formatQty(item.qty)} ${item.unit}`
  return `${item.product}: ${asked} ${t('is more than the')} ${formatQty(remaining)} ${item.unit} ${t('still available')}.`
}

// ── Totals ────────────────────────────────────────────────────────────────────
const subtotal      = computed(() => items.value.reduce((s, it) => s + it.qty * it.unitPrice, 0))
const discountTotal = computed(() => items.value.reduce((s, it) => s + Math.round(it.qty * it.unitPrice * it.discountPct / 100), 0))

const globalDiscountType  = ref<'%' | 'Rp'>('%')
const globalDiscountValue = ref(0)
const globalDiscountAmount = computed(() =>
  globalDiscountType.value === '%'
    ? Math.round((subtotal.value - discountTotal.value) * (globalDiscountValue.value / 100))
    : globalDiscountValue.value,
)

const taxBase     = computed(() => subtotal.value - discountTotal.value - globalDiscountAmount.value)
const taxAmount   = computed(() => Math.round(taxBase.value * 0.11))
const shippingFee = ref(0)
const total       = computed(() => taxBase.value + taxAmount.value + shippingFee.value)

// A sales order is not a payment document — no withholding/deposit at create; the
// header figure is the order total.
const orderTotal = computed(() => total.value)

const fmt = formatIDR
/** Table cells show the bare number — the "Rp" lives in the cell's prefix box. */
function fmtPlain(n: number) {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── Notes + attachments ───────────────────────────────────────────────────────
const message = ref('')
const memo    = ref('')
// Seeded from the File manager's "Add file › Create a new transaction"
// hand-off, so the form opens with those files already attached. Reading it
// clears it, so a later visit starts empty. Empty on every other entry.
const attachments = ref<{ name: string; sizeKB: number }[]>(takePendingAttachments())
function iconForFile(name: string): 'pdf' | 'excel-document' | 'word-document' | 'doc' {
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel-document'
  if (name.endsWith('.doc') || name.endsWith('.docx')) return 'word-document'
  return 'doc'
}
function onFilesChange(e: Event) {
  const files = (e.target as HTMLInputElement | null)?.files
  if (!files) return
  for (const f of Array.from(files)) {
    attachments.value.push({ name: f.name, sizeKB: Math.round(f.size / 1024 * 10) / 10 })
  }
}
function removeAttachment(idx: number) { attachments.value.splice(idx, 1) }

// ── Save ──────────────────────────────────────────────────────────────────────
function validate(): boolean {
  let ok = true
  if (!customerId.value) { customerError.value = true; ok = false }
  noItemsError.value = !items.value.length
  if (!items.value.length) ok = false

  overDeliveryErrors.value = []
  // A tranche needn't touch every order line: an order line left at 0 is simply
  // not part of this delivery. Only ad-hoc lines must carry a quantity — and the
  // delivery as a whole must deliver something.
  const orderLines = items.value.filter(it => it.orderLineIndex !== null)
  if (orderLines.length && !orderLines.some(it => it.qty > 0) && !items.value.some(it => it.orderLineIndex === null)) {
    orderLines.forEach(it => { it.qtyError = true })
    ok = false
  }
  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    // A hand-added line in Percentage needs a base to take the percentage of.
    if (it.orderLineIndex === null && it.inputMode === 'percent' && !(it.baseQty > 0)) { it.baseQtyError = true; ok = false }
    else if (it.orderLineIndex === null && !(it.qty > 0)) { it.qtyError = true; ok = false }
    const over = overDeliveryMessage(it)
    if (over) { it.qtyError = true; overDeliveryErrors.value.push(over); ok = false }
  })
  return ok
}

function nextDeliveryNumber(): number {
  return salesDeliveries.reduce((max, d) => Math.max(max, d.number), 20000) + 1
}
function nextDeliveryId(): string {
  const n = salesDeliveries.reduce((max, d) => {
    const num = parseInt(d.id.replace(/\D/g, ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0) + 1
  return `SD${String(n).padStart(3, '0')}`
}

function onCancel() { router.push('/sales-deliveries') }

function onSave() {
  // A closed-period delivery is not editable at all; the banner already says so,
  // and save refuses rather than writing past the lock (R-19).
  if (editLocked.value) return
  // Nothing to deliver — the empty state already says so; Save stays present but
  // writes nothing (CLAUDE.md › Form & modal actions, never disabled).
  if (nothingLeft.value) return
  // Validation errors surface INLINE (per-field + the banner below), never as a toast.
  // On edit this re-runs the same limit check against everything else delivered (R-17).
  if (!validate()) return
  const customer = customers.find(c => c.id === customerId.value)!
  const delivery: SalesDelivery = {
    id: editing.value?.id ?? nextDeliveryId(),
    number: editing.value?.number ?? nextDeliveryNumber(),
    customer: { id: customer.id, name: customer.name },
    date: dmyToIso(txDate.value),
    fulfillmentStatus: 'in transit',
    billingStatus: 'unbilled',
    total: total.value,
    tags: tagsList.value.map(t2 => String(t2.value)),
    ...(sourceOrder.value
      ? {
          orderId: sourceOrder.value.id,
          items: items.value
            .filter(it => it.orderLineIndex !== null && it.qty > 0)
            .map(it => ({
              orderLineIndex: it.orderLineIndex!,
              product: it.product,
              sku: it.sku,
              description: it.description,
              unit: it.unit,
              qty: it.qty,
              inputMode: it.inputMode,
              inputValue: it.inputValue,
            })),
        }
      : {}),
  }
  const at = editing.value ? salesDeliveries.findIndex(d => d.id === editing.value!.id) : -1
  if (at >= 0) salesDeliveries[at] = { ...salesDeliveries[at]!, ...delivery }
  else salesDeliveries.push(delivery)
  toast.notify({ variant: 'success', title: editing.value ? t('Sales delivery changes saved') : t('Sales delivery saved'), rootProps: { class: 'toast-enterprise' } })
  router.push(`/sales-deliveries/${delivery.id}`)
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="onCancel">{{ t('Sales deliveries') }}</MpTextlink>
        <h1 class="si-form-h1">{{ editing ? `${t('Edit sales delivery')} #${editing.number}` : t('Create sales delivery') }}</h1>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="si-form-stage">

      <!-- ── Header section 1: Customer + Email + Balance due ── -->
      <section class="si-header1 si-dashed-divider">
        <MpFormControl id="f-customer" class="si-field" is-required :is-invalid="customerError">
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpAutocomplete
            id="f-customer-inp" v-model="customerId" :data="customerOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select customer')" :is-invalid="customerError"
            @update:model-value="onCustomerChange"
          />
          <MpFormErrorMessage>{{ t('You must select customer') }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="f-email" class="si-field">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="f-email-inp" :data="emailTags" :placeholder="t('+Add email')" @change="onEmailChange" />
        </MpFormControl>

        <!-- prod: no header total on a delivery (prices live on the sales order) -->
        <div class="si-header1-total" />
      </section>

      <!-- ── Header section 2 — fixed-width fields that wrap, never stretch ── -->
      <section class="si-header2">
        <!-- Col 1 (318px): ship-to address (prod SalesDeliveryDetailFields) -->
        <div class="si-header2-col si-header2-col--wide">
          <MpFormControl id="f-ship-to" class="si-field">
            <MpFormLabel>{{ t('Ship to') }}</MpFormLabel>
            <MpTextarea id="f-ship-to-inp" v-model="shipTo" is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 2: shipping -->
        <div class="si-header2-col">
          <MpFormControl id="f-ship-date" class="si-field">
            <MpFormLabel>{{ t('Ship date') }}</MpFormLabel>
            <MpDatePicker id="f-ship-date-inp" v-model="shipDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="f-ship-via" class="si-field">
            <MpFormLabel>{{ t('Ship via') }}</MpFormLabel>
            <MpInput id="f-ship-via-inp" v-model="shipVia" is-full-width />
          </MpFormControl>

          <MpFormControl id="f-tracking" class="si-field">
            <MpFormLabel>{{ t('Tracking no.') }}</MpFormLabel>
            <MpInput id="f-tracking-inp" v-model="trackingNo" is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 3: warehouse + numbering -->
        <div class="si-header2-col">
          <MpFormControl id="f-warehouse" class="si-field">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete id="f-warehouse-inp" v-model="warehouse" :data="WAREHOUSES" use-portal is-clearable is-full-width />
          </MpFormControl>

          <MpFormControl id="f-tx-no" class="si-field">
            <MpFormLabel>
              <span class="si-label-row">
                {{ t('Transaction no.') }}
                <MpButton class="si-label-icon" :aria-label="t('Transaction number settings')" @click="noSettingsOpen = true">
                  <MpIcon name="settings" size="sm" />
                </MpButton>
              </span>
            </MpFormLabel>
            <MpInput id="f-tx-no-inp" :placeholder="t('Auto')" is-disabled is-full-width />
          </MpFormControl>

          <MpFormControl id="f-ref" class="si-field">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="f-ref-inp" v-model="referenceNo" is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 4: source order (read-only) + tags -->
        <div class="si-header2-col">
          <MpFormControl id="f-so-no" class="si-field">
            <MpFormLabel>{{ t('Sales order no.') }}</MpFormLabel>
            <span class="si-readonly-value">{{ sourceOrder ? `#${sourceOrder.number}` : '-' }}</span>
          </MpFormControl>

          <MpFormControl v-if="orderProgress" id="f-order-progress" class="si-field">
            <MpFormLabel>{{ t('Delivered so far') }}</MpFormLabel>
            <span class="si-readonly-value">{{ orderProgress }}</span>
          </MpFormControl>

          <MpFormControl id="f-tags" class="si-field">
            <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
            <MpInputTag id="f-tags-inp" :data="tagsList" :placeholder="t('Select tags')" @change="onTagsChange" />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Line items ── -->
      <section class="si-items-section">
        <!-- R-19: reached only by a direct link — the detail page does not offer
             Edit for a locked period. Says why, rather than failing on save. -->
        <MpBanner v-if="editLocked" id="sd-period-locked" variant="warning" align-items="center">
          <MpBannerIcon id="sd-period-locked-icon" />
          <MpBannerTitle>{{ t('This delivery is in a closed period') }}</MpBannerTitle>
          <MpBannerDescription>{{ t('Transactions up to') }} {{ isoToDMY(lockDate() ?? '') }} {{ t('are locked by Close books, so this delivery cannot be edited.') }}</MpBannerDescription>
        </MpBanner>


        <MpBanner v-if="hasLineItemErrors || noItemsError" id="si-lineitems-error-banner" variant="danger" align-items="center" class="si-items-error-banner">
          <MpBannerIcon id="si-lineitems-error-banner-icon" />
          <MpBannerTitle>
            {{ overDeliveryErrors.length ? t('More than the order has left to deliver')
              : noItemsError && !hasLineItemErrors ? t('Add at least one product')
              : t('Failed to save delivery') }}
          </MpBannerTitle>
          <MpBannerDescription>
            <!-- Names the line and the balance available, so the fix takes seconds
                 even when one line of many is over (R-07). -->
            <ul v-if="overDeliveryErrors.length" class="sd-over-list">
              <li v-for="m in overDeliveryErrors" :key="m">{{ m }}</li>
            </ul>
            <template v-else>{{ noItemsError && !hasLineItemErrors ? t('A sales delivery needs at least one line item before you can save.') : t('Please review the highlighted fields and try again.') }}</template>
          </MpBannerDescription>
        </MpBanner>

        <!-- OD-001 — one input method for the whole table (left); Fill Remaining sits
             with the table it acts on (right) — a tertiary pill, text only
             (rule/btn-icon-add-only keeps the + for create actions). -->
        <div v-if="!nothingLeft" class="si-items-header-row" data-devchange="sd-input-method-table">
          <MpFormControl id="f-input-method" class="sd-method">
            <MpFormLabel>{{ t('Input method') }}</MpFormLabel>
            <div class="sd-method-row">
              <ErpFilterSelect
                id="sd-input-method" :model-value="inputMode" :options="MODE_OPTIONS"
                :is-clearable="false" :disabled="!!orderLockInfo"
                @update:model-value="setInputMode"
              />
              <MpButton v-if="sourceOrder && hasRemaining" id="sd-fill-remaining" is-rounded variant="tertiary" @click="fillRemaining">{{ t('Fill remaining') }}</MpButton>
            </div>
            <!-- Disabled, never hidden — and always says why and which delivery did
                 it (OD-003). -->
            <span v-if="orderLockInfo" class="sd-lock sd-caption">
              {{ t('Locked by') }} {{ t('Sales Delivery') }} #{{ orderLockInfo.number }}.
              <MpTextlink v-if="mayRelease" id="f-release" as="a"
                class="sd-lock-release" @click.prevent="releaseOpen = true"
              >
                <!-- Sized on a span: Pixel's unstyled-button font rule lives in a
                     cascade layer and outranks any page-level override on the <a>. -->
                <span class="sd-lock-release-label">{{ t('Release') }}</span>
              </MpTextlink>
              <!-- Says who can, rather than leaving the way out unexplained (R-16). -->
              <template v-else>{{ t('Only a finance manager can release it.') }}</template>
            </span>
          </MpFormControl>
        </div>

        <div v-if="nothingLeft" class="empty-full sd-nothing-left">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No items left to deliver') }}</p>
          <p class="empty-full-desc">{{ t('Every line on this sales order has been delivered in full.') }}</p>
          <MpButton id="sd-view-order" class="sd-empty-cta" is-rounded variant="secondary"
            @click="router.push(`/sales-orders/${sourceOrder!.id}`)">{{ t('View sales order') }}</MpButton>
        </div>

        <div v-else class="si-items-scroll">
          <table class="si-items-table">
            <colgroup>
              <col class="si-col-drag" />
              <col class="si-col-product" />
              <col class="si-col-desc" />
              <col class="si-col-ordered" />
              <col class="si-col-qty" />
              <col class="si-col-unit" />
              <col class="si-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="si-th si-th--drag" />
                <th class="si-th">{{ t('Product') }}</th>
                <th class="si-th">{{ t('Description') }}</th>
                <th class="si-th">{{ t('Qty ordered') }}</th>
                <th class="si-th">{{ t('Qty delivered') }}</th>
                <th class="si-th">{{ t('Unit') }}</th>
                <th class="si-th si-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in items" :key="item._key" class="si-tr"
                :class="{ 'si-tr--dragging': dragSrcIndex === idx, 'si-tr--dragover': dragOverIndex === idx && dragSrcIndex !== idx }"
                draggable="true"
                @dragstart="onDragStart($event, idx)" @dragover="onDragOver($event, idx)"
                @drop="onDrop($event, idx)" @dragend="onDragEnd"
              >
                <td class="si-td si-td--drag si-td--border"><div class="si-cell-center"><MpIcon name="drag" size="sm" /></div></td>

                <td class="si-td si-td--input si-td--border" :class="{ 'si-td--error': item.productError }">
                  <MpTooltip
                    v-if="item.productError" :id="`si-product-tt-${item._key}`"
                    :label="t('You must select product')" placement="top" use-portal
                    class="si-error-tooltip-wrap"
                  >
                    <MpInput
                      :id="`f-product-${item._key}`" v-model="item.product" is-full-width
                      :is-invalid="item.productError" @focus="openProductRow = item._key"
                    />
                  </MpTooltip>
                  <MpPopover
                    v-else
                    is-manual :is-open="openProductRow === item._key" is-close-on-select
                    use-portal :is-keep-alive="false" placement="bottom-start" is-adaptive-width
                    @close="openProductRow = null"
                  >
                    <MpPopoverTrigger>
                      <MpInput :id="`f-product-${item._key}`" v-model="item.product" is-full-width @focus="openProductRow = item._key" />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in productMatches(item.product)" :key="p.id" @click="selectProduct(item, p)">
                          <ProductCell :name="p.name" :desc="p.code" />
                        </MpPopoverListItem>
                        <MpPopoverListItem class="si-quickadd" @click="onProductAdd(item.product)">
                          {{ item.product ? `${t('Add')} "${item.product}" ${t('as a new product')}` : t('Add new product') }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>

                <td class="si-td si-td--input si-td--border">
                  <MpInput v-model="item.description" is-full-width />
                </td>

                <!-- Qty ordered — read-only, from the source sales order. Progress reads
                     label left, figure right: "Delivered · 0,5 (50%)". A hand-added line
                     in Percentage takes its base here instead, typed by the user. -->
                <td v-if="item.orderedQty === null && inputMode === 'percent'"
                  class="si-td si-td--input si-td--border" :class="{ 'si-td--error': item.baseQtyError }"
                >
                  <MpTooltip v-if="item.baseQtyError" :id="`si-base-tt-${item._key}`"
                    :label="t('You must fill in qty to take the percentage of')" placement="top" use-portal
                    class="si-error-tooltip-wrap"
                  >
                    <MpInput type="number" :model-value="item.baseQty" is-full-width :is-invalid="true"
                      @update:model-value="(v) => setBaseQty(item, Number(v))" />
                  </MpTooltip>
                  <MpInput v-else type="number" :model-value="item.baseQty" is-full-width
                    @update:model-value="(v) => setBaseQty(item, Number(v))" />
                </td>
                <td v-else class="si-td si-td--border si-td--calc sd-ordered">
                  <span class="sd-ordered-qty">{{ item.orderedQty === null ? '-' : formatQty(item.orderedQty) }}</span>
                  <span v-if="item.orderedQty !== null" class="sd-band-info" data-devchange="sd-ordered-caption">
                    <span class="sd-progress-line sd-caption">
                      <span>{{ t('Delivered') }}</span>
                      <span>{{ formatQty(deliveredQtyOf(item)) }} ({{ pctText(deliveredQtyOf(item), item.orderedQty) }})</span>
                    </span>
                    <span class="sd-progress-line sd-caption">
                      <span>{{ t('Remaining') }}</span>
                      <span>{{ formatQty(remainingQtyOf(item)) }} ({{ pctText(remainingQtyOf(item), item.orderedQty) }})</span>
                    </span>
                  </span>
                </td>

                <td class="si-td si-td--input si-td--border" :class="{ 'si-td--error': item.qtyError }">
                  <MpTooltip
                    v-if="item.qtyError" :id="`si-qty-tt-${item._key}`"
                    :label="item.inputMode === 'percent' ? t('Percentage must be more than 0') : t('Qty must be more than 0')"
                    placement="top" use-portal class="si-error-tooltip-wrap"
                  >
                    <MpInputGroup v-if="item.inputMode === 'percent'" :id="`f-pct-group-${item._key}`" is-full-width>
                      <MpInput type="number" :model-value="item.inputValue" is-full-width :is-invalid="item.qtyError"
                        @update:model-value="(v) => applyInput(item, Number(v))" />
                      <MpInputRightAddon has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                    <MpInput v-else type="number" :model-value="item.inputValue" is-full-width
                      :is-invalid="item.qtyError"
                      @update:model-value="(v) => applyInput(item, Number(v))" />
                  </MpTooltip>
                  <template v-else>
                    <MpInputGroup v-if="item.inputMode === 'percent'" :id="`f-pct-group-${item._key}`" is-full-width>
                      <MpInput type="number" :model-value="item.inputValue" is-full-width
                        @update:model-value="(v) => applyInput(item, Number(v))" />
                      <MpInputRightAddon has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                    <MpInput v-else type="number" :model-value="item.inputValue" is-full-width
                      @update:model-value="(v) => applyInput(item, Number(v))" />
                  </template>
                  <!-- OD-002 — what the percentage produces, quantity above amount. Shown
                       from 0% so the line never jumps when the first digit lands. -->
                  <span v-if="item.orderedQty !== null || inputMode === 'percent'" class="sd-band-info">
                    <template v-if="showPreview(item)">
                      <span class="sd-preview-line sd-caption">{{ formatQty(item.qty) }} {{ item.unit }}</span>
                      <span class="sd-preview-line sd-caption">{{ formatIDR(lineAmount(item)) }}</span>
                    </template>
                  </span>
                </td>

                <td class="si-td si-td--input si-td--border">
                  <MpAutocomplete v-model="item.unit" :data="unitOptions" use-portal is-full-width />
                </td>

                <td class="si-td si-td--del">
                  <div class="si-cell-center">
                    <MpButton class="si-del-btn" :aria-label="`${t('Remove')} ${item.product}`" @click="removeItem(item._key)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                </td>
              </tr>

              <!-- Trailing "Select product" row — picking here appends a new line -->
              <tr class="si-tr">
                <td class="si-td si-td--drag si-td--border"><div class="si-cell-center"><MpIcon name="drag" size="sm" /></div></td>
                <td class="si-td si-td--input si-td--border">
                  <MpPopover
                    is-manual :is-open="openProductRow === NEW_ROW_KEY" is-close-on-select
                    use-portal :is-keep-alive="false" placement="bottom-start" is-adaptive-width
                    @close="openProductRow = null"
                  >
                    <MpPopoverTrigger>
                      <MpInput
                        id="f-product-new" v-model="newRowSearch" class="si-select--product"
                        :placeholder="t('Select product')" is-full-width
                        @focus="openProductRow = NEW_ROW_KEY"
                      />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in productMatches(newRowSearch)" :key="p.id" @click="selectNewProduct(p)">
                          <ProductCell :name="p.name" :desc="p.code" />
                        </MpPopoverListItem>
                        <MpPopoverListItem class="si-quickadd" @click="onProductAdd(newRowSearch)">
                          {{ newRowSearch ? `${t('Add')} "${newRowSearch}" ${t('as a new product')}` : t('Add new product') }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <!-- Description · Qty ordered · Qty delivered · Unit · delete -->
                <td class="si-td si-td--border" /><td class="si-td si-td--border" /><td class="si-td si-td--border" />
                <td class="si-td si-td--border" /><td class="si-td si-td--del" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Notes + Attachment + Totals ── -->
      <section class="si-bottom-section">
        <!-- Left stack: Message / Memo / Attachment, a constant 20px apart -->
        <div class="si-notes-col">
          <MpFormControl id="f-message" class="si-note-field">
            <div class="si-lbl-row"><MpFormLabel>{{ t('Message') }}</MpFormLabel><span class="si-counter">{{ message.length }}/250</span></div>
            <MpTextarea id="f-message-inp" v-model="message" :maxlength="250" is-full-width />
            <span class="si-field-caption">{{ t('Visible to customer') }}</span>
          </MpFormControl>

          <MpFormControl id="f-memo" class="si-note-field">
            <div class="si-lbl-row"><MpFormLabel>{{ t('Memo') }}</MpFormLabel><span class="si-counter">{{ memo.length }}/250</span></div>
            <MpTextarea id="f-memo-inp" v-model="memo" :maxlength="250" is-full-width />
            <span class="si-field-caption">{{ t('Only visible to you and your team') }}</span>
          </MpFormControl>

          <div class="si-attachment-section">
            <span class="si-attachment-label">{{ t('Attachments') }}</span>
            <MpUpload
              id="f-attachment" :button-text="t('Choose file')" :placeholder="t('or drag and drop here')"
              is-multiple is-full-width @change="onFilesChange"
            />
            <p class="si-field-caption">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
            <div v-if="attachments.length" class="si-attachment-list">
              <MpUploadList
                v-for="(a, idx) in attachments" :key="a.name + idx"
                :title="a.name" :subtitle="`${a.sizeKB} KB`" :icon-name="iconForFile(a.name)"
                status="success" is-show-remove-button @remove="removeAttachment(idx)"
              />
            </div>
          </div>
        </div>

        <!-- Right: shipping fee only — a delivery carries no prices (prod) -->
        <div class="si-totals-col">
          <div class="si-totals-row">
            <span>{{ t('Shipping fee') }}</span>
            <MpInputGroup id="f-shipping-fee-group" class="si-unit-field">
              <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
              <MpInput type="number" :model-value="shippingFee" is-full-width
                @update:model-value="(v) => shippingFee = Number(v)" />
            </MpInputGroup>
          </div>
        </div>
      </section>

      <!-- ── Footer (prod TransactionFooter for deliveries): ghost Cancel · primary
           "Save & close" · kebab (Sales settings) ── -->
      <MpButtonGroup class="erp-action-footer si-form-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ t('Save & close') }}</MpButton>
        <MpPopover id="sd-form-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More options')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="navigateTo('/sales-settings')">{{ t('Sales settings') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </MpButtonGroup>

    </div><!-- /si-form-stage -->

    <ReleaseInputBasisModal

      v-model:is-open="releaseOpen"

      :subject="releaseLabel"

      :locked-by="releaseLockedBy"

      @confirm="doRelease"

    />

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
.si-readonly-value { display: block; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* Fixed field widths, straight off the Figma: the address column is 318px and
   every other header field 228px. They never stretch with the container — same
   principle as NewExpensePage's --ex-field-width. */
.si-form-page {
  --si-field-wide: 318px;
  --si-field: 228px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Header bar ── */
.si-form-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.si-form-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.si-crumb {
  align-self: flex-start;
  background: none; border: none; padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.si-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.si-form-h1 {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Scrollable stage ── */
.si-form-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

.si-dashed-divider {
  padding-bottom: var(--mp-spacing-5);
  border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}

/* ── Header section 1 ── */
.si-header1 { display: flex; align-items: flex-start; gap: 16px 24px; }
.si-header1 > .si-field { flex: 0 0 var(--si-field-wide); }
.si-header1-total { margin-left: auto; align-self: flex-end; padding-bottom: var(--mp-spacing-2); }
.si-header1-total-value {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Header section 2 — every column is a FIXED 318px (= the Customer/Email
   fields in header section 1), so all columns line up in a tidy grid and wrap
   to the next line when they don't fit, instead of shrinking to odd widths. ── */
.si-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.si-header2-col {
  flex: 0 0 var(--si-field-wide);
  min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}
.si-header2-col--wide { flex: 0 0 var(--si-field-wide); min-width: 0; }

.si-field { min-width: 0; }
/* MpInputTag and MpDatePicker need explicit full-width hooks */
.si-field :deep(.input-tag__root) { width: 100%; }
/* Delivered / remaining sits under the ordered quantity — a caption, so 12px
   secondary (rule/type-*), not a second value competing with the figure. Stacked
   rather than one line: a six-decimal quantity makes any fixed width a guess. */
/* Two-band cells (docs/patterns/FormTable.md › Two-band cells). Every cell that
   carries information under its value splits into a 40px control band — where
   the value or control sits, on the same text line as every other cell — and an
   info band below a 1px rule. All info bands start on the same line, so the
   captions of the ordered quantity, the lock and the preview read across. */
.sd-band-info {
  display: flex; flex-direction: column;
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
/* One caption style for every info band — 12px secondary, 16px line. */
.sd-caption { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }
/* Qty ordered — figure right-aligned on the input's text line (10px down in a
   40px control); each progress line reads label left, figure right. */
/* `.si-td` sets `padding: 0 8px` at the same specificity and wins on order, so
   the ordered cell qualifies with it — the bands supply their own padding. */
.si-td.sd-ordered { padding: 0; text-align: right; }
.sd-ordered-qty { display: block; height: var(--mp-sizes-10, 40px); line-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); }
.sd-ordered .sd-band-info { align-items: stretch; }
.sd-cell-dash { display: block; padding: var(--mp-spacing-2\.5) var(--mp-spacing-1); color: var(--mp-text-default); }
.sd-progress-line { display: flex; justify-content: space-between; gap: var(--mp-spacing-2); white-space: nowrap; }
/* What the percentage produces, under the input — quantity, then amount. Caption
   size and colour (rule/type-*), indented to the input's own text. */
.sd-preview-line { white-space: nowrap; }
/* Why the method is locked, and the way out (OD-003). Release is the same 12px
   as the sentence it finishes — it's part of the caption, not a separate action. */
.sd-lock { display: block; white-space: normal; margin-top: var(--mp-spacing-1); }
.sd-lock-release { margin-left: var(--mp-spacing-0\.5); vertical-align: baseline; }
.sd-lock-release-label { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); }
/* The reset strips list-style, so a bulleted list needs both back (CLAUDE.md). */
/* Empty state — same shape as the module's index (rule/empty-state-structure). */
.sd-nothing-left { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-8) 0; }
.sd-nothing-left .empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.sd-nothing-left .empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sd-nothing-left .empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.sd-empty-cta { margin-top: var(--mp-spacing-4); }
.sd-over-list { list-style: disc outside; margin: 0; padding-left: var(--mp-spacing-5); }
.sd-over-list li { display: list-item; }
.si-datepicker { width: 100%; }
.si-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* MpCheckbox brings its own 12px control→label gap — the stack only owns the
   gap BETWEEN checkboxes (see the Pixel3 checkbox note). */
.si-checkbox-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }

.si-label-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.si-label-icon {
  display: inline-flex !important; align-items: center; justify-content: center;
  padding: 0 !important; border: none !important; background: none !important; min-width: 0 !important;
  cursor: pointer; color: var(--mp-text-secondary);
}

/* ── Line items ─────────────────────────────────────────────────────────────
   Column widths are the Figma's exact values; Description is the one flexible
   column. With the per-line Input method column gone (OD-001, now above the
   table) the floor drops by its 184px, so the table fits a 1440 stage unscrolled. */
.si-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-items-header-row { display: flex; }
/* The table-wide input method — a field, label above (OD-001); Fill remaining
   shares the dropdown's line, at the right edge of the table. */
.sd-method { display: flex; flex-direction: column; gap: var(--mp-spacing-1); flex: 1; }
.sd-method-row { display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-4); }
.si-items-error-banner { margin-bottom: var(--mp-spacing-2); }
.si-items-scroll { overflow-x: auto; }

.si-items-table {
  width: 100%; min-width: 1140px;
  table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
.si-col-drag     { width: 44px; }
.si-col-product  { width: 280px; }
.si-col-desc     { width: auto; }
/* Wide enough for the ordered figure plus its delivered/remaining caption; the
   64px qty column cannot hold "Delivered 11,68 · Remaining 4,32". */
.si-col-ordered  { width: 140px; }
/* Holds the two-segment Quantity / Percent control without wrapping its labels. */
/* 64px fits a bare count, but not the percent input plus the quantity and value
   it produces (OD-002) — "5,28 unit · Rp132.000.000". */
.si-col-qty      { width: 220px; }
.si-col-unit     { width: 104px; }
.si-col-price    { width: 164px; }
.si-col-discount { width: 88px; }
.si-col-tax      { width: 128px; }
.si-col-amount   { width: 164px; }
.si-col-del      { width: 52px; }

.si-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.si-th--drag, .si-th--del { padding: 0; }

/* Rows carry BOTH a bottom border (row separator) and right borders (column
   dividers) — the Figma's Row has border-b and each cell border-r. */
.si-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  /* A taller Dimensions cell must not pull the row's other cells to its
     vertical center — everything pins to the top instead. */
  vertical-align: top;
}
.si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.si-tr--dragging { opacity: 0.4; }
.si-tr--dragging .si-td--drag { cursor: grabbing; }
.si-tr--dragover > .si-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }
.si-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.si-td--del  { padding: 0; text-align: center; }
/* Pins the drag/delete control to the first row's height instead of drifting
   to the vertical center of a Dimensions-stretched row. */
.si-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.si-td--input { padding: 0; }
.si-td--input :deep([class*='input']),
.si-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
.si-td--input :deep(.mp-input__root),
.si-td--input :deep(.mp-select__root) { height: var(--mp-sizes-10, 40px); background: transparent; }
.si-td--input :deep(.mp-input__control),
.si-td--input :deep(.mp-select__control) {
  height: var(--mp-sizes-10, 40px);
  /* MpInput's control carries a hard min-width (88px). In the narrow Qty and
     Discount columns that overflows the cell and paints over the td's right
     border — and pushes the Discount "%" suffix out of view. */
  min-width: 0; width: 100%;
  border: none; border-radius: 0;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.si-td--input { position: relative; }
.si-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); /* pixel-police-allow-shadow: focus ring over collapsed borders */
}
/* The CELL is the field, as on the BOM form: white, the full row height, its
   control docked to the top. Rows grow past 40px (the ordered-quantity caption,
   the percentage preview), so a 40px control alone left a dead band under it —
   the control is transparent and the cell carries the field's surface instead. */
.si-td--input { background: var(--mp-background-neutral, #fff); }
.si-td--input :deep(input),
.si-td--input :deep(.mp-input__control) { background: transparent; }
.si-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }
.si-quickadd :deep(*), .si-quickadd { color: var(--mp-colors-text-link, #165082); }

/* Line-item validation — cell tint + inset red underline + tooltip, the same
   convention as NewExpensePage's .ex-td--error. */
.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }
.si-error-tooltip-wrap { display: block; width: 100%; }
.si-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

/* Prefix/suffix cells (Unit price, Discount, Amount) — a plain span box, never
   MpInputLeftAddon, so it fills the cell edge-to-edge like .ex-amount-prefix. */
.si-td--affix { padding: 0; position: relative; }
/* calculated (non-editable) Amount cell = disabled gray (rule/table-bg-white exception) */
.si-td--calc, .si-td--calc .si-affix, .si-td--calc .si-affix-value { background: var(--mp-background-neutral-strong, #f1f3f5); }
/* inset:0 (not height:100%) fills the full — possibly Dimensions-stretched —
   row height. align-items:stretch then lets .si-affix (auto cross-size) grow
   to match, while the input/value keep their own fixed height and simply
   dock to the top (a flex item with a definite cross size doesn't stretch). */
.si-affix-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.si-affix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* The input must actually shrink, or `is-full-width`'s width:100% takes the
   whole cell and shoves the prefix/suffix box outside it (that's what dropped
   the Discount "%"). Target the rendered root, not just the class on MpInput. */
.si-affix-input { flex: 1 1 0; min-width: 0; }
.si-affix-cell :deep(.mp-input__root) { flex: 1 1 0; min-width: 0; width: auto; }
.si-affix-value { flex: 1; min-width: 0; display: flex; align-items: flex-start; justify-content: flex-end; padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2); white-space: nowrap; }

.si-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.si-del-btn:hover { background: var(--mp-background-neutral, #ffffff) !important; color: var(--mp-text-danger, #dc2626); }

/* ── Notes + Attachment + Totals ── */
.si-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
/* Message / Memo / Attachment sit a constant 20px apart. Literal 20px, not
   --mp-spacing-5: that token resolves to 20.8px here (rem-based). */
.si-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.si-note-field { display: flex; flex-direction: column; }
.si-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1, 4px); }
/* char-counter on the label row (rule/input-char-counter) */
.si-lbl-row { display: flex; align-items: baseline; justify-content: space-between; }
.si-counter { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-text-secondary); }

/* Attachment: label→field gap is 4px, matching every MpFormLabel above it */
.si-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); width: var(--si-field-wide); }
.si-attachment-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md, 20px);
}
.si-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }

.si-totals-col { margin-left: auto; width: 428px; flex-shrink: 0; display: flex; flex-direction: column; }
.si-totals-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.si-totals-row--h3 { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg); }
.si-deduction { color: var(--mp-text-secondary); white-space: nowrap; }

.si-total-rule {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-2) 0;
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

.si-discount-block { position: relative; }
.si-discount-rows { display: flex; flex-direction: column; }
.si-discount-swap {
  position: absolute; left: -28px; top: var(--mp-spacing-2);
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px) !important; height: var(--mp-sizes-6, 24px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-text-subtle); border-radius: var(--mp-radii-sm);
}
.si-discount-swap:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }
.si-inline-field-label { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* Standalone (non-table) prefixed fields use MpInputGroup + MpInputLeftAddon,
   with the Rp/% switcher rendered as a popover trigger inside the addon —
   ported verbatim from NewExpensePage's .ex-wh-unit-addon / .ex-wh-unit-trigger. */
.si-unit-field { width: 180px; flex-shrink: 0; }
.si-unit-addon :deep(.mp-input-addon__root) {
  padding: 0;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-radius: var(--mp-radii-md);
}
.si-unit-trigger {
  display: flex !important; align-items: center; gap: 4px;
  padding: var(--mp-spacing-1\.5, 6px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-md) !important;
}
.si-unit-trigger:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.si-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Less: Withholding / Deposit ── */
.si-less-check { padding: var(--mp-spacing-2) 0; }
.si-less-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-bottom: var(--mp-spacing-2); }
.si-wh-row { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-wh-toprow { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.si-wh-remove, .si-wh-add { display: flex; justify-content: flex-end; }

/* ── Footer ── */
.si-form-footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
/* Chevron on a filled button follows the label colour, not the default icon grey */
.si-form-footer .btn-enterprise--primary :deep(.mp-icon),
.si-form-footer .btn-enterprise--primary :deep(svg) {
  --mp-icon-color: var(--mp-text-inverse, #fff);
  color: var(--mp-text-inverse, #fff);
}
</style>
