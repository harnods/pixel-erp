<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/components/to-match/ToMatchTab.vue -->
<script setup lang="ts">
/**
 * To match — bank statement lines awaiting a match, grouped by date (newest
 * first). Each card pairs the statement line (left) with the suggestion
 * (right) and a confirm (✓) button. Suggestion types: Match found (confirm
 * directly), Potential match found (expand → tick the right transactions so
 * they total the statement amount) and No match found (→ View details / Find
 * another match). Confirming persists the pair (moves to Matched).
 */
import {
  MpButton, MpIcon, MpBadge, MpCheckbox, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ReconciliationFindMatchModal, { type FindMatchItem } from '~/components/reconciliation/ReconciliationFindMatchModal.vue'
import {
  reconToMatchLines, reconNotReconciled, reconTransactionsById, reconMatch, reconDelete,
  type CashAccount, type ReconStatementLine, type ReconSuggestionType, type ReconTransaction,
} from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDate, formatDateLong } from '~/utils/date'

const props = defineProps<{ account: CashAccount }>()
const { t } = useLocale()
const router = useRouter()

const CHIP: Record<ReconSuggestionType, { label: string; color: 'green' | 'orange' | 'gray' }> = {
  match: { label: 'Match found', color: 'green' },
  potential: { label: 'Potential match found', color: 'orange' },
  none: { label: 'No match found', color: 'gray' },
}
const STATUS_OPTIONS = (Object.keys(CHIP) as ReconSuggestionType[]).map(k => ({ value: k, label: CHIP[k].label }))

// ── Filters: draft (date range + status) committed by Apply; search is live ──
const draftRange = ref<Date[] | null>(null)
const draftStatus = ref('')
const appliedRange = ref<Date[] | null>(null)
const appliedStatus = ref('')
const search = ref('')
function applyFilters() { appliedRange.value = draftRange.value; appliedStatus.value = draftStatus.value }

const lines = computed(() => reconToMatchLines(props.account.id))
const txById = computed(() => reconTransactionsById(props.account.id))
/** Suggestions can only point at transactions that are still unreconciled. */
const openTxIds = computed(() => new Set(reconNotReconciled(props.account.id).map(tx => tx.id)))
function suggestionFor(l: ReconStatementLine): { type: ReconSuggestionType; txs: ReconTransaction[] } {
  const txs = l.suggestion.transactionIds.filter(id => openTxIds.value.has(id)).map(id => txById.value[id]!).filter(Boolean)
  if (l.suggestion.type === 'none' || txs.length === 0) return { type: 'none', txs: [] }
  return { type: l.suggestion.type, txs }
}

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  const [from, to] = appliedRange.value ?? []
  return lines.value.filter(l => {
    if (appliedStatus.value && suggestionFor(l).type !== appliedStatus.value) return false
    if (from && to) {
      const d = new Date(`${l.date}T00:00:00`)
      if (d < from || d > to) return false
    }
    return !q || l.description.toLowerCase().includes(q) || String(l.amount).includes(q)
  })
})
const groups = computed(() => {
  const m = new Map<string, ReconStatementLine[]>()
  for (const l of visible.value) m.set(l.date, [...(m.get(l.date) ?? []), l])
  return [...m.entries()].map(([date, items]) => ({ date, items }))
})
const collapsedGroups = ref(new Set<string>())
function toggleGroup(d: string) {
  const s = new Set(collapsedGroups.value)
  s.has(d) ? s.delete(d) : s.add(d)
  collapsedGroups.value = s
}

// ── Expand + potential selection ──
const expanded = ref(new Set<string>())
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
const picks = reactive<Record<string, string[]>>({})
const cardErrors = reactive<Record<string, string>>({})
function togglePick(lineId: string, txId: string) {
  const cur = picks[lineId] ?? []
  picks[lineId] = cur.includes(txId) ? cur.filter(x => x !== txId) : [...cur, txId]
  cardErrors[lineId] = ''
}
function pickedTotal(l: ReconStatementLine) {
  return (picks[l.id] ?? []).reduce((s, id) => s + (txById.value[id]?.amount ?? 0), 0)
}

function money(n: number) { return formatMoney(n, props.account.currency) }
function signed(l: { amount: number; direction: string }) { return l.direction === 'out' ? money(-l.amount) : money(l.amount) }
function hint(l: ReconStatementLine) {
  const s = suggestionFor(l)
  if (s.type === 'match') return s.txs.length === 1 ? `${s.txs[0]!.type} #${s.txs[0]!.number} ${t('to')} ${s.txs[0]!.contact}` : `${s.txs.length} ${t('transactions')}`
  if (s.type === 'potential') return `${s.txs.length} ${t('possible matches found')}`
  return t('No match found')
}
function rightAmount(l: ReconStatementLine) {
  const s = suggestionFor(l)
  return signed({ amount: s.txs.reduce((x, tx) => x + tx.amount, 0), direction: l.direction })
}
function rightDate(l: ReconStatementLine) {
  const s = suggestionFor(l)
  return s.txs.length === 1 ? formatDate(s.txs[0]!.date) : t('Multiple transactions')
}

