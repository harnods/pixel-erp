<script setup lang="ts">
/**
 * Adjust work order — records what actually happened in the field before closing a
 * work order (Figma: Track routing › adjust wo). Uses the create-page shell and
 * form-table pattern of CreateWorkOrderPage. Identity fields and routing are
 * read-only; quantities, multipliers, other outputs and waste are editable.
 *
 * Save & finish stores the differences on the work order (never the BOM) and
 * returns to its detail page, which continues the completion flow via ?finish=1.
 */
import { ref, computed } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpAutocomplete, MpButton, MpFormControl, MpFormErrorMessage, MpFormLabel, MpIcon, MpInput,
  MpInputGroup, MpInputRightAddon, MpRadio,
} from '@mekari/pixel3'
import { CATALOG } from '~/data/catalog'
import { formatDate } from '~/utils/date'
import { workOrders, persistWorkOrders } from '~/data/workOrders'
import { billOfMaterials, catalogProduct, type BomProductionWaste } from '~/data/billOfMaterials'
import { routingStepsFor } from '~/data/workOrderRouting'
import { allocateProductionCost, neededQtyFor } from '~/data/workOrderAdjustment'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const bom = computed(() => wo.value ? billOfMaterials.find(b => b.id === wo.value!.bomId) : undefined)
const canAdjust = computed(() => ['in progress', 'partially produced', 'partially completed'].includes(wo.value?.status ?? ''))

function goList() { router.push('/work-orders') }
function goDetail() { router.push(`/work-orders/${props.orderId}`) }

const num = (v: string | number) => Number(v) || 0
const EXECUTION_WAREHOUSE = 'Production Jakarta'

// ── Info ─────────────────────────────────────────────────────────────────────
const producedQty = ref(String(wo.value?.producedQty || wo.value?.plannedQty || ''))
const planRange = computed(() => wo.value ? `${formatDate(wo.value.planStartDate)} - ${formatDate(wo.value.planEndDate)}` : '')
const mainProduct = computed(() => bom.value ? catalogProduct(bom.value.finishedGoodId) : undefined)

// ── Raw materials ────────────────────────────────────────────────────────────
const rawRows = ref((bom.value?.rawMaterials ?? []).map((r) => {
  const p = catalogProduct(r.productId)
  return {
    productId: r.productId, product: p?.name ?? '—', sku: p?.sku ?? '—', purchaseCost: r.purchaseCost, unit: r.unit,
    needed: String(neededQtyFor(wo.value, r.productId, r.needed)),
  }
}))
const rawEst = (r: { purchaseCost: number; needed: string }) => r.purchaseCost * num(r.needed)
const rawSubtotal = computed(() => rawRows.value.reduce((s, r) => s + rawEst(r), 0))

// ── Production cost ──────────────────────────────────────────────────────────
const costRows = ref((bom.value?.productionCost ?? []).map(c => ({
  group: c.group, account: c.account, driver: c.costDriver, unitCost: c.amount,
  multiplier: String(wo.value?.adjustment?.costMultipliers[c.group] ?? 1),
})))
const costAmount = (c: { unitCost: number; multiplier: string }) => c.unitCost * num(c.multiplier)
const costSubtotal = computed(() => costRows.value.reduce((s, c) => s + costAmount(c), 0))

// ── Routing (read-only) ──────────────────────────────────────────────────────
const routing = computed(() => wo.value ? routingStepsFor(wo.value, bom.value) : [])
const routingSubtotal = computed(() => routing.value.reduce((s, r) => s + r.amount, 0))
const totalProductionCost = computed(() => rawSubtotal.value + costSubtotal.value + routingSubtotal.value)

// ── Finished goods ───────────────────────────────────────────────────────────
// Each list keeps one blank trailing row to add from (same as the create form).
let seq = 0
interface OtherRow { id: number; productId: string; qty: string; unit: string; percentage: string }
interface WasteRow { id: number; accountMapping: string; allocationMethod: string; percentage: string; amount: string }
const blankOther = (): OtherRow => ({ id: seq++, productId: '', qty: '', unit: '', percentage: '' })
const blankWaste = (): WasteRow => ({ id: seq++, accountMapping: '', allocationMethod: 'Percentage', percentage: '', amount: '' })

