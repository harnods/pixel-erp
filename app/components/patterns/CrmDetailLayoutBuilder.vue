<script setup lang="ts">
/**
 * CrmDetailLayoutBuilder — the Layout tab ▸ "Details page" canvas of the Deals
 * module builder. A HubSpot-style edit-layout surface that MIRRORS our actual
 * record page (CrmDealDetailPage): a header preview + a tab strip (Deal details ·
 * Activity · Notes · Files · Sales orders) where the editable "Deal details" tab
 * holds a vertical stack of section cards, each an ordered property grid.
 *
 * Behaviour/components/styling follow /pixel-erp-design: ErpFilterSelect/MpPopover
 * (never native select), pill buttons, card surfaces, ContentList-style key/value,
 * inline errors, ConfirmModal for destructive deletes. All edits mutate the passed
 * reactive `detail` object; the parent's Save changes persists it.
 */
import { ref, computed, reactive } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpTooltip, MpSegmentedControl, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  dealProperties, DEAL_PROPERTY_TYPE_ICON, newDetailSectionId,
  type DealDetailLayout, type DetailLayoutTab, type DetailLayoutSection,
} from '~/data/crm'

const props = withDefaults(defineProps<{ detail: DealDetailLayout; moduleIcon?: string }>(), {
  moduleIcon: 'pipeline',
})
const { t } = useLocale()

const SECTION_NAME_MAX = 30
const COL_OPTIONS = [
  { id: 'col-1', label: '1', value: '1' },
  { id: 'col-2', label: '2', value: '2' },
  { id: 'col-3', label: '3', value: '3' },
]

// ── Tabs ──────────────────────────────────────────────────────────────────────
const visibleTabs = computed(() => props.detail.tabs.filter((tp) => tp.visible))
const hiddenTabs = computed(() => props.detail.tabs.filter((tp) => !tp.visible))
const activeTabId = ref<string>(props.detail.tabs.find((tp) => tp.editable)?.id ?? props.detail.tabs[0]?.id ?? '')
const activeTab = computed(() => props.detail.tabs.find((tp) => tp.id === activeTabId.value))

function selectTab(id: string) { activeTabId.value = id }
function hideTab(tp: DetailLayoutTab) {
  tp.visible = false
  if (activeTabId.value === tp.id) activeTabId.value = props.detail.tabs.find((x) => x.visible)?.id ?? ''
}
function showTab(tp: DetailLayoutTab) { tp.visible = true; activeTabId.value = tp.id }

// ── Property lookup ─────────────────────────────────────────────────────────────
function prop(id: string) { return dealProperties.find((p) => p.id === id) }
// Every property id already placed anywhere in the (editable) Details tab.
const placedIds = computed(() => {
  const ids = new Set<string>()
  for (const tp of props.detail.tabs) for (const s of tp.sections ?? []) for (const id of s.propertyIds) ids.add(id)
  return ids
})
// Properties available to add (not placed; the products block owns 'products').
const availableProps = computed(() =>
  dealProperties.filter((p) => p.id !== 'products' && !placedIds.value.has(p.id)),
)

// ── Add property (popover, per section) ─────────────────────────────────────────
const propSearch = ref('')
const filteredAvailable = computed(() => {
  const q = propSearch.value.trim().toLowerCase()
  return q ? availableProps.value.filter((p) => p.name.toLowerCase().includes(q) || p.variableName.includes(q)) : availableProps.value
})
function addProperty(section: DetailLayoutSection, id: string) {
  if (!section.propertyIds.includes(id)) section.propertyIds.push(id)
}
function removeProperty(section: DetailLayoutSection, id: string) {
  section.propertyIds = section.propertyIds.filter((x) => x !== id)
}

// ── Sections ────────────────────────────────────────────────────────────────────
function addSection() {
  const tab = activeTab.value
  if (!tab?.editable) return
  tab.sections = tab.sections ?? []
  const idx = tab.sections.findIndex((s) => s.kind === 'products')
  const section: DetailLayoutSection = { id: newDetailSectionId(), name: t('New section'), columns: 3, propertyIds: [] }
  if (idx >= 0) tab.sections.splice(idx, 0, section) // keep the products block last-ish
  else tab.sections.push(section)
}

