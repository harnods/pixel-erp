<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDateLong, formatDateTimeLong } from '~/utils/date'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { xpmMyClaims, xpmBadgeType, type XpmClaim } from '~/data/xpm'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const claim = computed<XpmClaim>(
  () => xpmMyClaims.find((c) => c.id === props.orderId) ?? xpmMyClaims[0]!,
)

// Reimbursement item lines (mock, coherent with the claim total).
const items = computed(() => [
  { subCategory: claim.value.subCategory, vendor: 'Blue Bird', description: `${claim.value.category} expense`, amount: claim.value.amount },
])

function goBack() { router.push('/my-claims') }
function edit() { router.push(`/my-claims/${claim.value.id}/edit`) }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">My claims</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Claim detail</h1>
          <ErpStatusBadge :status="claim.status" :label="claim.status" :type="xpmBadgeType(claim.status)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <p class="xpm-subtitle">{{ claim.id }} · requested {{ formatDateLong(claim.requestDate) }}</p>

      <!-- Claim information -->
      <section class="xpm-card">
        <div class="xpm-card-head">
          <h2 class="xpm-card-title">Claim information</h2>
          <button class="btn-enterprise btn-enterprise--secondary" @click="edit">Edit</button>
        </div>
        <div class="xpm-info-grid">
          <ContentList label="Transaction type" :value="claim.claimType" />
          <ContentList label="Account" value="Main account" />
          <ContentList label="Category" :value="claim.category" />
          <ContentList label="Transaction date" :value="formatDateLong(claim.requestDate)" />
          <ContentList label="Request date" :value="formatDateTimeLong(claim.requestDate)" />
        </div>
      </section>

      <!-- Reimbursement items -->
      <section class="xpm-card">
        <h2 class="xpm-card-title">Reimbursement items</h2>
        <p class="xpm-card-sub">Details of expenses submitted for reimbursement, outlining each item and its cost.</p>
        <table class="xpm-table">
          <thead>
            <tr>
              <th class="xpm-th">Subcategory</th>
              <th class="xpm-th">Vendor</th>
              <th class="xpm-th">Description</th>
              <th class="xpm-th xpm-th--num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in items" :key="i" class="xpm-row">
              <td class="xpm-td">{{ it.subCategory }}</td>
              <td class="xpm-td">{{ it.vendor }}</td>
              <td class="xpm-td xpm-td--muted">{{ it.description }}</td>
              <td class="xpm-td xpm-td--num">{{ formatIDR(it.amount) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="xpm-total-row">
              <td class="xpm-td xpm-td--total">Total reimbursement amount</td>
              <td class="xpm-td"></td>
              <td class="xpm-td"></td>
              <td class="xpm-td xpm-td--num xpm-td--total">{{ formatIDR(claim.amount) }}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Tabs: Request history + Discussions -->
      <section class="xpm-card">
        <MpTabs id="xpm-claim-tabs" :default-value="0" variant-color="green" class="xpm-tabs">
          <MpTabList>
            <MpTab id="xpm-claim-tab-history" value="history">Request history</MpTab>
            <MpTab id="xpm-claim-tab-discussions" value="discussions">Discussions</MpTab>
          </MpTabList>
          <MpTabPanels>
            <MpTabPanel value="history">
              <ol class="xpm-timeline">
                <li class="xpm-tl-item">
                  <span class="xpm-tl-dot xpm-tl-dot--warning" />
                  <div class="xpm-tl-body">
                    <span class="xpm-tl-title">Forwarded to approver</span>
                    <span class="xpm-tl-sub">Rizal Candra · {{ formatDateTimeLong(claim.requestDate) }}</span>
                  </div>
                </li>
                <li class="xpm-tl-item">
                  <span class="xpm-tl-dot xpm-tl-dot--done" />
                  <div class="xpm-tl-body">
                    <span class="xpm-tl-title">Submitted request</span>
                    <span class="xpm-tl-sub">You · {{ formatDateTimeLong(claim.requestDate) }}</span>
                  </div>
                </li>
              </ol>
            </MpTabPanel>
            <MpTabPanel value="discussions">
              <p class="xpm-empty">No discussions yet.</p>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px); font-family: inherit;
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default); white-space: nowrap;
}

/* ── Stage ── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
}
.xpm-subtitle { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Card ── */
.xpm-card {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-canvas, #fff); padding: var(--mp-spacing-5);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.xpm-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.xpm-card-title {
  margin: 0; font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.xpm-card-sub { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.xpm-info-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); }
.xpm-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Table ── */
.xpm-table { width: 100%; border-collapse: collapse; }
.xpm-th {
  height: 28px; text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.xpm-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.xpm-td {
  height: 40px;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-lg, 20px); vertical-align: middle;
}
.xpm-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.xpm-td--muted { color: var(--mp-text-secondary); }
.xpm-td--total { font-weight: var(--mp-font-weights-semi-bold); }
.xpm-row .xpm-td { border-bottom: 1px solid var(--mp-border-default); }
.xpm-total-row .xpm-td { border-top: 1px solid var(--mp-border-bold, #758195); }

/* ── Tabs ── */
.xpm-tabs :deep(.mp-tab--isSelected_true), .xpm-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.xpm-tabs :deep(.mp-tab-selected-border--isSelected_true) { background-color: var(--mp-border-selected, #029861) !important; }
.xpm-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* ── Timeline ── */
.xpm-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.xpm-tl-item { position: relative; display: flex; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); }
.xpm-tl-item:not(:last-child)::before {
  content: ''; position: absolute; left: 4px; top: 14px; bottom: 0; width: 1px; background: var(--mp-border-default);
}
.xpm-tl-dot { width: 9px; height: 9px; border-radius: 999px; margin-top: 5px; flex-shrink: 0; z-index: 1; }
.xpm-tl-dot--warning { background: var(--mp-background-warning-bold, #d99a00); }
.xpm-tl-dot--done { background: var(--mp-background-brand-bold, #029861); }
.xpm-tl-body { display: flex; flex-direction: column; }
.xpm-tl-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.xpm-tl-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
