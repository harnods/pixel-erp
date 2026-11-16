<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/contacts/views/ContactGroupListView.vue (+ components/ContactGroupFormModal.vue) -->
<script setup lang="ts">
/**
 * Contacts › <type> › Contact groups — groups scoped to one contact type,
 * read from `?type=customers|vendors|employees|others` (the sidebar's four
 * "Contact groups" items each carry their type). Search by name, sort by name
 * or member count, create / edit (name only) and delete with confirmation.
 */
import {
  MpButton, MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  contactGroups, contactGroupCount, addContactGroup, renameContactGroup, deleteContactGroup,
  CONTACT_GROUP_SEGMENTS, CONTACT_GROUP_ENTITY, type ContactGroup,
} from '~/data/contactGroups'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const actions = useParityActions()

const segment = computed(() => {
  const q = String(route.query.type ?? 'customers')
  return q in CONTACT_GROUP_SEGMENTS ? q : 'customers'
})
const groupType = computed(() => CONTACT_GROUP_SEGMENTS[segment.value]!)
const entity = computed(() => CONTACT_GROUP_ENTITY[groupType.value])

// The contact list each type belongs to (Employees has no list page here yet).
const LIST_PATH: Record<string, string> = { customers: '/customers', vendors: '/vendors', employees: '/employees', others: '/other-contacts' }

const columns: TableColumn[] = [
  { key: 'name', label: t('Group name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'contactsCount', label: t('Contacts'), kind: 'number', align: 'right', sortable: true, sortType: 'number' },
]

interface Row { id: string; name: string; contactsCount: number }
const rows = computed<Row[]>(() => contactGroups
  .filter((g) => g.type === groupType.value)
  .map((g) => ({ id: g.id, name: g.name, contactsCount: contactGroupCount(g) })))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
})
function clearSearch() { search.value = '' }
watch(segment, clearSearch)

// ─── Create / edit ───────────────────────────────────────────────────────────
const modalOpen = ref(false)
const editing = ref<ContactGroup | null>(null)
const name = ref('')
const nameError = ref('')
watch(name, () => { if (nameError.value) nameError.value = '' })

function openCreate() { editing.value = null; name.value = ''; nameError.value = ''; modalOpen.value = true }
function openEdit(id: string) {
  const g = contactGroups.find((x) => x.id === id)
  if (!g) return
  editing.value = g; name.value = g.name; nameError.value = ''; modalOpen.value = true
}
watch(() => actions.newContactGroup, openCreate)

function submit() {
  const candidate = name.value.trim()
  if (!candidate) { nameError.value = t('Group name is required'); return }
  const clash = contactGroups.some((g) => g.type === groupType.value && g.id !== editing.value?.id && g.name.toLowerCase() === candidate.toLowerCase())
  if (clash) { nameError.value = t('A group with this name already exists'); return }
  if (editing.value) {
    renameContactGroup(editing.value.id, candidate)
    toast.notify({ variant: 'success', title: t('Contact group saved') })
  } else {
    addContactGroup(candidate, groupType.value)
    toast.notify({ variant: 'success', title: t('Contact group created') })
  }
  modalOpen.value = false
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const pending = ref<Row | null>(null)
function askDelete(row: Row) { pending.value = row; deleteOpen.value = true }
const deleteMessage = computed(() => {
  const base = `"${pending.value?.name ?? ''}" ${t('will be deleted for everyone in this company. This cannot be undone.')}`
  return groupType.value === 'customer' ? `${base} ${t('Price rules using this group will also be removed.')}` : base
})
function confirmDelete() {
  if (!pending.value) return
  deleteContactGroup(pending.value.id)
  toast.notify({ variant: 'success', title: t('Contact group deleted') })
  pending.value = null
}
</script>

<template>
  <div class="cg-page">
    <span class="cell-link cg-back" @click="router.push(LIST_PATH[segment]!)">{{ t(entity) }}</span>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-search="!!search"
      :search="search"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-search="clearSearch"
      @clear-all="clearSearch"
    >
      <template #filters>
        <div class="filter-left" />
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search group name')" />
          </div>
        </div>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`cg-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openEdit((row as unknown as Row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No contact groups for') }} {{ t(entity) }} {{ t('yet') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <MpModal id="cg-modal" :is-open="modalOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="modalOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ editing ? t('Edit contact group') : t('New contact group') }}</MpModalHeader>
      <MpModalBody>
        <MpFormControl id="cg-name-fc" is-required :is-invalid="!!nameError">
          <MpFormLabel>{{ t('Group name') }}</MpFormLabel>
          <MpInput id="cg-name-input" v-model="name" autocomplete="off" @keyup.enter="submit" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="modalOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="submit">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete contact group?')"
    :description="deleteMessage"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.cg-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.cg-back { align-self: flex-start; font-size: var(--mp-font-sizes-md); }
.filter-left { flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