const otherRows = ref<OtherRow[]>([
  ...(wo.value?.adjustment?.otherOutputs ?? bom.value?.otherOutputs ?? []).map(o => ({
    id: seq++, productId: o.productId, qty: String(o.qty), unit: o.unit, percentage: String(o.percentage),
  })),
  blankOther(),
])
const wasteRows = ref<WasteRow[]>([
  ...(wo.value?.adjustment?.productionWaste ?? bom.value?.productionWaste ?? []).map(w => ({
    id: seq++, accountMapping: w.accountMapping, allocationMethod: w.allocationMethod,
    percentage: String(w.percentage), amount: String(w.amount),
  })),
  blankWaste(),
])

const productOptions = CATALOG.map(p => ({ id: p.id, name: p.name }))
const ALLOCATION_OPTIONS = ['Percentage', 'Amount'].map(m => ({ id: m, name: m }))
const wasteAccountOptions = computed(() => {
  const names = new Set(['Production waste', 'Scrap', ...wasteRows.value.map(w => w.accountMapping).filter(Boolean)])
  return [...names].map(n => ({ id: n, name: n }))
})

function onOtherProduct(row: OtherRow, id: string) {
  row.unit = catalogProduct(id)?.unit ?? ''
  if (id && otherRows.value[otherRows.value.length - 1]?.id === row.id) otherRows.value.push(blankOther())
}
function onWasteAccount(row: WasteRow, id: string) {
  if (id && wasteRows.value[wasteRows.value.length - 1]?.id === row.id) wasteRows.value.push(blankWaste())
}
function removeOther(id: number) { otherRows.value = otherRows.value.filter(r => r.id !== id) }
function removeWaste(id: number) { wasteRows.value = wasteRows.value.filter(r => r.id !== id) }

const filledOthers = computed(() => otherRows.value.filter(r => r.productId))
const filledWaste = computed(() => wasteRows.value.filter(r => r.accountMapping))
const allocation = computed(() => allocateProductionCost(
  totalProductionCost.value,
  filledOthers.value.map(r => ({ percentage: num(r.percentage) })),
  filledWaste.value.map(r => r.allocationMethod === 'Amount'
    ? { percentage: 0, fixedAmount: num(r.amount) }
    : { percentage: num(r.percentage) }),
))
const otherAmount = (row: OtherRow) => allocation.value.otherAmounts[filledOthers.value.indexOf(row)] ?? 0
const wasteAmount = (row: WasteRow) => allocation.value.wasteAmounts[filledWaste.value.indexOf(row)] ?? 0
const otherSubtotal = computed(() => allocation.value.otherAmounts.reduce((s, n) => s + n, 0))
const wasteSubtotal = computed(() => allocation.value.wasteAmounts.reduce((s, n) => s + n, 0))
const costPerUnit = computed(() => num(producedQty.value) ? allocation.value.mainAmount / num(producedQty.value) : 0)

// ── Save & finish ────────────────────────────────────────────────────────────
const producedError = ref(false)
const lineError = ref('')
const allocationError = computed(() => allocation.value.mainPercentage < 0)

function save() {
  if (!wo.value) return
  producedError.value = num(producedQty.value) <= 0
  const badQty = rawRows.value.some(r => num(r.needed) < 0)
    || costRows.value.some(c => num(c.multiplier) < 0)
    || filledOthers.value.some(r => num(r.qty) <= 0 || num(r.percentage) < 0)
    || filledWaste.value.some(r => r.allocationMethod === 'Amount' ? num(r.amount) < 0 : num(r.percentage) < 0)
  lineError.value = badQty ? t('Enter valid quantities and percentages. Other outputs need a qty above 0.') : ''
  if (producedError.value || badQty || allocationError.value) return

  wo.value.producedQty = num(producedQty.value)
  wo.value.adjustment = {
    rawNeeded: Object.fromEntries(rawRows.value.map(r => [r.productId, num(r.needed)])),
    costMultipliers: Object.fromEntries(costRows.value.map(c => [c.group, num(c.multiplier)])),
    otherOutputs: filledOthers.value.map(r => ({
      productId: r.productId, qty: num(r.qty), unit: r.unit, percentage: num(r.percentage), estCost: otherAmount(r),
    })),
    productionWaste: filledWaste.value.map(r => ({
      accountMapping: r.accountMapping, allocationMethod: r.allocationMethod as BomProductionWaste['allocationMethod'],
      percentage: r.allocationMethod === 'Amount' ? 0 : num(r.percentage), amount: wasteAmount(r),
    })),
    mainPercentage: allocation.value.mainPercentage,
  }
  persistWorkOrders()
  router.push(`/work-orders/${props.orderId}?finish=1`)
}
</script>

