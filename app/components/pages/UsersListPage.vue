<script setup lang="ts">
/**
 * Settings › Users & roles → "User list" tab.
 *
 * Matched to PRODUCTION (app.erp.mekari.com › Settings › User management): columns
 * User name · Role · Access time limits (i) · Status · Type (briefcase + "Member"),
 * a sticky per-row "Actions ▾" secondary dropdown, "All types" / "All status"
 * filters and a "Search user" box. Built on ErpTablePage + useTableState
 * (rule/table-use-erptablepage) with semantic column kinds, and the full
 * reachable-state set (loading skeleton, never-had-data empty, filtered-empty).
 * The Owner row's Actions only offers View details (can't be edited or removed).
 *
 * CRM seats (PRD "CRM Access and CRM User Seats in ERP"): the CRM tier is a chip
 * in the Role column ("CRM Basic" / "CRM Administrator"), after the ERP role chips —
 * no separate column. Everyday ERP / CRM seat counts live in the "Seat usage"
 * card on Invite / Edit user (no title-bar button, as in prod); the #stats slot
 * only renders STATE banners — over quota (US-006), expired (read-only,
 * US-001 AC-04) and Billing down (US-008). Seats are derived from the user list,
 * so deleting a user or cancelling an invite frees theirs automatically (US-005).
 */
import { computed, onMounted, ref } from 'vue'
import {
  MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import UserViewDrawer from '~/components/patterns/UserViewDrawer.vue'
import SeatContactSalesModal from '~/components/patterns/SeatContactSalesModal.vue'
import CrmSeatsScenarioFab from '~/components/patterns/CrmSeatsScenarioFab.vue'
import { successToast } from '~/utils/toasts'
import {
  accountUsers, userRoleNames, timeLimitText, ACCOUNT_TYPE_OPTIONS, accountTypeOf,
  deleteAccountUser, setAccountUserStatus, type AccountUser,
} from '~/data/usersRoles'
import { effectiveCrmRole, crmRoleLabel, SEAT_BLOCK_MESSAGES } from '~/data/crmSubscription'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'

const { t } = useLocale()
const router = useRouter()

const {
  mode: crmMode, crmVisible, crmSummary, isOverQuota, state: crmState,
} = useCrmSubscriptionScenario()
const contactSalesOpen = ref(false)
const contactSalesTopic = ref<'erp-seats' | 'crm-seats'>('crm-seats')
function openContactSales(topic: 'erp-seats' | 'crm-seats') {
  contactSalesTopic.value = topic
  contactSalesOpen.value = true
}
/** A seat banner applies (over quota / expired / Billing down) — otherwise no #stats row at all. */
const crmBannerVisible = computed(() =>
  isOverQuota.value || crmMode.value === 'read-only' || crmMode.value === 'unknown'
  || (crmVisible.value && crmState.billing === 'down'))

function goEdit(user: AccountUser) {
  if (user.isOwner) return
  router.push(`/users-and-roles/${user.id}/edit`)
}

// ─── Columns — matched to production (app.erp.mekari.com › User management):
// User name · Role · Access time limits (i) · Status · Type, plus the sticky
// per-row "Actions ▾". List manager is a chip in Role (as in prod), and the CRM
// tier is a chip there too — no separate CRM column. ──
const columns: TableColumn[] = [
  { key: 'name',      label: 'User name',          kind: 'name',    sortType: 'text' },
  { key: 'roles',     label: 'Role',               kind: 'tags' },
  { key: 'timeLimit', label: 'Access time limits', kind: 'address' },
  { key: 'status',    label: 'Status',             kind: 'status' },
  { key: 'type',      label: 'Type',               sortType: 'text' },
]

/** Role chips, prod order: ERP roles (Owner → "Owner"), the CRM tier, then List manager. */
function roleChips(user: AccountUser): string[] {
  const crm = crmVisible.value ? crmRoleOf(user) : null
  const chips = userRoleNames(user).map((n) => t(n))
  if (crm) chips.push(t(crmRoleLabel(crm)))
  if (user.isListManager && !user.isOwner) chips.push(t('List manager'))
  return chips
}

// ─── Filters ────────────────────────────────────────────────────────────────
// Two independent selects, so `useTableState`'s single statusFilter drives Status
// and the account type keeps its own ref.
const typeFilter = ref('')
// Production's account types (jurnal-frontend-app user_management › button_filter_type):
// "All types" (the placeholder) / Member / Partner — the same values the Type column shows.
const TYPE_OPTIONS = ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))
/** Type column icon, as in prod: Member → briefcase, Partner → team. */
const TYPE_ICON: Record<string, string> = { member: 'briefcase', partner: 'team' }
function crmRoleOf(user: AccountUser) { return effectiveCrmRole(user) }
const STATUS_OPTIONS = [
  { value: 'active',   label: t('Active') },
  { value: 'invited',  label: t('Invited') },
  { value: 'inactive', label: t('Inactive') },
]

