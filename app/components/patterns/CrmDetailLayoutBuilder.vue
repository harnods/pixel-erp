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
  MpButton, MpIcon, MpInput, MpSegmentedControl, MpTooltip, MpDatePicker, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButtonGroup,
} from '@mekari/pixel3'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import CrmPropertyDrawer from '~/components/patterns/CrmPropertyDrawer.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  DEAL_PROPERTY_TYPE_ICON, newDetailSectionId,
  type DealDetailLayout, type DetailLayoutSection, type DetailLayoutTab,
  type DealProperty, type DealPropertyType, type DealPropertyConfig, type PropertyCondition,
} from '~/data/crm'

type NewPropertyPayload = { name: string; variableName: string; type: DealPropertyType; config: DealPropertyConfig }

// `properties` = the parent's editable property list (draft clone), so newly
// created properties appear here immediately. moduleIcon kept for API compat.
const props = withDefaults(defineProps<{
  detail: DealDetailLayout
  properties: DealProperty[]
  createProperty: (payload: NewPropertyPayload) => DealProperty
  moduleIcon?: string
}>(), { moduleIcon: 'pipeline' })
const { t } = useLocale()

const SECTION_NAME_MAX = 30
const COL_OPTIONS = [
  { id: 'col-1', label: '1', value: '1' },
  { id: 'col-2', label: '2', value: '2' },
  { id: 'col-3', label: '3', value: '3' },
  { id: 'col-4', label: '4', value: '4' },
]
type ColCount = 1 | 2 | 3 | 4

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
// Tab rename (inline) + delete — from the hover kebab. Nothing is saved until
// "Save changes", so deletes are immediate (no confirm).
const renamingTabId = ref('')
const renameValue = ref('')
function startRenameTab(tp: DetailLayoutTab) { renamingTabId.value = tp.id; renameValue.value = t(tp.label) }
function commitRenameTab(tp: DetailLayoutTab) { if (renameValue.value.trim()) tp.label = renameValue.value.trim(); renamingTabId.value = '' }
function deleteTab(tp: DetailLayoutTab) {
  const i = props.detail.tabs.findIndex((x) => x.id === tp.id)
  props.detail.tabs = props.detail.tabs.filter((x) => x.id !== tp.id)
  if (activeTabId.value === tp.id) activeTabId.value = props.detail.tabs[Math.max(0, i - 1)]?.id ?? props.detail.tabs[0]?.id ?? ''
}

// ── Property lookup ─────────────────────────────────────────────────────────────
function prop(id: string) { return props.properties.find((p) => p.id === id) }

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
const editCols = ref<'1' | '2' | '3' | '4'>('3')
const editError = ref('')
function openEditSection(s: DetailLayoutSection) {
  editTarget.value = s; editName.value = s.name; editCols.value = String(s.columns) as '1' | '2' | '3' | '4'; editError.value = ''; editOpen.value = true
}
function saveEditSection() {
  if (!editName.value.trim()) { editError.value = t('Enter a section name.'); return }
  if (editTarget.value) { editTarget.value.name = editName.value.trim(); editTarget.value.columns = Number(editCols.value) as ColCount }
  editOpen.value = false
}

// Add-property — a two-pane "pick many" drawer (SelectAccessDrawer, same as
// Setup ▸ Access "Select users"). Options = properties not placed in ANOTHER
// section (plus this section's own, so they show as the running selection).
const addOpen = ref(false)
const addTarget = ref<DetailLayoutSection | null>(null)
function openAddProperty(s: DetailLayoutSection) { addTarget.value = s; addOpen.value = true }
const addPropOptions = computed(() => {
  const section = addTarget.value
  if (!section) return []
  const elsewhere = new Set<string>()
  for (const tp of props.detail.tabs) for (const s of tp.sections ?? []) if (s.id !== section.id) for (const id of s.propertyIds) elsewhere.add(id)
  const own = new Set(section.propertyIds)
  return props.properties
    .filter((p) => own.has(p.id) || (p.id !== 'products' && !elsewhere.has(p.id)))
    .map((p) => ({ id: p.id, name: p.name, subtitle: p.variableName, icon: DEAL_PROPERTY_TYPE_ICON[p.type] }))
})
function onAddPropSave(ids: string[]) { if (addTarget.value) addTarget.value.propertyIds = ids; addOpen.value = false }

