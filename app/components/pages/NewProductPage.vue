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
import { recommendedMinStock } from '~/data/replenishment'
import { effectiveSettings, getSkuOverride, saveSkuOverride } from '~/data/replenishmentSettings'
import { getReplenishmentConfig } from '~/data/replenishmentConfig'
import { leadTimeTierLabel } from '~/data/leadTimeHistory'

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
/**
 * Safety days is the number a person actually DECIDES (PRD §2.1): how much extra
 * cover to carry beyond the vendor's lead time. Min. stock below is what that
 * decision works out to — the PRD defines them as one quantity, "Reorder Point =
 * MINIMUM STOCK THRESHOLD = avg daily demand × (lead time + safety days)" — so
 * it is recommended rather than invented, and only overwritten deliberately.
 */
const safetyDays = ref('')
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

// Prefill in edit mode — only custom (user-created) products carry the full set
// of form fields; a seed CATALOG product can still be opened for edit but only
// its base fields prefill (accounts/toggles fall back to sensible defaults).
onMounted(() => {
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

  // Only a SKU-level OVERRIDE prefills. Leaving the box empty is what makes the
  // value inherited rather than pinned, so an inherited figure must show as the
  // placeholder, never as text in the field.
  const override = getSkuOverride(p.sku)
  if (override.safetyDays !== undefined) safetyDays.value = String(override.safetyDays)
  if (override.reorderPoint !== undefined) minStock.value = String(override.reorderPoint)
})

/**
 * What the system would set min. stock to, recomputed live as safety days is
 * typed. Null while there is no sales history to compute from — a brand-new
 * product has none, and a fabricated floor is exactly what US-003 forbids.
 */
const recommendation = computed(() => {
  const s = sku.value.trim()
  if (!s) return null
  const days = safetyDays.value === '' ? undefined : Number(safetyDays.value)
  return recommendedMinStock(s, Number.isFinite(days!) ? days : undefined)
})

/** The safety days in force if the user sets none — category or company default. */
const inheritedSafetyDays = computed(() => {
  const s = sku.value.trim()
  const cfg = getReplenishmentConfig()
  if (!s) return cfg.safetyDaysGlobal
  const wh = recommendation.value?.warehouseId
  return wh ? effectiveSettings(s, wh, cfg).safetyDays : cfg.safetyDaysGlobal
})

const minStockIsOverridden = computed(() =>
  minStock.value !== '' && Number(minStock.value) !== recommendation.value?.value,
)

/**
 * The min-stock explanation is collapsed by default.
 *
 * The recommended NUMBER is already visible — it is the field's placeholder and
 * the one-line summary — so what is hidden is the reasoning behind it, which
 * matters the first few times and becomes noise after that. It opens on click
 * rather than hover because it contains links, and a hover panel you have to
 * chase with the cursor is a panel whose links never get used.
 */
const minStockDetailsOpen = ref(false)

/** Plain string — MpTooltip takes a label, not markup. */
const safetyDaysTooltip = computed(() =>
  `${t('Extra cover beyond the vendor lead time, on top of however long delivery takes.')} `
  + `${t('Leave empty to inherit')} ${inheritedSafetyDays.value} ${t('days')}.`,
)

/** Where the category and fallback lead times actually live. */
function openLeadTimeSettings() {
  router.push({ path: '/replenishment-settings', hash: '#lead-time' })
}

/** The Vendors tab is where a preferred vendor is set — go there, don't explain it. */
function openVendors() {
  router.push(`/product-list/${props.orderId}?section=vendors`)
}

function useRecommendedMinStock() {
  const v = recommendation.value?.value
  if (v !== null && v !== undefined) minStock.value = String(v)
}

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

// Base unit → DJP unit — when the product's base unit has an obvious DJP
// equivalent, preselect it instead of making the user pick the same thing twice.
const BASE_UNIT_TO_DJP_GOODS: Record<string, string> = {
  Pcs: 'Piece', Piece: 'Piece', Kg: 'Kilogram', Kilogram: 'Kilogram', Box: 'Box', Unit: 'Unit',
  Liter: 'Liter', Ltr: 'Liter', Gram: 'Gram', Meter: 'Meter', Dozen: 'Dozen', Set: 'Set',
  Carton: 'Carton', Drum: 'Drum', Barrel: 'Barrel', Sheet: 'Sheet', Yard: 'Yard', Inch: 'Inch', Ampere: 'Ampere',
}
function preselectDjpUnit() {
  // Switching Goods ↔ Service swaps the DJP unit list — drop a unit picked from
  // the other list before (maybe) preselecting one that matches the base unit.
  if (djpUnit.value && !djpUnitOptions.value.some(o => o.value === djpUnit.value)) {
    djpUnit.value = ''
  }
  const mapped = productClassification.value === 'Service' ? undefined : BASE_UNIT_TO_DJP_GOODS[unit.value]
  if (mapped && djpUnitOptions.value.some(o => o.value === mapped)) {
    djpUnit.value = mapped
  }
}
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
  safetyDays.value = ''
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

