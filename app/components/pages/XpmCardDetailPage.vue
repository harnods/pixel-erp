<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpIcon, MpButton, toast,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmCards, xpmBadgeType, type XpmCard } from '~/data/xpm'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const card = computed<XpmCard>(
  () => xpmCards.find((c) => c.id === props.orderId) ?? xpmCards[0]!,
)

// ── Local state (freeze toggle + effective status) ──
const frozen = ref(false)
const deactivated = ref(false)
const effectiveStatus = computed(() =>
  deactivated.value ? 'Inactive' : frozen.value ? 'Frozen' : card.value.status,
)

function toggleFreeze() {
  frozen.value = !frozen.value
}
function deactivate() {
  deactivated.value = true
  toast.notify({ variant: 'success', title: 'Card deactivated.', maxWidth: 'max-content' })
}

// ── Balance breakdown (mock, coherent with card.balance) ──
const loaded = computed(() => Math.round(card.value.balance * 2.5))
const spent = computed(() => loaded.value - card.value.balance)

// ── Activity (mock rows) ──
interface Activity { title: string; txn: string; date: string; kind: 'Debit' | 'Credit' | 'Fee'; amount: number }
const activity: Activity[] = [
  { title: 'Adobe Creative Cloud', txn: 'TXN-88214', date: '21/07/2026', kind: 'Debit',  amount: 899000 },
  { title: 'Figma annual seats',   txn: 'TXN-88190', date: '20/07/2026', kind: 'Debit',  amount: 5100000 },
  { title: 'Top up from wallet',   txn: 'TXN-88155', date: '18/07/2026', kind: 'Credit', amount: 10000000 },
  { title: 'Google Workspace',     txn: 'TXN-88101', date: '17/07/2026', kind: 'Debit',  amount: 2400000 },
  { title: 'FX conversion fee',    txn: 'TXN-88099', date: '17/07/2026', kind: 'Fee',    amount: 45000 },
]
const activitySearch = ref('')
const activityFilters = ['All', 'Debit', 'Credit', 'Fee']
const activeFilter = ref('All')
const filteredActivity = computed(() => {
  const q = activitySearch.value.trim().toLowerCase()
  return activity.filter((a) =>
    (activeFilter.value === 'All' || a.kind === activeFilter.value) &&
    (!q || a.title.toLowerCase().includes(q) || a.txn.toLowerCase().includes(q)),
  )
})

