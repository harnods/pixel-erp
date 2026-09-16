<script setup lang="ts">
/**
 * Subcon goods receipt — what comes back from the vendor, and what QC made of it.
 *
 * Two things make this different from an ordinary goods receipt, and both are the
 * point of the screen:
 *
 *   1. **Disposition.** Subcon output is not simply "received" — each unit is
 *      accepted, sent for rework, or scrapped. The three must reconcile to the
 *      quantity received, so the form states the remainder rather than letting a
 *      silent mismatch through.
 *   2. **The inbound approval gate.** Inventory and journals do not post on
 *      receipt; they post on approval. Until then the stock is not on hand, and
 *      the page says so plainly instead of implying the goods have landed.
 */
import {
  MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import SubconDocumentBanner from '~/components/patterns/SubconDocumentBanner.vue'
import { successToast } from '~/utils/toasts'
import { formatDate } from '~/utils/date'
import {
  getSubconOrder, buildDocumentPlan, SUBCON_SCOPE_LABEL,
} from '~/data/subcon'

const props = defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()

const order = computed(() => (props.orderId ? getSubconOrder(props.orderId) : undefined))

function goOrder() {
  if (order.value) router.push(`/subcon-orders/${order.value.id}`)
  else router.push('/subcon-orders')
}

// ─── What is still outstanding against the order ───────────────────────────────
const outstanding = computed(() => {
  const o = order.value
  return o ? Math.max(0, o.qty - o.receivedQty) : 0
})

// ─── Disposition ───────────────────────────────────────────────────────────────
const receivedQty = ref('')
const accepted = ref('')
const rework = ref('')
const scrap = ref('')

watchEffect(() => {
  // Default the receipt to whatever is still owed, and treat it all as accepted
  // until QC says otherwise — the common case, typed once.
  if (!receivedQty.value && outstanding.value > 0) {
    receivedQty.value = String(outstanding.value)
    accepted.value = String(outstanding.value)
  }
})

function num(v: string) { return Number(v) || 0 }

const dispositionTotal = computed(() => num(accepted.value) + num(rework.value) + num(scrap.value))
const remainder = computed(() => num(receivedQty.value) - dispositionTotal.value)

const showErrors = ref(false)
const qtyError = computed(() => showErrors.value && num(receivedQty.value) <= 0)
const dispositionError = computed(() => showErrors.value && remainder.value !== 0)
const hasError = computed(() => qtyError.value || dispositionError.value)

// ─── Chain context ─────────────────────────────────────────────────────────────
const referenceRows = computed(() => {
  const o = order.value
  if (!o) return []
  const plan = buildDocumentPlan(o.scope, o.split, o.method)
  const serviceDoc = o.documents.find(d => d.startsWith('PR-SUB') || d.startsWith('PR-PRC'))
  return [
    { label: t('Subcon order'), value: o.number },
    { label: t('Linked BOM'), value: o.bomNumber },
    { label: t('Subcon purchase request'), value: serviceDoc ?? t('Not raised yet') },
    { label: t('Chain position'), value: `${plan.length} ${t('of')} ${plan.length}` },
  ]
})

function handleSave() {
  showErrors.value = true
  if (hasError.value) return
  successToast(t('Goods receipt saved'))
  goOrder()
}
</script>

<template>
  <div v-if="!order" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb btn-enterprise" @click="goOrder">{{ t('Subcon orders') }}</button>
        </nav>
        <h1 class="detail-title">{{ t('Goods receipt') }}</h1>
      </div>
    </header>
    <div class="detail-stage">
      <p class="sgr-empty">{{ t('This subcon order no longer exists, so there is nothing to receive against.') }}</p>
    </div>
  </div>

  <div v-else class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb btn-enterprise" @click="goOrder">{{ order.number }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New goods receipt') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="sgr-body">

        <!-- The gate, stated before anything is entered -->
        <MpBanner type="information" class="sgr-region">
          <MpBannerIcon />
          <MpBannerTitle>{{ t('This receipt will be held for inbound approval') }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('Inventory and journals post only once the receipt is approved. Until then the goods are recorded as received but are not on hand, and some fields can no longer be changed.') }}
          </MpBannerDescription>
        </MpBanner>

        <SubconDocumentBanner
          class="sgr-region"
          :title="t('Returned from the subcon vendor')"
          :rows="referenceRows"
        />

        <!-- ── Receipt info ── -->
        <section class="sgr-region">
          <h2 class="sgr-section-title">{{ t('Receipt info') }}</h2>
          <div class="sgr-info-grid">
            <ContentList :label="t('Received from')" :value="order.vendorName" />
            <ContentList :label="t('Into warehouse')" :value="order.receivingWarehouseName" />
            <ContentList :label="t('Output product')" :value="order.productName" />
            <ContentList :label="t('Scope')" :value="t(SUBCON_SCOPE_LABEL[order.scope])" />
            <ContentList :label="t('Promised return date')" :value="order.promisedDate ? formatDate(order.promisedDate) : '—'" />
            <ContentList :label="t('Already received')">
              {{ order.receivedQty.toLocaleString('id-ID') }} / {{ order.qty.toLocaleString('id-ID') }} {{ order.unit }}
            </ContentList>
          </div>
        </section>

        <!-- ── Quantity + disposition ── -->
        <section class="sgr-region sgr-region--last">
          <h2 class="sgr-section-title">{{ t('Quantity received') }}</h2>
          <p class="sgr-section-desc">
            {{ t('Split what arrived into what you can sell, what the vendor must redo, and what is written off. The three must add up to the quantity received.') }}
          </p>

          <div class="sgr-qty-grid">
            <MpFormControl id="sgr-received" is-required :is-invalid="qtyError">
              <MpFormLabel>{{ t('Received') }} ({{ order.unit }})</MpFormLabel>
              <MpInput id="sgr-received-input" v-model="receivedQty" type="number" is-full-width />
              <MpFormErrorMessage v-if="qtyError">
                {{ t('Enter how many units arrived.') }}
              </MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="sgr-accepted">
              <MpFormLabel>{{ t('Accepted') }}</MpFormLabel>
              <MpInput id="sgr-accepted-input" v-model="accepted" type="number" is-full-width />
            </MpFormControl>

            <MpFormControl id="sgr-rework">
              <MpFormLabel>{{ t('Rework') }}</MpFormLabel>
              <MpInput id="sgr-rework-input" v-model="rework" type="number" is-full-width />
            </MpFormControl>

            <MpFormControl id="sgr-scrap">
              <MpFormLabel>{{ t('Scrap') }}</MpFormLabel>
              <MpInput id="sgr-scrap-input" v-model="scrap" type="number" is-full-width />
            </MpFormControl>
          </div>

          <!-- The reconciliation, stated continuously rather than only on submit -->
          <p
            class="sgr-reconcile"
            :class="{
              'sgr-reconcile--balanced': remainder === 0,
              'sgr-reconcile--off': remainder !== 0,
            }"
          >
            <template v-if="remainder === 0">
              {{ t('Disposition balances against the quantity received.') }}
            </template>
            <template v-else-if="remainder > 0">
              {{ remainder.toLocaleString('id-ID') }} {{ order.unit }} {{ t('still undispositioned.') }}
            </template>
            <template v-else>
              {{ Math.abs(remainder).toLocaleString('id-ID') }} {{ order.unit }} {{ t('more dispositioned than received.') }}
            </template>
          </p>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <p v-if="hasError" class="sgr-footer-error">
        {{ dispositionError
          ? t('Accepted, rework and scrap must add up to the quantity received.')
          : t('Check the highlighted fields before saving.') }}
      </p>
      <MpButton variant="ghost" is-rounded @click="goOrder">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
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
  padding: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default);
}
.sgr-footer-error { margin: 0 auto 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }

/* ── Body ────────────────────────────────────────────────────────────────── */
.sgr-body { display: flex; flex-direction: column; }
.sgr-region { margin-bottom: var(--mp-spacing-8); }
.sgr-region--last { margin-bottom: 0; }

.sgr-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sgr-section-desc {
  margin: calc(-1 * var(--mp-spacing-2)) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  max-width: 720px;
}

.sgr-info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 318px));
  gap: 0 var(--mp-spacing-6);
}
.sgr-qty-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 200px));
  gap: var(--mp-spacing-4) var(--mp-spacing-6);
}

.sgr-reconcile {
  margin: var(--mp-spacing-4) 0 0;
  font-size: var(--mp-font-sizes-md);
}
.sgr-reconcile--balanced { color: var(--mp-text-success, #18794e); }
.sgr-reconcile--off { color: var(--mp-text-warning, #b54708); }

.sgr-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