// Inline section editor (rename + columns) — a popover form per section.
const editing = reactive<{ id: string; name: string; columns: 1 | 2 | 3; error: string }>({ id: '', name: '', columns: 3, error: '' })
function openEditSection(s: DetailLayoutSection) { editing.id = s.id; editing.name = s.name; editing.columns = s.columns; editing.error = '' }
function applyEditSection(s: DetailLayoutSection) {
  if (!editing.name.trim()) { editing.error = t('Enter a section name.'); return }
  s.name = editing.name.trim()
  s.columns = editing.columns
  editing.id = ''
}

// Delete section (ConfirmModal when it still holds properties).
const confirmDelete = ref<DetailLayoutSection | null>(null)
function requestDeleteSection(s: DetailLayoutSection) {
  if (s.propertyIds.length) confirmDelete.value = s
  else doDeleteSection(s)
}
function doDeleteSection(s: DetailLayoutSection) {
  const tab = activeTab.value
  if (!tab?.sections) return
  tab.sections = tab.sections.filter((x) => x.id !== s.id)
  confirmDelete.value = null
}

// ── Drag & drop (tabs, sections, properties) — hand-rolled HTML5 pattern ────────
function moveInArray<T>(arr: T[], from: number, to: number) {
  const copy = [...arr]
  const [m] = copy.splice(from, 1)
  copy.splice(to, 0, m!)
  return copy
}
// Tabs
const tabDrag = reactive<{ src: number | null; over: number | null }>({ src: null, over: null })
function onTabDrop(i: number) {
  if (tabDrag.src === null || tabDrag.src === i) { tabDrag.over = null; return }
  // Reorder within the full tabs array by matching visible indices.
  const vis = visibleTabs.value
  const srcId = vis[tabDrag.src]!.id, dstId = vis[i]!.id
  const from = props.detail.tabs.findIndex((x) => x.id === srcId)
  const to = props.detail.tabs.findIndex((x) => x.id === dstId)
  props.detail.tabs = moveInArray(props.detail.tabs, from, to)
  tabDrag.src = null; tabDrag.over = null
}
// Sections (within the active editable tab)
const secDrag = reactive<{ src: number | null; over: number | null }>({ src: null, over: null })
function onSecDrop(i: number) {
  const tab = activeTab.value
  if (!tab?.sections || secDrag.src === null || secDrag.src === i) { secDrag.over = null; return }
  tab.sections = moveInArray(tab.sections, secDrag.src, i)
  secDrag.src = null; secDrag.over = null
}
// Properties (within a section)
const propDrag = reactive<{ sec: string; src: number | null; over: number | null }>({ sec: '', src: null, over: null })
function onPropDrop(section: DetailLayoutSection, i: number) {
  if (propDrag.sec !== section.id || propDrag.src === null || propDrag.src === i) { propDrag.over = null; return }
  section.propertyIds = moveInArray(section.propertyIds, propDrag.src, i)
  propDrag.src = null; propDrag.over = null
}
</script>

