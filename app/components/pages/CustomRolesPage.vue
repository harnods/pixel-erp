<script setup lang="ts">
/**
 * Settings › Users & roles → "Custom role" tab.
 *
 * Jurnal opens "Add custom role" in a side panel; here that panel is the ERP's
 * hand-rolled Teleport drawer (rule/drawer-custom-shell — Pixel MpDrawer has no
 * structural CSS in this build), opened from the page title bar and from the
 * empty state's CTA.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import {
  MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CustomRoleDrawer from '~/components/patterns/CustomRoleDrawer.vue'
import { successToast } from '~/utils/toasts'
import {
  customRoles, deleteCustomRole, addCustomRole, grantedFeatureCount,
  type CustomRole, type CustomRoleInput,
} from '~/data/usersRoles'
import { useCustomRoleDrawer } from '~/composables/useCustomRoleDrawer'

const { t } = useLocale()

// The "New custom role" button lives in the page title bar (owned by
// [...slug].vue), so the open/edit intent is shared through a composable.
const { isOpen, editingId, openCreate, openEdit, close } = useCustomRoleDrawer()

// ─── Columns ────────────────────────────────────────────────────────────────
const allCols: TableColumn[] = [
  { key: 'name',          label: 'Role name',     kind: 'name',    sortType: 'text' },
  { key: 'description',   label: 'Description',   kind: 'address' },
  { key: 'features',      label: 'Features',      align: 'right',  sortType: 'number' },
  { key: 'assignedUsers', label: 'Users assigned', align: 'right', sortType: 'number' },
  { key: 'updatedAt',     label: 'Last updated',  kind: 'date',    sortType: 'date' },
]
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, true])),
)
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))

const rows = computed<CustomRole[]>(() =>
  [...customRoles].sort((a, b) => a.name.localeCompare(b.name)),
)

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CustomRole>(rows, {
  perPage: 25,
  filterFn: (row, s) =>
    !s || row.name.toLowerCase().includes(s) || row.description.toLowerCase().includes(s),
})

// ─── Loading (first paint) ──────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Row actions ────────────────────────────────────────────────────────────
function duplicate(role: CustomRole) {
  const payload: CustomRoleInput = {
    name: `${role.name} (${t('copy')})`,
    description: role.description,
    grants: { ...role.grants },
  }
  addCustomRole(payload)
  successToast(t('Custom role duplicated'))
}

const deleteTarget = ref<CustomRole | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteCustomRole(deleteTarget.value.id)
  successToast(t('Custom role deleted'))
  deleteTarget.value = null
}

function formatUpdatedAt(iso: string) {
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
    filter-empty-label="custom role"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="search = ''"
  >
    <!-- ── Filter bar — no inline filters here, only tools + search ── -->
    <template #filters>
      <div class="filter-left" />
      <div class="filter-right">
        <!-- Tool icons: ghost icon-only MpButtons in one group (rule/filter-bar-icon-group),
             each tooltipped and aria-labelled (rule/btn-icon-tooltip). -->
        <MpButtonGroup class="filter-btn-group">
          <ColumnSettingsMenu id="cr-columns" :items="columnItems" :visibility="columnVisibility" />
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

    <template #cell-name="{ value, row }">
      <a class="cell-link" @click.stop="openEdit((row as unknown as CustomRole).id)">{{ value }}</a>
    </template>

    <template #cell-description="{ value }">
      <span class="cr-wrap">{{ value || '—' }}</span>
    </template>

    <template #cell-features="{ row }">
      {{ grantedFeatureCount((row as unknown as CustomRole).grants) }}
    </template>

    <template #cell-assignedUsers="{ value }">
      {{ value }}
    </template>

    <template #cell-updatedAt="{ row }">
      <div class="cr-updated">
        <span>{{ formatUpdatedAt((row as unknown as CustomRole).updatedAt) }}</span>
        <span class="cr-updated-by">{{ (row as unknown as CustomRole).updatedBy }}</span>
      </div>
    </template>

    <template #actions="{ row }">
      <MpPopover
        :id="`cr-actions-${(row as unknown as CustomRole).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit((row as unknown as CustomRole).id)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate(row as unknown as CustomRole)">{{ t('Duplicate') }}</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="deleteTarget = (row as unknown as CustomRole)"
            >{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No custom roles') }}</p>
        <p class="empty-full-desc">{{ t('Custom roles will appear here.') }}</p>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="openCreate">
          {{ t('New custom role') }}
        </MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Add / edit custom role drawer ── -->
  <CustomRoleDrawer id="custom-role-drawer" :is-open="isOpen" :role-id="editingId" @close="close" />

  <!-- ── Delete confirmation ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="cr-delete-modal"
    :is-open="!!deleteTarget"
    size="md"
    :is-keep-alive="false"
    @close="deleteTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete custom role?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p>{{ t('Deleted custom role cannot be restored.') }}</p>
        <p v-if="deleteTarget?.assignedUsers" class="cr-delete-warning">
          {{ deleteTarget.assignedUsers }}
          {{ deleteTarget.assignedUsers === 1 ? t('user loses this authority.') : t('users lose this authority.') }}
        </p>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="deleteTarget = null">{{ t('Cancel') }}</MpButton>
        <MpButton variant="danger" is-rounded @click="confirmDelete">{{ t('Delete custom role') }}</MpButton>
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
.cr-wrap { white-space: normal; }
.cr-updated { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cr-updated-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.cr-delete-warning { margin-top: var(--mp-spacing-2); color: var(--mp-text-secondary); }

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
