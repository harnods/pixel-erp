<script setup lang="ts">
/**
 * New product form (Figma: "Products / New product"). Shell + field conventions
 * mirror NewWarehousePage.vue exactly (breadcrumb+H1 title bar, .nw-* classes,
 * inline validation fired only on Save, MpAutocomplete for required selects).
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpTextarea, MpRadio, MpCheckbox, MpAutocomplete, MpButton, toast,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import BarcodeSettingsButton from '~/components/patterns/BarcodeSettingsButton.vue'
import { PRODUCTS, type Product } from '~/data/inventory'
import { customProducts, addCustomProduct, updateCustomProduct } from '~/data/customProducts'
import { GOODS_CLASSIFICATION_CODES, SERVICE_CLASSIFICATION_CODES } from '~/data/taxClassificationCodes'
import { getProductTaxInfo, setProductTaxInfo } from '~/data/productsIndex'

const { t } = useLocale()

// order-id from the catch-all route: 'new' → create, a SKU → edit.
const props = defineProps<{ orderId?: string }>()
const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const editingCustom = computed(() => isEdit.value ? customProducts.find(p => p.sku === props.orderId) : undefined)

const router = useRouter()

// WMS doesn't deal in pricing/costing/accounting — those fields/sections are ERP-only.
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

const NAME_MAX = 255
const DESC_MAX = 6000

// ── Field state ──────────────────────────────────────────────────────────────
const productType = ref<'single' | 'bundle'>('single')
const hasVariants = ref(false)
const name = ref('')
const sku = ref('')
const barcode = ref('')
const category = ref('')
const unit = ref('Pcs')
const description = ref('')
const photoDataUrl = ref('')

// A WMS Standalone product is always stock-tracked — the only choice is HOW
// (quantity, batch or serial number), never whether, so the opt-out checkbox
// isn't rendered there and this stays true.
const trackStock = ref(true)
const minStock = ref('')
const trackStockBy = ref('Quantity')
const inventoryAccount = ref('1-10200 Inventory')

const doesBuy = ref(true)
const purchaseCost = ref('')
const purchaseAccount = ref('5-50000 Cost of Sales')
const purchaseTax = ref('')

const doesSell = ref(true)
const salesPrice = ref('')
const salesAccount = ref('4-40000 Revenues')
const salesTax = ref('')
const discountAccount = ref('')

// Tax info — Product classification determines VAT treatment (goods vs. service);
// Classification code is the DJP/KLU code used on the e-Faktur.
const productClassification = ref<'Goods' | 'Service' | ''>('')
const classificationCode = ref('')
const djpUnit = ref('')

// The picker binds to the bare code ("090100") but tax info is STORED as the full
// catalogue label ("090100 - Coffee, whether or not roasted…") — the description is
// part of the DJP master entry, so keeping them together means the detail page and
// the e-Faktur never have to re-look-up a description that's already known.
// Resolve against the ACTIVE list only — 146 codes appear in both catalogues with
// unrelated meanings (010100 is "Live horses…" for Goods but "General Construction
// Services for Buildings" for Services), so searching both would silently save the
// wrong description for every service that collides.
function codeLabelOf(value: string): string {
  if (!value) return ''
  return classificationCodeOptions.value.find(c => c.value === value)?.label ?? value
}
function codeValueOf(label: string): string {
  const sep = label.indexOf(' - ')
  return sep === -1 ? label : label.slice(0, sep)
}

// Prefill in edit mode — only custom (user-created) products carry the full set
// of form fields; a seed CATALOG product can still be opened for edit but only
// its base fields prefill (accounts/toggles fall back to sensible defaults).
onMounted(async () => {
  if (!isEdit.value) return
  const p = editingCustom.value ?? PRODUCTS.find(x => x.sku === props.orderId)
  if (!p) return
  name.value = p.name
  sku.value = p.sku
  category.value = p.category
  unit.value = p.unit
  description.value = p.desc
  photoDataUrl.value = p.img
  purchaseCost.value = p.buyPrice ? String(p.buyPrice) : ''
  salesPrice.value = p.sellPrice ? String(p.sellPrice) : ''

  // Tax info lives in its own SKU-keyed store, not on the product record (it
  // applies to read-only CATALOG products too) — see productsIndex.ts.
  const tax = getProductTaxInfo(p.sku)
  if (!tax) return
  productClassification.value = tax.productClassification as 'Goods' | 'Service' | ''
  // Restore AFTER the classification watchers have flushed: setting the type
  // re-runs preselectDjpUnit() and the code-list reconciler, both of which would
  // otherwise stomp the values we just loaded.
  await nextTick()
  classificationCode.value = codeValueOf(tax.djpCode)
  djpUnit.value = tax.djpUnit
})

// ── Options ────────────────────────────────────────────────────────────────────
const categoryOptions = computed(() =>
  [...new Set(PRODUCTS.map(p => p.category))].sort().map(c => ({ label: c, value: c })),
)
const unitOptions = computed(() =>
  [...new Set(['Pcs', ...PRODUCTS.map(p => p.unit)])].sort().map(u => ({ label: u, value: u })),
)
const trackStockByOptions = [
  { label: t('Quantity'), value: 'Quantity' },
  { label: t('Batch'), value: 'Batch' },
  { label: t('Serial number'), value: 'Serial number' },
]
const inventoryAccountOptions = [
  { label: '1-10200 Inventory', value: '1-10200 Inventory' },
  { label: '1-10100 Raw materials', value: '1-10100 Raw materials' },
  { label: '1-10300 Finished goods', value: '1-10300 Finished goods' },
]
const purchaseAccountOptions = [
  { label: '5-50000 Cost of Sales', value: '5-50000 Cost of Sales' },
  { label: '5-50100 Cost of Goods Sold', value: '5-50100 Cost of Goods Sold' },
]
const salesAccountOptions = [
  { label: '4-40000 Revenues', value: '4-40000 Revenues' },
  { label: '4-40100 Sales Revenue', value: '4-40100 Sales Revenue' },
]
const discountAccountOptions = [
  { label: '4-40900 Sales Discounts', value: '4-40900 Sales Discounts' },
  { label: '4-41000 Sales Returns & Allowances', value: '4-41000 Sales Returns & Allowances' },
]
const taxOptions = [{ label: 'PPN 11%', value: 'PPN 11%' }]
// Classification code list follows Product classification — Goods and Services
// draw from separate DJP (KLU) reference tables.
const classificationCodeOptions = computed(() =>
  productClassification.value === 'Service' ? SERVICE_CLASSIFICATION_CODES : GOODS_CLASSIFICATION_CODES,
)
// DJP (tax office) unit lists — Goods vs. Services have distinct vocabularies per
// the e-Faktur spec, so the options shown depend on Product classification.
const djpUnitGoodsList = [
  'Ampere', 'Barrel', 'Box', 'Drum', 'Gram', 'Inch', 'Carat', 'Carton', 'Kilogram',
  'Kiloliter', 'Others', 'Sheet', 'Liter', 'Dozen', 'MMBTU', 'Meter', 'Square meter',
  'Metric Ton', 'Piece', 'Centimeter', 'Cubic Centimeter', 'Set', 'Unit', 'Wet Ton', 'Yard',
]
const djpUnitServiceList = [
  'Material', 'Month', 'Day', 'Hour', 'Activities', 'Other', 'Report', 'Minute', 'Week', 'Percent', 'Year',
]
const djpUnitOptions = computed(() =>
  (productClassification.value === 'Service' ? djpUnitServiceList : djpUnitGoodsList)
    .map(u => ({ label: u, value: u })),
)

// Base unit → DJP unit. Most base units ARE their DJP unit ("Box", "Hour",
// "Kilogram"), so a name match against the active list does the bulk of the work
// and only genuine aliases need listing here.
const BASE_UNIT_ALIASES: Record<string, string> = {
  Pcs: 'Piece', Kg: 'Kilogram', Ltr: 'Liter',
}
/** The active list's catch-all entry. Spelled "Others" for Goods but "Other" for
 *  Services, so resolve it from the list rather than hardcoding either. */
