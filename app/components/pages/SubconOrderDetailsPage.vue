<script setup lang="ts">
/**
 * Subcon order detail — one order's whole life in one read-only page.
 *
 * The order itself is not where work happens; the documents it raises are. So
 * this page is organised around the chain: where the order sits, which documents
 * exist versus which are still planned, what stock is sitting at the vendor, and
 * how the goods that came back were dispositioned at QC.
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpIcon, MpBadge, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import SubconMethodChip from '~/components/patterns/SubconMethodChip.vue'
import SubconStageChain from '~/components/patterns/SubconStageChain.vue'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import {
  getSubconOrder, buildDocumentPlan, subconCustody, custodyBalance,
  SUBCON_SCOPE_LABEL, SUBCON_STAGES, SUBCON_SERVICE_FEE, SUBCON_HANDLING_FEE,
  SUBCON_BOM_LINES, SUBCON_BATCH_QTY,
  type SubconOrderStatus,
} from '~/data/subcon'

// Detail routes are rendered by [...slug].vue, which passes the path segment as `orderId`.
const props = defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()

const order = computed(() => (props.orderId ? getSubconOrder(props.orderId) : undefined))

function goList() { router.push('/subcon-orders') }

// ─── Status vocabulary ─────────────────────────────────────────────────────────
const STATUS_LABEL: Record<SubconOrderStatus, string> = {
  draft: 'Draft',
  'material sent': 'Material sent',
  'pending approval': 'Pending approval',
  'fee outstanding': 'Fee outstanding',
  discrepancy: 'Discrepancy',
  overdue: 'Overdue return',
}
const STATUS_TYPE: Record<SubconOrderStatus, 'completed' | 'announcement' | 'information' | 'warning' | 'critical'> = {
  draft: 'announcement',
  'material sent': 'completed',
  'pending approval': 'information',
  'fee outstanding': 'warning',
  discrepancy: 'critical',
  overdue: 'critical',
}

// ─── Document chain ────────────────────────────────────────────────────────────
/**
 * The planned chain, matched against the documents that actually exist. Planned-
 * but-missing steps stay visible as "Not raised yet" rather than being hidden —
 * the gap between plan and reality is the useful information on this page.
 */
const chain = computed(() => {
  const o = order.value
  if (!o) return []
  const plan = buildDocumentPlan(o.scope, o.split, o.method)
  // Documents are raised in chain order, so position matches position.
  const raised = o.documents.filter(d => !d.startsWith('Bill of Materials'))
  return plan.map((step, i) => {
    const number = raised[i]
    return {
      ...step,
      number,
      raised: !!number,
      status: !number ? 'planned' : step.kind === 'receipt' ? 'pending approval' : 'draft',
    }
  })
})

// ─── Materials held at the vendor for this order ───────────────────────────────
const custody = computed(() => (order.value ? subconCustody.filter(c => c.orderId === order.value!.id) : []))
const custodyValue = computed(() => custody.value.reduce((s, l) => s + l.balanceValue, 0))

// ─── Money ─────────────────────────────────────────────────────────────────────
const estimate = computed(() => {
  const o = order.value
  if (!o) return { components: 0, service: 0, total: 0 }
  const factor = (o.qty / SUBCON_BATCH_QTY) * (o.split === 'partial' ? 0.5 : 1)
  const components = o.method === 'basic'
    ? 0
    : SUBCON_BOM_LINES.reduce((s, l) => s + l.qty * l.unitPrice, 0) * factor
  const service = (SUBCON_SERVICE_FEE[o.scope].amount + SUBCON_HANDLING_FEE.amount) * factor
  return { components, service, total: components + service }
})

// ─── Where it is, in words ─────────────────────────────────────────────────────
const stageName = computed(() => {
  const o = order.value
  return o ? t(SUBCON_STAGES[o.stage - 1]?.name ?? '') : ''
})

