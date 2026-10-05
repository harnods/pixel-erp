<!-- prod-parity: jurnal-accounting-frontend/src/modules/cash-management/bank-rules/views/BankRulesIndexView.vue -->
<script setup lang="ts">
/**
 * Bank rules — ordered list (priority 1 runs first). Columns: Priority (drag
 * grip + ordinal), Name, Bank accounts, Conditions, Record as, Auto-record,
 * Memo (hidden by default — Column settings). Row kebab: Edit / Duplicate /
 * Delete. Drag the grip to reorder (disabled while searching, as in prod).
 * Title-bar "+ New bank rules" lives in [...slug].vue and routes to
 * /bank-rules/new.
 */
import {
  MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { usePointerSortable } from '~/composables/usePointerSortable'
import {
  bankRules, deleteBankRule, moveBankRule, persistBankRuleOrder, formatRuleCondition, cashAccounts,
  type BankRule,
} from '~/data'

const { t } = useLocale()
const router = useRouter()

interface RuleRow extends BankRule { priority: number }

const columns: TableColumn[] = [
  { key: 'priority', label: 'Priority', width: '110px' },
  { key: 'name', label: 'Name', kind: 'name', sortType: 'text' },
  { key: 'bankAccounts', label: 'Bank accounts', kind: 'address' },
  { key: 'conditions', label: 'Conditions', kind: 'address' },
  { key: 'recordAs', label: 'Record as', kind: 'status' },
  { key: 'autoRecord', label: 'Auto-record', kind: 'status' },
  { key: 'memo', label: 'Memo', kind: 'address' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, c.key !== 'memo'])))
const columnItems = columns.map(c => ({ key: c.key, label: c.label, disabled: c.key === 'priority' || c.key === 'name' }))
const visibleColumns = computed(() => columns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { if (key !== 'priority' && key !== 'name') columnVisibility[key] = false }

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 500) })

const rows = computed<RuleRow[]>(() => bankRules.map((r, i) => ({ ...r, priority: i + 1 })))
const { search, currentPage, paginated, total, perPage, setPage, setPerPage } =
  useTableState(rows, { defaultSort: { key: 'priority', dir: 'asc' }, filterFn: (r: RuleRow, s) => r.name.toLowerCase().includes(s) })
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

function accountLabel(id: string) {
  const a = cashAccounts.find(x => x.id === id)
  return a ? `${a.code} ${a.name}` : `${t('Account')} #${id}`
}
function memoText(r: BankRule) {
  if (r.memoMode === 'custom') return r.memoCustom || '—'
  if (r.memoMode === 'statement') return t('Same as statement description')
  return '—'
}

// ── Reorder (pointer sortable on the grip) ──
const reorderDisabled = computed(() => !!search.value)
const pageOffset = computed(() => (currentPage.value - 1) * perPage.value)
const { dragIndex, ghost, start } = usePointerSortable({
  axis: 'y',
  itemSelector: '.erp-tr',
  move: (from, to) => moveBankRule(pageOffset.value + from, pageOffset.value + to),
})
const draggedRule = computed(() => dragIndex.value === null ? null : (paginated.value as RuleRow[])[dragIndex.value] ?? null)
watch(dragIndex, (now, before) => {
  if (now === null && before !== null) {
    persistBankRuleOrder()
    const r = (paginated.value as RuleRow[])[before]
    if (r) toast.notify({ variant: 'success', title: `${t('Rule moved to priority')} ${r.priority}.`, maxWidth: 'max-content' })
  }
})
// ErpTablePage hands slots its own row objects, so resolve the page index by id.
function onGrip(id: string, e: PointerEvent) {
  const i = (paginated.value as RuleRow[]).findIndex(r => r.id === id)
  if (i >= 0 && !reorderDisabled.value) start(i, e)
}

