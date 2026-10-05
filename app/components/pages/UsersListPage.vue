<!-- prod-parity-aligned: jurnal-frontend-app/src/pages/settings/pages/user-management/composition-user_management.vue -->
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
import { computed, onMounted, reactive, ref } from 'vue'
import {
  MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import UserViewDrawer from '~/components/patterns/UserViewDrawer.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  accountUsers, userRoleNames, userRoleTypes, userRoleTypeLabels, timeLimitText, userPartnerType,
  deleteAccountUser, setAccountUserStatus, type AccountUser,
} from '~/data/usersRoles'

const { t } = useLocale()
const router = useRouter()

function goEdit(user: AccountUser) {
  if (user.isOwner) return
  router.push(`/users-and-roles/${user.id}/edit`)
}

// ─── Columns — Name, Role, List manager, Access time, Status, Type, Join date by
// default; Last active is optional (hidden), toggleable from Column settings. ──
// Prod order: User name, Role, Access time limits, Status, Type. List manager /
// Role type / Join date / Last active are local-only extras.
const baseColumns: TableColumn[] = [
  { key: 'name',        label: 'User name',   kind: 'name',    sortType: 'text' },
  { key: 'roles',       label: 'Role',        kind: 'tags' },
  { key: 'timeLimit',   label: 'Access time limits', kind: 'address', sortType: 'text' },
  { key: 'status',      label: 'Status',      kind: 'status',  sortType: 'text' },
  { key: 'partnerType', label: 'Type',        sortType: 'text' },
  { key: 'listManager', label: 'List manager', sortType: 'text' },
  { key: 'joinedAt',    label: 'Join date',   kind: 'date',    sortType: 'date' },
]
const optionalColumns: TableColumn[] = [
  { key: 'type',        label: 'Role type',   kind: 'tags' },
  { key: 'lastActive',  label: 'Last active', kind: 'date', sortType: 'date' },
]
const allCols: TableColumn[] = [...baseColumns, ...optionalColumns]
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, baseColumns.some((b) => b.key === c.key)])),
)
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))

// ─── Filters ────────────────────────────────────────────────────────────────
// Two independent selects, so `useTableState`'s single statusFilter drives Status
// and the role type keeps its own ref.
const typeFilter = ref('')
const TYPE_OPTIONS = [
  { value: 'member',  label: t('Member') },
  { value: 'partner', label: t('Partner') },
]
// Local-only: filter by role kind (Owner / Existing role / Custom role).
const roleTypeFilter = ref('')
const ROLE_TYPE_OPTIONS = [
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
    const matchesType = !typeFilter.value || userPartnerType(row) === typeFilter.value
    const matchesRoleType = !roleTypeFilter.value || userRoleTypes(row).includes(roleTypeFilter.value as never)
    return matchesSearch && matchesStatus && matchesType && matchesRoleType
  },
})

function resetFilters() {
  search.value = ''
  statusFilter.value = ''
  typeFilter.value = ''
  roleTypeFilter.value = ''
}

// ─── Loading (first paint) ──────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Row actions ────────────────────────────────────────────────────────────
function resendInvitation(_user: AccountUser) {
  successToast(t('Invitation resent'))
}

function activate(user: AccountUser) {
  setAccountUserStatus(user.id, 'active')
  successToast(t('User activated'))
}

const deactivateTarget = ref<AccountUser | null>(null)
function confirmDeactivate() {
  if (!deactivateTarget.value) return
  setAccountUserStatus(deactivateTarget.value.id, 'inactive')
  successToast(t('User deactivated'))
  deactivateTarget.value = null
}

// The signed-in user (Rizal Candra) is the Owner, so the Owner row offers
// "Transfer ownership" (prod: only action on the owner row).
function transferOwnership() { infoToast(t('Not in this prototype')) }

const viewTarget = ref<AccountUser | null>(null)
function viewDetails(user: AccountUser) { viewTarget.value = user }

const deleteTarget = ref<AccountUser | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteAccountUser(deleteTarget.value.id)
  successToast(t('User deleted'))
  deleteTarget.value = null
}