// "+ New property" from the drawer footer: swap Add-property → New-property drawer,
// then swap back after the property is created (it appears in the Add list).
const newPropOpen = ref(false)
function openNewProperty() { addOpen.value = false; newPropOpen.value = true }
function onNewPropertySaved(payload: NewPropertyPayload) { props.createProperty(payload) }
// Closing the New-property drawer (save OR cancel) swaps back to Add-property.
function onNewPropertyClose(open: boolean) { newPropOpen.value = open; if (!open) addOpen.value = true }

// ── Conditional logic (per property card) ───────────────────────────────────────
// Show/hide a property card when another property's value meets a condition. The
// operator set + value control adapt to the chosen field's type.
const condOpen = ref(false)
const condSection = ref<DetailLayoutSection | null>(null)
const condPid = ref('')
// Working copy — `then: ''` is the unset (first-run) state; committed on Apply.
const cond = ref<{ field: string; operator: PropertyCondition['operator']; value: string; valueEnd?: string; then: 'show' | 'hide' | '' }>(
  { field: '', operator: 'equals', value: '', then: '' },
)

type CondKind = 'boolean' | 'number' | 'date' | 'text'
function kindOf(type?: DealPropertyType): CondKind {
  if (type === 'Single checkbox') return 'boolean'
  if (type === 'Number') return 'number'
  if (type === 'Date picker' || type === 'Date and time picker') return 'date'
  return 'text'
}
const condKind = computed<CondKind>(() => (cond.value.field ? kindOf(prop(cond.value.field)?.type) : 'text'))
const ALL_OPS: { value: PropertyCondition['operator']; label: string }[] = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not-equals', label: 'is not equal to' },
  { value: 'less-than', label: 'is less than' },
  { value: 'less-equal', label: 'is less than or equal to' },
  { value: 'greater-than', label: 'is greater than' },
  { value: 'greater-equal', label: 'is greater than or equal to' },
  { value: 'between', label: 'is between' },
]
// Ordered/range operators only make sense for Number + Date fields.
const condOpOptions = computed(() => {
  const ops = condKind.value === 'number' || condKind.value === 'date' ? ALL_OPS : ALL_OPS.slice(0, 2)
  return ops.map((o) => ({ value: o.value, label: t(o.label) }))
})
const THEN_OPTIONS = [
  { value: 'show', label: t('Show') },
  { value: 'hide', label: t('Hide') },
]
const BOOL_OPTIONS = [
  { id: 'cond-true', label: t('True'), value: 'true' },
  { id: 'cond-false', label: t('False'), value: 'false' },
]
// Any property can drive the rule (except the card itself).
const condFieldOptions = computed(() =>
  props.properties.filter((p) => p.id !== condPid.value && p.id !== 'products').map((p) => ({ value: p.id, label: p.name })),
)
function onCondFieldChange(v: string) {
  cond.value.field = v
  // Reset operator/value to valid defaults for the new field type.
  const valid = condOpOptions.value.map((o) => o.value)
  if (!valid.includes(cond.value.operator)) cond.value.operator = 'equals'
  cond.value.value = condKind.value === 'boolean' ? 'true' : ''
  cond.value.valueEnd = ''
}
function openCondition(section: DetailLayoutSection, pid: string) {
  condSection.value = section; condPid.value = pid
  const existing = section.conditions?.[pid]
  cond.value = existing ? { ...existing } : { field: '', operator: 'equals', value: '', then: '' }
  condOpen.value = true
}
function applyCondition() {
  const s = condSection.value
  if (s && cond.value.field && cond.value.then) {
    s.conditions = { ...(s.conditions ?? {}), [condPid.value]: { ...cond.value, then: cond.value.then } as PropertyCondition }
  }
  condOpen.value = false
}
function clearCondition() {
  const s = condSection.value
  if (s?.conditions) { const c = { ...s.conditions }; delete c[condPid.value]; s.conditions = c }
  condOpen.value = false
}
const condSentence = computed(() => {
  let val = cond.value.value || '—'
  if (condKind.value === 'boolean') val = cond.value.value === 'false' ? t('False') : t('True')
  if (cond.value.operator === 'between') val = `${cond.value.value || '—'} ${t('and')} ${cond.value.valueEnd || '—'}`
  return {
    prop: prop(condPid.value)?.name ?? t('This property'),
    action: cond.value.then === 'show' ? t('shown') : t('hidden'),
    field: prop(cond.value.field)?.name ?? '—',
    op: condOpOptions.value.find((o) => o.value === cond.value.operator)?.label ?? '',
    val,
  }
})
function removeProperty(section: DetailLayoutSection, id: string) { section.propertyIds = section.propertyIds.filter((x) => x !== id) }