// ── Row actions ──
const deleteTarget = ref<BankRule | null>(null)
const deleteDescription = computed(() => deleteTarget.value ? `${t('Delete')} "${deleteTarget.value.name}"? ${t("This can't be undone.")}` : '')
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteBankRule(deleteTarget.value.id)
  deleteTarget.value = null
  toast.notify({ variant: 'success', title: t('Bank rule deleted.'), maxWidth: 'max-content' })
}
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :search="search"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    filter-empty-label="bank rule"
    actions-align-top
    @page-change="setPage"
    @per-page-change="setPerPage"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="br-filter-left" />
      <div class="br-filter-right">
        <ColumnSettingsMenu id="br-columns" :items="columnItems" :visibility="columnVisibility" />
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
          v-model="search"
          class="filter-search-input"
          type="text"
          :placeholder="t('Search...')" :aria-label="t('Search...')" />
        </div>
      </div>
    </template>

    <template #cell-priority="{ row }">
      <span class="br-priority" :class="{ 'br-priority--dragging': draggedRule?.id === (row as unknown as RuleRow).id }">
        <span
          class="br-grip"
          :class="{ 'br-grip--inert': reorderDisabled }"
          :aria-label="`${t('Reorder rule with priority')} ${(row as unknown as RuleRow).priority}`"
          @pointerdown="onGrip((row as unknown as RuleRow).id, $event)"
        ><MpIcon name="drag" size="sm" /></span>
        <span>{{ (row as unknown as RuleRow).priority }}</span>
      </span>
    </template>
    <template #cell-name="{ row }">
      <span class="cell-link" @click.stop="router.push(`/bank-rules/${(row as unknown as RuleRow).id}/edit`)">{{ (row as unknown as RuleRow).name }}</span>
    </template>
    <template #cell-bankAccounts="{ row }">
      <span v-if="(row as unknown as RuleRow).applyTo === 'all'">{{ t('All accounts') }}</span>
      <ul v-else class="br-lines">
        <li v-for="id in ((row as unknown as RuleRow).applyTo as string[])" :key="id">{{ accountLabel(id) }}</li>
      </ul>
    </template>
    <template #cell-conditions="{ row }">
      <div class="br-cond">
        <p class="br-cond__head">{{ (row as unknown as RuleRow).matchType === 'all' ? t('All conditions below:') : t('Any conditions below:') }}</p>
        <ul class="br-cond__list">
          <li v-for="(c, i) in (row as unknown as RuleRow).conditions" :key="i">{{ formatRuleCondition(c) }}</li>
        </ul>
      </div>
    </template>
    <template #cell-recordAs="{ row }">
      <span>{{ (row as unknown as RuleRow).trigger === 'money_in' ? t('Receive money') : t('Spend money') }}</span>
    </template>
    <template #cell-autoRecord="{ row }">
      <span>{{ (row as unknown as RuleRow).autoRecord ? t('Yes') : t('No') }}</span>
    </template>
    <template #cell-memo="{ row }"><span>{{ memoText(row as unknown as RuleRow) }}</span></template>

    <template #actions="{ row }">
      <MpPopover :id="`br-act-${(row as unknown as RuleRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" is-rounded class="br-kebab" :aria-label="t('Bank rule actions')"><MpIcon name="menu-kebab" size="sm" /></MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="router.push(`/bank-rules/${(row as unknown as RuleRow).id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="router.push(`/bank-rules/${(row as unknown as RuleRow).id}/duplicate`)">{{ t('Duplicate') }}</MpPopoverListItem>
            <MpPopoverListItem @click="deleteTarget = (row as unknown as RuleRow)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
        <p class="empty-full__title">{{ t('No bank rules yet') }}</p>
        <p class="empty-full__desc">{{ t('Create a rule to categorise bank transactions automatically.') }}</p>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="router.push('/bank-rules/new')">{{ t('New bank rules') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <Teleport to="body">
    <div v-if="ghost && draggedRule" class="br-ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px`, width: `${ghost.w}px` }">
      <MpIcon name="drag" size="sm" />
      <span>{{ draggedRule.priority }}</span>
      <span class="br-ghost__name">{{ draggedRule.name }}</span>
    </div>
  </Teleport>

  <ConfirmModal
    :is-open="deleteTarget !== null"
    :title="t('Delete bank rule')"
    :description="deleteDescription"
    :confirm-label="t('Delete')"
    @update:is-open="(v: boolean) => { if (!v) deleteTarget = null }"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.br-filter-left { display: flex; }
.br-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.br-priority { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.br-priority--dragging { visibility: hidden; }
:deep(.erp-tr:has(.br-priority--dragging)) { outline: 1px dashed var(--mp-colors-border-selected); outline-offset: -1px; background: var(--mp-colors-background-brand-subtle); }
.br-grip { display: inline-flex; align-items: center; color: var(--mp-colors-icon-default); cursor: grab; touch-action: none; user-select: none; }
.br-grip--inert { opacity: 0.4; cursor: not-allowed; }
.br-lines, .br-cond__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.br-cond { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.br-cond__head { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.br-cond__list li { overflow-wrap: anywhere; }
.br-kebab { min-width: 0 !important; }
/* Transient drag affordance — the one sanctioned shadow (rule/dnd-live-sortable). */
.br-ghost {
  position: fixed; z-index: 1000; pointer-events: none;
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-colors-border-selected);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-lg); /* pixel-police-allow-shadow: transient drag ghost */
  transform: rotate(-1.5deg) scale(1.02);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.br-ghost__name { font-weight: var(--mp-font-weights-semi-bold); }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full__illustration { width: var(--mp-sizes-72, 288px); height: var(--mp-sizes-60, 240px); object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full__desc { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