// ── Confirm ──
function confirm(l: ReconStatementLine) {
  const s = suggestionFor(l)
  if (s.type === 'match') {
    reconMatch(props.account.id, [l.id], s.txs.map(tx => tx.id), 'matched')
    toast.notify({ variant: 'success', title: t('Bank statement matched'), maxWidth: 'max-content' })
    return
  }
  if (s.type === 'potential') {
    if (!expanded.value.has(l.id)) toggleExpand(l.id)
    const chosen = picks[l.id] ?? []
    if (chosen.length === 0 || pickedTotal(l) !== l.amount) {
      cardErrors[l.id] = t('Select transactions that total the statement amount to confirm')
      return
    }
    reconMatch(props.account.id, [l.id], chosen, 'manual')
    toast.notify({ variant: 'success', title: t('Bank statement matched'), maxWidth: 'max-content' })
  }
}

// ── Find another match ──
const findAnchor = ref<ReconStatementLine | null>(null)
const findCandidates = computed<FindMatchItem[]>(() => reconNotReconciled(props.account.id).map(tx => ({
  id: tx.id, date: tx.date, number: `${tx.type} #${tx.number}`, contact: tx.contact, description: tx.description, amount: tx.amount, direction: tx.direction,
})))
function onFindConfirm(ids: string[]) {
  const l = findAnchor.value
  if (!l) return
  reconMatch(props.account.id, [l.id], ids, 'manual')
  findAnchor.value = null
  toast.notify({ variant: 'success', title: t('Match confirmed'), maxWidth: 'max-content' })
}

// ── Delete statement line ──
const deleteTarget = ref<ReconStatementLine | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  reconDelete([deleteTarget.value.id])
  deleteTarget.value = null
  toast.notify({ variant: 'success', title: t('Bank statement line deleted'), maxWidth: 'max-content' })
}

function createRule(l: ReconStatementLine) {
  router.push({ path: '/bank-rules/new', query: { trigger: l.direction === 'in' ? 'money_in' : 'money_out', description: l.description, account: props.account.id } })
}
</script>

