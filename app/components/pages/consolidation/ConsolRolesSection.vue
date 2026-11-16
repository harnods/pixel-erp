<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/roles/index.vue (+ components/table, components/drawer) -->
<script setup lang="ts">
/**
 * Consolidation roles — prod's /v3/consolidations/roles (Admin only).
 * Role filter + name search; Add role / Edit role drawer (user + Admin /
 * Editor / Viewer); delete with confirmation. The company owner's Admin role
 * is protected, and the last Admin can't be removed or demoted.
 */
import {
  MpButton, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { successToast } from '~/utils/toasts'
import ConsolDrawer from './ConsolDrawer.vue'
import { roleAssignments, ROLE_LABEL, ROLE_USER_POOL, emailFor, newId, type ConsolRole, type RoleAssignment } from '~/data/consolidation'

const { t } = useLocale()

const columns: TableColumn[] = [
  { key: 'userName', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'role', label: t('Role'), kind: 'status' },
]
const roleFilter = ref('')
const rows = computed(() => roleAssignments.map((r) => ({ ...r })))
const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<RoleAssignment>(rows, {
  perPage: 25,
  filterFn: (r, s) => (!s || r.userName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)) && (!roleFilter.value || r.role === roleFilter.value),
})
watch(roleFilter, () => setPage(1))
const roleOptions = computed(() => (Object.keys(ROLE_LABEL) as ConsolRole[]).map((k) => ({ value: k, label: t(ROLE_LABEL[k]) })))
const hasActiveFilter = computed(() => !!(search.value || roleFilter.value))
function clearFilters() { search.value = ''; roleFilter.value = '' }
const adminCount = computed(() => roleAssignments.filter((r) => r.role === 'admin').length)

// ─── Drawer ──────────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ userName: '', role: '' as ConsolRole | '' })
const errors = reactive({ user: '', role: '' })
const userOptions = computed(() => ROLE_USER_POOL.filter((n) => editingId.value || !roleAssignments.some((r) => r.userName === n)).map((n) => ({ value: n, label: `${n} · ${emailFor(n)}` })))
function openDrawer(id: string | null) {
  editingId.value = id
  const r = id ? roleAssignments.find((x) => x.id === id) : null
  form.userName = r?.userName ?? ''
  form.role = r?.role ?? ''
  errors.user = ''; errors.role = ''
  drawerOpen.value = true
}
function save() {
  errors.user = form.userName ? '' : `${t('You must fill in')} ${t('User')}`
  errors.role = form.role ? '' : `${t('You must fill in')} ${t('Role')}`
  if (errors.user || errors.role) return
  if (editingId.value) {
    const r = roleAssignments.find((x) => x.id === editingId.value)!
    if (r.role === 'admin' && form.role !== 'admin' && adminCount.value <= 1) { errors.role = t("You can't remove or demote the last Admin in this company."); return }
    r.role = form.role as ConsolRole
    successToast(t('Role updated.'))
  } else {
    if (roleAssignments.some((r) => r.userName === form.userName)) { errors.user = t('This user already has a role in this company.'); return }
    roleAssignments.push({ id: newId('cr'), userName: form.userName, email: emailFor(form.userName), role: form.role as ConsolRole })
    successToast(t('Role added.'))
  }
  drawerOpen.value = false
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const pending = ref<RoleAssignment | null>(null)
const deleteError = ref('')
function askDelete(r: RoleAssignment) {
  if (r.role === 'admin' && adminCount.value <= 1) { deleteError.value = t("You can't remove or demote the last Admin in this company."); return }
  deleteError.value = ''
  pending.value = r
  deleteOpen.value = true
}
function confirmDelete() {
  const i = roleAssignments.findIndex((r) => r.id === pending.value?.id)
  if (i >= 0) roleAssignments.splice(i, 1)
  successToast(t('Role removed.'))
}
</script>

<template>
  <div class="ro">
    <div class="ro-head">
      <h2 class="ro-title">{{ t('Consolidation roles') }}</h2>
      <MpButton variant="primary" is-rounded left-icon="add" @click="openDrawer(null)">{{ t('Add role') }}</MpButton>
    </div>
    <p v-if="deleteError" class="ro-error">{{ deleteError }}</p>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="search"
      :has-active-filter="hasActiveFilter"
      filter-empty-label="users"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="ro-role" v-model="roleFilter" :placeholder="t('Role')" :options="roleOptions" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search name...')" />
          </div>
        </div>
      </template>
      <template #cell-userName="{ row }">
        <span class="ro-stack">
          <span>{{ (row as unknown as RoleAssignment).userName }}</span>
          <span class="ro-sub">{{ (row as unknown as RoleAssignment).email }}</span>
        </span>
      </template>
      <template #cell-role="{ row }">{{ t(ROLE_LABEL[(row as unknown as RoleAssignment).role]) }}</template>
      <template #actions="{ row }">
        <MpTooltip v-if="(row as unknown as RoleAssignment).isOwner" :label="t('The company owner\'s role can\'t be edited or removed.')" placement="left">
          <MpIcon name="info" size="md" class="ro-owner-info" />
        </MpTooltip>
        <MpPopover v-else :id="`ro-row-${(row as unknown as RoleAssignment).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openDrawer((row as unknown as RoleAssignment).id)">{{ t('Edit role') }}</MpPopoverListItem>
              <MpPopoverListItem @click="askDelete(row as unknown as RoleAssignment)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No role assignments yet.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <ConsolDrawer :open="drawerOpen" :title="editingId ? t('Edit role') : t('Add role')" @close="drawerOpen = false">
    <div class="ro-field">
      <span class="ro-field-label ro-req">{{ editingId ? t('User') : t('Select user') }}</span>
      <span v-if="editingId" class="ro-value">{{ form.userName }} · {{ emailFor(form.userName) }}</span>
      <ErpFilterSelect v-else id="ro-user" :model-value="form.userName" :placeholder="t('Search Mekari ERP user...')" :options="userOptions" width="100%" @update:model-value="(v: string) => { form.userName = v; errors.user = '' }" />
      <span v-if="!editingId" class="ro-hint">{{ t('Only Mekari ERP users in this company can be added.') }}</span>
      <span v-if="errors.user" class="ro-error">{{ errors.user }}</span>
    </div>
    <div class="ro-field">
      <span class="ro-field-label ro-req">{{ t('Role') }}</span>
      <ErpFilterSelect id="ro-role-f" :model-value="form.role" :placeholder="t('Select a role')" :options="roleOptions" width="100%" @update:model-value="(v: string) => { form.role = v as ConsolRole; errors.role = '' }" />
      <span class="ro-hint">{{ t('Admin: full access · Editor: manage data & journals · Viewer: view & export reports.') }}</span>
      <span v-if="errors.role" class="ro-error">{{ errors.role }}</span>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
    </template>
  </ConsolDrawer>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete role?')"
    :description="t('This user will lose access to the consolidation group. This action cannot be undone.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.ro { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.ro-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.ro-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.filter-left { flex: 1 1 auto; display: flex; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ro-owner-info { display: block; margin: 0 auto; color: var(--mp-colors-icon-default); cursor: help; }
.ro-stack { display: flex; flex-direction: column; min-width: 0; }
.ro-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ro-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.ro-field-label { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ro-req::after { content: ' *'; color: var(--mp-text-danger); }
.ro-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ro-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ro-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
