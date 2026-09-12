<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  MpIcon, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  approvalWorkflows, setApprovalWorkflowActive, deleteApprovalWorkflow,
  transactionTypeLabel, projectActionLabel, type ApprovalWorkflowRule,
} from '~/data/approvalWorkflows'
import { formatIDR } from '~/utils/currency'

const { t } = useLocale()
const router = useRouter()
const { projectAccountingEnabled, setProjectAccountingEnabled } = useApprovalWorkflowScenario()

function goEdit(id: string) { router.push(`/approval-workflows/${id}/edit`) }

// ─── Column definitions ────────────────────────────────────────────────────
// Widths are sized to fit each column's longest real content (see appliesToText /
// amountText below) plus truncation on the cell itself, so a long value never
// bleeds into the next column.
const columns: TableColumn[] = [
  { key: 'name',            label: 'Workflow name',     kind: 'name', sortType: 'text' },
  { key: 'description',     label: 'Description',       kind: 'address' },
  { key: 'appliesTo',       label: 'Applies to',        sortType: 'text' },
  { key: 'minAmount',       label: 'Amount higher than', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'levels',          label: 'Approval levels'  },
  { key: 'createdBy',       label: 'Transaction created by' },
  { key: 'status',          label: 'Status',            kind: 'status', sortType: 'text' },
  { key: 'lastUpdated',     label: 'Last updated',      kind: 'date' },
]

function appliesToText(row: ApprovalWorkflowRule) {
  if (row.appliesTo === 'project') return `${t('Project Action')} — ${t(projectActionLabel(row.projectAction))}`
  return t(transactionTypeLabel(row.transactionType))
}
function amountText(row: ApprovalWorkflowRule) {
  return row.minAmount == null ? '—' : formatIDR(row.minAmount)
}
function createdByText(row: ApprovalWorkflowRule) {
  // "Transaction created by" is omitted from the Project Action form entirely, so those rows
  // stay at the field's default (createdByScope: 'all') — show that default rather than a dash.
  if (row.createdByScope === 'all') return t('All users')
  const n = row.createdByUserIds.length
  return `${n} ${n === 1 ? t('user') : t('users')}`
}
function levelsText(row: ApprovalWorkflowRule) {
  return row.levels.length === 1 ? `1 ${t('level')}` : `${row.levels.length} ${t('levels')}`
}

// ─── Table state ────────────────────────────────────────────────────────────
const rows = computed<ApprovalWorkflowRule[]>(() => approvalWorkflows)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ApprovalWorkflowRule>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = row.name.toLowerCase().includes(s) || appliesToText(row).toLowerCase().includes(s)
    const matchesStatus = !status || (row.isActive ? 'active' : 'inactive') === status
    return matchesSearch && matchesStatus
  },
})

