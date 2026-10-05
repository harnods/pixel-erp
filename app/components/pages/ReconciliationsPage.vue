<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/views/ReconciliationView.vue -->
<script setup lang="ts">
/**
 * Reconciliations workspace — account rail (left, on the grey shell) beside the
 * reconciled account's page: title bar (`{code} {name}` + New transaction +
 * kebab), overview strip (identity / Statement balance / Book balance /
 * Difference) and the four workspace tabs (To match / Not reconciled / Matched /
 * Cash mapping) with count badges.
 *
 * Routes mirror prod: /reconciliations lands on the last-used account (else the
 * first rail account) and replaces the URL; /reconciliations/:id/<tab-slug>.
 * Full-bleed (own rail + title bar), so it renders through detailMatch.
 */
import {
  MpButton, MpIcon, MpBadge, MpTabs, MpTabList, MpTab,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ReconciliationToMatchTab from '~/components/reconciliation/ReconciliationToMatchTab.vue'
import ReconciliationNotReconciledTab from '~/components/reconciliation/ReconciliationNotReconciledTab.vue'
import ReconciliationMatchedTab from '~/components/reconciliation/ReconciliationMatchedTab.vue'
import ReconciliationCashMappingTab from '~/components/reconciliation/ReconciliationCashMappingTab.vue'
import {
  reconRailAccounts, reconAccount, reconSummary, reconToMatchLines, reconNotReconciled, reconMatchedPairs,
  loadCreated, saveCreated, type CashAccount,
} from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const TAB_SLUGS = ['to-match', 'not-reconciled', 'matched', 'cash-mapping'] as const
type TabSlug = (typeof TAB_SLUGS)[number]
const TAB_LABELS: Record<TabSlug, string> = {
  'to-match': 'To match', 'not-reconciled': 'Not reconciled', 'matched': 'Matched', 'cash-mapping': 'Cash mapping',
}

const LAST_KEY = 'reconciliation-last-account'
const segs = computed(() => route.path.split('/').filter(Boolean))
const rail = computed(() => reconRailAccounts())

// ── Landing: last-used-if-still-in-the-rail, else the first rail account ──
const landingId = computed(() => {
  const last = loadCreated<string>(LAST_KEY)[0]
  if (last && rail.value.some(a => a.id === last)) return last
  return rail.value[0]?.id
})
const accountId = computed(() => segs.value[1] ?? landingId.value)
const account = computed<CashAccount | undefined>(() => (accountId.value ? reconAccount(accountId.value) : undefined))

watch([() => segs.value[1], landingId], ([seg, landing]) => {
  if (!seg && landing) router.replace(`/reconciliations/${landing}/to-match`)
  else if (seg && !reconAccount(seg) && landing) router.replace(`/reconciliations/${landing}/to-match`)
}, { immediate: true })
watch(account, (a) => { if (a) saveCreated(LAST_KEY, [a.id]) }, { immediate: true })

// ── Tabs (route segment = tab slug) ──
const activeSlug = computed<TabSlug>(() => {
  const s = segs.value[2] as TabSlug | undefined
  return s && TAB_SLUGS.includes(s) ? s : 'to-match'
})
const activeTabIndex = computed({
  get: () => TAB_SLUGS.indexOf(activeSlug.value),
  set: (i: number) => { if (account.value) router.replace(`/reconciliations/${account.value.id}/${TAB_SLUGS[i] ?? 'to-match'}`) },
})
const visited = ref(new Set<TabSlug>())
watch(activeSlug, s => { visited.value = new Set(visited.value).add(s) }, { immediate: true })
watch(accountId, () => { visited.value = new Set([activeSlug.value]) })

const tabCounts = computed<Record<TabSlug, number>>(() => {
  const id = account.value?.id
  if (!id) return { 'to-match': 0, 'not-reconciled': 0, 'matched': 0, 'cash-mapping': 0 }
  const toMatch = reconToMatchLines(id).length
  return {
    'to-match': toMatch,
    'not-reconciled': reconNotReconciled(id).length,
    'matched': reconMatchedPairs(id).length,
    'cash-mapping': toMatch,
  }
})

// ── Rail ──
const railSearch = ref('')
const railFiltered = computed(() => {
  const q = railSearch.value.trim().toLowerCase()
  return q ? rail.value.filter(a => `${a.code} ${a.name}`.toLowerCase().includes(q)) : rail.value
})
function selectAccount(a: CashAccount) {
  if (a.id === account.value?.id) return
  router.push(`/reconciliations/${a.id}/${activeSlug.value}`)
}
function railIcon(a: CashAccount) { return /^2-/.test(a.code) ? 'id-card' : 'wallet' }

// ── Overview strip ──
const summary = computed(() => (account.value ? reconSummary(account.value) : null))
const PLACEHOLDER = '—'
const statementValue = computed(() => (summary.value?.statementBalance == null || !account.value) ? PLACEHOLDER : formatMoney(summary.value.statementBalance, account.value.currency))
const bookValue = computed(() => account.value ? formatMoney(account.value.bookBalance, account.value.currency) : PLACEHOLDER)
const differenceValue = computed(() => (summary.value?.difference == null || !account.value) ? PLACEHOLDER : formatMoney(summary.value.difference, account.value.currency))
const statementCaption = computed(() => summary.value?.statementDate ? `${t('As of')} ${formatDateLong(summary.value.statementDate)}` : '')
const differenceCaption = computed(() => `${tabCounts.value['to-match']} ${t('transaction(s) to reconcile')}`)

function goCreate(path: string | null) {
  if (path) router.push(path)
  else infoToast(t('Not in this prototype'))
}
</script>

<template>
  <div class="recon">
    <!-- ── Account rail ── -->
    <aside class="recon-rail">
      <p class="recon-rail__title">{{ t('Reconciliations') }}</p>
      <div class="filter-search recon-rail__search">
        <MpIcon name="search" size="sm" />
        <input v-model="railSearch" class="filter-search-input btn-enterprise" type="text" :placeholder="t('Search account')" :aria-label="t('Search account')" />
      </div>
      <p v-if="railFiltered.length === 0" class="recon-rail__empty">{{ t('No accounts found') }}</p>
      <ul v-else class="recon-rail__list">
        <li v-for="a in railFiltered" :key="a.id">
          <button
            type="button"
            class="recon-rail__row btn-enterprise"
            :class="{ 'recon-rail__row--active': a.id === account?.id }"
            @click="selectAccount(a)"
          >
            <MpIcon :name="railIcon(a)" size="sm" class="recon-rail__icon" />
            <span class="recon-rail__col">
              <span class="recon-rail__label">{{ a.code }} {{ a.name }}</span>
              <span class="recon-rail__currency">{{ a.currency }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="railFiltered.length > 0" class="recon-rail__end">{{ t("You've reached the end") }}</p>
    </aside>

    <!-- ── Empty: no cash or bank accounts ── -->
    <div v-if="rail.length === 0" class="recon-main recon-main--empty">
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
        <p class="empty-full__title">{{ t('No cash or bank accounts') }}</p>
        <p class="empty-full__desc">{{ t('Add a cash or bank account to start reconciling transactions.') }}</p>
      </div>
    </div>

    <div v-else-if="account" class="recon-main">
      <!-- ── Title bar ── -->
      <header class="recon-titlebar">
        <h1 class="recon-titlebar__title">{{ account.code }} {{ account.name }}</h1>
        <div class="recon-titlebar__actions">
          <MpPopover id="recon-new-tx" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('New transaction') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="goCreate('/cash-management/internal-transfer')">{{ t('New internal transfer') }}</MpPopoverListItem>
                <MpPopoverListItem @click="goCreate(null)">{{ t('New receive money') }}</MpPopoverListItem>
                <MpPopoverListItem @click="goCreate(null)">{{ t('New spend money') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <MpPopover id="recon-account-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" is-rounded class="recon-kebab" :aria-label="t('Manage account')">
                <MpIcon name="menu-kebab" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Import bank statement') }}</MpPopoverListItem>
                <MpPopoverListItem @click="router.push('/bank-rules')">{{ t('Bank rules') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </header>

      <!-- ── Stage ── -->
      <div class="recon-stage">
        <!-- Overview strip -->
        <div class="recon-overview">
          <div class="recon-overview__cell recon-overview__identity">
            <span class="recon-overview__logo"><MpIcon name="bank" size="md" /></span>
            <div class="recon-overview__identity-text">
              <div class="recon-overview__name-row">
                <span class="recon-overview__name">{{ account.connection?.bankName ?? `${account.code} ${account.name}` }}</span>
                <MpBadge v-if="account.isConnected" variant="subtle" variant-color="green">{{ t('Connected') }}</MpBadge>
              </div>
              <span class="recon-overview__caption">
                {{ account.currency }}<template v-if="account.accountNumber"> {{ account.accountNumber }}</template>
              </span>
            </div>
          </div>
          <div class="recon-overview__cell">
            <span class="recon-overview__label">{{ t('Statement balance') }}</span>
            <span class="recon-overview__caption">{{ statementCaption || t('No statement imported') }}</span>
            <span class="recon-overview__value">{{ statementValue }}</span>
          </div>
          <div class="recon-overview__cell">
            <span class="recon-overview__label">{{ t('Book balance') }}</span>
            <span class="recon-overview__caption">{{ t('As of today') }}</span>
            <span class="recon-overview__value">{{ bookValue }}</span>
          </div>
          <div class="recon-overview__cell">
            <span class="recon-overview__label">{{ t('Difference') }}</span>
            <span class="recon-overview__caption">{{ differenceCaption }}</span>
            <span class="recon-overview__value">{{ differenceValue }}</span>
          </div>
        </div>

        <!-- Workspace tabs -->
        <MpTabs id="recon-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="recon-tabs">
          <MpTabList>
            <MpTab v-for="slug in TAB_SLUGS" :id="`recon-tab-${slug}`" :key="slug" :value="slug">
              <span class="recon-tab">
                <span>{{ t(TAB_LABELS[slug]) }}</span>
                <MpBadge for="tableStatus" :type="slug === activeSlug ? 'completed' : 'announcement'">{{ tabCounts[slug] }}</MpBadge>
              </span>
            </MpTab>
          </MpTabList>
        </MpTabs>

        <div v-if="visited.has('to-match')" v-show="activeSlug === 'to-match'">
          <ReconciliationToMatchTab :key="account.id" :account="account" />
        </div>
        <div v-if="visited.has('not-reconciled')" v-show="activeSlug === 'not-reconciled'">
          <ReconciliationNotReconciledTab :key="account.id" :account="account" />
        </div>
        <div v-if="visited.has('matched')" v-show="activeSlug === 'matched'">
          <ReconciliationMatchedTab :key="account.id" :account="account" />
        </div>
        <div v-if="visited.has('cash-mapping')" v-show="activeSlug === 'cash-mapping'">
          <ReconciliationCashMappingTab :key="account.id" :account="account" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recon {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--mp-background-neutral-subtle);
}

/* ── Rail ── */
.recon-rail {
  flex-shrink: 0;
  width: var(--mp-sizes-64, 256px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-5) var(--mp-spacing-4) var(--mp-spacing-2);
  overflow-y: auto;
}
.recon-rail__title {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--mp-text-default);
}
.recon-rail__search { width: 100%; box-sizing: border-box; }
.recon-rail__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.recon-rail__row {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-2);
  width: 100%;
  text-align: left;
  padding: var(--mp-spacing-2);
  border: 1px solid transparent;
  border-radius: var(--mp-radii-md);
  background: transparent;
  cursor: pointer;
}
.recon-rail__row:hover { background: var(--mp-background-neutral-hovered); }
.recon-rail__row--active,
.recon-rail__row--active:hover { background: var(--mp-background-neutral); border-color: var(--mp-border-default); }
.recon-rail__icon { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5, 2px); color: var(--mp-colors-icon-default); }
.recon-rail__col { display: flex; flex-direction: column; min-width: 0; }
.recon-rail__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.recon-rail__row--active .recon-rail__label { font-weight: var(--mp-font-weights-semi-bold); }
.recon-rail__currency { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.recon-rail__empty,
.recon-rail__end { margin: 0; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }

/* ── Right column ── */
.recon-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.recon-main--empty { align-items: center; justify-content: center; background: var(--mp-background-stage); }
.recon-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-6);
  padding: 0 var(--mp-spacing-6);
}
.recon-titlebar__title {
  margin: 0;
  min-width: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px);
  color: var(--mp-text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recon-titlebar__actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.recon-kebab { min-width: 0 !important; }
.recon-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) 0 0 0;
}

/* ── Overview strip — flat divided cells ── */
.recon-overview { display: flex; gap: var(--mp-spacing-6); }
.recon-overview__cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  border-right: 1px solid var(--mp-border-default);
}
.recon-overview__cell:last-child { border-right: none; padding-right: 0; }
.recon-overview__identity { flex-direction: row; align-items: center; gap: var(--mp-spacing-3); }
.recon-overview__logo {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  color: var(--mp-colors-icon-default);
}
.recon-overview__identity-text { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.recon-overview__name-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.recon-overview__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.recon-overview__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.recon-overview__caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.recon-overview__value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* ── Tabs ── */
.recon-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; }
.recon-tab { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