// Delete section — immediate (nothing is saved until "Save changes", so no confirm).
function deleteSection(s: DetailLayoutSection) {
  const tab = activeTab.value
  if (tab?.sections) tab.sections = tab.sections.filter((x) => x.id !== s.id)
}

// ── Drag & drop — the ERP standard (rule/dnd-live-sortable, same as edit-pipeline):
//    handle-initiated, ghost = whole card via setDragImage, LIVE sortable (reorder
//    on dragover), faded source (.is-dragging), FLIP-animated via <TransitionGroup>.
const secDragSrc = ref<number | null>(null)
function onSecDragStart(i: number, e: DragEvent) {
  secDragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
  const card = (e.target as HTMLElement).closest('.dlb-section') as HTMLElement | null
  if (card) e.dataTransfer!.setDragImage(card, 16, 16)
}
function onSecDragOver(i: number, e: DragEvent) {
  e.preventDefault(); e.dataTransfer!.dropEffect = 'move'
  const tab = activeTab.value
  if (!tab?.sections || secDragSrc.value === null || secDragSrc.value === i) return
  const arr = [...tab.sections]; const [m] = arr.splice(secDragSrc.value, 1); arr.splice(i, 0, m!)
  tab.sections = arr; secDragSrc.value = i
}
function onSecDragEnd() { secDragSrc.value = null }

const propDrag = ref<{ sec: string; src: number | null }>({ sec: '', src: null })
function onPropDragStart(section: DetailLayoutSection, i: number, e: DragEvent) {
  propDrag.value = { sec: section.id, src: i }
  e.dataTransfer!.effectAllowed = 'move'
  const card = (e.target as HTMLElement).closest('.dlb-prop') as HTMLElement | null
  if (card) e.dataTransfer!.setDragImage(card, 12, 12)
}
function onPropDragOver(section: DetailLayoutSection, i: number, e: DragEvent) {
  e.preventDefault(); e.dataTransfer!.dropEffect = 'move'
  if (propDrag.value.sec !== section.id || propDrag.value.src === null || propDrag.value.src === i) return
  const arr = [...section.propertyIds]; const [m] = arr.splice(propDrag.value.src, 1); arr.splice(i, 0, m!)
  section.propertyIds = arr; propDrag.value.src = i
}
function onPropDragEnd() { propDrag.value = { sec: '', src: null } }
</script>

