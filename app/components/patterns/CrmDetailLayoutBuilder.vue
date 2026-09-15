<script setup lang="ts">
/**
 * CrmDetailLayoutBuilder — the Layout tab ▸ "Details page" canvas of the Deals
 * module builder (Figma CRM 4244-18718). Concept mirrors HubSpot's edit-layout,
 * built with ERP components + tokens (/pixel-erp-design):
 *   "Edit layout" title → text tab strip (green underline; a FIXED set of tabs —
 *   no add/delete) → per-tab sections (plain titled groups) → property fields as
 *   bordered cards. A tab can only be renamed (hover kebab), never added or removed.
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
  DEAL_PROPERTY_TYPE_ICON, newDetailSectionId, isRelatedListType, sectionAllProps, distributeCols,
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
function selectTab(id: string) { activeTabId.value = id }
// Tabs are a FIXED set (seeded) — they can only be renamed, never added or
// deleted. Rename is inline from the hover kebab; nothing persists until the
// parent's "Save changes".
const renamingTabId = ref('')
const renameValue = ref('')
function startRenameTab(tp: DetailLayoutTab) { renamingTabId.value = tp.id; renameValue.value = t(tp.label) }
function commitRenameTab(tp: DetailLayoutTab) { if (renameValue.value.trim()) tp.label = renameValue.value.trim(); renamingTabId.value = '' }

// ── Property lookup ─────────────────────────────────────────────────────────────
function prop(id: string) { return props.properties.find((p) => p.id === id) }

// ── Sections ────────────────────────────────────────────────────────────────────
function addSection() {
  const tab = activeTab.value
  if (!tab?.editable) return
  tab.sections = tab.sections ?? []
  tab.sections.push({ id: newDetailSectionId(), name: t('New section'), columns: 3, cols: [[], [], []] })
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
  const s = editTarget.value
  if (s) {
    s.name = editName.value.trim()
    const n = Number(editCols.value) as ColCount
    if (n !== s.columns) { s.cols = distributeCols(sectionAllProps(s), n); s.columns = n }  // re-flow, keep reading order
  }
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
  for (const tp of props.detail.tabs) for (const s of tp.sections ?? []) if (s.id !== section.id) for (const id of sectionAllProps(s)) elsewhere.add(id)
  const own = new Set(sectionAllProps(section))
  return props.properties
    .filter((p) => own.has(p.id) || !elsewhere.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, subtitle: p.variableName, icon: DEAL_PROPERTY_TYPE_ICON[p.type] }))
})
// Reconcile the drawer's picked set into the section's columns: drop de-selected
// ids from every column, append newly-picked ids to the shortest column (keeps
// each column roughly balanced without disturbing existing arrangement).
function onAddPropSave(ids: string[]) {
  const s = addTarget.value
  if (s) {
    const keep = new Set(ids)
    s.cols = s.cols.map((col) => col.filter((id) => keep.has(id)))
    const present = new Set(sectionAllProps(s))
    for (const id of ids) if (!present.has(id)) {
      let shortest = 0
      for (let c = 1; c < s.cols.length; c++) if (s.cols[c]!.length < s.cols[shortest]!.length) shortest = c
      s.cols[shortest]!.push(id)
    }
  }
  addOpen.value = false
}

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
  props.properties.filter((p) => p.id !== condPid.value && !isRelatedListType(p.type)).map((p) => ({ value: p.id, label: p.name })),
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
function removeProperty(section: DetailLayoutSection, id: string) { section.cols = section.cols.map((c) => c.filter((x) => x !== id)) }

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

// ── Property-card reorder — POINTER-based, COLUMN-aware sortable ─────────────────
// The card LIFTS out and follows the cursor (a floating ghost, Teleported to the
// body). Its place in the list becomes a dashed drop-slot placeholder that live-
// moves as you drag — so surrounding cards FLIP-slide to open the gap where it
// will land. Works within a column or across to another (columns hold independent
// counts). Release drops it. Not native HTML5 DnD (which proved unreliable).
const propDrag = ref<{ sec: string; pid: string } | null>(null)
// Floating ghost that tracks the pointer (rendered via Teleport). `dx/dy` is where
// inside the card the user grabbed, so the ghost sits under the cursor naturally.
const ghost = ref<{ x: number; y: number; w: number; icon: string; label: string; variable: string } | null>(null)
let ghostDX = 0
let ghostDY = 0

function colsWrapEl(secId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-dlb-sec="${secId}"] .dlb-cols`)
}
/** Which column + row a property currently sits in. */
function locate(section: DetailLayoutSection, pid: string): { c: number; i: number } | null {
  for (let c = 0; c < section.cols.length; c++) {
    const i = section.cols[c]!.indexOf(pid)
    if (i >= 0) return { c, i }
  }
  return null
}
function onPropPointerDown(section: DetailLayoutSection, pid: string, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  const cardEl = (e.currentTarget as HTMLElement).closest('.dlb-prop') as HTMLElement | null
  const rect = cardEl?.getBoundingClientRect()
  const p = prop(pid)
  if (rect) {
    ghostDX = e.clientX - rect.left
    ghostDY = e.clientY - rect.top
    ghost.value = {
      x: rect.left, y: rect.top, w: rect.width,
      icon: p?.type ? DEAL_PROPERTY_TYPE_ICON[p.type] : 'text-editor-text',
      label: p?.name ?? pid, variable: p?.variableName ?? pid,
    }
  }
  propDrag.value = { sec: section.id, pid }

  const onMove = (ev: PointerEvent) => {
    const d = propDrag.value
    if (!d) return
    if (ghost.value) { ghost.value.x = ev.clientX - ghostDX; ghost.value.y = ev.clientY - ghostDY }
    const wrap = colsWrapEl(d.sec)
    if (!wrap) return
    const colEls = Array.from(wrap.querySelectorAll<HTMLElement>('.dlb-col'))
    if (!colEls.length) return
    // Target column: first whose right edge is past the cursor X (else the last).
    let tc = colEls.length - 1
    for (let c = 0; c < colEls.length; c++) {
      if (ev.clientX < colEls[c]!.getBoundingClientRect().right) { tc = c; break }
    }
    // Target row within that column: above a card's vertical midpoint → before it;
    // past all cards → the end.
    const cards = Array.from(colEls[tc]!.querySelectorAll<HTMLElement>('.dlb-prop'))
    let ti = cards.length
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k]!.getBoundingClientRect()
      if (ev.clientY < r.top + r.height / 2) { ti = k; break }
    }
    const loc = locate(section, d.pid)
    if (!loc) return
    if (loc.c === tc && loc.i === ti) return
    const cols = section.cols.map((a) => [...a])
    cols[loc.c]!.splice(loc.i, 1)
    let insert = ti
    if (loc.c === tc && loc.i < ti) insert -= 1     // same column, removed an earlier row
    cols[tc]!.splice(insert, 0, d.pid)
    section.cols = cols
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    propDrag.value = null
    ghost.value = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div class="dlb">
    <!-- Title block -->
    <div class="dlb-titleblock">
      <h3 class="dlb-title">{{ t('Edit layout') }}</h3>
      <p class="dlb-desc">{{ t('Applies to the deal details page and the creation form.') }}</p>
    </div>

    <!-- Text tab strip (green underline) — a FIXED set of tabs (no add / delete).
         Each tab reveals a kebab on hover with a single action: Rename (inline). -->
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
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </span>
        </template>
      </div>
    </div>

    <!-- Active tab body -->
    <div class="dlb-body">
      <template v-if="activeTab?.editable">
        <TransitionGroup name="dlb-sec" tag="div" class="dlb-sections">
          <section
            v-for="(section, si) in (activeTab.sections ?? [])" :key="section.id"
            :data-dlb-sec="section.id"
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

            <!-- Each column is its own drop list (independent card counts). -->
            <div class="dlb-cols" :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }">
              <TransitionGroup
                v-for="(col, ci) in section.cols" :key="ci"
                name="dlb-prop" tag="div" class="dlb-col"
              >
                <div
                  v-for="pid in col" :key="pid"
                  class="dlb-prop" :class="{ 'is-dragging': propDrag?.sec === section.id && propDrag?.pid === pid }"
                >
                  <span class="dlb-drag" :aria-label="t('Drag to reorder')" @pointerdown="onPropPointerDown(section, pid, $event)"><MpIcon name="drag" size="sm" /></span>
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
            </div>
            <p v-if="!section.cols.some((c) => c.length)" class="dlb-empty">{{ t('No properties yet. Add one from the section menu.') }}</p>
          </section>
        </TransitionGroup>

        <div class="dlb-add-section">
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addSection">{{ t('New section') }}</MpButton>
        </div>
      </template>
    </div>

    <!-- Add-property drawer (two-pane pick-many, same as Setup ▸ Access) -->
    <SelectAccessDrawer
      :open="addOpen"
      :title="t('Add property')"
      :list-title="t('Properties')"
      :options="addPropOptions"
      :model-value="addTarget ? sectionAllProps(addTarget) : []"
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
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="dlb-editsec-modal" :is-open="editOpen" :is-keep-alive="false" size="sm" @close="editOpen = false">
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
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="dlb-cond-modal" :is-open="condOpen" :is-keep-alive="false" size="md" @close="condOpen = false">
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

    <!-- Floating drag ghost — a lifted clone that follows the cursor while a
         property card is being dragged (the in-list card becomes a dashed slot). -->
    <Teleport to="body">
      <div v-if="ghost" class="dlb-ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px`, width: `${ghost.w}px` }">
        <span class="dlb-drag"><MpIcon name="drag" size="sm" /></span>
        <MpIcon :name="ghost.icon" size="sm" class="dlb-prop-type" />
        <div class="dlb-prop-text">
          <span class="dlb-prop-label">{{ ghost.label }}</span>
          <span class="dlb-prop-var">{{ ghost.variable }}</span>
        </div>
      </div>
    </Teleport>
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

