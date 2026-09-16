<script setup lang="ts">
/**
 * Create subcon order — the configurator that decides which documents the ERP
 * will raise.
 *
 * The three choices on this page (scope × split × supply method) are the whole
 * point: together they determine a different chain of purchase requests,
 * warehouse transfers and goods receipts. That chain is computed by
 * `buildDocumentPlan()` and previewed live in the last section, so the user sees
 * the consequence of each choice before saving rather than discovering it in
 * three other modules afterwards.
 */
import {
  MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpRadio, MpIcon,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import SubconPlanPreview from '~/components/patterns/SubconPlanPreview.vue'
import { warehouses } from '~/data/warehouses'
import { successToast } from '~/utils/toasts'
import {
  buildDocumentPlan, addSubconOrder,
  SUBCON_VENDORS, DEFAULT_SUBCON_VENDOR, SUBCON_SCOPE_LABEL, SUBCON_SCOPE_DESCRIPTION,
  SUBCON_METHOD_LABEL, SUBCON_METHOD_DESCRIPTION, SUBCON_OUTPUT, SUBCON_BATCH_QTY,
  PRODUCTION_WAREHOUSE, SOURCE_WAREHOUSE,
  type SubconScope, type SubconSplit, type SubconMethod,
} from '~/data/subcon'

const { t } = useLocale()
const router = useRouter()

function goList() { router.push('/subcon-orders') }

// ─── Form state ────────────────────────────────────────────────────────────────
const bomNumber = 'Bill of Materials #10087'
const scope = ref<SubconScope>('finished-good')
const split = ref<SubconSplit>('full')
const method = ref<SubconMethod>('resupply')
const vendorId = ref(DEFAULT_SUBCON_VENDOR.id)
const qty = ref(String(SUBCON_BATCH_QTY))
const promisedDate = ref('')
// Where components leave from, and where the vendor's output comes back to. The
// transfer's DESTINATION is the vendor's own location, derived from the vendor.
const sourceWarehouseId = ref(SOURCE_WAREHOUSE.id)
const receivingWarehouseId = ref(PRODUCTION_WAREHOUSE.id)

const warehouseOptions = warehouses
  .filter(w => !w.isDefault && w.status === 'active')
  .map(w => ({ value: w.id, label: w.name }))

function warehouseName(id: string) {
  return warehouseOptions.find(w => w.value === id)?.label ?? ''
}

/** Only `resupply` moves stock out of a company warehouse. */
const needsSourceWarehouse = computed(() => method.value === 'resupply')

const subconVendorOptions = SUBCON_VENDORS
  .filter(v => v.role === 'subcon')
  .map(v => ({ value: v.id, label: v.name }))

const vendor = computed(() => SUBCON_VENDORS.find(v => v.id === vendorId.value) ?? DEFAULT_SUBCON_VENDOR)

// ─── Choices ───────────────────────────────────────────────────────────────────
const scopeOptions = (Object.keys(SUBCON_SCOPE_LABEL) as SubconScope[]).map(k => ({
  key: k, label: t(SUBCON_SCOPE_LABEL[k]), desc: t(SUBCON_SCOPE_DESCRIPTION[k]),
}))

const splitOptions: { key: SubconSplit; label: string; desc: string }[] = [
  { key: 'full',    label: t('Full quantity'), desc: t('The whole order goes to the vendor.') },
  { key: 'partial', label: t('Partial (split)'), desc: t('Half goes to the vendor; the rest is handled in-house.') },
]

const methodOptions = computed(() =>
  (Object.keys(SUBCON_METHOD_LABEL) as SubconMethod[]).map(m => {
    const steps = buildDocumentPlan(scope.value, split.value, m).length
    return {
      key: m,
      label: m === 'basic' ? t('By the subcon vendor')
        : m === 'resupply' ? t('By the company itself')
        : t('By a 3rd-party vendor'),
      desc: t(SUBCON_METHOD_DESCRIPTION[scope.value][m]),
      steps: `${steps} ${t(steps === 1 ? 'document' : 'documents')}`,
    }
  }),
)

const methodLabel = computed(() => scope.value === 'finished-good'
  ? t('How are components procured?')
  : t('How does the raw material reach the subcon vendor?'))

/** What a partial split actually means, stated in this order's own terms. */
const splitNote = computed(() => {
  if (split.value !== 'partial') return ''
  const half = Math.round(Number(qty.value || 0) / 2)
  return scope.value === 'finished-good'
    ? `${half} ${t('of')} ${qty.value} ${SUBCON_OUTPUT.unit} ${t('subcontracted; the rest is produced in-house on a work order.')}`
    : `${half} ${t('of')} ${qty.value} ${t('sent for the subcon process; the rest is purchased normally into your warehouse.')}`
})

// ─── Save ──────────────────────────────────────────────────────────────────────
// The footer actions are always rendered and always enabled; a click with
// incomplete input surfaces the problem inline (rule/btn-no-disabled-validation).
const showErrors = ref(false)
const qtyError = computed(() => showErrors.value && !(Number(qty.value) > 0))
const dateError = computed(() => showErrors.value && !promisedDate.value)
const hasError = computed(() => qtyError.value || dateError.value)

function handleSave() {
  showErrors.value = true
  if (hasError.value) return

  const order = addSubconOrder({
    scope: scope.value,
    split: split.value,
    method: method.value,
    vendorId: vendor.value.id,
    vendorName: vendor.value.name,
    productId: SUBCON_OUTPUT.id,
    productName: SUBCON_OUTPUT.name,
    qty: Number(qty.value),
    unit: SUBCON_OUTPUT.unit,
    stage: 1,
    stageCaption: t('At BOM & subcon configuration'),
    receivedQty: 0,
    promisedDate: promisedDate.value,
    sourceWarehouseId: needsSourceWarehouse.value ? sourceWarehouseId.value : undefined,
    sourceWarehouseName: needsSourceWarehouse.value ? warehouseName(sourceWarehouseId.value) : undefined,
    receivingWarehouseId: receivingWarehouseId.value,
    receivingWarehouseName: warehouseName(receivingWarehouseId.value),
    lateDays: 0,
    status: 'draft',
    needsAttention: false,
    documents: [bomNumber],
    bomNumber,
  })
  successToast(t('Subcon order saved'))
  router.push(`/subcon-orders/${order.id}`)
}
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb btn-enterprise" @click="goList">{{ t('Subcon orders') }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New subcon order') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="sc-body">

        <!-- ══ Order info ═══════════════════════════════════════════════════ -->
        <section class="sc-section">
          <h2 class="sc-section-title">{{ t('Order info') }}</h2>

          <div class="sc-grid">
            <MpFormControl id="sc-bom">
              <MpFormLabel>{{ t('Bill of materials') }}</MpFormLabel>
              <MpInput id="sc-bom-input" :model-value="bomNumber" is-full-width is-disabled />
            </MpFormControl>

            <MpFormControl id="sc-product">
              <MpFormLabel>{{ t('Output product') }}</MpFormLabel>
              <MpInput id="sc-product-input" :model-value="SUBCON_OUTPUT.name" is-full-width is-disabled />
            </MpFormControl>

            <MpFormControl id="sc-vendor" is-required>
              <MpFormLabel>{{ t('Subcon vendor') }}</MpFormLabel>
              <ErpFilterSelect
                id="sc-vendor-select"
                v-model="vendorId"
                :placeholder="t('Subcon vendor')"
                :options="subconVendorOptions"
                :is-clearable="false"
                width="100%"
              />
            </MpFormControl>

            <MpFormControl id="sc-qty" is-required :is-invalid="qtyError">
              <MpFormLabel>{{ t('Quantity') }} ({{ SUBCON_OUTPUT.unit }})</MpFormLabel>
              <MpInput id="sc-qty-input" v-model="qty" type="number" is-full-width />
              <MpFormErrorMessage v-if="qtyError">
                {{ t('Enter how many units the vendor should deliver.') }}
              </MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="sc-promised" is-required :is-invalid="dateError">
              <MpFormLabel>{{ t('Promised return date') }}</MpFormLabel>
              <MpInput id="sc-promised-input" v-model="promisedDate" type="date" is-full-width />
              <MpFormErrorMessage v-if="dateError">
                {{ t('Pick the date the vendor has promised the goods back.') }}
              </MpFormErrorMessage>
            </MpFormControl>

            <!-- Source warehouse exists only for Resupply — it is the warehouse
                 the transfer draws from. Basic uses the vendor's own stock and
                 Dropship ships from a third party, so neither has one. -->
            <MpFormControl v-if="needsSourceWarehouse" id="sc-source-warehouse" is-required>
              <MpFormLabel>{{ t('Transfer components from') }}</MpFormLabel>
              <ErpFilterSelect
                id="sc-source-warehouse-select"
                v-model="sourceWarehouseId"
                :placeholder="t('Select warehouse')"
                :options="warehouseOptions"
                :is-clearable="false"
                width="100%"
              />
              <p class="sc-field-hint">
                {{ t('Destination') }}: {{ vendor.name }} — {{ t('in transit at vendor') }}
              </p>
            </MpFormControl>

            <MpFormControl id="sc-warehouse" is-required>
              <MpFormLabel>{{ t('Receive output into') }}</MpFormLabel>
              <ErpFilterSelect
                id="sc-warehouse-select"
                v-model="receivingWarehouseId"
                :placeholder="t('Select warehouse')"
                :options="warehouseOptions"
                :is-clearable="false"
                width="100%"
              />
            </MpFormControl>
          </div>
        </section>

        <!-- ══ Subcon scope ═════════════════════════════════════════════════ -->
        <section class="sc-section">
          <h2 class="sc-section-title">{{ t('What is subcontracted?') }}</h2>

          <div class="sc-cards">
            <label
              v-for="o in scopeOptions"
              :key="o.key"
              class="sc-card"
              :class="{ 'sc-card--selected': scope === o.key }"
            >
              <MpRadio
                :id="`sc-scope-${o.key}`"
                name="sc-scope"
                :value="o.key"
                :is-checked="scope === o.key"
                @change="scope = o.key"
              />
              <span class="sc-card__text">
                <span class="sc-card__label">{{ o.label }}</span>
                <span class="sc-card__desc">{{ o.desc }}</span>
              </span>
            </label>
          </div>

          <h3 class="sc-subsection-title">{{ t('How much of it?') }}</h3>
          <div class="sc-cards">
            <label
              v-for="o in splitOptions"
              :key="o.key"
              class="sc-card"
              :class="{ 'sc-card--selected': split === o.key }"
            >
              <MpRadio
                :id="`sc-split-${o.key}`"
                name="sc-split"
                :value="o.key"
                :is-checked="split === o.key"
                @change="split = o.key"
              />
              <span class="sc-card__text">
                <span class="sc-card__label">{{ o.label }}</span>
                <span class="sc-card__desc">{{ o.desc }}</span>
              </span>
            </label>
          </div>

          <MpBanner v-if="splitNote" type="information" :class="css({ marginTop: 'var(--mp-spacing-4)' })">
            <MpBannerIcon />
            <MpBannerTitle>{{ t('This order will be split') }}</MpBannerTitle>
            <MpBannerDescription>{{ splitNote }}</MpBannerDescription>
          </MpBanner>
        </section>

        <!-- ══ Component supply ═════════════════════════════════════════════ -->
        <section class="sc-section">
          <h2 class="sc-section-title">{{ methodLabel }}</h2>
          <p class="sc-section-desc">
            {{ t('This choice decides which documents the order raises — and whose stock sits at the vendor.') }}
          </p>

          <div class="sc-cards sc-cards--stack">
            <label
              v-for="o in methodOptions"
              :key="o.key"
              class="sc-card"
              :class="{ 'sc-card--selected': method === o.key }"
            >
              <MpRadio
                :id="`sc-method-${o.key}`"
                name="sc-method"
                :value="o.key"
                :is-checked="method === o.key"
                @change="method = o.key"
              />
              <span class="sc-card__text">
                <span class="sc-card__label">
                  {{ o.label }}
                  <SubconMethodChip :method="o.key" />
                </span>
                <span class="sc-card__desc">{{ o.desc }}</span>
                <span class="sc-card__meta">{{ o.steps }}</span>
              </span>
            </label>
          </div>
        </section>

        <!-- ══ Document plan — the consequence of the three choices above ═══ -->
        <section class="sc-section sc-section--last">
          <h2 class="sc-section-title">{{ t('Documents this order will raise') }}</h2>
          <p class="sc-section-desc">
            {{ t('Saving creates the chain below in order. Each document links back to this subcon order.') }}
          </p>

          <SubconPlanPreview :scope="scope" :split="split" :method="method" :qty="Number(qty || 0)" />

          <p v-if="method === 'resupply'" class="sc-footnote">
            <MpIcon name="info" size="sm" />
            {{ t('Components leave') }} {{ warehouseName(sourceWarehouseId) }}
            {{ t('but stay on your books until the vendor consumes them — track the balance on the custody dashboard.') }}
          </p>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <p v-if="hasError" class="sc-footer-error">
        {{ t('Check the highlighted fields before saving.') }}
      </p>
      <MpButton variant="ghost" is-rounded @click="goList">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell (shared create-page pattern) ─────────────────────────────── */
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
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default);
}
.sc-footer-error {
  margin: 0 auto 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-critical, var(--mp-text-danger, #a8352d));
}

/* ── Body / sections ─────────────────────────────────────────────────────── */
.sc-body { display: flex; flex-direction: column; }
.sc-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.sc-section:first-child { padding-top: 0; }
.sc-section--last { border-bottom: none; }
.sc-section-title {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.sc-section-desc {
  margin: calc(-1 * var(--mp-spacing-3)) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
.sc-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

.sc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 318px));
  gap: var(--mp-spacing-4) var(--mp-spacing-6);
}

/* ── Choice cards ────────────────────────────────────────────────────────── */
.sc-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 420px)); gap: var(--mp-spacing-3); }
.sc-cards--stack { grid-template-columns: minmax(0, 860px); }

.sc-card {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-default, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  cursor: pointer;
}
.sc-card:hover { background: var(--mp-background-neutral-hovered); }
.sc-card--selected {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-information, #eef0fc);
}
.sc-card__text { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.sc-card__label {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sc-card__desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.sc-card__meta {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle, #75808f);
}

.sc-field-hint {
  margin: var(--mp-spacing-1) 0 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.sc-footnote {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin: var(--mp-spacing-4) 0 0; max-width: 860px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