/** The one thing blocking this order, if anything is. */
const blocker = computed(() => {
  const o = order.value
  if (!o) return null
  if (o.status === 'fee outstanding') {
    return {
      type: 'warning' as const,
      title: t('Closing is blocked by an outstanding fee invoice'),
      body: t('The vendor fee has not been invoiced against this order. The order cannot close until it is billed.'),
    }
  }
  if (o.status === 'discrepancy') {
    return {
      type: 'critical' as const,
      title: `${t('Short by')} ${(o.qty - o.receivedQty).toLocaleString('id-ID')} ${o.unit}`,
      body: t('Less has come back than was sent out. Reconcile the receipt against the vendor before closing.'),
    }
  }
  if (o.status === 'overdue') {
    return {
      type: 'critical' as const,
      title: `${t('Overdue by')} ${o.lateDays} ${t('days')}`,
      body: t('The vendor has missed the promised return date. Nothing has been received against this order yet.'),
    }
  }
  if (o.status === 'pending approval') {
    return {
      type: 'information' as const,
      title: t('Goods receipt is pending inbound approval'),
      body: t('Inventory and journals post once the receipt is approved, so stock is not on hand yet.'),
    }
  }
  return null
})

function formatNum(n: number) { return n.toLocaleString('id-ID') }
</script>

