<script setup lang="ts">
/**
 * New product form (Figma: "Products / New product"). Shell + field conventions
 * mirror NewWarehousePage.vue exactly (breadcrumb+H1 title bar, .nw-* classes,
 * inline validation fired only on Save, MpAutocomplete for required selects).
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpTextarea, MpRadio, MpCheckbox, MpAutocomplete, toast,
} from '@mekari/pixel3'
import BarcodeSettingsButton from '~/components/patterns/BarcodeSettingsButton.vue'
import { PRODUCTS, type Product } from '~/data/inventory'
import { customProducts, addCustomProduct, updateCustomProduct } from '~/data/customProducts'

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
})

// ── Options ────────────────────────────────────────────────────────────────────
const categoryOptions = computed(() =>
  [...new Set(PRODUCTS.map(p => p.category))].sort().map(c => ({ label: c, value: c })),
)
const unitOptions = computed(() =>
  [...new Set(['Pcs', ...PRODUCTS.map(p => p.unit)])].sort().map(u => ({ label: u, value: u })),
)
const trackStockByOptions = [
  { label: 'Quantity', value: 'Quantity' },
  { label: 'Batch', value: 'Batch' },
  { label: 'Serial number', value: 'Serial number' },
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

  if (!name.value.trim()) nameError.value = 'You must fill in product name'

  if (!sku.value.trim()) {
    skuError.value = 'You must fill in SKU'
  } else {
    const skuUpper = sku.value.trim().toUpperCase()
    const dup = [...PRODUCTS, ...customProducts].some(
      p => p.sku.toUpperCase() === skuUpper && (!isEdit.value || p.sku !== props.orderId),
    )
    if (dup) skuError.value = 'SKU already taken'
  }

  if (!category.value) categoryError.value = 'You must select category'
  if (!unit.value) unitError.value = 'You must select base unit'

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
    toast.notify({ variant: 'success', title: 'Product updated', maxWidth: 'max-content' })
    router.push(`/product-list/${payload.sku}`)
  } else if (isEdit.value) {
    // Seed (CATALOG) product — read-only master data, nothing to persist.
    toast.notify({ variant: 'success', title: 'Product updated', maxWidth: 'max-content' })
    router.push(`/product-list/${props.orderId}`)
  } else {
    // New product → whatever's in the field (free-typed or generated via the
    // settings icon); left blank, the product simply has no real barcode yet.
    const created = addCustomProduct({ ...payload, barcode: barcode.value.trim() || undefined })
    toast.notify({ variant: 'success', title: 'Product saved', maxWidth: 'max-content' })
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
</script>

<template>
  <div class="nw-page">

    <!-- ── Title bar ── -->
    <div class="nw-titlebar">
      <div class="nw-titlebar-left">
        <button class="nw-breadcrumb" @click="goBack">Products</button>
        <h1 class="nw-title">{{ isEdit ? 'Edit product' : 'New product' }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div ref="stageEl" class="nw-stage">
      <div class="np-layout">

        <!-- ── Product info ── -->
        <div class="nw-form-group">
          <div class="nw-section">
            <h2 class="nw-section-title">Product info</h2>
            <div class="nw-section-spacer" />

            <div class="nw-fields">

              <!-- Product type -->
              <MpFormControl id="np-type" is-required>
                <MpFormLabel>Product type</MpFormLabel>
                <div class="np-radio-group">
                  <label class="np-radio-item">
                    <MpRadio id="np-type-single" name="np-type" value="single" :is-checked="productType === 'single'" @change="productType = 'single'" />
                    <span>Single product</span>
                  </label>
                  <label class="np-radio-item">
                    <MpRadio id="np-type-bundle" name="np-type" value="bundle" :is-checked="productType === 'bundle'" @change="productType = 'bundle'" />
                    <span>Bundle product</span>
                  </label>
                </div>
              </MpFormControl>

              <!-- Has variants -->
              <label class="np-checkbox-row">
                <MpCheckbox id="np-has-variants" :is-checked="hasVariants" @change="hasVariants = !hasVariants" />
                <span>This product has variants</span>
              </label>

              <!-- Product name -->
              <MpFormControl id="np-name" is-required :is-invalid="!!nameError">
                <div class="nw-label-row">
                  <MpFormLabel>Product name</MpFormLabel>
                  <span class="nw-counter">{{ name.length }} / {{ NAME_MAX }}</span>
                </div>
                <MpInput id="np-name-input" v-model="name" :maxlength="NAME_MAX" @update:model-value="nameError = ''" />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- SKU + Barcode -->
              <div class="nw-row">
                <MpFormControl id="np-sku" class="np-field-270" is-required :is-invalid="!!skuError">
                  <MpFormLabel>SKU</MpFormLabel>
                  <MpInput id="np-sku-input" v-model="sku" @update:model-value="skuError = ''" />
                  <MpFormErrorMessage>{{ skuError }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="np-barcode" class="np-field-270">
                  <div class="np-label-row">
                    <MpFormLabel>Barcode</MpFormLabel>
                    <BarcodeSettingsButton @generated="barcode = $event" />
                  </div>
                  <MpInput id="np-barcode-input" v-model="barcode" placeholder="Enter barcode or generate" is-full-width />
                </MpFormControl>
              </div>

              <!-- Category -->
              <MpFormControl id="np-category" is-required :is-invalid="!!categoryError">
                <MpFormLabel>Category</MpFormLabel>
                <MpAutocomplete
                  id="np-category-ac" v-model="category" :data="categoryOptions" label-prop="label" value-prop="value"
                  placeholder="Select category" is-searchable use-portal is-full-width :is-invalid="!!categoryError"
                  @update:model-value="categoryError = ''"
                />
                <MpFormErrorMessage>{{ categoryError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Base unit -->
              <MpFormControl id="np-unit" class="np-field-270" is-required :is-invalid="!!unitError">
                <MpFormLabel>Base unit</MpFormLabel>
                <MpAutocomplete
                  id="np-unit-ac" v-model="unit" :data="unitOptions" label-prop="label" value-prop="value"
                  placeholder="Select unit" is-searchable use-portal is-full-width :is-invalid="!!unitError"
                  @update:model-value="unitError = ''"
                />
                <MpFormErrorMessage>{{ unitError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Description -->
              <MpFormControl id="np-desc">
                <div class="nw-label-row">
                  <MpFormLabel>Description</MpFormLabel>
                  <span class="nw-counter">{{ description.length }} / {{ DESC_MAX.toLocaleString('id-ID') }}</span>
                </div>
                <MpTextarea id="np-desc-input" v-model="description" :maxlength="DESC_MAX" is-full-width rows="6" />
              </MpFormControl>

            </div>
          </div>
        </div>

        <!-- ── Product photo ── -->
        <div class="np-photo-col">
          <h2 class="nw-section-title">Product photo</h2>
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
                Choose photo
                <input type="file" accept="image/*" hidden @change="onPhotoInput" />
              </label>
              or drag and drop here
            </p>
          </div>
          <div v-else class="np-photo-preview">
            <img :src="photoDataUrl" alt="Product photo" class="np-photo-img" />
            <button class="np-photo-remove" type="button" aria-label="Remove photo" @click="removePhoto">
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
          <h2 class="nw-section-title">{{ isWms ? 'Inventory info' : 'Pricing & inventory info' }}</h2>
          <div class="nw-section-spacer" />

          <div class="nw-fields">

            <!-- I track stock for this product -->
            <div class="np-toggle-block">
              <label class="np-checkbox-row">
                <MpCheckbox id="np-track-stock" :is-checked="trackStock" @change="trackStock = !trackStock" />
                <span>I track stock for this product</span>
              </label>
              <div v-if="trackStock" class="nw-row np-toggle-fields">
                <MpFormControl id="np-min-stock" class="np-field-270">
                  <MpFormLabel>Min. stock</MpFormLabel>
                  <div class="np-suffix-wrap">
                    <input id="np-min-stock-input" v-model="minStock" class="np-suffix-input" type="text" inputmode="numeric" placeholder="0" />
                    <span class="np-suffix-chip">{{ unit || 'Pcs' }}</span>
                  </div>
                </MpFormControl>
                <MpFormControl id="np-track-by" class="np-field-270" is-required>
                  <MpFormLabel>Track stock by</MpFormLabel>
                  <MpAutocomplete
                    id="np-track-by-ac" v-model="trackStockBy" :data="trackStockByOptions" label-prop="label" value-prop="value"
                    is-searchable use-portal is-full-width
                  />
                </MpFormControl>
                <MpFormControl v-if="!isWms" id="np-inventory-account" class="np-field-270" is-required>
                  <MpFormLabel>Default inventory account</MpFormLabel>
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
                  <span>I buy this product</span>
                </label>
                <div v-if="doesBuy" class="nw-row np-toggle-fields">
                  <MpFormControl id="np-purchase-cost" class="np-field-270">
                    <MpFormLabel>Default purchase cost</MpFormLabel>
                    <div class="np-prefix-wrap">
                      <span class="np-prefix-chip">Rp</span>
                      <input id="np-purchase-cost-input" v-model="purchaseCost" class="np-prefix-input" type="text" inputmode="numeric" placeholder="0" />
                    </div>
                  </MpFormControl>
                  <MpFormControl id="np-purchase-account" class="np-field-270" is-required>
                    <MpFormLabel>Default purchase account</MpFormLabel>
                    <MpAutocomplete
                      id="np-purchase-account-ac" v-model="purchaseAccount" :data="purchaseAccountOptions" label-prop="label" value-prop="value"
                      is-searchable use-portal is-full-width
                    />
                  </MpFormControl>
                  <MpFormControl id="np-purchase-tax" class="np-field-270">
                    <MpFormLabel>Default purchase tax</MpFormLabel>
                    <MpAutocomplete
                      id="np-purchase-tax-ac" v-model="purchaseTax" :data="taxOptions" label-prop="label" value-prop="value"
                      placeholder="Select default purchase tax" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                </div>
              </div>

              <div class="np-toggle-block">
                <label class="np-checkbox-row">
                  <MpCheckbox id="np-does-sell" :is-checked="doesSell" @change="doesSell = !doesSell" />
                  <span>I sell this product</span>
                </label>
                <div v-if="doesSell" class="nw-row np-toggle-fields np-toggle-fields--wrap">
                  <MpFormControl id="np-sales-price" class="np-field-270">
                    <MpFormLabel>Default sales price</MpFormLabel>
                    <div class="np-prefix-wrap">
                      <span class="np-prefix-chip">Rp</span>
                      <input id="np-sales-price-input" v-model="salesPrice" class="np-prefix-input" type="text" inputmode="numeric" placeholder="0" />
                    </div>
                  </MpFormControl>
                  <MpFormControl id="np-sales-account" class="np-field-270" is-required>
                    <MpFormLabel>Default sales account</MpFormLabel>
                    <MpAutocomplete
                      id="np-sales-account-ac" v-model="salesAccount" :data="salesAccountOptions" label-prop="label" value-prop="value"
                      is-searchable use-portal is-full-width
                    />
                  </MpFormControl>
                  <MpFormControl id="np-sales-tax" class="np-field-270">
                    <MpFormLabel>Default sales tax</MpFormLabel>
                    <MpAutocomplete
                      id="np-sales-tax-ac" v-model="salesTax" :data="taxOptions" label-prop="label" value-prop="value"
                      placeholder="Select default sales tax" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                  <MpFormControl id="np-discount-account" class="np-field-270">
                    <MpFormLabel>Default discount account</MpFormLabel>
                    <MpAutocomplete
                      id="np-discount-account-ac" v-model="discountAccount" :data="discountAccountOptions" label-prop="label" value-prop="value"
                      placeholder="Select default discount account" is-searchable use-portal is-full-width is-clearable
                    />
                  </MpFormControl>
                </div>
              </div>
            </template>

          </div>
        </div>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <div class="nw-footer" :class="{ 'nw-footer--floating': stageOverflowing }">
      <button class="nw-btn-cancel" @click="goBack">Cancel</button>
      <button v-if="!isEdit" class="nw-btn-secondary" :disabled="isSaving || isSavingAndAdding" @click="saveAndAdd">
        {{ isSavingAndAdding ? 'Saving…' : 'Save & add another' }}
      </button>
      <button class="nw-btn-save" :disabled="isSaving || isSavingAndAdding" @click="save">{{ isSaving ? 'Saving…' : 'Save' }}</button>
    </div>
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
</style>