<template>
  <div v-if="wo" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">{{ t('Work orders') }}</button>
        <h1 class="detail-title">{{ t('Adjust work order') }}</h1>
      </div>
    </header>

    <div v-if="!canAdjust" class="detail-stage">
      <div class="aw-empty">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="aw-empty-title">{{ t('This work order cannot be adjusted') }}</p>
        <p class="aw-empty-desc">{{ t('Only a started work order that is not closed can be adjusted.') }}</p>
        <MpButton variant="secondary" is-rounded @click="goDetail">{{ t('Back to work order') }}</MpButton>
      </div>
    </div>

    <template v-else>
      <div class="detail-stage" data-devchange="wo-adjust-page">
        <section class="wo-section">
          <h2 class="wo-section-title">{{ t('Work order info') }}</h2>
          <div class="aw-grid">
            <MpFormControl id="aw-no" is-required>
              <MpFormLabel>{{ t('Work order no.') }}</MpFormLabel>
              <MpInput id="aw-no-input" :model-value="wo.number" is-full-width is-disabled />
            </MpFormControl>
            <span />
            <MpFormControl id="aw-type" is-required>
              <MpFormLabel>{{ t('Type') }}</MpFormLabel>
              <MpInput id="aw-type-input" :model-value="wo.type" is-full-width is-disabled />
            </MpFormControl>
            <MpFormControl id="aw-routing">
              <MpFormLabel>{{ t('Track routing') }}</MpFormLabel>
              <div class="aw-radios">
                <MpRadio id="aw-routing-yes" name="aw-routing" value="yes" :is-checked="wo.trackRouting" is-disabled>{{ t('Yes') }}</MpRadio>
                <MpRadio id="aw-routing-no" name="aw-routing" value="no" :is-checked="!wo.trackRouting" is-disabled>{{ t('No') }}</MpRadio>
              </div>
            </MpFormControl>
            <MpFormControl id="aw-bom" is-required>
              <MpFormLabel>{{ t('BOM name') }}</MpFormLabel>
              <MpInput id="aw-bom-input" :model-value="wo.bomName" is-full-width is-disabled />
            </MpFormControl>
            <MpFormControl id="aw-bom-no">
              <MpFormLabel>{{ t('BOM no.') }}</MpFormLabel>
              <MpInput id="aw-bom-no-input" :model-value="bom?.number ?? '—'" is-full-width is-disabled />
            </MpFormControl>
            <MpFormControl id="aw-plan" is-required>
              <MpFormLabel>{{ t('Production plan dates') }}</MpFormLabel>
              <MpInput id="aw-plan-input" :model-value="planRange" is-full-width is-disabled />
            </MpFormControl>
            <MpFormControl id="aw-qty" is-required :is-invalid="producedError">
              <MpFormLabel>{{ t('Produced qty') }}</MpFormLabel>
              <MpInputGroup id="aw-qty-group" is-full-width>
                <MpInput id="aw-qty-input" v-model="producedQty" type="number" placeholder="0" is-full-width @update:model-value="producedError = false" />
                <MpInputRightAddon has-background>{{ bom?.finishedGoodUnit ?? 'Pcs' }}</MpInputRightAddon>
              </MpInputGroup>
              <MpFormErrorMessage v-if="producedError">{{ t('Enter a produced qty above 0.') }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </section>

        <section class="wo-section">
          <h2 class="wo-section-title">{{ t('Raw materials') }}</h2>
          <div class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('SKU') }}</th>
                <th class="wo-th wo-th--right">{{ t('Purchase cost') }}</th><th class="wo-th">{{ t('Warehouse') }}</th>
                <th class="wo-th wo-th--right">{{ t('Needed qty') }}</th><th class="wo-th">{{ t('Unit') }}</th>
                <th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="r in rawRows" :key="r.productId" class="wo-tr">
                  <td class="wo-td">{{ r.product }}</td><td class="wo-td">{{ r.sku }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(r.purchaseCost) }}</td>
                  <td class="wo-td">{{ EXECUTION_WAREHOUSE }}</td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`aw-need-${r.productId}`" v-model="r.needed" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td">{{ r.unit }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(rawEst(r)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span class="wo-subtotal-amount">{{ formatIDR(rawSubtotal) }}</span></div>
        </section>

        <section class="wo-section">
          <h2 class="wo-section-title">{{ t('Production cost') }}</h2>
          <div v-if="costRows.length" class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Account mapping') }}</th><th class="wo-th">{{ t('Cost driver') }}</th>
                <th class="wo-th wo-th--right">{{ t('Estimated unit cost') }}</th><th class="wo-th wo-th--right">{{ t('Multiplier') }}</th>
                <th class="wo-th wo-th--right">{{ t('Amount') }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="c in costRows" :key="c.group" class="wo-tr">
                  <td class="wo-td">{{ c.account }}</td><td class="wo-td">{{ c.driver || '—' }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(c.unitCost) }}</td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`aw-mult-${c.group}`" v-model="c.multiplier" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(costAmount(c)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-subtotal-row"><span>{{ t('Production cost subtotal') }}</span><span class="wo-subtotal-amount">{{ formatIDR(costSubtotal) }}</span></div>
        </section>

        <section class="wo-section">
          <h2 class="wo-section-title">{{ t('Routing') }}</h2>
          <div v-if="routing.length" class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Process') }}</th><th class="wo-th">{{ t('Description') }}</th>
                <th class="wo-th">{{ t('Account mapping') }}</th><th class="wo-th">{{ t('Plan dates') }}</th>
                <th class="wo-th wo-th--right">{{ t('Amount') }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="r in routing" :key="r.index" class="wo-tr">
                  <td class="wo-td">{{ r.process }}</td><td class="wo-td aw-td--wrap">{{ r.description }}</td>
                  <td class="wo-td">{{ r.accountMapping }}</td>
                  <td class="wo-td">{{ formatDate(r.planStart) }} - {{ formatDate(r.planEnd) }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wo-summary">
            <div class="wo-summary-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Production cost subtotal') }}</span><span>{{ formatIDR(costSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Routing cost subtotal') }}</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>{{ t('Estimated total production cost') }}</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
          </div>
        </section>

        <section class="wo-section wo-section--last">
          <h2 class="wo-section-title">{{ t('Finished goods') }}</h2>

          <h3 class="wo-subsection-title">{{ t('Main output') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('SKU') }}</th>
                <th class="wo-th wo-th--right">{{ t('Produced qty') }}</th><th class="wo-th">{{ t('Unit') }}</th>
                <th class="wo-th wo-th--right">{{ t('Percentage') }}</th><th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th>
              </tr></thead>
              <tbody>
                <tr class="wo-tr">
                  <td class="wo-td">{{ mainProduct?.name ?? wo.bomName }}</td><td class="wo-td">{{ mainProduct?.sku ?? '—' }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ num(producedQty) }}</td><td class="wo-td">{{ bom?.finishedGoodUnit ?? 'Pcs' }}</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ allocation.mainPercentage }}%</td>
                  <td class="wo-td wo-td--num wo-td--right">{{ formatIDR(allocation.mainAmount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="wo-subsection-title">{{ t('Other outputs') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Product') }}</th><th class="wo-th">{{ t('SKU') }}</th>
                <th class="wo-th wo-th--right">{{ t('Produced qty') }}</th><th class="wo-th">{{ t('Unit') }}</th>
                <th class="wo-th wo-th--right">{{ t('Percentage') }}</th><th class="wo-th wo-th--right">{{ t('Estimated cost') }}</th>
                <th class="wo-th wo-th--del" />
              </tr></thead>
              <tbody>
                <tr v-for="row in otherRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input"><MpAutocomplete :id="`aw-other-${row.id}`" v-model="row.productId" :data="productOptions" label-prop="name" value-prop="id" :placeholder="t('Select product')" is-searchable use-portal is-full-width @update:model-value="(v: string) => onOtherProduct(row, v)" /></td>
                  <td class="wo-td">{{ catalogProduct(row.productId)?.sku ?? '' }}</td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.productId" :id="`aw-other-qty-${row.id}`" v-model="row.qty" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td">{{ row.unit }}</td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.productId" :id="`aw-other-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td class="wo-td wo-td--num wo-td--right"><template v-if="row.productId">{{ formatIDR(otherAmount(row)) }}</template></td>
                  <td class="wo-td wo-td--del"><button v-if="row.productId" class="wo-del-btn" type="button" :aria-label="t('Remove')" @click="removeOther(row.id)"><MpIcon name="minus-circular" size="sm" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="wo-subsection-title">{{ t('Production waste') }}</h3>
          <div class="wo-table-scroll">
            <table class="wo-table aw-table">
              <thead><tr>
                <th class="wo-th">{{ t('Account mapping') }}</th><th class="wo-th">{{ t('Allocation method') }}</th>
                <th class="wo-th wo-th--right">{{ t('Percentage') }}</th><th class="wo-th wo-th--right">{{ t('Amount') }}</th>
                <th class="wo-th wo-th--del" />
              </tr></thead>
              <tbody>
                <tr v-for="row in wasteRows" :key="row.id" class="wo-tr">
                  <td class="wo-td wo-td--input"><MpAutocomplete :id="`aw-waste-${row.id}`" v-model="row.accountMapping" :data="wasteAccountOptions" label-prop="name" value-prop="id" :placeholder="t('Select account mapping')" is-searchable use-portal is-full-width @update:model-value="(v: string) => onWasteAccount(row, v)" /></td>
                  <td class="wo-td wo-td--input"><MpAutocomplete v-if="row.accountMapping" :id="`aw-waste-alloc-${row.id}`" v-model="row.allocationMethod" :data="ALLOCATION_OPTIONS" label-prop="name" value-prop="id" use-portal is-full-width /></td>
                  <td class="wo-td wo-td--input wo-td--num-input"><MpInput v-if="row.accountMapping && row.allocationMethod !== 'Amount'" :id="`aw-waste-pct-${row.id}`" v-model="row.percentage" type="number" placeholder="0" is-full-width /></td>
                  <td v-if="row.accountMapping && row.allocationMethod === 'Amount'" class="wo-td wo-td--input wo-td--num-input"><MpInput :id="`aw-waste-amt-${row.id}`" v-model="row.amount" type="number" placeholder="0" is-full-width /></td>
                  <td v-else class="wo-td wo-td--num wo-td--right"><template v-if="row.accountMapping">{{ formatIDR(wasteAmount(row)) }}</template></td>
                  <td class="wo-td wo-td--del"><button v-if="row.accountMapping" class="wo-del-btn" type="button" :aria-label="t('Remove')" @click="removeWaste(row.id)"><MpIcon name="minus-circular" size="sm" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="wo-summary">
            <div class="wo-summary-row"><span>{{ t('Estimated main output subtotal') }}</span><span>{{ formatIDR(allocation.mainAmount) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Estimated other outputs subtotal') }}</span><span>{{ formatIDR(otherSubtotal) }}</span></div>
            <div class="wo-summary-row"><span>{{ t('Estimated production waste subtotal') }}</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>{{ t('Estimated finished goods total') }}</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
            <div class="wo-summary-row wo-summary-row--total"><span>{{ t('Estimated production cost per unit') }}</span><span>{{ formatIDR(costPerUnit) }}</span></div>
          </div>
        </section>

        <p v-if="allocationError" class="aw-error">{{ t('Other outputs and production waste cannot exceed 100% of the production cost.') }}</p>
        <p v-if="lineError" class="aw-error">{{ lineError }}</p>
      </div>

      <footer class="detail-footer">
        <MpButton variant="ghost" is-rounded @click="goDetail">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="save">{{ t('Save & finish') }}</MpButton>
      </footer>
    </template>
  </div>

  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">{{ t('Work orders') }}</button>
        <h1 class="detail-title">{{ t('Work order not found') }}</h1>
      </div>
    </header>
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
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent; transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Body / sections ─────────────────────────────────────────────────────── */
.wo-body { display: flex; flex-direction: column; }
.wo-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.wo-section:first-child { padding-top: 0; }
.wo-section--last { border-bottom: none; }
.wo-section-title {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.wo-section-desc {
  margin: -12px 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
.wo-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Work order info grid — 2 columns, up to 318px each, capped at 660px.
   minmax(0, 318px) lets the columns shrink on narrow viewports instead of
   overflowing the stage (which otherwise pushes the field arrows/calendar icons
   off to the right edge). */
.wo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 318px));
  gap: var(--mp-spacing-4) var(--mp-spacing-6);
  align-items: start;
  max-width: 660px;
}
.wo-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.wo-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.wo-datepicker { width: 100%; }
.wo-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.wo-radio-group { display: flex; align-items: center; gap: var(--mp-spacing-6); height: var(--mp-sizes-10, 40px); }
.wo-radio-item { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Attachment ──────────────────────────────────────────────────────────── */
.wo-attachment { margin-top: var(--mp-spacing-6); max-width: 640px; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wo-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wo-file-hidden { display: none; }
.wo-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.wo-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wo-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.wo-file-list { margin: var(--mp-spacing-1) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wo-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.wo-file-name { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wo-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.wo-file-remove:hover { color: var(--mp-text-critical); }

.wo-checkbox-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-6); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wo-checkbox-row--tight { margin-top: 0; margin-bottom: var(--mp-spacing-4); }

/* ── Line-item tables (shared .cr-table pattern) ─────────────────────────── */
/* Borderless ERP table: top + bottom horizontal rules frame it, internal grid
   lines come from the cells — no outer box or rounded corners. */
.wo-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.wo-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; min-width: max-content; }
.wo-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.wo-th--right { text-align: right; }
/* Action/button icon column — fixed 44px, pinned to the right edge of the table
   so it stays visible while the table scrolls horizontally. Compound selector
   (.wo-td.wo-td--del) so padding:0 beats the general .wo-td padding — otherwise the
   32px button + 20px padding inflates the row past the 38px input height. */
.wo-th.wo-th--del, .wo-td.wo-td--del {
  position: sticky;
  right: 0;
  z-index: 2;
  width: 44px;
  min-width: 44px;
  padding: 0;
  text-align: center;
  /* 1px inset separator on the sticky column's left edge. It must match the 1px
     cell borders exactly and read the same whether the column is pinned (scrolled)
     or not — so it's the SINGLE divider here and the neighbouring cell drops its
     own border-right below (otherwise the two stack into a bolder 2px line). */
  box-shadow: inset 1px 0 var(--mp-border-default);
}
/* Cell immediately left of the sticky action column: no right border, so the
   sticky column's 1px inset shadow is the only line at that boundary. */
.wo-th:nth-last-child(2), .wo-td:nth-last-child(2) { border-right: none; }
.wo-th--del { background: var(--mp-background-neutral-subtle); }
.wo-td--del { background: var(--mp-background-neutral); }
.wo-td {
  /* vertical padding kept under the 38px input-control height so read-only text
     cells don't out-tall the inputs — the inputs define the row height and fill it,
     matching the barang-masuk/new create table. */
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.wo-td:last-child { border-right: none; }
.wo-tr:last-child .wo-td { border-bottom: none; }
.wo-td--num { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-td--right { text-align: right; }
.wo-td--input { padding: 0; vertical-align: middle; background: var(--mp-background-neutral, #fff); }
.wo-td--num-input { padding: 0; background: var(--mp-background-neutral, #fff); }
.wo-td--num-input :deep(input) { text-align: right; }
/* Cell controls are borderless within the grid; the focused cell shows a 2px inset
   ring (square) — matching the barang-masuk/new create-table active state. */
.wo-td--input :deep([class*='input']),
.wo-td--input :deep([class*='autocomplete']),
.wo-td--input :deep(.mp-datepicker__root) { border-radius: 0; border-color: transparent; }
.wo-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); z-index: 1; }
.wo-tracked-hint { display: block; padding: var(--mp-spacing-1) var(--mp-spacing-2) 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wo-tracking { display: block; padding: 0 var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.wo-tracking:hover { text-decoration: underline; text-underline-offset: 2px; }
.wo-del-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.wo-del-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-critical); }

/* Loading skeleton bar (shown in each cell while the selected BOM's data loads) */
.wo-skel {
  display: block;
  height: 14px;
  width: 70%;
  border-radius: var(--mp-radii-sm, 4px);
  background: linear-gradient(90deg, var(--mp-border-default) 25%, var(--mp-background-neutral-subtle) 37%, var(--mp-border-default) 63%);
  background-size: 400% 100%;
  animation: wo-skel-shimmer 1.4s ease infinite;
}
.wo-td--del .wo-skel { display: none; }
@keyframes wo-skel-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.wo-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wo-subtotal-amount { min-width: 160px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-summary { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wo-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wo-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wo-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wo-summary-row--total > :last-child { color: var(--mp-text-default); }

/* ── Adjust work order ── */
.aw-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 318px)); gap: var(--mp-spacing-4) var(--mp-spacing-6); margin-top: var(--mp-spacing-4); }
.aw-radios { display: flex; align-items: center; gap: var(--mp-spacing-8); height: var(--mp-sizes-10, 40px); }
.aw-table { min-width: 100%; }
.aw-td--wrap { white-space: normal; }
.aw-error { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical); }
.aw-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-8); text-align: center; }
.aw-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aw-empty-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