<template>
  <div class="dlb">
    <!-- Title block -->
    <div class="dlb-titleblock">
      <h3 class="dlb-title">{{ t('Edit layout') }}</h3>
      <p class="dlb-desc">{{ t('Applies to the deal details page and the creation form.') }}</p>
    </div>

    <!-- Text tab strip (green underline) + New tab. Each tab reveals a kebab on
         hover: Rename (inline) / Delete. -->
    <div class="dlb-tabstrip">
      <div v-for="tp in detail.tabs" :key="tp.id" class="dlb-tab" :class="{ 'dlb-tab--active': tp.id === activeTabId }">
        <MpInput
          v-if="renamingTabId === tp.id" :id="`dlb-tabname-${tp.id}`" v-model="renameValue" class="dlb-tab-input"
          autofocus @keydown.enter="commitRenameTab(tp)" @keydown.esc="renamingTabId = ''" @blur="commitRenameTab(tp)"
        />
        <template v-else>
          <button type="button" class="dlb-tab-btn" @click="selectTab(tp.id)">{{ t(tp.label) }}</button>
          <span class="dlb-kebab dlb-tab-kebab">
            <MpPopover :id="`dlb-tab-${tp.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Tab actions')" @click.stop />
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="startRenameTab(tp)">{{ t('Rename tab') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="deleteTab(tp)">{{ t('Delete tab') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </span>
        </template>
      </div>
      <button type="button" class="dlb-newtab" @click="addTab"><MpIcon name="add" size="sm" />{{ t('New tab') }}</button>
    </div>

    <!-- Active tab body -->
    <div class="dlb-body">
      <template v-if="activeTab?.editable">
        <TransitionGroup name="dlb-sec" tag="div" class="dlb-sections">
          <section
            v-for="(section, si) in (activeTab.sections ?? [])" :key="section.id"
            class="dlb-section" :class="{ 'is-dragging': secDragSrc === si }"
            @dragover="onSecDragOver(si, $event)" @drop.prevent="onSecDragEnd"
          >
            <header class="dlb-sec-head">
              <span class="dlb-drag" draggable="true" :aria-label="t('Drag to reorder')" @dragstart="onSecDragStart(si, $event)" @dragend="onSecDragEnd"><MpIcon name="drag" size="sm" /></span>
              <span class="dlb-sec-name">{{ t(section.name) }}</span>
              <span class="dlb-spacer" />
              <span class="dlb-kebab">
                <MpPopover :id="`dlb-sec-${section.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Section actions')" />
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '180px' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openAddProperty(section)">{{ t('Add property') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="openEditSection(section)">{{ t('Edit section') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </span>
            </header>

            <TransitionGroup name="dlb-prop" tag="div" class="dlb-grid" :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }">
              <div
                v-for="(pid, pi) in section.propertyIds" :key="pid"
                class="dlb-prop" :class="{ 'is-dragging': propDrag.sec === section.id && propDrag.src === pi }"
                @dragover="onPropDragOver(section, pi, $event)" @drop.prevent="onPropDragEnd"
              >
                <span class="dlb-drag" draggable="true" :aria-label="t('Drag to reorder')" @dragstart="onPropDragStart(section, pi, $event)" @dragend="onPropDragEnd"><MpIcon name="drag" size="sm" /></span>
                <MpIcon :name="prop(pid)?.type ? DEAL_PROPERTY_TYPE_ICON[prop(pid)!.type] : 'text-editor-text'" size="sm" class="dlb-prop-type" />
                <div class="dlb-prop-text">
                  <span class="dlb-prop-label">{{ prop(pid)?.name ?? pid }}</span>
                  <span class="dlb-prop-var">{{ prop(pid)?.variableName ?? pid }}</span>
                </div>
                <MpTooltip v-if="section.conditions?.[pid]" :id="`dlb-cond-${section.id}-${pid}`" :label="t('Has conditional logic')" placement="top" use-portal>
                  <MpIcon name="condition" size="sm" class="dlb-prop-cond" />
                </MpTooltip>
                <span class="dlb-kebab">
                  <MpPopover :id="`dlb-prop-${section.id}-${pid}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton variant="ghost" is-rounded left-icon="menu-kebab" :aria-label="t('Property actions')" @click.stop />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '190px' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="openCondition(section, pid)">{{ t('Set conditional logic') }}</MpPopoverListItem>
                        <MpPopoverListItem @click="removeProperty(section, pid)">{{ t('Remove card') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </span>
              </div>
            </TransitionGroup>
            <p v-if="!section.propertyIds.length" class="dlb-empty">{{ t('No properties yet. Add one from the section menu.') }}</p>
          </section>
        </TransitionGroup>

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

    <!-- Add-property drawer (two-pane pick-many, same as Setup ▸ Access) -->
    <SelectAccessDrawer
      :open="addOpen"
      :title="t('Add property')"
      :list-title="t('Properties')"
      :options="addPropOptions"
      :model-value="addTarget?.propertyIds ?? []"
      :empty-title="t('No properties selected')"
      :empty-caption="t('Add properties from the left to show them in this section.')"
      @update:open="addOpen = $event"
      @save="onAddPropSave"
    >
      <template #footer-left>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="openNewProperty">{{ t('New property') }}</MpButton>
      </template>
    </SelectAccessDrawer>

    <!-- New-property drawer — swapped in from the Add-property footer, swaps back on save. -->
    <CrmPropertyDrawer :open="newPropOpen" mode="add" :property="null" @update:open="onNewPropertyClose" @save="onNewPropertySaved" />

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

    <!-- Conditional-logic modal (per property card) -->
    <MpModal id="dlb-cond-modal" :is-open="condOpen" :is-keep-alive="false" size="md" @close="condOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Conditional logic') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div class="dlb-cond-if">
            <div class="dlb-cond-head">
              <span class="dlb-cond-title">{{ t('If') }}</span>
              <MpTooltip id="dlb-cond-clear-tip" :label="t('Clear condition')" placement="top" use-portal>
                <MpButton variant="ghost" is-rounded left-icon="minus-circular" :aria-label="t('Clear condition')" @click="clearCondition" />
              </MpTooltip>
            </div>
            <ErpFilterSelect id="dlb-cond-field" class="dlb-cond-select" :placeholder="t('Select a property')" :model-value="cond.field" :options="condFieldOptions" :is-clearable="false" @update:model-value="onCondFieldChange" />
            <!-- Operator + value only appear once a property is chosen (first-run state = just the selector). -->
            <template v-if="cond.field">
              <ErpFilterSelect id="dlb-cond-op" class="dlb-cond-select" placeholder="" :model-value="cond.operator" :options="condOpOptions" :is-clearable="false" @update:model-value="(v: string) => (cond.operator = v as PropertyCondition['operator'])" />
              <MpSegmentedControl v-if="condKind === 'boolean'" id="dlb-cond-val" name="dlb-cond-val" :model-value="cond.value || 'true'" :data="BOOL_OPTIONS" @update:model-value="(v: string) => (cond.value = v)" />
              <div v-else-if="cond.operator === 'between'" class="dlb-cond-range">
                <MpDatePicker v-if="condKind === 'date'" id="dlb-cond-v1" v-model="cond.value" format="DD/MM/YYYY" value-type="format" use-portal />
                <MpInput v-else id="dlb-cond-v1" v-model="cond.value" type="number" is-full-width />
                <span class="dlb-cond-and">{{ t('and') }}</span>
                <MpDatePicker v-if="condKind === 'date'" id="dlb-cond-v2" v-model="cond.valueEnd" format="DD/MM/YYYY" value-type="format" use-portal />
                <MpInput v-else id="dlb-cond-v2" v-model="cond.valueEnd" type="number" is-full-width />
              </div>
              <MpDatePicker v-else-if="condKind === 'date'" id="dlb-cond-val-date" v-model="cond.value" format="DD/MM/YYYY" value-type="format" use-portal />
              <MpInput v-else-if="condKind === 'number'" id="dlb-cond-val-num" v-model="cond.value" type="number" is-full-width />
              <MpInput v-else id="dlb-cond-val-text" v-model="cond.value" is-full-width />
            </template>
          </div>
          <div class="dlb-cond-then" :class="{ 'dlb-cond-disabled': !cond.field }">
            <span class="dlb-cond-title">{{ t('Then') }}</span>
            <ErpFilterSelect id="dlb-cond-then" class="dlb-cond-select" :placeholder="t('Choose display option')" :model-value="cond.then" :options="THEN_OPTIONS" :is-clearable="false" @update:model-value="(v: string) => (cond.then = v as 'show' | 'hide')" />
          </div>
          <p v-if="cond.field && cond.then" class="dlb-cond-sentence">
            <strong>{{ condSentence.prop }}</strong> {{ t('will be') }} <strong>{{ condSentence.action }}</strong> {{ t('when') }} <strong>{{ condSentence.field }}</strong> {{ condSentence.op }} <strong>{{ condSentence.val }}</strong>.
          </p>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="condOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="applyCondition">{{ t('Apply') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.dlb { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Title block */
.dlb-titleblock { display: flex; flex-direction: column; gap: 2px; }
.dlb-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.dlb-desc { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); margin: 0; }

/* Text tab strip with a green active underline; each tab reveals a hover kebab */
.dlb-tabstrip { display: flex; align-items: center; gap: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.dlb-tab { position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 4px); }
.dlb-tab-btn { padding: var(--mp-spacing-3) 0; border: none; background: transparent; cursor: pointer; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #536062); }
.dlb-tab--active .dlb-tab-btn { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.dlb-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-colors-background-success-bold, #16b364); }
.dlb-tab-input { width: 132px; }
.dlb-tab-kebab { margin: -8px -6px -8px 0; }
.dlb-newtab { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) 0; border: none; background: transparent; cursor: pointer; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #536062); }
.dlb-newtab:hover { color: var(--mp-colors-text-default, #080d0e); }

/* Body */
.dlb-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
/* 32px gap between sections (Overview / Transaction data / Products), no divider. */
.dlb-sections { display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px); }
.dlb-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); border-radius: 8px; transition: opacity 0.12s ease; }
.dlb-sec-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Drag handle — default icon colour at 75% opacity (rule/dnd-live-sortable). */
.dlb-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-default, #536062); opacity: 0.75; cursor: grab; flex-shrink: 0; }
.dlb-drag:active { cursor: grabbing; }
.dlb-sec-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.dlb-spacer { flex: 1; }
/* Kebab reveals on card/section hover (or keyboard focus) only. */
.dlb-kebab { display: inline-flex; opacity: 0; transition: opacity 0.12s ease; }
.dlb-section:hover > .dlb-sec-head > .dlb-kebab, .dlb-prop:hover .dlb-kebab, .dlb-tab:hover .dlb-kebab, .dlb-kebab:focus-within { opacity: 1; }
/* Faded source while dragging + FLIP move animation (same feel as edit-pipeline). */
.dlb-section.is-dragging, .dlb-prop.is-dragging { opacity: 0.4; }
.dlb-sec-move { transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.dlb-prop-move { transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1); }

/* Property grid + field cards */
.dlb-grid { display: grid; gap: var(--mp-spacing-4); }
.dlb-prop { display: flex; align-items: center; gap: var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 8px; padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-neutral, #fff); min-width: 0; min-height: 56px; transition: opacity 0.12s ease, border-color 0.12s ease; }
.dlb-prop:hover { border-color: var(--mp-colors-border-bold, #8c9596); }
.dlb-prop-type { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.dlb-prop-cond { color: var(--mp-colors-icon-information, #2f6fd0); flex-shrink: 0; }
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

/* Edit-section modal fields */
.dlb-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.dlb-field + .dlb-field { margin-top: var(--mp-spacing-4); }
.dlb-field-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-inline-error { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-danger, #d92d20); margin: 0; }

/* Conditional-logic modal */
.dlb-cond-select { width: 100%; }
.dlb-cond-select :deep(.efs), .dlb-cond-select :deep(.efs-trigger) { width: 100%; }
.dlb-cond-if { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.dlb-cond-head { display: flex; align-items: center; justify-content: space-between; }
.dlb-cond-range { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.dlb-cond-and { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); flex-shrink: 0; }
/* First-run: Then is greyed until a property is chosen. */
.dlb-cond-disabled { opacity: 0.45; pointer-events: none; }
.dlb-cond-title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.dlb-cond-then { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-5); }
.dlb-cond-sentence { margin: var(--mp-spacing-5) 0 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); line-height: 1.5; }
.dlb-cond-sentence strong { color: var(--mp-colors-text-default, #080d0e); font-weight: var(--mp-font-weights-semi-bold, 600); }
</style>