/* Body */
.dlb-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
/* 32px gap between sections (Overview / Transaction data / Products), no divider. */
.dlb-sections { display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px); }
.dlb-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); border-radius: 8px; transition: opacity 0.12s ease; }
.dlb-sec-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Drag handle — default icon colour at 75% opacity (rule/dnd-live-sortable). */
.dlb-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-default, #536062); opacity: 0.75; cursor: grab; flex-shrink: 0; touch-action: none; user-select: none; -webkit-user-select: none; }
.dlb-drag:active { cursor: grabbing; }
.dlb-sec-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.dlb-spacer { flex: 1; }
/* Kebab reveals on card/section hover (or keyboard focus) only. */
.dlb-kebab { display: inline-flex; opacity: 0; transition: opacity 0.12s ease; }
.dlb-section:hover > .dlb-sec-head > .dlb-kebab, .dlb-prop:hover .dlb-kebab, .dlb-tab:hover .dlb-kebab, .dlb-kebab:focus-within { opacity: 1; }
/* Section drag: faded source (same feel as edit-pipeline). */
.dlb-section.is-dragging { opacity: 0.4; }
/* Property card drag: the source card becomes a DASHED DROP-SLOT placeholder (its
   content hidden, size kept) so surrounding cards FLIP-slide to open the gap where
   the card will land. The lifted card itself is the floating .dlb-ghost. */
