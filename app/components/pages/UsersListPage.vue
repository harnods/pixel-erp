<script setup lang="ts">
/**
 * Settings › Users & roles → "User list" tab.
 *
 * Benchmarked on Jurnal's User management list; rebuilt on the ERP standards —
 * ErpTablePage + useTableState (rule/table-use-erptablepage), semantic column
 * kinds (rule/table-column-kind), ErpFilterSelect for the filters
 * (rule/select-erpfilterselect), and the full reachable-state set (loading
 * skeleton, never-had-data empty, filtered-empty).
 *
 * The Owner row is deliberately action-less: the account holder can't be
 * deactivated or removed from inside the product (rule: permission-gated actions
 * are hidden, not disabled-without-reason).
 */
import { computed, onMounted, ref } from 'vue'
import {
  MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { successToast } from '~/utils/toasts'
import {
  accountUsers, userRoleNames, userRoleTypes, timeLimitText,
  setAccountUserStatus, deleteAccountUser, type AccountUser,
} from '~/data/usersRoles'

const { t } = useLocale()
const router = useRouter()

function goEdit(user: AccountUser) {
  if (user.isOwner) return
  router.push(`/users-and-roles/${user.id}/edit`)
}

// ─── Columns ────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name',        label: 'User name',         kind: 'name',    sortType: 'text' },
  { key: 'roles',       label: 'Role',              kind: 'tags' },
  { key: 'timeLimit',   label: 'Access time limit', kind: 'address' },
  { key: 'listManager', label: 'List manager' },
  { key: 'status',      label: 'Status',            kind: 'status',  sortType: 'text' },
  { key: 'lastActive',  label: 'Last active',       kind: 'date',    sortType: 'date' },
]

// ─── Filters ────────────────────────────────────────────────────────────────
// Two independent selects, so `useTableState`'s single statusFilter drives Status
// and the role type keeps its own ref.
const typeFilter = ref('')
const TYPE_OPTIONS = [
  { value: 'owner',    label: t('Owner') },
  { value: 'existing', label: t('Existing role') },
  { value: 'custom',   label: t('Custom role') },
]
const STATUS_OPTIONS = [
  { value: 'active',   label: t('Active') },
  { value: 'invited',  label: t('Invited') },
  { value: 'inactive', label: t('Inactive') },
]

const rows = computed<AccountUser[]>(() =>
  // Named-entity table → alphabetical by name (rule/table-default-sort-alpha).
  [...accountUsers].sort((a, b) => a.name.localeCompare(b.name)),
)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<AccountUser>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch =
      !s ||
      row.name.toLowerCase().includes(s) ||
      row.email.toLowerCase().includes(s) ||
      userRoleNames(row).some((r) => r.toLowerCase().includes(s))
    const matchesStatus = !status || row.status === status
    const matchesType = !typeFilter.value || userRoleTypes(row).includes(typeFilter.value as never)
    return matchesSearch && matchesStatus && matchesType
  },
})

function resetFilters() {
  search.value = ''
  statusFilter.value = ''
  typeFilter.value = ''
}

// ─── Loading (first paint) ──────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Row actions ────────────────────────────────────────────────────────────
function resendInvitation(user: AccountUser) {
  successToast(`${t('Invitation sent to')} ${user.email}`)
}

const deactivateTarget = ref<AccountUser | null>(null)
function confirmDeactivate() {
  if (!deactivateTarget.value) return
  setAccountUserStatus(deactivateTarget.value.id, 'inactive')
  successToast(t('User deactivated'))
  deactivateTarget.value = null
}

function activate(user: AccountUser) {
  setAccountUserStatus(user.id, 'active')
  successToast(t('User activated'))
}

const deleteTarget = ref<AccountUser | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteAccountUser(deleteTarget.value.id)
  successToast(t('User deleted'))
  deleteTarget.value = null
}