// ─── Status filter ──────────────────────────────────────────────────────────
const statusOptions = [
  { label: t('Active'),   value: 'active'   },
  { label: t('Inactive'), value: 'inactive' },
]
const statusLabel = computed(
  () => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Delete confirmation ────────────────────────────────────────────────────
const deleteModalOpen = ref(false)
const ruleToDelete = ref<ApprovalWorkflowRule | null>(null)
function openDeleteModal(row: ApprovalWorkflowRule) { ruleToDelete.value = row; deleteModalOpen.value = true }
function closeDeleteModal() { deleteModalOpen.value = false; ruleToDelete.value = null }
function confirmDelete() {
  if (!ruleToDelete.value) return
  deleteApprovalWorkflow(ruleToDelete.value.id)
  toast.notify({ variant: 'success', title: t('Approval workflow deleted'), maxWidth: 'max-content' })
  closeDeleteModal()
}

// ─── Turn on/off — turning on is low-friction (no confirmation); turning off
// asks for confirmation since it stops the workflow applying to new
// transactions, even though it stays reversible (can be turned on again). ──
function toggleActive(row: ApprovalWorkflowRule) {
  const wasActive = row.isActive
  setApprovalWorkflowActive(row.id, !wasActive)
  toast.notify({
    variant: 'success',
    title: wasActive ? t('Approval workflow turned off') : t('Approval workflow turned on'),
    maxWidth: 'max-content',
  })
}

const turnOffModalOpen = ref(false)
const ruleToTurnOff = ref<ApprovalWorkflowRule | null>(null)
function handleToggleActive(row: ApprovalWorkflowRule) {
  if (row.isActive) { ruleToTurnOff.value = row; turnOffModalOpen.value = true; return }
  toggleActive(row)
}
function closeTurnOffModal() { turnOffModalOpen.value = false; ruleToTurnOff.value = null }
function confirmTurnOff() {
  if (!ruleToTurnOff.value) return
  toggleActive(ruleToTurnOff.value)
  closeTurnOffModal()
}

// ─── Empty state ─────────────────────────────────────────────────────────────
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter"
    filter-empty-label="approval workflow"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
  >

    <!-- ── Filter bar (Status select + search) ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="awf-status-filter" is-close-on-select>
          <!-- placeholder = filter name ("Status"); is-clearable shows (x) when a
               value is picked → @clear resets to show-all. -->
          <MpPopoverTrigger>
            <MpSelect
              id="awf-status-select"
              :placeholder="t('Status')"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in statusOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <!-- ── Cell: Workflow name ── -->
    <template #cell-name="{ value, row }">
      <a class="cell-link" @click.stop="goEdit((row as unknown as ApprovalWorkflowRule).id)">{{ value }}</a>
    </template>

    <!-- ── Cell: Description ── -->
    <template #cell-description="{ row }">
      <span class="cell-truncate">{{ (row as unknown as ApprovalWorkflowRule).description || '—' }}</span>
    </template>

    <!-- ── Cell: Transaction type ── -->
    <template #cell-appliesTo="{ row }">
      <span class="cell-truncate">{{ appliesToText(row as unknown as ApprovalWorkflowRule) }}</span>
    </template>

    <!-- ── Cell: Amount higher than ── -->
    <template #cell-minAmount="{ row }">
      {{ amountText(row as unknown as ApprovalWorkflowRule) }}
    </template>

    <!-- ── Cell: Approval levels ── -->
    <template #cell-levels="{ row }">
      {{ levelsText(row as unknown as ApprovalWorkflowRule) }}
    </template>

    <!-- ── Cell: Created by ── -->
    <template #cell-createdBy="{ row }">
      {{ createdByText(row as unknown as ApprovalWorkflowRule) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as ApprovalWorkflowRule).isActive ? 'active' : 'inactive'" />
    </template>

    <!-- ── Cell: Last updated ── -->
    <template #cell-lastUpdated="{ row }">
      <div class="cell-last-updated">
        <span class="cell-last-updated__date">{{ formatUpdatedAt((row as unknown as ApprovalWorkflowRule).updatedAt) }}</span>
        <span class="cell-last-updated__by">{{ (row as unknown as ApprovalWorkflowRule).updatedBy }}</span>
      </div>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`awf-actions-${(row as unknown as ApprovalWorkflowRule).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goEdit((row as unknown as ApprovalWorkflowRule).id)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="handleToggleActive(row as unknown as ApprovalWorkflowRule)">
              {{ (row as unknown as ApprovalWorkflowRule).isActive ? t('Turn off') : t('Turn on') }}
            </MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="openDeleteModal(row as unknown as ApprovalWorkflowRule)"
            >
              {{ t('Delete') }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No approval workflows') }}</p>
        <p class="empty-full-desc">{{ t('Approval workflows will appear here once created.') }}</p>
      </div>
    </template>

  </ErpTablePage>

  <!-- ── Delete confirmation modal ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="awf-delete-modal"
    :is-open="deleteModalOpen"
    size="md"
    :is-keep-alive="false"
    @close="closeDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete approval workflow?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted approval workflow cannot be restored.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeDeleteModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Turn off confirmation modal — reversible, so primary button is the
       standard (non-danger) state, per the Archive-confirmation pattern. ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="awf-turn-off-modal"
    :is-open="turnOffModalOpen"
    size="md"
    :is-keep-alive="false"
    @close="closeTurnOffModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Turn off approval workflow?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('This workflow will no longer apply to new transactions. You can turn it on again anytime.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeTurnOffModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmTurnOff">{{ t('Turn off') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Demo scenario FAB — switch whether this tenant has the Project Accounting
       billing component, to preview the Approval workflows form both ways ──── -->
  <MpPopover id="awf-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab btn-enterprise" :aria-label="t('Change scenario state')">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('Project Accounting billing component') }}</p>
      <MpPopoverList>
        <MpPopoverListItem :is-active="projectAccountingEnabled" @click="setProjectAccountingEnabled(true)">
          {{ t('Component exists') }}
        </MpPopoverListItem>
        <MpPopoverListItem :is-active="!projectAccountingEnabled" @click="setProjectAccountingEnabled(false)">
          {{ t('Component does not exist') }}
        </MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  min-width: 200px;
}
.filter-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.cell-link {
  display: block;
  color: var(--mp-text-link);
  cursor: pointer;
  white-space: normal;
  word-break: break-word;
}
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-truncate {
  display: block;
  white-space: normal;
  word-break: break-word;
}

.cell-last-updated { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cell-last-updated__date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.cell-last-updated__by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.row-kebab {
  /* Overrides every .btn-enterprise base property that would otherwise leak through
     (padding especially — width/height are fixed here, so unset padding would inflate
     the box beyond 32x32 under content-box sizing). */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  padding: 0;
  border: none;
  background: none;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-secondary);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Demo scenario FAB — matches SettingsCompanyProfilePage.vue's convention exactly. */
.demo-fab {
  /* padding:0 overrides .btn-enterprise's base padding — width/height are fixed here, so
     unset padding would inflate the box beyond 48x48 under content-box sizing. */
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-text-inverse);
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB, not a surface/card */
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