.dlb-prop.is-dragging {
  border-style: dashed;
  border-color: var(--mp-colors-border-brand, #0a6e4e);
  background: var(--mp-colors-background-brand-subtle, #f0f7f4);
  box-shadow: none;
}
.dlb-prop.is-dragging > * { visibility: hidden; }
/* The floating ghost that tracks the cursor — a lifted clone (drop shadow + slight
   tilt). Deviates from rule/surface-border-no-shadow ON PURPOSE: transient drag
   affordance, not a resting surface. */
.dlb-ghost {
  position: fixed; z-index: 1000; pointer-events: none;
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  border: 1px solid var(--mp-colors-border-bold, #8c9596); border-radius: 8px;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-neutral, #fff); min-height: 56px;
  box-shadow: 0 12px 28px rgba(8, 13, 14, 0.18), 0 2px 6px rgba(8, 13, 14, 0.12);
  transform: rotate(-1.5deg) scale(1.03); transform-origin: center;
  cursor: grabbing;
}
.dlb-sec-move { transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
/* FLIP: siblings slide to open/close the gap; enter/leave fade the slot smoothly. */
.dlb-prop-move { transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.dlb-prop-enter-active, .dlb-prop-leave-active { transition: opacity 0.15s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.dlb-prop-leave-active { position: absolute; }
.dlb-prop-enter-from, .dlb-prop-leave-to { opacity: 0; }

/* Property grid + field cards */
/* Columns are independent lists. Each .dlb-col is a vertical stack (also a drop
   target); min-height keeps an empty column droppable. padding-bottom leaves a
   strip under the last card so "drop below the last card" still lands in-column. */
.dlb-cols { display: grid; gap: var(--mp-spacing-4); align-items: start; }
.dlb-col { position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 56px; padding-bottom: var(--mp-spacing-4); min-width: 0; }
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