/**
 * Persist the two replenishment inputs at the SKU tier (US-011 VR-03 precedence:
 * warehouse-SKU > SKU > category > global).
 *
 * An empty box means INHERIT, so it clears the override rather than storing a
 * zero — storing 0 would pin the product to "no buffer" and quietly stop it ever
 * being recommended. Min. stock is only stored when it actually differs from the
 * recommendation; accepting the suggested figure leaves it calculated, so it
 * keeps tracking demand instead of freezing at today's number.
 */
function saveReplenishmentInputs(savedSku: string) {
  const safety = safetyDays.value.trim()
  const min = minStock.value.trim()
  const recommended = recommendation.value?.value ?? null

  saveSkuOverride(savedSku, {
    safetyDays: safety === '' ? undefined : Math.max(0, Number(safety)),
    reorderPoint: min === '' || Number(min) === recommended
      ? undefined
      : Math.max(0, Number(min)),
  })
}

async function save() {
  if (!validate()) return

  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  const payload = buildPayload()
  isSaving.value = false

  if (isEdit.value && editingCustom.value) {
    updateCustomProduct(props.orderId!, payload)
    saveReplenishmentInputs(payload.sku)
    toast.notify({ variant: 'success', title: t('Product changes saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${payload.sku}`)
  } else if (isEdit.value) {
    // Seed (CATALOG) product — its master fields are read-only, but replenishment
    // settings are the tenant's own policy and DO persist, for seed products too.
    saveReplenishmentInputs(props.orderId!)
    toast.notify({ variant: 'success', title: t('Product changes saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${props.orderId}`)
  } else {
    // New product → whatever's in the field (free-typed or generated via the
    // settings icon); left blank, the product simply has no real barcode yet.
    const created = addCustomProduct({ ...payload, barcode: barcode.value.trim() || undefined })
    saveReplenishmentInputs(created.sku)
    toast.notify({ variant: 'success', title: t('Product saved'), maxWidth: 'max-content' })
    router.push(`/product-list/${created.sku}`)
  }
}

// Create mode only — persist then reset the form to add the next product.
async function saveAndAdd() {
  if (!validate()) return
  isSavingAndAdding.value = true
  await new Promise(r => setTimeout(r, 600))
  addCustomProduct({ ...buildPayload(), barcode: barcode.value.trim() || undefined })
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
                <!-- Safety days is the decision; min. stock is what it works out
                     to. Ordering matters — the input comes before its result. -->
                <MpFormControl id="np-safety-days" class="np-field-270">
                  <MpFormLabel>
                    <span class="np-label-with-info">
                      {{ t('Safety days') }}
                      <MpTooltip
                        id="np-safety-days-tip" :label="safetyDaysTooltip"
                        placement="top" use-portal
                      >
                        <span class="np-info-icon"><MpIcon name="info" size="sm" /></span>
                      </MpTooltip>
                    </span>
                  </MpFormLabel>
                  <div class="np-suffix-wrap">
                    <input
                      id="np-safety-days-input" v-model="safetyDays" class="np-suffix-input"
                      type="text" inputmode="numeric" :placeholder="String(inheritedSafetyDays)"
                    />
                    <span class="np-suffix-chip">{{ t('days') }}</span>
                  </div>
                </MpFormControl>

                <MpFormControl id="np-min-stock" class="np-field-270">
                  <MpFormLabel>{{ t('Min. stock') }}</MpFormLabel>
                  <div class="np-suffix-wrap">
                    <input
                      id="np-min-stock-input" v-model="minStock" class="np-suffix-input"
                      type="text" inputmode="numeric"
                      :placeholder="recommendation?.value !== null && recommendation?.value !== undefined ? String(recommendation.value) : '0'"
                    />
                    <span class="np-suffix-chip">{{ unit || 'Pcs' }}</span>
                  </div>

                  <!--
                    One line always, the reasoning on request. The recommended
                    number is right there in the placeholder, so what is worth
                    hiding is the arithmetic behind it — useful the first few
                    times, clutter every time after.
                  -->
                  <template v-if="recommendation && recommendation.value !== null">
                    <span class="np-field-hint">
                      {{ t('Recommended') }} {{ recommendation.value }} {{ unit || 'Pcs' }}
                      <a class="np-field-link" @click="minStockDetailsOpen = !minStockDetailsOpen">
                        {{ minStockDetailsOpen ? t('Hide details') : t('Why this number?') }}
                        <MpIcon :name="minStockDetailsOpen ? 'chevrons-up' : 'chevrons-down'" size="sm" />
                      </a>
                      <a v-if="minStockIsOverridden" class="np-field-link" @click="useRecommendedMinStock">
                        {{ t('Use recommended') }}
                      </a>
                    </span>

                    <div v-if="minStockDetailsOpen" class="np-field-details">
                      <p class="np-field-details-row">
                        {{ recommendation.avgDailySales.toFixed(2) }}/{{ t('day') }} ×
                        ({{ recommendation.leadTimeDays }} {{ t('days lead time') }} +
                        {{ recommendation.safetyDays }} {{ t('safety') }})
                        = {{ recommendation.value }} {{ unit || 'Pcs' }}
                      </p>
                      <p v-if="recommendation.warehouseCount > 1" class="np-field-details-row">
                        {{ t('Covers') }} {{ recommendation.warehouseName }},
                        {{ t('your busiest of') }} {{ recommendation.warehouseCount }}.
                      </p>

                      <!-- Where the LEAD TIME came from. A category default and an
                           average of five real receipts look identical once
                           multiplied out, so the figure has to say which it is
                           (US-001 AC-03/AC-04). -->
                      <p class="np-field-details-row">
                        <template v-if="!recommendation.preferredVendorId">
                          {{ t('No preferred vendor yet, so this uses your') }}
                          {{ category || t('category') }} {{ t('default of') }}
                          {{ recommendation.leadTimeDays }} {{ t('days') }}.
                          {{ t('Set one and the lead time comes from their actual deliveries.') }}
                        </template>
                        <template v-else-if="recommendation.leadTimeEstimated">
                          {{ t('Lead time is an estimate') }}
                          ({{ leadTimeTierLabel(recommendation.leadTimeTier) }}) —
                          {{ recommendation.preferredVendorName }}
                          {{ t('has no delivered purchase orders yet. It sharpens once they do.') }}
                        </template>
                        <template v-else>
                          {{ t('Lead time measured from') }} {{ recommendation.preferredVendorName }} —
                          {{ leadTimeTierLabel(recommendation.leadTimeTier, recommendation.leadTimeSampleSize) }}.
                        </template>
                      </p>

                      <p class="np-field-details-row">
                        <a v-if="isEdit && !recommendation.preferredVendorId" class="np-field-link" @click="openVendors">
                          {{ t('Set preferred vendor') }}
                        </a>
                        <span v-if="isEdit && !recommendation.preferredVendorId" class="np-field-sep">·</span>
                        <a class="np-field-link" @click="openLeadTimeSettings">{{ t('Category defaults') }}</a>
                      </p>
                    </div>
                  </template>

                  <!-- No number to explain — the reason IS the message, so it stays
                       visible rather than hiding behind a disclosure. -->
                  <span v-else class="np-field-hint">
                    {{ t('Calculated from sales history and your vendor lead time once this product starts moving. Set a figure now if you already know it.') }}
                  </span>
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

/* Field-level explanation: where a recommended number came from, and how to get
   back to it after overwriting. Muted so it reads as support, not as an error. */
.np-field-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mp-text-subdued, #6b7280);
}
.np-field-link {
  margin-left: 6px;
  color: var(--mp-text-brand, #029861);
  cursor: pointer;
}
.np-field-link:hover { text-decoration: underline; }
.np-field-sep { margin-left: 6px; color: var(--mp-text-subdued, #6b7280); }

/* Label + its info affordance, so the icon sits on the text baseline rather
   than hanging off the end of the control. */
.np-label-with-info { display: inline-flex; align-items: center; gap: 4px; }
.np-info-icon {
  display: inline-flex;
  color: var(--mp-icon-subdued, #9ca3af);
  cursor: help;
}
.np-info-icon:hover { color: var(--mp-icon-default, #4b5563); }

/* The expanded reasoning. Indented behind a rule so it reads as support for the
   field above rather than as a new field of its own. */
.np-field-details {
  margin-top: 8px;
  padding-left: 10px;
  border-left: 2px solid var(--mp-border-subdued, #e5e7eb);
}
.np-field-details-row {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mp-text-subdued, #6b7280);
}
.np-field-details-row:last-child { margin-bottom: 0; }
/* The toggle's chevron should ride with its text, not float above it. */
.np-field-link { display: inline-flex; align-items: center; gap: 2px; }

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