const djpUnitOther = computed(
  () => djpUnitOptions.value.find(o => o.value === 'Others' || o.value === 'Other')?.value ?? '',
)
function preselectDjpUnit() {
  const opts = djpUnitOptions.value
  const base = unit.value.trim()
  // Direct name match first (case-insensitive), then the alias table.
  const mapped = opts.find(o => o.value.toLowerCase() === base.toLowerCase())?.value
    ?? opts.find(o => o.value === BASE_UNIT_ALIASES[base])?.value
  // No DJP equivalent → default to the catch-all rather than leaving the field
  // blank; an unset DJP unit blocks the e-Faktur, and "Others" is what DJP
  // expects for a unit outside its master. The user can still override it.
  djpUnit.value = mapped ?? djpUnitOther.value
}
// Re-derive whenever the base unit or the Goods/Service scope changes: switching
// scope swaps the unit list wholesale, so a unit picked from the other list would
// otherwise linger as an invalid selection.
watch([unit, productClassification], preselectDjpUnit)

// Switching Goods ↔ Service swaps the classification code list entirely — clear
// a code picked from the other list instead of leaving a stale mismatch selected.
watch(productClassification, () => {
  if (classificationCode.value && !classificationCodeOptions.value.some(o => o.value === classificationCode.value)) {
    classificationCode.value = ''
  }
})

// ── Photo upload (drag & drop + choose file) — stored as a data URL so it
// survives a refresh via the same localStorage snapshot as the rest of the record ──
const dragOver = ref(false)
function readPhoto(file: File) {
  if (!file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = () => { photoDataUrl.value = String(reader.result ?? '') }
  reader.readAsDataURL(file)
}
function onPhotoInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readPhoto(file)
}
function onPhotoDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) readPhoto(file)
}
function removePhoto() { photoDataUrl.value = '' }

// ── Errors — only triggered from the Save action, never inline while typing ──
const nameError = ref('')
const skuError = ref('')
const categoryError = ref('')
const unitError = ref('')
const isSaving = ref(false)
const isSavingAndAdding = ref(false)

