<script setup lang="ts">
/**
 * CrmDetailLayoutBuilder — the Layout tab ▸ "Details page" canvas of the Deals
 * module builder (Figma CRM 4244-18718). Concept mirrors HubSpot's edit-layout,
 * built with ERP components + tokens (/pixel-erp-design):
 *   "Edit layout" title → text tab strip (green underline) + New tab → per-tab
 *   sections (plain titled groups) → property fields as bordered cards.
 * Section actions (add property / edit / delete) and property remove live in a
 * kebab menu; edits use MpModal, destructive delete uses ConfirmModal. All edits
 * mutate the passed reactive `detail`; the parent's Save changes persists it.
 */
import { ref, computed } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpSegmentedControl, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButtonGroup,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  dealProperties, DEAL_PROPERTY_TYPE_ICON, newDetailSectionId,
  type DealDetailLayout, type DetailLayoutSection,
} from '~/data/crm'

// moduleIcon kept for API compatibility (parent passes it); not shown in this canvas.
const props = withDefaults(defineProps<{ detail: DealDetailLayout; moduleIcon?: string }>(), { moduleIcon: 'pipeline' })
const { t } = useLocale()

const SECTION_NAME_MAX = 30
const COL_OPTIONS = [
  { id: 'col-1', label: '1', value: '1' },
  { id: 'col-2', label: '2', value: '2' },
  { id: 'col-3', label: '3', value: '3' },
]

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTabId = ref<string>(props.detail.tabs.find((tp) => tp.editable)?.id ?? props.detail.tabs[0]?.id ?? '')
const activeTab = computed(() => props.detail.tabs.find((tp) => tp.id === activeTabId.value))
let tabSeq = 1
function selectTab(id: string) { activeTabId.value = id }
function addTab() {
  const id = `tab-custom-${tabSeq++}`
  props.detail.tabs.push({ id, key: id, label: t('New tab'), editable: true, visible: true, sections: [] })
  activeTabId.value = id
}

// ── Property lookup ─────────────────────────────────────────────────────────────
function prop(id: string) { return dealProperties.find((p) => p.id === id) }
const placedIds = computed(() => {
  const ids = new Set<string>()
  for (const tp of props.detail.tabs) for (const s of tp.sections ?? []) for (const id of s.propertyIds) ids.add(id)
  return ids
})
const availableProps = computed(() => dealProperties.filter((p) => p.id !== 'products' && !placedIds.value.has(p.id)))

// ── Sections ────────────────────────────────────────────────────────────────────
function addSection() {
  const tab = activeTab.value
  if (!tab?.editable) return
  tab.sections = tab.sections ?? []
  tab.sections.push({ id: newDetailSectionId(), name: t('New section'), columns: 3, propertyIds: [] })
}

// Edit-section modal (rename + columns)
const editOpen = ref(false)
const editTarget = ref<DetailLayoutSection | null>(null)
const editName = ref('')
const editCols = ref<'1' | '2' | '3'>('3')
const editError = ref('')
function openEditSection(s: DetailLayoutSection) {
  editTarget.value = s; editName.value = s.name; editCols.value = String(s.columns) as '1' | '2' | '3'; editError.value = ''; editOpen.value = true
}
function saveEditSection() {
  if (!editName.value.trim()) { editError.value = t('Enter a section name.'); return }
  if (editTarget.value) { editTarget.value.name = editName.value.trim(); editTarget.value.columns = Number(editCols.value) as 1 | 2 | 3 }
  editOpen.value = false
}

// Add-property modal
const addOpen = ref(false)
const addTarget = ref<DetailLayoutSection | null>(null)
const addSearch = ref('')
function openAddProperty(s: DetailLayoutSection) { addTarget.value = s; addSearch.value = ''; addOpen.value = true }
const addFiltered = computed(() => {
  const q = addSearch.value.trim().toLowerCase()
  return q ? availableProps.value.filter((p) => p.name.toLowerCase().includes(q) || p.variableName.includes(q)) : availableProps.value
})
function addProperty(id: string) { if (addTarget.value && !addTarget.value.propertyIds.includes(id)) addTarget.value.propertyIds.push(id) }
function removeProperty(section: DetailLayoutSection, id: string) { section.propertyIds = section.propertyIds.filter((x) => x !== id) }

// Delete-section (ConfirmModal when non-empty)
const confirmDelete = ref<DetailLayoutSection | null>(null)
function requestDeleteSection(s: DetailLayoutSection) { s.propertyIds.length ? (confirmDelete.value = s) : doDeleteSection(s) }
function doDeleteSection(s: DetailLayoutSection) {
  const tab = activeTab.value
  if (tab?.sections) tab.sections = tab.sections.filter((x) => x.id !== s.id)
  confirmDelete.value = null
}