// ─── Formatting ─────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
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
    :has-active-filter="!!statusFilter || !!typeFilter || !!roleTypeFilter"
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
        <ErpFilterSelect
          id="usr-role-type-filter"
          v-model="roleTypeFilter"
          :placeholder="t('All role types')"
          :options="ROLE_TYPE_OPTIONS"
          width="176px"
        />
      </div>

      <div class="filter-right">
        <!-- Tool icons: ghost icon-only MpButtons in one group (rule/filter-bar-icon-group),
             each tooltipped and aria-labelled (rule/btn-icon-tooltip). -->
        <MpButtonGroup class="filter-btn-group">
          <ColumnSettingsMenu id="usr-columns" :items="columnItems" :visibility="columnVisibility" />
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search user')">
          <MpButton
            v-if="search" variant="ghost" class="filter-search-clear"
            left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
          />
        </div>
      </div>
    </template>

    <!-- ── Name + email ── -->
    <template #cell-name="{ row }">
      <div class="usr-identity">
        <span
          v-if="!(row as unknown as AccountUser).isOwner"
          class="cell-link"
          @click.stop="goEdit(row as unknown as AccountUser)"
        >{{ (row as unknown as AccountUser).name }}</span>
        <span v-else class="usr-name">{{ (row as unknown as AccountUser).name }}</span>
        <span class="usr-email">{{ (row as unknown as AccountUser).email }}</span>
      </div>
    </template>

    <!-- ── Roles ── -->
    <template #cell-roles="{ row }">
      <ErpTagList :tags="userRoleNames(row as unknown as AccountUser)" />
    </template>

    <!-- ── List manager ── -->
    <template #cell-listManager="{ row }">
      <span v-if="(row as unknown as AccountUser).isListManager" class="usr-yes">
        <MpIcon name="check" size="sm" />
        {{ t('Yes') }}
      </span>
      <span v-else class="usr-muted">—</span>
    </template>

    <!-- ── Access time ── -->
    <template #cell-timeLimit="{ row }">
      <span class="usr-wrap">{{ timeLimitText(row as unknown as AccountUser) }}</span>
    </template>

    <!-- ── Status ── -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as AccountUser).status" />
    </template>

    <!-- ── Type — Member / Partner (prod) ── -->
    <template #cell-partnerType="{ row }">
      <span class="usr-yes">
        <MpIcon :name="userPartnerType(row as unknown as AccountUser) === 'partner' ? 'people' : 'profile'" size="sm" />
        {{ userPartnerType(row as unknown as AccountUser) === 'partner' ? t('Partner') : t('Member') }}
      </span>
    </template>

    <!-- ── Role type — Owner / Existing role / Custom role (local-only, optional) ── -->
    <template #cell-type="{ row }">
      <ErpTagList :tags="userRoleTypeLabels(row as unknown as AccountUser)" />
    </template>

    <!-- ── Join date ── -->
    <template #cell-joinedAt="{ row }">
      {{ formatDate((row as unknown as AccountUser).joinedAt) }}
    </template>

    <!-- ── Last active (optional column) ── -->
    <template #cell-lastActive="{ row }">
      {{ formatDate((row as unknown as AccountUser).lastActiveAt) }}
    </template>

    <!-- ── Actions kebab — the Owner row only offers Transfer ownership ── -->
    <template #actions="{ row }">
      <MpPopover
        v-if="(row as unknown as AccountUser).isOwner"
        :id="`usr-actions-${(row as unknown as AccountUser).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="transferOwnership">{{ t('Transfer ownership') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <MpPopover
        v-else
        :id="`usr-actions-${(row as unknown as AccountUser).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as AccountUser)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="goEdit(row as unknown as AccountUser)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="deleteTarget = (row as unknown as AccountUser)"
            >{{ t('Delete') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as AccountUser).status === 'active'"
              @click="deactivateTarget = (row as unknown as AccountUser)"
            >{{ t('Deactivate user') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as AccountUser).status === 'inactive'"
              @click="activate(row as unknown as AccountUser)"
            >{{ t('Activate user') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as unknown as AccountUser).status === 'invited'"
              @click="resendInvitation(row as unknown as AccountUser)"
            >{{ t('Resend invitation') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Never-had-data empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('User list will appear here') }}</p>
        <p class="empty-full-desc">{{ t('Invite new users from Invite user button.') }}</p>
        <MpButton
          variant="secondary" is-rounded left-icon="add"
          @click="router.push('/users-and-roles/invite')"
        >{{ t('Invite user') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── View details drawer ── -->
  <UserViewDrawer
    id="usr-view-drawer"
    :is-open="!!viewTarget"
    :user="viewTarget"
    @update:is-open="(v: boolean) => { if (!v) viewTarget = null }"
  />

  <!-- ── Delete confirmation — destructive, verb+noun danger primary ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="usr-delete-modal"
    :is-open="!!deleteTarget"
    size="md"
    :is-keep-alive="false"
    @close="deleteTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete user?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ deleteTarget?.name }} {{ t('will be deleted from this company account. You can always reinvite it again.') }}
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deleteTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="confirmDelete">{{ t('Delete user') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Deactivate confirmation (prod modal-deactivate-user) ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="usr-deactivate-modal"
    :is-open="!!deactivateTarget"
    size="md"
    :is-keep-alive="false"
    @close="deactivateTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Deactivate this user?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="usr-modal-text">
          <strong>{{ deactivateTarget?.name }}</strong>
          {{ t('will not be able to access this company account temporarily. You can activate this user again if needed.') }}
        </p>
        <div class="usr-modal-banner">
          <MpIcon name="info" size="sm" />
          <span>{{ t('Deactivating users will not reduce Jurnal subscription billing.') }}</span>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deactivateTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="confirmDeactivate">{{ t('Deactivate') }}</MpButton>
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

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
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

/* ── Deactivate modal ── */
.usr-modal-text { margin: 0; }
.usr-modal-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-warning); color: var(--mp-text-default);
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