// ── Top up drawer ──
const topUpOpen = ref(false)
const sources = [
  { id: 'main',  name: 'Main account',       balance: 0 },
  { id: 'reimb', name: 'Reimbursement pool',  balance: 6773797 },
  { id: 'float', name: 'Card float',          balance: 2180000 },
]
const selectedSource = ref('reimb')
const topUpAmount = ref('')
const topUpReason = ref('')
const newBalancePreview = computed(() => {
  const parsed = Number(String(topUpAmount.value).replace(/[^\d]/g, '')) || 0
  return formatIDR(card.value.balance + parsed)
})
function openTopUp() { topUpOpen.value = true }
function closeTopUp() { topUpOpen.value = false }
function proceedTopUp() {
  topUpOpen.value = false
  toast.notify({ variant: 'success', title: 'Card topped up.', maxWidth: 'max-content' })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="router.push('/xpm-cards')">Cards</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ card.name }}</h1>
          <ErpStatusBadge :status="effectiveStatus" :label="effectiveStatus" :type="xpmBadgeType(effectiveStatus)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <div class="detail-bar-actions">
        <button class="btn-enterprise btn-enterprise--secondary" @click="toggleFreeze">{{ frozen ? 'Unfreeze' : 'Freeze' }}</button>
        <button class="btn-enterprise btn-enterprise--ghost" @click="deactivate">Deactivate</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="openTopUp">Top up balance</button>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <p class="xpm-subtitle">{{ card.id }} · {{ card.type }} card · {{ card.cardholder }} · Spending card</p>

      <!-- ── Balance card ── -->
      <section class="xpm-card xpm-balance">
        <div class="xpm-balance-cells">
          <div class="xpm-balance-cell">
            <span class="xpm-balance-label">Remaining balance</span>
            <span class="xpm-balance-value">{{ formatIDR(card.balance) }}</span>
          </div>
          <div class="xpm-balance-cell">
            <span class="xpm-balance-label">Loaded to card</span>
            <span class="xpm-balance-value">{{ formatIDR(loaded) }}</span>
          </div>
          <div class="xpm-balance-cell">
            <span class="xpm-balance-label">Spent</span>
            <span class="xpm-balance-value">{{ formatIDR(spent) }}</span>
            <span class="xpm-balance-sub">3 transactions</span>
          </div>
          <div class="xpm-balance-cell">
            <span class="xpm-balance-label">Funded from</span>
            <span class="xpm-balance-value">{{ card.account }}</span>
            <span class="xpm-balance-sub">wallet</span>
          </div>
        </div>
        <div class="xpm-progress"><span class="xpm-progress-fill" :style="{ width: '60%' }" /></div>
        <span class="xpm-progress-label">60% of loaded balance spent</span>
      </section>

      <!-- ── Two-column body ── -->
      <div class="xpm-body">
        <!-- LEFT: Activity -->
        <section class="xpm-card xpm-col-main">
          <h2 class="xpm-card-title">Activity</h2>
          <div class="xpm-activity-bar">
            <div class="xpm-chip-row">
              <button
                v-for="f in activityFilters" :key="f"
                class="xpm-chip" :class="{ 'xpm-chip--active': activeFilter === f }"
                @click="activeFilter = f"
              >{{ f }}</button>
            </div>
            <input v-model="activitySearch" class="xpm-search" type="text" placeholder="Search activity…" />
          </div>
          <ul class="xpm-activity-list">
            <li v-for="a in filteredActivity" :key="a.txn" class="xpm-activity-row">
              <div class="xpm-activity-meta">
                <span class="xpm-activity-title">{{ a.title }}</span>
                <span class="xpm-activity-sub">{{ a.txn }} · {{ a.date }}</span>
              </div>
              <span class="xpm-activity-badge" :class="`xpm-activity-badge--${a.kind.toLowerCase()}`">{{ a.kind }}</span>
              <span class="xpm-activity-amount">{{ formatIDR(a.amount) }}</span>
            </li>
            <li v-if="!filteredActivity.length" class="xpm-empty-row">No activity found.</li>
          </ul>
        </section>

        <!-- RIGHT: card visual + info -->
        <div class="xpm-col-side">
          <div class="xpm-visa">
            <div class="xpm-visa-top">
              <span class="xpm-visa-brand">mekari</span>
              <span class="xpm-visa-network">VISA</span>
            </div>
            <div class="xpm-visa-mid">
              <span class="xpm-visa-name">{{ card.name }}</span>
              <span class="xpm-visa-type">{{ card.type }} card</span>
            </div>
            <div class="xpm-visa-bot">
              <span class="xpm-visa-pan">•••• {{ card.last4 }}</span>
              <span class="xpm-visa-exp">Valid thru {{ card.expiration }}</span>
            </div>
          </div>

          <section class="xpm-card">
            <h2 class="xpm-card-title">Card information</h2>
            <dl class="xpm-meta-list">
              <div class="xpm-meta-row"><dt>Card ID</dt><dd>{{ card.id }}</dd></div>
              <div class="xpm-meta-row"><dt>Purpose</dt><dd>{{ card.name }}</dd></div>
              <div class="xpm-meta-row"><dt>Card holder</dt><dd>{{ card.cardholder }}</dd></div>
              <div class="xpm-meta-row"><dt>Active window</dt><dd>Until {{ card.expiration }}</dd></div>
              <div class="xpm-meta-row"><dt>Funded from</dt><dd>{{ card.account }}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </div>

    <!-- ── Top up drawer ── -->
    <MpDrawer
      id="xpm-card-topup-drawer"
      :is-open="topUpOpen"
      placement="right"
      size="md"
      variant="floating"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="closeTopUp"
    >
      <MpDrawerContent>
        <MpDrawerBody>
          <div class="xpm-drawer">
            <div class="xpm-drawer-header">
              <span class="xpm-drawer-title">Top up balance</span>
              <MpButton class="xpm-drawer-close" aria-label="Close" @click="closeTopUp">
                <MpIcon name="close" size="sm" />
              </MpButton>
            </div>

            <div class="xpm-drawer-content">
              <div class="xpm-banner">
                <MpIcon name="info" size="md" class="xpm-banner-icon" />
                <span>The source wallet is debited the moment the top-up succeeds · no bank transfer needed.</span>
              </div>

              <div class="xpm-drawer-field">
                <span class="xpm-field-label">Pay from wallet</span>
                <div class="xpm-source-list">
                  <button
                    v-for="s in sources" :key="s.id"
                    class="xpm-source-row" :class="{ 'xpm-source-row--active': selectedSource === s.id }"
                    @click="selectedSource = s.id"
                  >
                    <span class="xpm-source-radio" :class="{ 'xpm-source-radio--on': selectedSource === s.id }" />
                    <span class="xpm-source-name">{{ s.name }}</span>
                    <span class="xpm-source-balance">{{ formatIDR(s.balance) }}</span>
                  </button>
                </div>
              </div>

              <div class="xpm-drawer-field">
                <span class="xpm-field-label">Top up amount</span>
                <MpInputGroup id="xpm-topup-amount-group" is-full-width>
                  <MpInputLeftAddon>Rp</MpInputLeftAddon>
                  <MpInput id="xpm-topup-amount" v-model="topUpAmount" placeholder="0" />
                </MpInputGroup>
                <span class="xpm-field-help">New card balance after top-up: {{ newBalancePreview }}</span>
              </div>

              <div class="xpm-drawer-field">
                <span class="xpm-field-label">Reason</span>
                <MpTextarea id="xpm-topup-reason" v-model="topUpReason" is-full-width placeholder="Enter reason" />
              </div>
            </div>

            <div class="xpm-drawer-footer">
              <button class="btn-enterprise btn-enterprise--ghost" @click="closeTopUp">Cancel</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="proceedTopUp">Proceed</button>
            </div>
          </div>
        </MpDrawerBody>
      </MpDrawerContent>
      <MpDrawerOverlay />
    </MpDrawer>
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
.detail-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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
.xpm-card-title {
  margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Balance ── */
.xpm-balance { gap: var(--mp-spacing-4); }
.xpm-balance-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mp-spacing-6); }
.xpm-balance-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.xpm-balance-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-balance-value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.xpm-balance-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-progress { height: 6px; border-radius: 999px; background: var(--mp-background-neutral-subtle); overflow: hidden; }
.xpm-progress-fill { display: block; height: 100%; background: var(--mp-background-brand-bold, #029861); }
.xpm-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Two-column body ── */
.xpm-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--mp-spacing-6); align-items: start; }
.xpm-col-main { min-width: 0; }
.xpm-col-side { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

/* ── Activity ── */
.xpm-activity-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.xpm-chip-row { display: flex; gap: var(--mp-spacing-2); }
.xpm-chip {
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); padding: var(--mp-spacing-1) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; font-family: inherit;
}
.xpm-chip--active { background: var(--mp-background-brand-subtle, #e6f5ef); border-color: var(--mp-border-brand-bold, #029861); color: var(--mp-text-default); }
.xpm-search {
  width: 200px; box-sizing: border-box; padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; font-family: inherit;
}
.xpm-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.xpm-activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.xpm-activity-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default);
}
.xpm-activity-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.xpm-activity-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.xpm-activity-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-activity-badge {
  font-size: var(--mp-font-sizes-sm); padding: 1px var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px); flex-shrink: 0;
}
.xpm-activity-badge--debit { background: var(--mp-background-critical-subtle, #fdeceb); color: var(--mp-text-critical, #c0341d); }
.xpm-activity-badge--credit { background: var(--mp-background-brand-subtle, #e6f5ef); color: var(--mp-text-brand, #027a4e); }
.xpm-activity-badge--fee { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }
.xpm-activity-amount { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.xpm-empty-row { padding: var(--mp-spacing-4) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── VISA card visual ── */
.xpm-visa {
  border-radius: var(--mp-radii-lg, 8px);
  background: linear-gradient(135deg, #04543a 0%, #029861 60%, #05b876 100%);
  color: #fff; padding: var(--mp-spacing-5);
  display: flex; flex-direction: column; justify-content: space-between; gap: var(--mp-spacing-6);
  min-height: 190px;
}
.xpm-visa-top { display: flex; align-items: center; justify-content: space-between; }
.xpm-visa-brand { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.5px; }
.xpm-visa-network { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); font-style: italic; letter-spacing: 1px; }
.xpm-visa-mid { display: flex; flex-direction: column; gap: 2px; }
.xpm-visa-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.xpm-visa-type { font-size: var(--mp-font-sizes-sm); opacity: 0.85; }
.xpm-visa-bot { display: flex; align-items: flex-end; justify-content: space-between; }
.xpm-visa-pan { font-size: var(--mp-font-sizes-lg, 16px); letter-spacing: 2px; }
.xpm-visa-exp { font-size: var(--mp-font-sizes-sm); opacity: 0.85; }

/* ── Meta list ── */
.xpm-meta-list { margin: var(--mp-spacing-1) 0 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.xpm-meta-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); }
.xpm-meta-row dt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.xpm-meta-row dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; }

/* ── Drawer ── */
.xpm-drawer { display: flex; flex-direction: column; height: 100%; width: 460px; max-width: 90vw; }
.xpm-drawer-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.xpm-drawer-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.xpm-drawer-close { display: inline-flex !important; background: none !important; border: none !important; padding: var(--mp-spacing-1) !important; min-width: 0 !important; cursor: pointer; color: var(--mp-text-secondary); }
.xpm-drawer-close:hover { color: var(--mp-text-default); }
.xpm-drawer-content { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-4); }
.xpm-banner {
  display: flex; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information, #eef0fc); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.xpm-banner-icon { color: var(--mp-icon-information, #1d6fdc); flex-shrink: 0; }
.xpm-drawer-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.xpm-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.xpm-field-help { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-source-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.xpm-source-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3); text-align: left;
  padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md); background: var(--mp-background-canvas, #fff); cursor: pointer; font-family: inherit;
}
.xpm-source-row--active { border-color: var(--mp-border-brand-bold, #029861); background: var(--mp-background-brand-subtle, #e6f5ef); }
.xpm-source-radio { width: 16px; height: 16px; border-radius: 999px; border: 1.5px solid var(--mp-border-bold); flex-shrink: 0; }
.xpm-source-radio--on { border-color: var(--mp-border-brand-bold, #029861); border-width: 5px; }
.xpm-source-name { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.xpm-source-balance { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.xpm-drawer-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default);
}
</style>