<template>
  <div class="dlb">
    <!-- Header preview (visual only — mirrors the record title + stage bar) -->
    <div class="dlb-preview">
      <div class="dlb-preview-icon"><MpIcon :name="moduleIcon" size="md" /></div>
      <div class="dlb-preview-main">
        <span class="dlb-preview-title">{{ t('Deal name') }}</span>
        <div class="dlb-stagebar"><span v-for="n in 5" :key="n" class="dlb-stageseg" :class="{ 'dlb-stageseg--on': n === 1 }" /></div>
      </div>
    </div>

    <!-- Tab strip -->
    <div class="dlb-tabstrip">
      <div class="dlb-tabs">
        <div
          v-for="(tp, i) in visibleTabs" :key="tp.id" class="dlb-tab" role="tab" tabindex="0"
          :aria-selected="tp.id === activeTabId"
          :class="{ 'dlb-tab--active': tp.id === activeTabId, 'dlb-tab--over': tabDrag.over === i && tabDrag.src !== i }"
          draggable="true"
          @click="selectTab(tp.id)" @keydown.enter="selectTab(tp.id)" @keydown.space.prevent="selectTab(tp.id)"
          @dragstart="tabDrag.src = i" @dragover.prevent="tabDrag.over = i" @drop.prevent="onTabDrop(i)" @dragend="tabDrag.src = null; tabDrag.over = null"
        >
          <MpIcon name="drag" size="sm" class="dlb-tab-drag" />
          <span class="dlb-tab-label">{{ t(tp.label) }}</span>
          <MpPopover v-if="!tp.editable" :id="`dlb-tab-${tp.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="dlb-tab-kebab" variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Tab actions')" @click.stop />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px' })">
              <MpPopoverList><MpPopoverListItem @click="hideTab(tp)">{{ t('Hide tab') }}</MpPopoverListItem></MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- + Add tab (re-add a hidden default tab) -->
      <MpPopover id="dlb-add-tab" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" is-rounded left-icon="add" :aria-label="t('Add tab')" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="tp in hiddenTabs" :key="tp.id" @click="showTab(tp)">{{ t(tp.label) }}</MpPopoverListItem>
            <li v-if="!hiddenTabs.length" class="dlb-menu-empty">{{ t('All tabs are shown.') }}</li>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>

    <!-- Active tab body -->
    <div class="dlb-body">
      <!-- Editable "Deal details" tab: section cards -->
      <template v-if="activeTab?.editable">
        <div
          v-for="(section, si) in (activeTab.sections ?? [])" :key="section.id"
          class="dlb-card" :class="{ 'dlb-card--over': secDrag.over === si && secDrag.src !== si, 'dlb-card--system': section.system }"
          :draggable="!section.system"
          @dragstart="!section.system && (secDrag.src = si)" @dragover.prevent="secDrag.over = si" @drop.prevent="onSecDrop(si)" @dragend="secDrag.src = null; secDrag.over = null"
        >
          <header class="dlb-card-head">
            <MpIcon v-if="!section.system" name="drag" size="sm" class="dlb-card-drag" />
            <MpIcon v-else name="security" size="sm" class="dlb-card-lock" :aria-label="t('System section')" />
            <span class="dlb-card-name">{{ t(section.name) }}</span>
            <span v-if="!section.system" class="dlb-card-cols">{{ section.columns }} {{ t('columns') }}</span>
            <span class="dlb-card-spacer" />
            <!-- Edit (rename + columns) -->
            <MpPopover v-if="!section.system" :id="`dlb-edit-${section.id}`" use-portal :is-keep-alive="false" placement="bottom-end" @open="openEditSection(section)">
              <MpPopoverTrigger>
                <MpButton variant="ghost" is-rounded left-icon="edit" :aria-label="t('Edit section')" />
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '260px', padding: '12px' })">
                <div class="dlb-edit">
                  <span class="dlb-edit-label">{{ t('Section name') }}</span>
                  <MpInput :id="`dlb-secname-${section.id}`" v-model="editing.name" is-full-width :maxlength="SECTION_NAME_MAX" @update:model-value="editing.error = ''" />
                  <p v-if="editing.error" class="dlb-inline-error">{{ editing.error }}</p>
                  <span class="dlb-edit-label">{{ t('Columns') }}</span>
                  <MpSegmentedControl
                    :id="`dlb-cols-${section.id}`" :name="`dlb-cols-${section.id}`"
                    :model-value="String(editing.columns)" :data="COL_OPTIONS"
                    @update:model-value="(v: string) => (editing.columns = (Number(v) as 1 | 2 | 3))"
                  />
                  <div class="dlb-edit-actions">
                    <MpButton variant="secondary" is-rounded @click="applyEditSection(section)">{{ t('Apply') }}</MpButton>
                  </div>
                </div>
              </MpPopoverContent>
            </MpPopover>
            <!-- Kebab (delete) -->
            <MpPopover v-if="!section.system" :id="`dlb-sec-${section.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Section actions')" />
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px' })">
                <MpPopoverList><MpPopoverListItem @click="requestDeleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem></MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </header>

          <!-- System products block (locked) -->
          <div v-if="section.system" class="dlb-products">
            <MpIcon name="security" size="sm" class="dlb-products-icon" />
            <span>{{ t('Products table and totals — managed by the system.') }}</span>
          </div>

          <!-- Property grid -->
          <template v-else>
            <div class="dlb-grid" :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }">
              <div
                v-for="(pid, pi) in section.propertyIds" :key="pid"
                class="dlb-prop" :class="{ 'dlb-prop--over': propDrag.sec === section.id && propDrag.over === pi && propDrag.src !== pi }"
                draggable="true"
                @dragstart="propDrag.sec = section.id; propDrag.src = pi" @dragover.prevent="propDrag.sec === section.id && (propDrag.over = pi)" @drop.prevent="onPropDrop(section, pi)" @dragend="propDrag.src = null; propDrag.over = null"
              >
                <MpIcon name="drag" size="sm" class="dlb-prop-drag" />
                <MpIcon :name="prop(pid)?.type ? DEAL_PROPERTY_TYPE_ICON[prop(pid)!.type] : 'text-editor-text'" size="sm" class="dlb-prop-type" />
                <div class="dlb-prop-text">
                  <span class="dlb-prop-label">{{ prop(pid)?.name ?? pid }}</span>
                  <span class="dlb-prop-var">{{ prop(pid)?.variableName ?? pid }}</span>
                </div>
                <MpTooltip :id="`dlb-rm-${section.id}-${pid}`" :label="t('Remove')" placement="top" use-portal>
                  <MpButton class="dlb-prop-remove" variant="ghost" is-rounded left-icon="close" :aria-label="t('Remove')" @click.stop="removeProperty(section, pid)" />
                </MpTooltip>
              </div>
              <div v-if="!section.propertyIds.length" class="dlb-empty-cell">{{ t('No properties yet.') }}</div>
            </div>

            <!-- + Add property -->
            <MpPopover :id="`dlb-addprop-${section.id}`" use-portal :is-keep-alive="false" placement="bottom-start" @open="propSearch = ''">
              <MpPopoverTrigger>
                <MpButton class="dlb-addprop" variant="ghost" is-rounded left-icon="add">{{ t('Property') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '320px', maxHeight: '360px', overflowY: 'auto', padding: '8px' })">
                <MpInput :id="`dlb-propsearch-${section.id}`" v-model="propSearch" is-full-width left-icon="search" :placeholder="t('Search property')" />
                <ul class="dlb-picker">
                  <li v-for="p in filteredAvailable" :key="p.id" class="dlb-picker-row" @click="addProperty(section, p.id)">
                    <MpIcon :name="DEAL_PROPERTY_TYPE_ICON[p.type]" size="sm" class="dlb-picker-icon" />
                    <div class="dlb-prop-text">
                      <span class="dlb-prop-label">{{ p.name }}</span>
                      <span class="dlb-prop-var">{{ p.variableName }}</span>
                    </div>
                    <MpIcon name="add" size="sm" class="dlb-picker-add" />
                  </li>
                  <li v-if="!filteredAvailable.length" class="dlb-menu-empty">{{ availableProps.length ? t('No matching property.') : t('All properties are placed.') }}</li>
                </ul>
              </MpPopoverContent>
            </MpPopover>
          </template>
        </div>

        <!-- + Add section -->
        <div class="dlb-add-section">
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addSection">{{ t('Section') }}</MpButton>
        </div>
      </template>

      <!-- System tab: locked placeholder -->
      <div v-else-if="activeTab" class="dlb-card dlb-card--system dlb-systemtab">
        <MpIcon name="security" size="md" class="dlb-card-lock" />
        <div class="dlb-systemtab-text">
          <span class="dlb-systemtab-title">{{ t(activeTab.label) }}</span>
          <span class="dlb-systemtab-caption">{{ t('This tab shows system content and can’t be edited.') }}</span>
        </div>
      </div>
    </div>

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
.dlb { display: flex; flex-direction: column; gap: var(--mp-spacing-5); max-width: 920px; }

