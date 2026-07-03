<script setup lang="ts">
/**
 * Storage locations — the fixed 7-level storage hierarchy (Floor → Bin). A static
 * master list of exactly 7 rows: no pagination, and (≤10 rows) no outside border.
 * Each level has a default type: Organizational or Storage. A level's Name + Default
 * type can be edited from the row-hover pencil; once edited its Description clears to
 * an em dash (the stock description no longer applies).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpFormControl, MpFormLabel, MpInput, MpAutocomplete, MpButton,
} from '@mekari/pixel3'
import ErpFilterBar from '~/components/patterns/ErpFilterBar.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { storageLevels, updateStorageLevel } from '~/data/storageLevels'

// Rows = the shared master levels (persisted), with a display Level number (order).
type LevelRow = (typeof storageLevels)[number] & { level: number }
const levels = computed<LevelRow[]>(() =>
  storageLevels.map((l, i) => ({ ...l, level: i + 1 })),
)

// Column show/hide — Level always on; Last updated appended, hidden by default.
const colVis = reactive<Record<string, boolean>>({
  level: true, name: true, description: true, defaultType: true, lastUpdated: false,
})
const columnItems = [
  { key: 'level', label: 'Level', disabled: true },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'defaultType', label: 'Storing preference' },
  { key: 'lastUpdated', label: 'Last updated' },
]
function luFor(lvl: LevelRow) {
  return lvl.updatedAt ? { at: lvl.updatedAt, by: lvl.updatedBy } : lastUpdatedFor(`storage-${lvl.level}`)
}

const search = ref('')
const filteredLevels = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return levels.value
  return levels.value.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.description.toLowerCase().includes(q) ||
    l.defaultType.toLowerCase().includes(q) ||
    String(l.level).includes(q),
  )
})

// ── Edit modal ────────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { label: 'Organizational', value: 'Organizational' },
  { label: 'Storage', value: 'Storage' },
]
const editOpen = ref(false)
const editingKey = ref<string | null>(null)
const editName = ref('')
const editDesc = ref('')
const editType = ref<'Organizational' | 'Storage'>('Organizational')

function openEdit(lvl: LevelRow) {
  editingKey.value = lvl.key
  editName.value = lvl.name
  editDesc.value = lvl.description === '—' ? '' : lvl.description
  editType.value = lvl.defaultType
  editOpen.value = true
}
function saveEdit() {
  if (editingKey.value) {
    updateStorageLevel(editingKey.value, { name: editName.value, defaultType: editType.value, description: editDesc.value })
  }
  editOpen.value = false
}
</script>

<template>
  <div class="sl-page">
    <ErpFilterBar>
      <div class="sl-toolbar" style="margin-left: auto">
        <ColumnSettingsMenu id="sl-col-settings" :items="columnItems" :visibility="colVis" />
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
      </div>
    </ErpFilterBar>

    <table class="sl-table">
      <colgroup>
        <col style="width: 64px" />
        <col v-if="colVis.name" style="width: 160px" />
        <col v-if="colVis.description" style="width: 360px" />
        <col v-if="colVis.defaultType" style="width: 160px" />
        <col v-if="colVis.lastUpdated" style="width: 200px" />
        <col /><!-- actions: fills the remaining space so the edit button sits far right -->
      </colgroup>
      <thead>
        <tr>
          <th class="sl-th">Level</th>
          <th v-if="colVis.name" class="sl-th">Name</th>
          <th v-if="colVis.description" class="sl-th">Description</th>
          <th v-if="colVis.defaultType" class="sl-th">Storing preference</th>
          <th v-if="colVis.lastUpdated" class="sl-th">Last updated</th>
          <th class="sl-th" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="lvl in filteredLevels" :key="lvl.key" class="sl-row">
          <td class="sl-td">{{ lvl.level }}</td>
          <td v-if="colVis.name" class="sl-td">{{ lvl.name }}</td>
          <td v-if="colVis.description" class="sl-td sl-desc">{{ lvl.description }}</td>
          <td v-if="colVis.defaultType" class="sl-td">{{ lvl.defaultType }}</td>
          <td v-if="colVis.lastUpdated" class="sl-td"><LastUpdatedCell v-bind="luFor(lvl)" /></td>
          <td class="sl-td sl-td--action">
            <MpButton class="sl-edit-btn" variant="ghost" left-icon="edit" aria-label="Edit" @click="openEdit(lvl)" />
          </td>
        </tr>
        <tr v-if="!filteredLevels.length">
          <td class="sl-td sl-empty" colspan="6">No results found.</td>
        </tr>
      </tbody>
    </table>

    <!-- Edit modal -->
    <MpModal
      id="sl-edit-modal"
      :is-open="editOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="editOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Edit storage level
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <div class="sl-form">
            <MpFormControl id="sl-edit-name">
              <MpFormLabel>Name</MpFormLabel>
              <MpInput id="sl-edit-name-input" v-model="editName" is-full-width placeholder="Level name" />
            </MpFormControl>
            <MpFormControl id="sl-edit-desc">
              <MpFormLabel>Description</MpFormLabel>
              <textarea id="sl-edit-desc-input" v-model="editDesc" class="sl-textarea" rows="3" placeholder="Describe this storage level" />
            </MpFormControl>
            <MpFormControl id="sl-edit-type">
              <MpFormLabel>Storing preference</MpFormLabel>
              <MpAutocomplete
                id="sl-edit-type-ac"
                v-model="editType"
                :data="TYPE_OPTIONS"
                label-prop="label"
                value-prop="value"
                placeholder="Select type"
                use-portal
                is-full-width
              />
            </MpFormControl>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="sl-modal-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="editOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="saveEdit">Save changes</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.sl-page { display: flex; flex-direction: column; }

.sl-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* index-style pill search inside the filter bar */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* fixed, equal column widths — table hugs content (no stretch to the right edge);
   ≤10 rows → no outside border, just header + row dividers */
.sl-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.sl-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
/* every row cell: 14px regular, default colour — nothing bold */
.sl-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.sl-desc { white-space: normal; }
.sl-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }

/* row-hover edit button (Pixel MpButton, icon-only). Kept in layout with
   visibility (not display) so the button's space is always reserved — revealing it
   on hover never changes the row height. */
.sl-td--action { padding: 0 var(--mp-spacing-2); text-align: right; vertical-align: middle; }
.sl-edit-btn { visibility: hidden; }
.sl-row:hover .sl-edit-btn { visibility: visible; }

.sl-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.sl-modal-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.sl-textarea {
  width: 100%; resize: vertical;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral); font-family: inherit; line-height: 1.5;
  outline: none;
}
.sl-textarea:focus { border-color: var(--mp-border-focused, #0f6d4d); box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15,109,77,0.2)); }
.sl-textarea::placeholder { color: var(--mp-text-placeholder); }
</style>