const rows = computed<AccountUser[]>(() =>
  // Owner pinned first, as in production; then alphabetical by name
  // (rule/table-default-sort-alpha — prod's Owner-first wins over it).
  [...accountUsers].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name)),
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
      roleChips(row).some((r) => r.toLowerCase().includes(s))
    const matchesStatus = !status || row.status === status
    const matchesType = !typeFilter.value || accountTypeOf(row) === typeFilter.value
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

function reactivate(user: AccountUser) {
  setAccountUserStatus(user.id, 'active')
  successToast(t('User reactivated'))
}

const viewTarget = ref<AccountUser | null>(null)
function viewDetails(user: AccountUser) { viewTarget.value = user }

const deleteTarget = ref<AccountUser | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  // A removed user / cancelled invite frees their CRM seat (US-005 AC-02/03).
  const heldCrmSeat = crmVisible.value && !!crmRoleOf(deleteTarget.value)
  deleteAccountUser(deleteTarget.value.id)
  successToast(heldCrmSeat ? t('User deleted. Their CRM seat is free again.') : t('User deleted'))
  deleteTarget.value = null
}

// ─── Empty state ────────────────────────────────────────────────────────────

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
    actions-width="136px"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter || !!typeFilter"
    filter-empty-label="user"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="resetFilters"
  >
    <!-- ── Seat STATES only (over quota / expired / Billing down) — the everyday
         ERP / CRM counts live in the title bar's "Seat usage" dialog. ── -->
    <template v-if="crmBannerVisible" #stats>
      <div class="usr-quota-row" data-devchange="crm-user-seats-list-banners" data-test-id="usr-seat-banners">
        <MpBanner v-if="isOverQuota" id="usr-crm-over-quota" variant="warning" data-test-id="usr-over-quota-banner">
          <MpBannerIcon id="usr-crm-over-quota-icon" />
          <MpBannerTitle>
            <template v-if="crmSummary.overTotal">
              {{ t('Your company is') }} {{ crmSummary.overTotal }} {{ crmSummary.overTotal === 1 ? t('CRM seat over quota') : t('CRM seats over quota') }}
            </template>
            <template v-else>
              {{ t('Your company is') }} {{ crmSummary.overAdmin }} {{ crmSummary.overAdmin === 1 ? t('CRM Administrator seat over quota') : t('CRM Administrator seats over quota') }}
            </template>
          </MpBannerTitle>
          <MpBannerDescription>
            {{ crmSummary.overTotal
              ? t('Everyone keeps their CRM access, but you can\'t give CRM access to anyone new until usage fits.')
              : t('Everyone keeps their CRM access, but you can\'t make anyone new a CRM Administrator until usage fits. CRM Basic can still be given while seats are left.') }}
            {{ t('See Seat usage when inviting or editing a user.') }}
            <a class="usr-link" @click="openContactSales('crm-seats')">{{ t('Contact Sales') }}</a>
          </MpBannerDescription>
        </MpBanner>
        <MpBanner v-else-if="crmMode === 'read-only'" id="usr-crm-expired" variant="warning">
          <MpBannerIcon id="usr-crm-expired-icon" />
          <MpBannerTitle>{{ t('Your CRM add-on has expired') }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('CRM access is kept and shown read-only. It works again unchanged when CRM is renewed.') }}
            <a class="usr-link" @click="openContactSales('crm-seats')">{{ t('Contact Sales') }}</a>
          </MpBannerDescription>
        </MpBanner>
        <MpBanner v-else-if="crmMode === 'unknown'" id="usr-crm-billing-unknown" variant="warning">
          <MpBannerIcon id="usr-crm-billing-unknown-icon" />
          <MpBannerDescription>{{ t(SEAT_BLOCK_MESSAGES['billing-unknown']) }} {{ t('Existing CRM access is not affected.') }}</MpBannerDescription>
        </MpBanner>
        <MpBanner v-else-if="crmVisible && crmState.billing === 'down'" id="usr-crm-billing-down" variant="info">
          <MpBannerIcon id="usr-crm-billing-down-icon" />
          <MpBannerDescription>{{ t("Billing can't be reached right now, so these are the last confirmed CRM seats.") }}</MpBannerDescription>
        </MpBanner>
      </div>
    </template>

    <!-- ── Filter bar: Type + Status | tools + search ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="usr-type-filter"
          data-devchange="crm-user-seats-list-type"
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
        <!-- Every name is a link, as in prod; the Owner (not editable) opens details. -->
        <span
          class="cell-link"
          @click.stop="(row as unknown as AccountUser).isOwner ? viewDetails(row as unknown as AccountUser) : goEdit(row as unknown as AccountUser)"
        >{{ (row as unknown as AccountUser).name }}</span>
        <span class="usr-email">{{ (row as unknown as AccountUser).email }}</span>
      </div>
    </template>

    <!-- ── Role chips: ERP roles, then the CRM tier, then List manager (prod) ── -->
    <template #cell-roles="{ row }">
      <span data-devchange="crm-user-seats-list-column" :data-test-id="`usr-roles-${(row as unknown as AccountUser).id}`">
        <ErpTagList v-if="roleChips(row as unknown as AccountUser).length" :tags="roleChips(row as unknown as AccountUser)" />
        <span v-else class="usr-muted">-</span>
      </span>
    </template>

    <!-- ── Access time limits header (i) ── -->
    <template #header-timeLimit>
      <MpTooltip id="usr-time-limit-tt" :label="t('The days and hours this user can sign in. Times are in GMT+7.')" placement="top" use-portal>
        <span class="usr-info"><MpIcon name="info" size="sm" /></span>
      </MpTooltip>
    </template>

    <!-- ── Access time ── -->
    <template #cell-timeLimit="{ row }">
      <span class="usr-wrap">{{ timeLimitText(row as unknown as AccountUser) }}</span>
    </template>

    <!-- ── Status ── -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as AccountUser).status" />
    </template>

    <!-- ── Type — account type, as in prod: briefcase + "Member" / team + "Partner" ── -->
    <template #cell-type="{ row }">
      <span class="usr-type" :data-test-id="`usr-type-${(row as unknown as AccountUser).id}`">
        <MpIcon :name="TYPE_ICON[accountTypeOf(row as unknown as AccountUser)]" size="sm" />
        {{ t(ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountTypeOf(row as unknown as AccountUser))!.label) }}
      </span>
    </template>

    <!-- ── Per-row "Actions ▾" (sticky right column), as in prod. The Owner only
         gets View details — the account holder can't be edited or removed. ── -->
    <template #actions="{ row }">
      <MpPopover
        :id="`usr-actions-${(row as unknown as AccountUser).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="secondary" is-rounded right-icon="chevrons-down" :data-test-id="`usr-actions-${(row as unknown as AccountUser).id}`">{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as AccountUser)">{{ t('View details') }}</MpPopoverListItem>
            <template v-if="!(row as unknown as AccountUser).isOwner">
              <MpPopoverListItem @click="goEdit(row as unknown as AccountUser)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="(row as unknown as AccountUser).status === 'invited'"
                @click="resendInvitation(row as unknown as AccountUser)"
              >{{ t('Resend invitation') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="(row as unknown as AccountUser).status === 'inactive'"
                @click="reactivate(row as unknown as AccountUser)"
              >{{ t('Reactivate') }}</MpPopoverListItem>
              <MpPopoverListItem
                :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
                @click="deleteTarget = (row as unknown as AccountUser)"
              >{{ t('Delete') }}</MpPopoverListItem>
            </template>
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
        {{ t('Deleted user cannot be restored. Their transactions stay in the account.') }}
        <template v-if="crmVisible && deleteTarget && crmRoleOf(deleteTarget)">
          {{ t('Their CRM seat becomes free. CRM records they created are kept.') }}
        </template>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deleteTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="confirmDelete">{{ t('Delete user') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <SeatContactSalesModal v-model:is-open="contactSalesOpen" id="usr-contact-sales" :topic="contactSalesTopic" />

  <!-- Demo: CRM add-on states, add-on quantities, ERP limit (rule/index-scenario-fab). -->
  <CrmSeatsScenarioFab />
</template>

<style scoped>
/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }


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

/* ── Seat-state banners (over quota / expired / Billing down) ── */
.usr-quota-row { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); }
.usr-link { margin-left: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }
.usr-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.usr-type { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-default); }
.usr-info { display: inline-flex; color: var(--mp-icon-subtle, var(--mp-text-secondary)); cursor: help; }

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