// ─── Demo scenario state (FAB) — previews Tax info's Figma variants ───────────
type DemoState = 'empty' | 'data' | 'ai_matched'
const demoState = ref<DemoState>('empty')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: t('With data') },
  { value: 'empty', label: t('Empty state') },
  { value: 'ai_matched', label: t('AI matched') },
]
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'empty') {
    productType.value = 'single'
    hasVariants.value = false
    name.value = ''
    sku.value = ''
    barcode.value = ''
    category.value = ''
    unit.value = 'Pcs'
    description.value = ''
    photoDataUrl.value = ''
    minStock.value = ''
    trackStock.value = true
    trackStockBy.value = 'Quantity'
    inventoryAccount.value = '1-10200 Inventory'
    doesBuy.value = true
    purchaseCost.value = ''
    purchaseAccount.value = '5-50000 Cost of Sales'
    purchaseTax.value = ''
    doesSell.value = true
    salesPrice.value = ''
    salesAccount.value = '4-40000 Revenues'
    salesTax.value = ''
    discountAccount.value = ''
    productClassification.value = ''
    classificationCode.value = ''
    djpUnit.value = ''
  } else {
    // 'data' and 'ai_matched' share the same sample product — Airene's suggestion
    // reads the name/description, so the AI-matched preview needs them filled too.
    name.value = 'Kopi Arabika Gayo 250g'
    sku.value = 'COF-ARB-250'
    barcode.value = '8991234567890'
    category.value = categoryOptions.value[0]?.value ?? ''
    unit.value = 'Pcs'
    description.value = 'Single-origin arabica coffee beans from Gayo highlands, medium roast, 250g pack.'
    minStock.value = '10'
    trackStock.value = true
    trackStockBy.value = 'Quantity'
    inventoryAccount.value = '1-10200 Inventory'
    doesBuy.value = true
    purchaseCost.value = '45000'
    purchaseAccount.value = '5-50000 Cost of Sales'
    purchaseTax.value = 'PPN 11%'
    doesSell.value = true
    salesPrice.value = '75000'
    salesAccount.value = '4-40000 Revenues'
    salesTax.value = 'PPN 11%'
    discountAccount.value = '4-40900 Sales Discounts'
    productClassification.value = 'Goods'
    classificationCode.value = '090100'
    preselectDjpUnit()
  }
  nameError.value = skuError.value = categoryError.value = unitError.value = ''
}

function goBack() {
  router.push(isEdit.value ? `/product-list/${props.orderId}` : '/product-list')
}