<template>
  <div class="tm">
    <!-- Filter row -->
    <div class="tm-filters">
      <div class="tm-filters__left">
        <AdvancedDateRangePicker id="tm-daterange" :model-value="draftRange" placeholder="All dates" @update:model-value="draftRange = $event" />
        <ErpFilterSelect id="tm-status" v-model="draftStatus" :placeholder="t('All matches')" :options="STATUS_OPTIONS" width="220px" />
        <MpButton variant="secondary" is-rounded @click="applyFilters">{{ t('Apply') }}</MpButton>
      </div>
      <div class="filter-search">
        <MpIcon name="search" size="sm" />
        <input
          v-model="search"
          class="filter-search-input"
          type="text"
          :placeholder="t('Search...')" :aria-label="t('Search...')" />
      </div>
    </div>

    <!-- Empty -->
    <div v-if="lines.length === 0" class="tm-empty">
      <img src="/illustrations/empty-folder.png" alt="" class="tm-empty__img" width="240" height="200" />
      <p class="tm-empty__desc">{{ t("You're all caught up — no statement lines to match.") }}</p>
    </div>
    <div v-else-if="groups.length === 0" class="tm-empty">
      <p class="tm-empty__title">{{ t('No results found') }}</p>
      <MpButton variant="ghost" is-rounded @click="search = ''; draftStatus = ''; draftRange = null; applyFilters()">{{ t('Clear all filters') }}</MpButton>
    </div>

    <!-- Column heads -->
    <div v-else class="tm-list">
      <div class="tm-heads">
        <span />
        <span>{{ t('Bank statement') }}</span>
        <span />
        <span>{{ t('Suggestion') }}</span>
        <span />
      </div>

      <section v-for="g in groups" :key="g.date" class="tm-group">
        <button type="button" class="tm-group__head btn-enterprise" :aria-expanded="!collapsedGroups.has(g.date)" @click="toggleGroup(g.date)">
          <MpIcon :name="collapsedGroups.has(g.date) ? 'chevrons-down' : 'chevrons-up'" size="sm" />
          <span>{{ formatDateLong(g.date) }}</span>
          <span class="tm-muted">({{ g.items.length }})</span>
        </button>

        <template v-if="!collapsedGroups.has(g.date)">
          <article v-for="l in g.items" :key="l.id" class="tm-card" :class="{ 'tm-card--open': expanded.has(l.id) }">
            <div class="tm-card__row">
              <button type="button" class="tm-icon-btn btn-enterprise" :aria-label="expanded.has(l.id) ? t('Collapse') : t('Expand')" @click="toggleExpand(l.id)">
                <MpIcon :name="expanded.has(l.id) ? 'chevrons-up' : 'chevrons-down'" size="sm" />
              </button>

              <div class="tm-side">
                <span class="tm-muted">{{ formatDate(l.date) }}</span>
                <span class="tm-amount" :class="{ 'tm-amount--out': l.direction === 'out' }">{{ signed(l) }}</span>
                <span class="tm-desc">{{ l.description }}</span>
              </div>

              <span class="tm-connector" aria-hidden="true" />

              <div class="tm-side">
                <template v-if="suggestionFor(l).type === 'none'">
                  <span class="tm-desc tm-muted">{{ hint(l) }}</span>
                </template>
                <template v-else>
                  <span class="tm-muted">{{ rightDate(l) }}</span>
                  <span class="tm-amount-row">
                    <span class="tm-amount" :class="{ 'tm-amount--out': l.direction === 'out' }">{{ rightAmount(l) }}</span>
                    <MpBadge variant="subtle" :variant-color="CHIP[suggestionFor(l).type].color">{{ t(CHIP[suggestionFor(l).type].label) }}</MpBadge>
                  </span>
                  <span class="tm-desc">{{ hint(l) }}</span>
                </template>
              </div>

              <!-- Confirm (✓) / no-match actions -->
              <MpPopover v-if="suggestionFor(l).type === 'none'" :id="`tm-none-${l.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton variant="ghost" is-rounded class="tm-confirm tm-confirm--dashed" :aria-label="t('No match actions')"><MpIcon name="check" size="sm" /></MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="toggleExpand(l.id)">{{ t('View details') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="findAnchor = l">{{ t('Find another match') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <MpTooltip v-else :id="`tm-confirm-tt-${l.id}`" :label="t('Confirm match')" placement="top" use-portal>
                <MpButton variant="ghost" is-rounded class="tm-confirm" :class="{ 'tm-confirm--dashed': suggestionFor(l).type === 'potential' }" :aria-label="t('Confirm match')" @click="confirm(l)">
                  <MpIcon name="check" size="sm" />
                </MpButton>
              </MpTooltip>
            </div>
            <p v-if="cardErrors[l.id]" class="tm-error" role="alert">{{ cardErrors[l.id] }}</p>

            <!-- Expanded panels -->
            <div v-if="expanded.has(l.id)" class="tm-card__expanded">
              <section class="tm-panel">
                <header class="tm-panel__head">
                  <h4 class="tm-panel__title">{{ t('Bank statement') }}</h4>
                  <MpPopover :id="`tm-stmt-menu-${l.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton variant="ghost" is-rounded class="tm-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="sm" /></MpButton>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="createRule(l)">{{ t('Create bank rule') }}</MpPopoverListItem>
                        <MpPopoverListItem @click="deleteTarget = l">{{ t('Delete statement line') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </header>
                <dl class="tm-fields">
                  <dt>{{ t('Date') }}</dt><dd>{{ formatDate(l.date) }}</dd>
                  <dt>{{ l.direction === 'in' ? t('Money in') : t('Money out') }}</dt><dd>{{ money(l.amount) }}</dd>
                  <dt>{{ t('Description') }}</dt><dd>{{ l.description }}</dd>
                </dl>
              </section>

              <section class="tm-panel">
                <header class="tm-panel__head">
                  <h4 class="tm-panel__title">
                    {{ suggestionFor(l).type === 'match' ? t('Matched transaction') : suggestionFor(l).type === 'potential' ? t('Select the correct transactions') : t('No match') }}
                  </h4>
                </header>

                <template v-if="suggestionFor(l).type === 'match'">
                  <dl v-for="tx in suggestionFor(l).txs" :key="tx.id" class="tm-fields">
                    <dt>{{ t('Transaction no.') }}</dt><dd>{{ tx.type }} #{{ tx.number }}</dd>
                    <dt>{{ t('Date') }}</dt><dd>{{ formatDate(tx.date) }}</dd>
                    <dt>{{ t('Contact') }}</dt><dd>{{ tx.contact || '—' }}</dd>
                    <dt>{{ t('Amount') }}</dt><dd>{{ money(tx.amount) }}</dd>
                  </dl>
                </template>

                <template v-else-if="suggestionFor(l).type === 'potential'">
                  <p class="tm-muted tm-help">{{ t('These transactions possibly match your bank statement. Select the correct ones.') }}</p>
                  <ul class="tm-picks">
                    <li v-for="tx in suggestionFor(l).txs" :key="tx.id" class="tm-pick" @click="togglePick(l.id, tx.id)">
                      <MpCheckbox :id="`tm-pick-${l.id}-${tx.id}`" :is-checked="(picks[l.id] ?? []).includes(tx.id)" @click.stop="togglePick(l.id, tx.id)" />
                      <span class="tm-pick__main">
                        <span>{{ tx.type }} #{{ tx.number }}</span>
                        <span class="tm-muted">{{ formatDate(tx.date) }} · {{ tx.contact }}</span>
                      </span>
                      <span class="tm-amount">{{ money(tx.amount) }}</span>
                    </li>
                  </ul>
                  <div class="tm-total"><span>{{ t('Selected total') }}</span><span class="tm-amount">{{ money(pickedTotal(l)) }}</span></div>
                </template>

                <template v-else>
                  <p class="tm-muted tm-help">{{ t('No matching transaction was found for this statement line') }}</p>
                </template>

                <div class="tm-panel__foot">
                  <span class="tm-muted">{{ t("Don't see the correct transaction?") }}</span>
                  <MpButton variant="ghost" is-rounded @click="findAnchor = l">{{ t('Find another transaction') }}</MpButton>
                </div>
              </section>
            </div>
          </article>
        </template>
      </section>
      <p class="tm-muted tm-count">{{ t('Showing') }} {{ visible.length }} {{ t('of') }} {{ lines.length }}</p>
    </div>

    <ReconciliationFindMatchModal
      :open="findAnchor !== null"
      :account="account"
      mode="statement"
      :anchors="findAnchor ? [{ id: findAnchor.id, date: findAnchor.date, description: findAnchor.description, amount: findAnchor.amount, direction: findAnchor.direction }] : []"
      :candidates="findCandidates"
      @close="findAnchor = null"
      @confirm="onFindConfirm"
    />
    <ConfirmModal
      :is-open="deleteTarget !== null"
      :title="t('Delete statement line?')"
      :description="t('The statement line will be removed from this account. This cannot be undone here.')"
      :confirm-label="t('Delete')"
      @update:is-open="(v: boolean) => { if (!v) deleteTarget = null }"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.tm { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-5); }
.tm-filters { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.tm-filters__left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.tm-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.tm-list { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.tm-heads, .tm-card__row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 24px minmax(0, 1fr) 36px;
  gap: var(--mp-spacing-3);
  align-items: center;
}
.tm-heads { padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary); }

.tm-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.tm-group__head {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); align-self: flex-start;
  padding: var(--mp-spacing-1) var(--mp-spacing-2); border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
  border-radius: var(--mp-radii-md);
}
.tm-group__head:hover { background: var(--mp-background-neutral-hovered); }