// ─── Formatting ─────────────────────────────────────────────────────────────
function formatLastActive(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

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
    :loading="loading"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter || !!typeFilter"
    filter-empty-label="user"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="resetFilters"
  >
    <!-- ── Filter bar: Type + Status | tools + search ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="usr-type-filter"
          v-model="typeFilter"
          :placeholder="t('All types')"
          :options="TYPE_OPTIONS"
          width="176px"
        />
        <ErpFilterSelect
          id="usr-status-filter"
          v-model="statusFilter"
          :placeholder="t('All status')"
          :options="STATUS_OPTIONS"
          width="160px"
        />
      </div>

      <div class="filter-right">
        <!-- Tool icons: ghost icon-only MpButtons in one group (rule/filter-bar-icon-group),
             each tooltipped and aria-labelled (rule/btn-icon-tooltip). -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip id="tt-usr-columns" :label="t('Column settings')" placement="bottom" use-portal>
            <MpButton
              variant="ghost" class="filter-icon-btn"
              left-icon="table-view-column" :aria-label="t('Column settings')"
            />
          </MpTooltip>
          <MpTooltip id="tt-usr-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton
              variant="ghost" class="filter-icon-btn"
              left-icon="download" :aria-label="t('Export')"
            />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
          <MpButton
            v-if="search" variant="ghost" class="filter-search-clear"
            left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
          />
        </div>
      </div>
    </template>

    <!-- ── User name + email ── -->
    <template #cell-name="{ row }">
      <div class="usr-identity">
        <a
          v-if="!(row as unknown as AccountUser).isOwner"
          class="cell-link"
          @click.stop="goEdit(row as unknown as AccountUser)"
        >{{ (row as unknown as AccountUser).name }}</a>
        <span v-else class="usr-name">{{ (row as unknown as AccountUser).name }}</span>
        <span class="usr-email">{{ (row as unknown as AccountUser).email }}</span>
      </div>
    </template>

    <!-- ── Roles ── -->
    <template #cell-roles="{ row }">
      <ErpTagList :tags="userRoleNames(row as unknown as AccountUser)" />
    </template>

    <!-- ── Access time limit ── -->
    <template #cell-timeLimit="{ row }">
      <span class="usr-wrap">{{ timeLimitText(row as unknown as AccountUser) }}</span>
    </template>

    <!-- ── List manager ── -->
    <template #cell-listManager="{ row }">
      <span v-if="(row as unknown as AccountUser).isListManager" class="usr-yes">
        <MpIcon name="check" size="sm" />
        {{ t('Yes') }}
      </span>
      <span v-else class="usr-muted">—</span>
    </template>

    <!-- ── Status ── -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as AccountUser).status" />
    </template>

    <!-- ── Last active ── -->
    <template #cell-lastActive="{ row }">
      {{ formatLastActive((row as unknown as AccountUser).lastActiveAt) }}
    </template>

    <!-- ── Actions kebab — hidden for the Owner row (nothing is permitted) ── -->
    <template #actions="{ row }">
      <MpPopover
        v-if="!(row as unknown as AccountUser).isOwner"
        :id="`usr-actions-${(row as unknown as AccountUser).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" class="row-kebab" left-icon="menu-kebab" :aria-label="t('More actions')" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goEdit(row as unknown as AccountUser)">{{ t('Edit access') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as AccountUser).status === 'invited'"
              @click="resendInvitation(row as unknown as AccountUser)"
            >{{ t('Resend invitation') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as AccountUser).status === 'inactive'"
              @click="activate(row as unknown as AccountUser)"
            >{{ t('Activate user') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-else
              @click="deactivateTarget = (row as unknown as AccountUser)"
            >{{ t('Deactivate user') }}</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="deleteTarget = (row as unknown as AccountUser)"
            >{{ t('Delete user') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Never-had-data empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No users') }}</p>
        <p class="empty-full-desc">{{ t('Invited users will appear here.') }}</p>
        <MpButton
          variant="secondary" is-rounded left-icon="add"
          @click="router.push('/users-and-roles/invite')"
        >{{ t('Invite user') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Deactivate confirmation — reversible, so a standard primary confirm ── -->
  <MpModal
    id="usr-deactivate-modal"
    :is-open="!!deactivateTarget"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="deactivateTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Deactivate user?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('This user loses access immediately. You can activate them again anytime.') }}
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deactivateTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="confirmDeactivate">{{ t('Deactivate user') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Delete confirmation — destructive, verb+noun danger primary ── -->
  <MpModal
    id="usr-delete-modal"
    :is-open="!!deleteTarget"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="deleteTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete user?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted user cannot be restored. Their transactions stay in the account.') }}
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deleteTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="confirmDelete">{{ t('Delete user') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }

.filter-btn-group { display: flex; align-items: center; }
/* Ghost MpButton squared off to the 36x36 filter-bar tool size. The !important
   overrides are Pixel's own atomic min-width/padding on .mp-button. */
.filter-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important; padding: var(--mp-spacing-2) !important;
  color: var(--mp-text-default);
}

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.filter-search-clear {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important; color: var(--mp-text-subtle);
}

/* ── Cells ── */
.usr-identity { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.usr-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.usr-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.usr-wrap { white-space: normal; }
.usr-muted { color: var(--mp-text-secondary); }
.usr-yes {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  color: var(--mp-text-default);
}

.cell-link {
  color: var(--mp-text-link); cursor: pointer;
  white-space: normal; word-break: break-word;
}
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Kebab — 20px tall so the actions cell stays within the 40px baseline row */
/* Kebab — 20px tall so the actions cell stays within the 40px baseline row. */
.row-kebab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important;
  margin-left: auto; color: var(--mp-text-secondary);
}

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