function parseAmount(v: string): number {
  const n = Number(v.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function validate(): boolean {
  nameError.value = ''
  skuError.value = ''
  categoryError.value = ''
  unitError.value = ''

  if (!name.value.trim()) nameError.value = t('You must fill in product name')

  if (!sku.value.trim()) {
    skuError.value = t('You must fill in SKU')
  } else {
    const skuUpper = sku.value.trim().toUpperCase()
    const dup = [...PRODUCTS, ...customProducts].some(
      p => p.sku.toUpperCase() === skuUpper && (!isEdit.value || p.sku !== props.orderId),
    )
    if (dup) skuError.value = t('SKU already taken')
  }

  if (!category.value) categoryError.value = t('You must select category')
  if (!unit.value) unitError.value = t('You must select base unit')

  return !(nameError.value || skuError.value || categoryError.value || unitError.value)
}

function buildPayload(): Omit<Product, 'id'> {
  const sellPrice = doesSell.value ? parseAmount(salesPrice.value) : 0
  const buyPrice = doesBuy.value ? parseAmount(purchaseCost.value) : 0
  return {
    sku: sku.value.trim(),
    name: name.value.trim(),
    desc: description.value.trim(),
    img: photoDataUrl.value,
    category: category.value,
    unit: unit.value,
    sellPrice,
    buyPrice,
    averageCost: Math.round(sellPrice * 0.6),
    lastPurchaseCost: Math.round(sellPrice * 0.62),
  }
}

// Clear the form back to its defaults after "Save & add another".
function resetForm() {
  productType.value = 'single'
  hasVariants.value = false
  name.value = ''
  sku.value = ''
  barcode.value = ''
  category.value = ''
  unit.value = 'Pcs'
  description.value = ''
  photoDataUrl.value = ''
  minStock.value = ''
  trackStock.value = true
  trackStockBy.value = 'Quantity'
  doesBuy.value = true
  purchaseCost.value = ''
  doesSell.value = true
  salesPrice.value = ''
  productClassification.value = ''
  classificationCode.value = ''
  djpUnit.value = ''
  nameError.value = skuError.value = categoryError.value = unitError.value = ''
}

async function save() {
  if (!validate()) return

  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  const payload = buildPayload()
  isSaving.value = false

  if (isEdit.value && editingCustom.value) {
    updateCustomProduct(props.orderId!, payload)
    saveTaxInfo(payload.sku)
    toast.notify({ variant: 'success', title: t('Product changes saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${payload.sku}`)
  } else if (isEdit.value) {
    // Seed (CATALOG) product — read-only master data, so the operational fields
    // aren't persisted. Tax info still is: it lives in its own SKU-keyed store
    // precisely so Tax/Finance can classify catalogue products they can't edit.
    saveTaxInfo(props.orderId!)
    toast.notify({ variant: 'success', title: t('Product changes saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${props.orderId}`)
  } else {
    // New product → whatever's in the field (free-typed or generated via the
    // settings icon); left blank, the product simply has no real barcode yet.
    const created = addCustomProduct({ ...payload, barcode: barcode.value.trim() || undefined })
    saveTaxInfo(created.sku)
    toast.notify({ variant: 'success', title: t('Product saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${created.sku}`)
  }
}

/** Persist the Tax info section. Written unconditionally — saving with the fields
 *  blank is how a user records "this product is deliberately unclassified", which
 *  has to stick rather than fall back to the seeded classification. */
function saveTaxInfo(productSku: string) {
  setProductTaxInfo(productSku, {
    productClassification: productClassification.value,
    djpCode: codeLabelOf(classificationCode.value),
    djpUnit: djpUnit.value,
  })
}

// Create mode only — persist then reset the form to add the next product.
async function saveAndAdd() {
  if (!validate()) return
  isSavingAndAdding.value = true
  await new Promise(r => setTimeout(r, 600))
  const created = addCustomProduct({ ...buildPayload(), barcode: barcode.value.trim() || undefined })
  saveTaxInfo(created.sku)
  toast.notify({ variant: 'success', title: 'Product saved', maxWidth: 'max-content' })
  isSavingAndAdding.value = false
  resetForm()
}

// ── Sticky footer — show a top border only once the stage actually scrolls ──
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
onUnmounted(() => { stageObserver?.disconnect() })

// ── Demo scenario FAB — pinned 32px above the footer, not the viewport bottom ──
const footerEl = ref<HTMLElement | null>(null)
const fabBottom = ref(24)
let footerObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    if (footerEl.value) {
      fabBottom.value = footerEl.value.offsetHeight + 24
      footerObserver = new ResizeObserver(() => { fabBottom.value = (footerEl.value?.offsetHeight ?? 0) + 24 })
      footerObserver.observe(footerEl.value)
    }
  })
})
onUnmounted(() => { footerObserver?.disconnect() })
</script>

<template>
  <div class="nw-page">

    <!-- ── Title bar ── -->
    <div class="nw-titlebar">
      <div class="nw-titlebar-left">
        <button class="nw-breadcrumb" @click="goBack">{{ t('Products') }}</button>
        <h1 class="nw-title">{{ isEdit ? t('Edit product') : t('New product') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div ref="stageEl" class="nw-stage">
      <div class="np-layout">

        <!-- ── Product info ── -->
        <div class="nw-form-group">
          <div class="nw-section">
            <h2 class="nw-section-title">{{ t('Product info') }}</h2>
            <div class="nw-section-spacer" />

            <div class="nw-fields">

              <!-- Product type — ERP only; a WMS Standalone product is always single,
                   so there is nothing to choose. -->
              <MpFormControl v-if="!isWms" id="np-type" is-required>
                <MpFormLabel>{{ t('Product type') }}</MpFormLabel>
                <div class="np-radio-group">
                  <label class="np-radio-item">
                    <MpRadio id="np-type-single" name="np-type" value="single" :is-checked="productType === 'single'" @change="productType = 'single'" />
                    <span>{{ t('Single product') }}</span>
                  </label>
                  <label class="np-radio-item">
                    <MpRadio id="np-type-bundle" name="np-type" value="bundle" :is-checked="productType === 'bundle'" @change="productType = 'bundle'" />
                    <span>{{ t('Bundle product') }}</span>
                  </label>
                </div>
              </MpFormControl>

              <!-- Has variants -->
              <label class="np-checkbox-row">
                <MpCheckbox id="np-has-variants" :is-checked="hasVariants" @change="hasVariants = !hasVariants" />
                <span>{{ t('This product has variants') }}</span>
              </label>

              <!-- Product name -->
              <MpFormControl id="np-name" is-required :is-invalid="!!nameError">
                <div class="nw-label-row">
                  <MpFormLabel>{{ t('Product name') }}</MpFormLabel>
                  <span class="nw-counter">{{ name.length }} / {{ NAME_MAX }}</span>
                </div>
                <MpInput id="np-name-input" v-model="name" :maxlength="NAME_MAX" @update:model-value="nameError = ''" />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- SKU + Barcode -->
              <div class="nw-row">
                <MpFormControl id="np-sku" class="np-field-270" is-required :is-invalid="!!skuError">
                  <MpFormLabel>{{ t('SKU') }}</MpFormLabel>
                  <MpInput id="np-sku-input" v-model="sku" @update:model-value="skuError = ''" />
                  <MpFormErrorMessage>{{ skuError }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="np-barcode" class="np-field-270">
                  <div class="np-label-row">
                    <MpFormLabel>{{ t('Barcode') }}</MpFormLabel>
                    <BarcodeSettingsButton @generated="barcode = $event" />
                  </div>
                  <MpInput id="np-barcode-input" v-model="barcode" :placeholder="t('Enter barcode or generate')" is-full-width />
                </MpFormControl>
              </div>

              <!-- Category -->
              <MpFormControl id="np-category" is-required :is-invalid="!!categoryError">
                <MpFormLabel>{{ t('Category') }}</MpFormLabel>
                <MpAutocomplete
                  id="np-category-ac" v-model="category" :data="categoryOptions" label-prop="label" value-prop="value"
                  :placeholder="t('Select category')" is-searchable use-portal is-full-width :is-invalid="!!categoryError"
                  @update:model-value="categoryError = ''"
                />
                <MpFormErrorMessage>{{ categoryError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Base unit -->
              <MpFormControl id="np-unit" class="np-field-270" is-required :is-invalid="!!unitError">
                <MpFormLabel>{{ t('Base unit') }}</MpFormLabel>
                <MpAutocomplete
                  id="np-unit-ac" v-model="unit" :data="unitOptions" label-prop="label" value-prop="value"
                  :placeholder="t('Select unit')" is-searchable use-portal is-full-width :is-invalid="!!unitError"
                  @update:model-value="unitError = ''"
                />
                <MpFormErrorMessage>{{ unitError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Description -->
              <MpFormControl id="np-desc">
                <div class="nw-label-row">
                  <MpFormLabel>{{ t('Description') }}</MpFormLabel>
                  <span class="nw-counter">{{ description.length }} / {{ DESC_MAX.toLocaleString('id-ID') }}</span>
                </div>
                <MpTextarea id="np-desc-input" v-model="description" :maxlength="DESC_MAX" is-full-width rows="6" />
              </MpFormControl>

            </div>
          </div>
        </div>

        <!-- ── Product photo ── -->
        <div class="np-photo-col">
          <h2 class="nw-section-title">{{ t('Product photo') }}</h2>
          <div class="nw-section-spacer" />
          <div
            v-if="!photoDataUrl"
            class="np-dropzone"
            :class="{ 'np-dropzone--over': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onPhotoDrop"
          >
            <img src="/upload-photo.svg" alt="" aria-hidden="true" class="np-dropzone-icon" />
            <p class="np-dropzone-copy">
              <label class="np-dropzone-link">
                {{ t('Choose photo') }}
                <input type="file" accept="image/*" hidden @change="onPhotoInput" />
              </label>
              {{ t('or drag and drop here') }}
            </p>
          </div>
          <div v-else class="np-photo-preview">
            <img :src="photoDataUrl" :alt="t('Product photo')" class="np-photo-img" />
            <button class="np-photo-remove" type="button" :aria-label="t('Remove photo')" @click="removePhoto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Pricing & inventory info (WMS: "Inventory info" — no pricing) ── -->
      <div class="nw-form-group np-full">
        <div class="nw-section">
          <h2 class="nw-section-title">{{ isWms ? t('Inventory info') : t('Pricing & inventory info') }}</h2>
          <div class="nw-section-spacer" />

          <div class="nw-fields">

            <!-- I track stock for this product -->
            <div class="np-toggle-block">
              <!-- WMS Standalone tracks every product, so there is nothing to opt out
                   of — only "Track stock by" (quantity, batch, serial) is a choice. -->
              <label v-if="!isWms" class="np-checkbox-row">
                <MpCheckbox id="np-track-stock" :is-checked="trackStock" @change="trackStock = !trackStock" />
                <span>{{ t('I track stock for this product') }}</span>
              </label>
              <div v-if="isWms || trackStock" class="nw-row np-toggle-fields">
                <MpFormControl id="np-min-stock" class="np-field-270">
                  <MpFormLabel>{{ t('Min. stock') }}</MpFormLabel>
                  <div class="np-suffix-wrap">
                    <input id="np-min-stock-input" v-model="minStock" class="np-suffix-input" type="text" inputmode="numeric" placeholder="0" />
                    <span class="np-suffix-chip">{{ unit || 'Pcs' }}</span>
                  </div>
                </MpFormControl>
                <MpFormControl id="np-track-by" class="np-field-270" is-required>
                  <MpFormLabel>{{ t('Track stock by') }}</MpFormLabel>
                  <MpAutocomplete
                    id="np-track-by-ac" v-model="trackStockBy" :data="trackStockByOptions" label-prop="label" value-prop="value"
                    is-searchable use-portal is-full-width
                  />
                </MpFormControl>
                <MpFormControl v-if="!isWms" id="np-inventory-account" class="np-field-270" is-required>
                  <MpFormLabel>{{ t('Default inventory account') }}</MpFormLabel>
                  <MpAutocomplete
                    id="np-inventory-account-ac" v-model="inventoryAccount" :data="inventoryAccountOptions" label-prop="label" value-prop="value"
                    is-searchable use-portal is-full-width
                  />
                </MpFormControl>
              </div>
            </div>

            <!-- I buy this product / I sell this product — ERP only; WMS only tracks stock -->
            <template v-if="!isWms">
              <div class="np-toggle-block">
                <label class="np-checkbox-row">
                  <MpCheckbox id="np-does-buy" :is-checked="doesBuy" @change="doesBuy = !doesBuy" />
                  <span>{{ t('I buy this product') }}</span>
                </label>
                <div v-if="doesBuy" class="nw-row np-toggle-fields">
                  <MpFormControl id="np-purchase-cost" class="np-field-270">
                    <MpFormLabel>{{ t('Default purchase cost') }}</MpFormLabel>
                    <div class="np-prefix-wrap">
                      <span class="np-prefix-chip">Rp</span>
                      <input id="np-purchase-cost-input" v-model="purchaseCost" class="np-prefix-input" type="text" inputmode="numeric" placeholder="0" />
                    </div>
                  </MpFormControl>
                  <MpFormControl id="np-purchase-account" class="np-field-270" is-required>
                    <MpFormLabel>{{ t('Default purchase account') }}</MpFormLabel>
                    <MpAutocomplete
                      id="np-purchase-account-ac" v-model="purchaseAccount" :data="purchaseAccountOptions" label-prop="label" value-prop="value"
                      is-searchable use-portal is-full-width
                    />
                  </MpFormControl>
                  <MpFormControl id="np-purchase-tax" class="np-field-270">
                    <MpFormLabel>{{ t('Default purchase tax') }}</MpFormLabel>
                    <MpAutocomplete
                      id="np-purchase-tax-ac" v-model="purchaseTax" :data="taxOptions" label-prop="label" value-prop="value"
                      :placeholder="t('Select default purchase tax')" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                </div>
              </div>

              <div class="np-toggle-block">
                <label class="np-checkbox-row">
                  <MpCheckbox id="np-does-sell" :is-checked="doesSell" @change="doesSell = !doesSell" />
                  <span>{{ t('I sell this product') }}</span>
                </label>
                <div v-if="doesSell" class="nw-row np-toggle-fields np-toggle-fields--wrap">
                  <MpFormControl id="np-sales-price" class="np-field-270">
                    <MpFormLabel>{{ t('Default sales price') }}</MpFormLabel>
                    <div class="np-prefix-wrap">
                      <span class="np-prefix-chip">Rp</span>
                      <input id="np-sales-price-input" v-model="salesPrice" class="np-prefix-input" type="text" inputmode="numeric" placeholder="0" />
                    </div>
                  </MpFormControl>
                  <MpFormControl id="np-sales-account" class="np-field-270" is-required>
                    <MpFormLabel>{{ t('Default sales account') }}</MpFormLabel>
                    <MpAutocomplete
                      id="np-sales-account-ac" v-model="salesAccount" :data="salesAccountOptions" label-prop="label" value-prop="value"
                      is-searchable use-portal is-full-width
                    />
                  </MpFormControl>
                  <MpFormControl id="np-sales-tax" class="np-field-270">
                    <MpFormLabel>{{ t('Default sales tax') }}</MpFormLabel>
                    <MpAutocomplete
                      id="np-sales-tax-ac" v-model="salesTax" :data="taxOptions" label-prop="label" value-prop="value"
                      :placeholder="t('Select default sales tax')" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                  <MpFormControl id="np-discount-account" class="np-field-270">
                    <MpFormLabel>{{ t('Default discount account') }}</MpFormLabel>
                    <MpAutocomplete
                      id="np-discount-account-ac" v-model="discountAccount" :data="discountAccountOptions" label-prop="label" value-prop="value"
                      :placeholder="t('Select default discount account')" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                </div>
              </div>
            </template>

          </div>
        </div>

      </div>

      <!-- ── Tax info — ERP only; the WMS Standalone package has no tax module ── -->
      <div v-if="!isWms" class="nw-form-group np-full">
        <div class="nw-section">
          <h2 class="nw-section-title">{{ t('Tax info') }}</h2>
          <div class="nw-section-spacer" />

          <div class="nw-fields">

            <!-- Product classification -->
            <MpFormControl id="np-classification">
              <MpFormLabel>{{ t('Product classification') }}</MpFormLabel>
              <div class="np-radio-group">
                <label class="np-radio-item">
                  <MpRadio id="np-classification-goods" name="np-classification" value="Goods" :is-checked="productClassification === 'Goods'" @change="productClassification = 'Goods'" />
                  <span>{{ t('Goods') }}</span>
                </label>
                <label class="np-radio-item">
                  <MpRadio id="np-classification-service" name="np-classification" value="Service" :is-checked="productClassification === 'Service'" @change="productClassification = 'Service'" />
                  <span>{{ t('Service') }}</span>
                </label>
              </div>
            </MpFormControl>

            <!-- Classification code — same width as Category (564px), not the full Tax info row -->
            <div class="np-ai-field np-field-564">
              <MpFormControl id="np-classification-code" :class="{ 'np-ai-select': demoState === 'ai_matched' }">
                <MpFormLabel>{{ t('DJP code') }}</MpFormLabel>
                <MpAutocomplete
                  id="np-classification-code-ac" v-model="classificationCode" :data="classificationCodeOptions" label-prop="label" value-prop="value"
                  :placeholder="t('Select DJP code')" is-searchable use-portal is-full-width is-adaptive-width
                >
                  <template #default="{ item }">
                    <MpTooltip
                      v-if="item.label.length > 60" :id="`np-cc-tip-${item.value}`"
                      :label="item.label" placement="top" use-portal
                    >
                      <span class="np-option-truncate np-option-truncate--code">{{ item.label }}</span>
                    </MpTooltip>
                    <span v-else class="np-option-truncate np-option-truncate--code">{{ item.label }}</span>
                  </template>
                </MpAutocomplete>
              </MpFormControl>
              <div v-if="demoState === 'ai_matched'" class="np-ai-banner">
                <MpIcon name="airene-brand" size="sm" />
                <span>{{ t('AI matched — Matches product name & description') }}</span>
              </div>
            </div>

            <!-- DJP unit -->
            <MpFormControl id="np-djp-unit" class="np-field-270">
              <MpFormLabel>{{ t('DJP unit') }}</MpFormLabel>
              <MpAutocomplete
                id="np-djp-unit-ac" v-model="djpUnit" :data="djpUnitOptions" label-prop="label" value-prop="value"
                :placeholder="t('Select DJP unit')" is-searchable use-portal is-full-width is-adaptive-width
              >
                <template #default="{ item }">
                  <MpTooltip
                    v-if="item.label.length > 60" :id="`np-djp-tip-${item.value}`"
                    :label="item.label" placement="top" use-portal
                  >
                    <span class="np-option-truncate np-option-truncate--unit">{{ item.label }}</span>
                  </MpTooltip>
                  <span v-else class="np-option-truncate np-option-truncate--unit">{{ item.label }}</span>
                </template>
              </MpAutocomplete>
            </MpFormControl>

          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <div ref="footerEl" class="nw-footer" :class="{ 'nw-footer--floating': stageOverflowing }">
      <button class="nw-btn-cancel" @click="goBack">{{ t('Cancel') }}</button>
      <button v-if="!isEdit" class="nw-btn-secondary" :disabled="isSaving || isSavingAndAdding" @click="saveAndAdd">
        {{ isSavingAndAdding ? t('Saving…') : t('Save & add another') }}
      </button>
      <button class="nw-btn-save" :disabled="isSaving || isSavingAndAdding" @click="save">{{ isSaving ? t('Saving…') : t('Save') }}</button>
    </div>

    <!-- ── Demo scenario FAB — Tax info preview states; nothing to preview in WMS ── -->
    <MpPopover v-if="!isWms" id="np-demo-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <MpButton class="demo-fab" :style="{ bottom: fabBottom + 'px' }" :aria-label="t('Change scenario state')"><MpIcon name="sliders" size="md" color="icon.inverse" /></MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
        <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
        <MpPopoverList>
          <MpPopoverListItem
            v-for="s in demoStates" :key="s.value"
            :is-active="s.value === demoState" @click="setDemoState(s.value)"
          >{{ s.label }}</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* ── Shell — identical to NewWarehousePage.vue ── */
.nw-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.nw-titlebar {
  flex-shrink: 0; height: 72px; background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 var(--mp-spacing-6);
}
.nw-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.nw-breadcrumb {
  background: none; border: none; cursor: pointer; padding: 0; font-size: 12px;
  font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link); font-family: inherit; white-space: nowrap;
}
.nw-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.nw-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.nw-stage {
  flex: 1; min-height: 0; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
}
.nw-form-group { width: 564px; max-width: 100%; display: flex; flex-direction: column; gap: 20px; }
.nw-form-group.np-full { width: 100%; margin-top: 40px; }
.nw-section { display: flex; flex-direction: column; }
.nw-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.nw-section-spacer { height: 12px; }
.nw-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
/* Pricing & inventory info: 20px row gap between the I track / I buy / I sell blocks */
.np-full .nw-fields { gap: 20px; }
.nw-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.nw-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }

/* Label + icon row (e.g. Barcode's BarcodeSettingsButton) */
.np-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.nw-counter { flex-shrink: 0; font-size: 12px; font-weight: var(--mp-font-weights-regular); line-height: 16px; color: var(--mp-text-secondary); text-align: right; }
/* Sticky footer — mirrors CreateReceiptPage.vue's .detail-footer */
.nw-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
  transition: border-top-color 0.15s;
}
.nw-footer--floating { border-top-color: var(--mp-border-default); }
.nw-btn-secondary {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  border: 1px solid var(--mp-border-bold);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); cursor: pointer; white-space: nowrap; font-family: inherit;
}
.nw-btn-secondary:hover:not(:disabled) { background: var(--mp-background-neutral-hovered); }
.nw-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }
.nw-btn-cancel {
  background: transparent; border: none; border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; font-family: inherit;
}
.nw-btn-cancel:hover { background: var(--mp-background-neutral-hovered); }
.nw-btn-save {
  background: var(--mp-colors-emerald-700, #029861); border: 1px solid var(--mp-colors-emerald-700, #029861);
  border-radius: var(--mp-radii-full, 999px); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-inverse); cursor: pointer; font-family: inherit; white-space: nowrap;
}
.nw-btn-save:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
.nw-btn-save:disabled { opacity: 0.7; cursor: default; }

/* ── This page's own layout: Product info (564px) + Product photo (270px), 122px gap (Figma) ── */
.np-layout { display: flex; gap: 122px; align-items: flex-start; width: 100%; }
.np-photo-col { flex-shrink: 0; width: 270px; display: flex; flex-direction: column; }

.np-field-270 { width: 270px; flex-shrink: 0; }

/* Radio group */
.np-radio-group { display: flex; gap: var(--mp-spacing-6); align-items: center; }
/* No gap here — MpRadio already renders its own 12px control-to-label gap
   internally (radio__root). A wrapper gap would stack into a double gap. */
.np-radio-item { display: flex; align-items: center; gap: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); user-select: none; }

/* Plain checkbox row (not wrapped in MpFormControl — matches Figma's simple toggle rows) */
/* No gap here — MpCheckbox already renders its own 12px control-to-label gap
   internally (checkbox__root). A wrapper gap would stack into a double gap. */
.np-checkbox-row { display: flex; align-items: center; gap: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); user-select: none; }

/* Toggle-reveal blocks (Pricing & inventory info) */
.np-toggle-block { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.np-toggle-fields { padding-left: var(--mp-spacing-7, 28px); }
.np-toggle-fields--wrap { flex-wrap: wrap; row-gap: var(--mp-spacing-4); }

/* Prefix chip (Rp) / suffix chip (unit) — no MpFormControl precedent exists for this,
   built the same way the codebase's table-cell prefix inputs are (wrapper + chip + raw input) */
.np-prefix-wrap, .np-suffix-wrap {
  display: flex; align-items: stretch; width: 100%;
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); overflow: hidden;
}
.np-prefix-chip, .np-suffix-chip {
  display: flex; align-items: center; padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap;
}
.np-prefix-input, .np-suffix-input {
  flex: 1; min-width: 0; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3);
  border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.np-suffix-input { text-align: left; }
.np-prefix-wrap:focus-within, .np-suffix-wrap:focus-within {
  border-color: var(--mp-border-focused, #0f6d4d); box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15,109,77,0.2));
}

/* Photo dropzone */
.np-dropzone {
  width: 270px; height: 270px; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); padding: var(--mp-spacing-8); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-placeholder); text-align: center; cursor: pointer;
  transition: background 0.15s;
}
.np-dropzone--over { background: var(--mp-background-neutral-subtle-hovered, var(--mp-background-neutral-hovered)); }
.np-dropzone-icon { width: 48px; height: 48px; }
.np-dropzone-copy { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.np-dropzone-link { color: var(--mp-text-link); cursor: pointer; }
.np-dropzone-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.np-photo-preview {
  position: relative; width: 270px; height: 270px; border-radius: var(--mp-radii-md); overflow: hidden;
  background: var(--mp-background-neutral-subtle);
}
.np-photo-img { width: 100%; height: 100%; object-fit: cover; }
.np-photo-remove {
  position: absolute; top: var(--mp-spacing-2); right: var(--mp-spacing-2);
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse); color: var(--mp-text-inverse); cursor: pointer; opacity: 0.85;
}
.np-photo-remove:hover { opacity: 1; }

/* Tax info — AI-matched banner attaches to the classification code select's
   bottom edge (select gets -8px margin + z-index so its border sits on top) */
.np-ai-field { display: flex; flex-direction: column; }
.np-ai-select { margin-bottom: calc(-1 * var(--mp-spacing-2, 8px)); position: relative; z-index: 2; }
.np-ai-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  position: relative; z-index: 1;
  background: var(--mp-airene-banner-bg, #f6f3ff); color: var(--mp-airene-banner-text, #5221a5);
  padding: var(--mp-spacing-4, 16px) var(--mp-spacing-1\.5, 6px) var(--mp-spacing-1\.5, 6px);
  border-radius: 0 0 var(--mp-radii-md) var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
}

/* Classification code / DJP unit popover options — long DJP descriptions get
   ellipsis-truncated instead of wrapping/overflowing; full text via MpTooltip.
   Widths are capped a little under the field's own width (minus the popover
   list item's own horizontal padding) so the popover never grows past it. */
.np-field-564 { width: 564px; max-width: 100%; }
.np-option-truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-option-truncate--code { max-width: 532px; }
.np-option-truncate--unit { max-width: 238px; }

/* Demo scenario FAB — mirrors ShippedIndexPage.vue's .demo-fab; rendered via
   MpButton, not a raw HTML control, with its default look reset so it can take
   on the circular floating-trigger shape. */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0 !important; min-width: 0 !important;
  display: inline-flex !important; align-items: center; justify-content: center;
  border: none !important; border-radius: var(--mp-radii-full, 999px) !important;
  background: var(--mp-background-inverse) !important; color: var(--mp-text-inverse); cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB trigger */
}
.demo-fab:hover { opacity: 0.9; background: var(--mp-background-inverse) !important; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