.tm-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
.tm-card--open { border-color: var(--mp-colors-border-bold); }
.tm-card__row { padding: var(--mp-spacing-3); }
.tm-side { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.tm-amount-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.tm-amount { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-success); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tm-amount--out { color: var(--mp-text-default); }
.tm-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.tm-connector { height: 1px; background: var(--mp-border-default); }
.tm-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default);
}
.tm-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.tm-confirm { min-width: 0 !important; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: 1px solid var(--mp-colors-border-bold) !important; }
.tm-confirm--dashed { border-style: dashed !important; }
.tm-kebab { min-width: 0 !important; }
.tm-error { margin: 0; padding: 0 var(--mp-spacing-3) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); text-align: right; }

.tm-card__expanded { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); border-radius: 0 0 var(--mp-radii-md) var(--mp-radii-md); }
.tm-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); min-width: 0; }
.tm-panel__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.tm-panel__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tm-panel__foot { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; padding-top: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default); }
.tm-fields { display: grid; grid-template-columns: 140px 1fr; gap: var(--mp-spacing-2) var(--mp-spacing-4); margin: 0; font-size: var(--mp-font-sizes-md); }
.tm-fields dt { color: var(--mp-text-secondary); }
.tm-fields dd { margin: 0; color: var(--mp-text-default); overflow-wrap: anywhere; }
.tm-help { margin: 0; }
.tm-picks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tm-pick { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); cursor: pointer; }
.tm-pick__main { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--mp-font-sizes-md); }
.tm-total { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.tm-count { margin: 0; }

.tm-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.tm-empty__img { width: 240px; height: 200px; object-fit: contain; }
.tm-empty__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tm-empty__desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