<template>
  <!-- Permission/lookup failure is a reachable state: the id may not resolve. -->
  <div v-if="!order" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb btn-enterprise" @click="goList">{{ t('Subcon orders') }}</button>
        </nav>
        <h1 class="detail-title">{{ t('Subcon order') }}</h1>
      </div>
    </header>
    <div class="detail-stage">
      <div class="sc-notfound">
        <p class="sc-notfound__title">{{ t('This subcon order no longer exists') }}</p>
        <p class="sc-notfound__desc">{{ t('It may have been removed, or the link is out of date.') }}</p>
        <MpButton variant="secondary" is-rounded @click="goList">{{ t('Back to subcon orders') }}</MpButton>
      </div>
    </div>
  </div>

  <div v-else class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb btn-enterprise" @click="goList">{{ t('Subcon orders') }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Subcon Order') }} #{{ order.number }}</h1>
          <ErpStatusBadge
            :status="order.status"
            :label="t(STATUS_LABEL[order.status])"
            :type="STATUS_TYPE[order.status]"
            badge-for="additionalInformation"
          />
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="sc-body">

        <!-- ── What is blocking this order, if anything ── -->
        <MpBanner v-if="blocker" :type="blocker.type" class="sc-region">
          <MpBannerIcon />
          <MpBannerTitle>{{ blocker.title }}</MpBannerTitle>
          <MpBannerDescription>{{ blocker.body }}</MpBannerDescription>
        </MpBanner>

        <!-- ── Header summary ── -->
        <div class="sc-region sc-summary">
          <div class="sc-summary__primary">
            <ContentList :label="t('Subcon vendor')" :value="order.vendorName" />
            <ContentList :label="t('Output product')" :value="order.productName" />
            <div class="sc-summary__emphasis">
              <span class="sc-summary__emphasis-label">{{ t('Estimated total') }}</span>
              <span class="sc-summary__emphasis-value">{{ formatIDR(estimate.total) }}</span>
            </div>
          </div>

          <div class="sc-summary__divider" />

          <div class="sc-summary__grid">
            <div>
              <ContentList :label="t('Scope')" :value="t(SUBCON_SCOPE_LABEL[order.scope])" />
              <ContentList :label="t('Quantity')">
                {{ formatNum(order.qty) }} {{ order.unit }}
                <template v-if="order.split === 'partial'"> · {{ t('partial split') }}</template>
              </ContentList>
            </div>
            <div>
              <ContentList :label="t('Component supply')">
                <SubconMethodChip :method="order.method" />
              </ContentList>
              <ContentList :label="t('Transfer components from')">
                {{ order.sourceWarehouseName ?? t('No company warehouse — supplied to the vendor directly') }}
              </ContentList>
              <ContentList :label="t('Bill of materials')" :value="order.bomNumber" />
            </div>
            <div>
              <ContentList :label="t('Promised return date')" :value="order.promisedDate ? formatDate(order.promisedDate) : '—'" />
              <ContentList :label="t('Receive output into')" :value="order.receivingWarehouseName" />
            </div>
            <div>
              <ContentList :label="t('Received')">
                {{ formatNum(order.receivedQty) }} / {{ formatNum(order.qty) }} {{ order.unit }}
              </ContentList>
              <ContentList :label="t('Estimated component cost')">
                {{ order.method === 'basic' ? t('Supplied by the vendor') : formatIDR(estimate.components) }}
              </ContentList>
            </div>
          </div>
        </div>

        <!-- ── Progress ── -->
        <section class="sc-region">
          <h2 class="sc-section-title">{{ t('Progress') }}</h2>
          <div class="sc-progress">
            <SubconStageChain :stage="order.stage" :method="order.method" />
            <div class="sc-progress__text">
              <span class="sc-progress__stage">{{ stageName }}</span>
              <span class="sc-progress__caption">{{ order.stageCaption }}</span>
            </div>
          </div>
        </section>

        <!-- ── Document chain ── -->
        <section class="sc-region">
          <h2 class="sc-section-title">{{ t('Documents') }}</h2>
          <p class="sc-section-desc">
            {{ chain.filter(c => c.raised).length }} {{ t('of') }} {{ chain.length }} {{ t('planned documents raised') }}
          </p>

          <table class="sc-table">
            <thead>
              <tr>
                <th class="sc-th">{{ t('Document') }}</th>
                <th class="sc-th">{{ t('Type') }}</th>
                <th class="sc-th">{{ t('What it does') }}</th>
                <th class="sc-th">{{ t('Status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="step in chain" :key="step.kind" class="sc-tr">
                <td class="sc-td">
                  <span v-if="step.raised" class="sc-td__doc">{{ step.number }}</span>
                  <span v-else class="sc-muted">{{ t('Not raised yet') }}</span>
                </td>
                <td class="sc-td">
                  <MpBadge for="tableStatus" :type="step.tag === 'Transfer' ? 'warning' : step.tag === 'Receipt' ? 'completed' : 'information'">
                    {{ t(step.tag) }}
                  </MpBadge>
                </td>
                <td class="sc-td sc-td--wrap">{{ t(step.detail) }}</td>
                <td class="sc-td">
                  <ErpStatusBadge
                    v-if="step.status === 'pending approval'"
                    status="pending approval" :label="t('Pending approval')" type="information"
                  />
                  <ErpStatusBadge
                    v-else-if="step.status === 'draft'"
                    status="draft" :label="t('Draft')" type="warning"
                  />
                  <span v-else class="sc-muted">{{ t('Planned') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ── Materials at the vendor — only for methods that put stock there ── -->
        <section class="sc-region">
          <h2 class="sc-section-title">{{ t('Materials in vendor custody') }}</h2>

          <p v-if="order.method === 'basic'" class="sc-empty-line">
            {{ t('None — on a Basic order the vendor sources its own materials, so no company stock sits with them.') }}
          </p>
          <p v-else-if="!custody.length" class="sc-empty-line">
            {{ t('Nothing in custody yet — materials appear here once the transfer or dropship shipment is sent.') }}
          </p>

          <template v-else>
            <table class="sc-table">
              <thead>
                <tr>
                  <th class="sc-th">{{ t('Material') }}</th>
                  <th class="sc-th">{{ t('Document') }}</th>
                  <th class="sc-th sc-th--num">{{ t('Sent') }}</th>
                  <th class="sc-th sc-th--num">{{ t('Consumed') }}</th>
                  <th class="sc-th sc-th--num">{{ t('Returned') }}</th>
                  <th class="sc-th sc-th--num">{{ t('Balance') }}</th>
                  <th class="sc-th sc-th--num">{{ t('Value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in custody" :key="line.id" class="sc-tr">
                  <td class="sc-td">
                    <span class="sc-td__name">{{ line.productName }}</span>
                    <span class="sc-td__sub">SKU {{ line.sku }}</span>
                  </td>
                  <td class="sc-td">{{ line.docNumber }}</td>
                  <td class="sc-td sc-td--num">{{ formatNum(line.sentQty) }} {{ line.unit }}</td>
                  <td class="sc-td sc-td--num">
                    <span v-if="!line.consumedQty" class="sc-muted">—</span>
                    <span v-else>{{ formatNum(line.consumedQty) }} {{ line.unit }}</span>
                  </td>
                  <td class="sc-td sc-td--num">
                    <span v-if="!line.returnedQty" class="sc-muted">—</span>
                    <span v-else>{{ formatNum(line.returnedQty) }} {{ line.unit }}</span>
                  </td>
                  <td class="sc-td sc-td--num sc-td--strong">{{ formatNum(custodyBalance(line)) }} {{ line.unit }}</td>
                  <td class="sc-td sc-td--num">{{ formatIDR(line.balanceValue) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="sc-table-caption">
              {{ t('Still on your books at the vendor') }}: <strong>{{ formatIDR(custodyValue) }}</strong>
            </p>
          </template>
        </section>

        <!-- ── QC disposition — exists only once goods have come back ── -->
        <section class="sc-region sc-region--last">
          <h2 class="sc-section-title">{{ t('Receipt disposition') }}</h2>

          <p v-if="!order.disposition" class="sc-empty-line">
            {{ t('Nothing received yet — quality outcomes appear here after the first goods receipt.') }}
          </p>

          <dl v-else class="sc-disposition">
            <div class="sc-disposition__item">
              <dt>{{ t('Accepted') }}</dt>
              <dd class="sc-disposition__value sc-disposition__value--accepted">
                {{ formatNum(order.disposition.accepted) }} {{ order.unit }}
              </dd>
            </div>
            <div class="sc-disposition__item">
              <dt>{{ t('Rework') }}</dt>
              <dd class="sc-disposition__value sc-disposition__value--rework">
                {{ formatNum(order.disposition.rework) }} {{ order.unit }}
              </dd>
            </div>
            <div class="sc-disposition__item">
              <dt>{{ t('Scrap') }}</dt>
              <dd class="sc-disposition__value sc-disposition__value--scrap">
                {{ formatNum(order.disposition.scrap) }} {{ order.unit }}
              </dd>
            </div>
          </dl>
        </section>

      </div>
    </div>

    <!-- ── Footer actions ── -->
    <footer class="detail-footer">
      <MpPopover id="sc-print-share" is-close-on-select use-portal placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Print & share') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>

      <MpPopover id="sc-actions" is-close-on-select use-portal placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="router.push('/subcon-custody')">{{ t('Open custody dashboard') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
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
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default);
}

/* 32px between every region — the detail-page standard. */
.sc-body { display: flex; flex-direction: column; }
.sc-region { margin-bottom: var(--mp-spacing-8); }
.sc-region--last { margin-bottom: 0; }

.sc-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sc-section-desc {
  margin: calc(-1 * var(--mp-spacing-2)) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Header summary ──────────────────────────────────────────────────────── */
.sc-summary__primary {
  display: grid;
  grid-template-columns: minmax(0, 318px) 1fr auto;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.sc-summary__emphasis { display: flex; flex-direction: column; align-items: flex-end; padding: var(--mp-spacing-2) 0; }
.sc-summary__emphasis-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sc-summary__emphasis-value {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
/* 4px dash / 4px gap — CSS dashed borders cannot set the dash size. */
.sc-summary__divider {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-3) 0;
  background: repeating-linear-gradient(to right, var(--mp-border-default) 0 4px, transparent 4px 8px);
}
.sc-summary__grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(3, 1fr);
  gap: 0 var(--mp-spacing-6);
}

/* ── Progress ────────────────────────────────────────────────────────────── */
.sc-progress {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-default, #fff);
}
.sc-progress__text { display: flex; flex-direction: column; min-width: 0; }
.sc-progress__stage {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sc-progress__caption { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Read-only tables ────────────────────────────────────────────────────── */
.sc-table { width: 100%; border-collapse: collapse; }
.sc-th {
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-th--num { text-align: right; }
.sc-tr:last-child .sc-td { border-bottom: none; }
.sc-td {
  padding: var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap;
}
.sc-td--wrap { white-space: normal; }
.sc-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.sc-td--strong { font-weight: var(--mp-font-weights-semi-bold); }
.sc-td__doc { color: var(--mp-text-link); }
.sc-td__name { display: block; }
.sc-td__sub {
  display: block;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.sc-table-caption {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.sc-table-caption strong { color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.sc-muted { color: var(--mp-text-secondary); }
.sc-empty-line { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Disposition ─────────────────────────────────────────────────────────── */
.sc-disposition { display: flex; gap: var(--mp-spacing-8); margin: 0; }
.sc-disposition__item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.sc-disposition__item dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sc-disposition__value {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  font-variant-numeric: tabular-nums;
}
.sc-disposition__value--accepted { color: var(--mp-text-success, #18794e); }
.sc-disposition__value--rework { color: var(--mp-text-warning, #b54708); }
.sc-disposition__value--scrap { color: var(--mp-text-critical, var(--mp-text-danger, #a8352d)); }

/* ── Not-found state ─────────────────────────────────────────────────────── */
.sc-notfound { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
.sc-notfound__title {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sc-notfound__desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