/* Header preview */
.dlb-preview { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-5); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 12px; background: var(--mp-colors-background-neutral, #fff); }
.dlb-preview-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.dlb-preview-main { display: flex; flex-direction: column; gap: var(--mp-spacing-2); flex: 1; min-width: 0; }
.dlb-preview-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.dlb-stagebar { display: flex; gap: 4px; }
.dlb-stageseg { height: 6px; flex: 1; border-radius: 3px; background: var(--mp-colors-background-neutral-subtle, #eef1f1); }
.dlb-stageseg--on { background: var(--mp-colors-background-success-bold, #16b364); }

/* Tab strip */
.dlb-tabstrip { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.dlb-tabs { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.dlb-tab { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 8px; background: var(--mp-colors-background-neutral, #fff); cursor: pointer; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }
.dlb-tab--active { border-color: var(--mp-colors-border-success, #16b364); box-shadow: inset 0 -2px 0 var(--mp-colors-border-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.dlb-tab--over { border-color: var(--mp-colors-border-success, #16b364); }
.dlb-tab-drag, .dlb-card-drag, .dlb-prop-drag { color: var(--mp-colors-icon-subtle, #97a0a1); cursor: grab; flex-shrink: 0; }
.dlb-tab-kebab { margin: -6px -6px -6px 0; }

/* Body cards */
.dlb-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.dlb-card { border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 12px; background: var(--mp-colors-background-neutral, #fff); padding: var(--mp-spacing-4) var(--mp-spacing-5); }
.dlb-card--over { border-color: var(--mp-colors-border-success, #16b364); background: var(--mp-colors-background-success-subtlest, #f0fdf4); }
.dlb-card--system { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); }
.dlb-card-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.dlb-card-lock { color: var(--mp-colors-icon-subtle, #97a0a1); flex-shrink: 0; }
.dlb-card-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.dlb-card-cols { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); background: var(--mp-colors-background-neutral-subtle, #f2f4f4); border-radius: 4px; padding: 1px 6px; }
.dlb-card-spacer { flex: 1; }

/* Property grid */
.dlb-grid { display: grid; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-4); }
.dlb-prop { display: flex; align-items: center; gap: var(--mp-spacing-2); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 8px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-colors-background-neutral, #fff); min-width: 0; }
.dlb-prop--over { border-color: var(--mp-colors-border-success, #16b364); }
.dlb-prop-type, .dlb-picker-icon { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.dlb-prop-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dlb-prop-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlb-prop-var { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); font-family: var(--mp-fonts-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlb-prop-remove { flex-shrink: 0; margin: -4px -6px -4px 0; }
.dlb-empty-cell { grid-column: 1 / -1; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); padding: var(--mp-spacing-3) 0; }
.dlb-addprop { margin-top: var(--mp-spacing-3); }

/* Add-property picker */
.dlb-picker { list-style: none; margin: var(--mp-spacing-2) 0 0; padding: 0; }
.dlb-picker-row { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-2); border-radius: 6px; cursor: pointer; }
.dlb-picker-row:hover { background: var(--mp-colors-background-neutral-subtle, #f2f4f4); }
.dlb-picker-add { color: var(--mp-colors-icon-subtle, #97a0a1); flex-shrink: 0; }
.dlb-menu-empty { list-style: none; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }

/* Products / system tab */
.dlb-products { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-products-icon { color: var(--mp-colors-icon-subtle, #97a0a1); }
.dlb-systemtab { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.dlb-systemtab-text { display: flex; flex-direction: column; gap: 2px; }
.dlb-systemtab-title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.dlb-systemtab-caption { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }

/* Add section + edit popover */
.dlb-add-section { padding-top: var(--mp-spacing-2); }
.dlb-edit { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.dlb-edit-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-edit-actions { display: flex; justify-content: flex-end; margin-top: var(--mp-spacing-2); }
.dlb-inline-error { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-danger, #d92d20); margin: 0; }
</style>