// ── Drag & drop (sections, properties) — hand-rolled HTML5 pattern ──────────────
function moveInArray<T>(arr: T[], from: number, to: number) { const c = [...arr]; const [m] = c.splice(from, 1); c.splice(to, 0, m!); return c }
const secDrag = ref<{ src: number | null; over: number | null }>({ src: null, over: null })
function onSecDrop(i: number) {
  const tab = activeTab.value
  if (!tab?.sections || secDrag.value.src === null || secDrag.value.src === i) { secDrag.value.over = null; return }
  tab.sections = moveInArray(tab.sections, secDrag.value.src, i); secDrag.value = { src: null, over: null }
}
const propDrag = ref<{ sec: string; src: number | null; over: number | null }>({ sec: '', src: null, over: null })
function onPropDrop(section: DetailLayoutSection, i: number) {
  if (propDrag.value.sec !== section.id || propDrag.value.src === null || propDrag.value.src === i) { propDrag.value.over = null; return }
  section.propertyIds = moveInArray(section.propertyIds, propDrag.value.src, i); propDrag.value = { sec: '', src: null, over: null }
}
</script>

<template>
  <div class="dlb">
    <!-- Title block -->
    <div class="dlb-titleblock">
      <h3 class="dlb-title">{{ t('Edit layout') }}</h3>
      <p class="dlb-desc">{{ t('Arrange the tabs, sections and properties shown on a deal record.') }}</p>
    </div>

    <!-- Text tab strip (green underline) + New tab -->
    <div class="dlb-tabstrip">
      <button
        v-for="tp in detail.tabs" :key="tp.id" type="button" class="dlb-tab"
        :class="{ 'dlb-tab--active': tp.id === activeTabId }" @click="selectTab(tp.id)"
      >{{ t(tp.label) }}</button>
      <button type="button" class="dlb-newtab" @click="addTab"><MpIcon name="add" size="sm" />{{ t('New tab') }}</button>
    </div>

    <!-- Active tab body -->
    <div class="dlb-body">
      <template v-if="activeTab?.editable">
        <section
          v-for="(section, si) in (activeTab.sections ?? [])" :key="section.id"
          class="dlb-section" :class="{ 'dlb-section--over': secDrag.over === si && secDrag.src !== si }"
          draggable="true"
          @dragstart="secDrag.src = si" @dragover.prevent="secDrag.over = si" @drop.prevent="onSecDrop(si)" @dragend="secDrag = { src: null, over: null }"
        >
          <header class="dlb-sec-head">
            <MpIcon name="drag" size="sm" class="dlb-drag" />
            <span class="dlb-sec-name">{{ t(section.name) }}</span>
            <span class="dlb-spacer" />
            <MpPopover :id="`dlb-sec-${section.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Section actions')" />
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="openAddProperty(section)">{{ t('Add property') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="openEditSection(section)">{{ t('Edit section') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="requestDeleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </header>

          <div class="dlb-grid" :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }">
            <div
              v-for="(pid, pi) in section.propertyIds" :key="pid"
              class="dlb-prop" :class="{ 'dlb-prop--over': propDrag.sec === section.id && propDrag.over === pi && propDrag.src !== pi }"
              draggable="true"
              @dragstart="propDrag = { sec: section.id, src: pi, over: null }" @dragover.prevent="propDrag.sec === section.id && (propDrag.over = pi)" @drop.prevent="onPropDrop(section, pi)" @dragend="propDrag = { sec: '', src: null, over: null }"
            >
              <MpIcon name="drag" size="sm" class="dlb-drag" />
              <div class="dlb-prop-text">
                <span class="dlb-prop-label">{{ prop(pid)?.name ?? pid }}</span>
                <span class="dlb-prop-var">{{ prop(pid)?.variableName ?? pid }}</span>
              </div>
              <MpPopover :id="`dlb-prop-${section.id}-${pid}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Property actions')" @click.stop />
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '160px' })">
                  <MpPopoverList><MpPopoverListItem @click="removeProperty(section, pid)">{{ t('Remove property') }}</MpPopoverListItem></MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>
            <p v-if="!section.propertyIds.length" class="dlb-empty">{{ t('No properties yet. Add one from the section menu.') }}</p>
          </div>
        </section>

        <div class="dlb-add-section">
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addSection">{{ t('New section') }}</MpButton>
        </div>
      </template>

      <!-- System tab: not editable -->
      <div v-else-if="activeTab" class="dlb-systemtab">
        <MpIcon name="security" size="md" class="dlb-systemtab-icon" />
        <div class="dlb-systemtab-text">
          <span class="dlb-systemtab-title">{{ t(activeTab.label) }}</span>
          <span class="dlb-systemtab-caption">{{ t('This tab shows system content and can’t be edited.') }}</span>
        </div>
      </div>
    </div>

    <!-- Add-property modal -->
    <MpModal id="dlb-addprop-modal" :is-open="addOpen" :is-keep-alive="false" size="sm" @close="addOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Add property') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <MpInput id="dlb-addprop-search" v-model="addSearch" is-full-width left-icon="search" :placeholder="t('Search property')" />
          <ul class="dlb-picker">
            <li v-for="p in addFiltered" :key="p.id" class="dlb-picker-row" @click="addProperty(p.id)">
              <MpIcon :name="DEAL_PROPERTY_TYPE_ICON[p.type]" size="sm" class="dlb-picker-icon" />
              <div class="dlb-prop-text">
                <span class="dlb-prop-label">{{ p.name }}</span>
                <span class="dlb-prop-var">{{ p.variableName }}</span>
              </div>
              <MpIcon name="add" size="sm" class="dlb-picker-add" />
            </li>
            <li v-if="!addFiltered.length" class="dlb-empty">{{ availableProps.length ? t('No matching property.') : t('All properties are placed.') }}</li>
          </ul>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="addOpen = false">{{ t('Done') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Edit-section modal -->
    <MpModal id="dlb-editsec-modal" :is-open="editOpen" :is-keep-alive="false" size="sm" @close="editOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Edit section') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div class="dlb-field">
            <span class="dlb-field-label">{{ t('Section name') }}</span>
            <MpInput id="dlb-editsec-name" v-model="editName" is-full-width :maxlength="SECTION_NAME_MAX" @update:model-value="editError = ''" />
            <p v-if="editError" class="dlb-inline-error">{{ editError }}</p>
          </div>
          <div class="dlb-field">
            <span class="dlb-field-label">{{ t('Columns') }}</span>
            <MpSegmentedControl id="dlb-editsec-cols" name="dlb-editsec-cols" v-model="editCols" :data="COL_OPTIONS" />
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="editOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveEditSection">{{ t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <ConfirmModal
      :is-open="!!confirmDelete"
      :title="t('Delete section?')"
      :description="t('Its properties return to the property list. This can’t be undone.')"
      :confirm-label="t('Delete section')"
      @update:is-open="(v) => { if (!v) confirmDelete = null }"
      @confirm="confirmDelete && doDeleteSection(confirmDelete)"
    />
  </div>
</template>

<style scoped>
.dlb { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Title block */
.dlb-titleblock { display: flex; flex-direction: column; gap: 2px; }
.dlb-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.dlb-desc { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); margin: 0; }

/* Text tab strip with a green active underline */
.dlb-tabstrip { display: flex; align-items: center; gap: var(--mp-spacing-6); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.dlb-tab { position: relative; padding: var(--mp-spacing-3) 0; border: none; background: transparent; cursor: pointer; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #536062); }
.dlb-tab--active { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.dlb-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-colors-background-success-bold, #16b364); }
.dlb-newtab { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) 0; border: none; background: transparent; cursor: pointer; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #536062); }
.dlb-newtab:hover { color: var(--mp-colors-text-default, #080d0e); }

/* Body */
.dlb-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.dlb-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); border-radius: 8px; }
.dlb-section--over { outline: 1px solid var(--mp-colors-border-success, #16b364); outline-offset: 6px; }
.dlb-sec-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.dlb-drag { color: var(--mp-colors-icon-subtle, #97a0a1); cursor: grab; flex-shrink: 0; }
.dlb-sec-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.dlb-spacer { flex: 1; }

/* Property grid + field cards */
.dlb-grid { display: grid; gap: var(--mp-spacing-4); }
.dlb-prop { display: flex; align-items: center; gap: var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 8px; padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-neutral, #fff); min-width: 0; min-height: 56px; }
.dlb-prop--over { border-color: var(--mp-colors-border-success, #16b364); background: var(--mp-colors-background-success-subtlest, #f0fdf4); }
.dlb-prop-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dlb-prop-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlb-prop-var { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); font-family: var(--mp-fonts-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlb-empty { grid-column: 1 / -1; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); margin: 0; padding: var(--mp-spacing-2) 0; }

.dlb-add-section { padding-top: var(--mp-spacing-2); }

/* System tab */
.dlb-systemtab { display: flex; align-items: center; gap: var(--mp-spacing-4); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 12px; background: var(--mp-colors-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-5); }
.dlb-systemtab-icon { color: var(--mp-colors-icon-subtle, #97a0a1); }
.dlb-systemtab-text { display: flex; flex-direction: column; gap: 2px; }
.dlb-systemtab-title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.dlb-systemtab-caption { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }

/* Add-property picker (modal) */
.dlb-picker { list-style: none; margin: var(--mp-spacing-3) 0 0; padding: 0; }
.dlb-picker-row { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2); border-radius: 6px; cursor: pointer; }
.dlb-picker-row:hover { background: var(--mp-colors-background-neutral-subtle, #f2f4f4); }
.dlb-picker-icon { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.dlb-picker-add { color: var(--mp-colors-icon-subtle, #97a0a1); flex-shrink: 0; }

/* Edit-section modal fields */
.dlb-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.dlb-field + .dlb-field { margin-top: var(--mp-spacing-4); }
.dlb-field-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-inline-error { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-danger, #d92d20); margin: 0; }
</style>
