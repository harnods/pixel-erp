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
  MpButtonGroup, MpCheckbox, MpTextarea, MpAutocomplete, MpUpload,
  MpFormControl, MpFormLabel, MpInputGroup, MpInputLeftAddon,
} from '@mekari/pixel3'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import CrmPropertyDrawer from '~/components/patterns/CrmPropertyDrawer.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  DEAL_PROPERTY_TYPE_ICON, newDetailSectionId, isRelatedListType, sectionAllProps, distributeCols,
  type DealDetailLayout, type DetailLayoutSection, type DetailLayoutTab,
  type DealProperty, type DealPropertyType, type DealPropertyConfig, type PropertyCondition,
  type CrmConversionTarget,
} from '~/data/crm'

type NewPropertyPayload = { name: string; variableName: string; type: DealPropertyType; config: DealPropertyConfig }

const props = withDefaults(defineProps<{
  detail: DealDetailLayout
  properties: DealProperty[]
  createProperty: (payload: NewPropertyPayload) => DealProperty
  moduleIcon?: string
  moduleId?: string
  readonly?: boolean
}>(), { moduleIcon: 'pipeline', moduleId: '', readonly: false })
const emit = defineEmits<{ 'update:erp-target': [target: CrmConversionTarget] }>()
const { t } = useLocale()

// ── ERP transaction target (orders tab) ─────────────────────────────────────────
const ERP_TARGET_OPTIONS = [
  { value: 'sales-order', label: 'Sales order list' },
  { value: 'sales-quote', label: 'Sales quote list' },
]
function ordersTab(): DetailLayoutTab | undefined { return props.detail.tabs.find((tp) => tp.key === 'orders') }
function onErpTargetChange(val: string) {
  const tab = ordersTab()
  const target = (val as CrmConversionTarget) || null
  if (tab) {
    tab.erpTarget = target
    tab.label = target === 'sales-order' ? 'Sales order list' : target === 'sales-quote' ? 'Sales quote list' : 'ERP transactions'
  }
  emit('update:erp-target', target)
}

// ── Preview layout drawer ───────────────────────────────────────────────────────
const previewOpen = ref(false)
const previewMode = ref<'form' | 'details'>('details')
const PREVIEW_MODES = [
  { id: 'prev-form', label: 'Form', value: 'form' },
  { id: 'prev-details', label: 'Details record', value: 'details' },
]
const DUMMY_DATA: Record<string, string> = {
  'deal-name': 'Annual espresso contract', 'deal-value': 'Rp 19.200.000', 'company': 'Kopi Kenangan Pusat',
  'contact-person': 'Ratna Sari', 'contact-person-email': 'buyer@kopikenangan.com', 'contact-person-phone': '+62 811 5550 006',
  'owner': 'Dewi Lestari', 'currency': 'IDR', 'billing-address': 'Jl. Menteng Raya No. 42, Jakarta',
  'transaction-date': '15/09/2026', 'due-date': '15/10/2026', 'close-date': '30/09/2026',
  'transaction-no': 'TXN-0913', 'reference-no': 'RFQ-8815', 'payment-terms': 'Net 30',
  'exchange-rate': '1.00', 'warehouse': 'Gudang Utama', 'shipping-address': 'Jl. Menteng Raya No. 42',
  'shipping-date': '16/09/2026', 'delivery-date': '18/09/2026', 'ship-via': 'JNE Regular',
  'tracking-no': 'JNE-88150913', 'shipping-fee': 'Rp 150.000',
  'discount': '5%', 'global-discount': '0%', 'tax': 'PPN 11%', 'tax-inclusive': 'No', 'tax-after-discount': 'Yes',
  'memo': 'Twelve-month espresso bean supply across all outlets.', 'attachment': '—', 'message': '—',
  'service-type': 'Consultation', 'priority': 'High',
  'record-name': 'Annual espresso contract', 'record-value': 'Rp 19.200.000',
}
const PREVIEW_STAGES = ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', 'Won']
const previewActiveTab = ref('details')
const previewTabs = computed(() => {
  const editable = props.detail.tabs.filter((tp) => tp.editable && tp.visible)
  const system: { key: string; label: string }[] = []
  for (const tp of props.detail.tabs) {
    if (tp.editable || !tp.visible) continue
    if (tp.key === 'orders' && !tp.erpTarget) continue
    system.push({ key: tp.key, label: tp.key === 'orders' ? (tp.erpTarget === 'sales-order' ? 'Sales order list' : 'Sales quote list') : tp.label })
  }
  return [...editable.map((tp) => ({ key: tp.key, label: tp.label })), ...system]
})
function detailsTabSections() {
  const tp = props.detail.tabs.find((t) => t.editable && t.visible)
  return tp?.sections ?? []
}

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
  <div class="dlb" :class="{ 'dlb--readonly': readonly }">
    <!-- Title block -->
    <div class="dlb-titleblock" data-devchange="crm-layout-preview">
      <div class="dlb-title-row">
        <div>
          <h3 class="dlb-title">{{ readonly ? t('Layout') : t('Edit layout') }}</h3>
          <p class="dlb-desc">{{ t('Applies to the record details page and the creation form.') }}</p>
        </div>
        <MpButton v-if="!readonly" variant="secondary" is-rounded left-icon="show" @click="previewOpen = true">{{ t('Preview layout') }}</MpButton>
      </div>
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

      <!-- Non-editable system tabs (Activity, Notes, Files, ERP transactions) -->
      <template v-else-if="activeTab">
        <div v-if="activeTab.key === 'activity'" class="dlb-system-tab" data-devchange="crm-layout-system-tabs">
          <MpIcon name="chart-line" size="md" class="dlb-system-icon" />
          <p class="dlb-system-label">{{ t('Activity log') }}</p>
          <p class="dlb-system-desc">{{ t('Shows a chronological log of all record activities. This section is fixed and cannot be customized.') }}</p>
        </div>
        <div v-else-if="activeTab.key === 'notes'" class="dlb-system-tab">
          <MpIcon name="textarea" size="md" class="dlb-system-icon" />
          <p class="dlb-system-label">{{ t('Notes') }}</p>
          <p class="dlb-system-desc">{{ t('A collaborative notes area for the record. This section is fixed and cannot be customized.') }}</p>
        </div>
        <div v-else-if="activeTab.key === 'files'" class="dlb-system-tab">
          <MpIcon name="attachment" size="md" class="dlb-system-icon" />
          <p class="dlb-system-label">{{ t('Files') }}</p>
          <p class="dlb-system-desc">{{ t('Uploaded files and attachments for this record. This section is fixed and cannot be customized.') }}</p>
        </div>
        <div v-else-if="activeTab.key === 'orders'" class="dlb-system-tab" data-devchange="crm-layout-erp-target">
          <MpIcon name="sales" size="md" class="dlb-system-icon" />
          <p class="dlb-system-label">{{ t('ERP transactions') }}</p>
          <template v-if="readonly">
            <p class="dlb-system-desc">{{ activeTab.erpTarget ? t(ERP_TARGET_OPTIONS.find(o => o.value === activeTab.erpTarget)?.label ?? 'ERP transactions') : t('No transaction type selected.') }}</p>
          </template>
          <template v-else>
            <p class="dlb-system-desc">{{ t('Choose which ERP transaction list to show on this tab. This determines the conversion target for records in this module.') }}</p>
            <div class="dlb-erp-picker">
              <span class="dlb-erp-picker-label">{{ t('Transaction type') }}</span>
              <ErpFilterSelect
                id="dlb-erp-target"
                class="dlb-erp-select"
                :placeholder="t('Select transaction type')"
                :model-value="activeTab.erpTarget ?? ''"
                :options="ERP_TARGET_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))"
                :is-clearable="false"
                @update:model-value="onErpTargetChange"
              />
            </div>
          </template>
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

    <!-- Floating drag ghost -->
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

    <!-- Preview layout drawer (full screen) -->
    <Teleport to="body">
      <Transition name="dlb-preview">
        <div v-if="previewOpen" class="dlb-preview-overlay" data-devchange="crm-layout-preview">
          <div class="dlb-preview-panel" role="dialog">
            <header class="dlb-preview-header">
              <h3 class="dlb-preview-title">{{ t('Preview layout') }}</h3>
              <MpSegmentedControl id="dlb-preview-mode" name="dlb-preview-mode" v-model="previewMode" :data="PREVIEW_MODES" />
              <span class="dlb-spacer" />
              <MpButton variant="ghost" is-rounded left-icon="close" :aria-label="t('Close')" @click="previewOpen = false" />
            </header>
            <div class="dlb-preview-body">
              <!-- Details record preview -->
              <template v-if="previewMode === 'details'">
                <div class="dlb-prev-record">
                  <!-- Title bar -->
                  <div class="dlb-prev-titlebar">
                    <div class="dlb-prev-breadcrumb">{{ t('Deals') }}</div>
                    <div class="dlb-prev-titlerow">
                      <h2 class="dlb-prev-dealname">{{ DUMMY_DATA['deal-name'] || DUMMY_DATA['record-name'] || 'Deal name' }}</h2>
                      <span class="dlb-prev-action-btn">{{ t('Mark as won') }}</span>
                    </div>
                  </div>
                  <!-- Pipeline stepper -->
                  <div class="dlb-prev-stepper">
                    <div class="dlb-prev-stepper-labels">
                      <span v-for="(s, i) in PREVIEW_STAGES" :key="i" class="dlb-prev-step-label" :class="{ 'dlb-prev-step-label--active': i === 2 }">{{ t(s) }}</span>
                    </div>
                    <div class="dlb-prev-stepper-bar">
                      <span v-for="(_, i) in PREVIEW_STAGES" :key="i" class="dlb-prev-bar-seg" :class="{ 'dlb-prev-bar-seg--filled': i <= 2 }" />
                    </div>
                  </div>
                  <!-- Tabs -->
                  <div class="dlb-prev-tabs">
                    <button v-for="tb in previewTabs" :key="tb.key" class="dlb-prev-tab-btn" :class="{ 'dlb-prev-tab-btn--active': previewActiveTab === tb.key }" @click="previewActiveTab = tb.key">{{ t(tb.label) }}</button>
                  </div>
                  <!-- Tab content -->
                  <div class="dlb-prev-tab-content">
                    <!-- Editable details tab -->
                    <template v-if="previewActiveTab === 'details'">
                      <div v-for="section in detailsTabSections()" :key="section.id" class="dlb-prev-section">
                        <h5 v-if="section.name" class="dlb-prev-sec-name">{{ t(section.name) }}</h5>
                        <div v-if="section.kind === 'products'" class="dlb-prev-products">
                          <table class="dlb-prev-table">
                            <thead><tr><th>{{ t('Product') }}</th><th>{{ t('Description') }}</th><th class="dlb-prev-th--num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="dlb-prev-th--num">{{ t('Unit price') }}</th><th class="dlb-prev-th--num">{{ t('Discount') }}</th><th>{{ t('Tax') }}</th></tr></thead>
                            <tbody>
                              <tr><td>Espresso Blend 1kg</td><td class="dlb-prev-td--muted">Premium single-origin</td><td class="dlb-prev-td--num">60</td><td>bag</td><td class="dlb-prev-td--num">Rp 320.000</td><td class="dlb-prev-td--num">0%</td><td>PPN 11%</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div v-else class="dlb-prev-content-grid" :style="{ '--dlb-cols': Math.max(1, section.columns - 1) }">
                          <div v-for="(col, ci) in section.cols" :key="ci" class="dlb-prev-content-col">
                            <div v-for="pid in col" :key="pid" class="dlb-prev-cl">
                              <span class="dlb-prev-cl-label">{{ prop(pid)?.name ?? pid }}</span>
                              <span class="dlb-prev-cl-value">{{ DUMMY_DATA[pid] || '—' }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- System tabs with dummy data -->
                    <template v-else-if="previewActiveTab === 'activity'">
                      <table class="dlb-prev-table">
                        <thead><tr><th>{{ t('Date') }}</th><th>{{ t('User') }}</th><th>{{ t('Action') }}</th></tr></thead>
                        <tbody>
                          <tr><td>20 Sep 2026, 14:30</td><td>Dewi Lestari</td><td>{{ t('Moved stage from Open Lead to 1st Meeting') }}</td></tr>
                          <tr><td>18 Sep 2026, 09:15</td><td>Rizal Candra</td><td>{{ t('Created deal') }}</td></tr>
                        </tbody>
                      </table>
                    </template>
                    <template v-else-if="previewActiveTab === 'notes'">
                      <div class="dlb-prev-notes-list">
                        <div class="dlb-prev-note">
                          <div class="dlb-prev-note-header"><strong>Dewi Lestari</strong><span class="dlb-prev-note-date">20 Sep 2026, 14:30</span></div>
                          <p class="dlb-prev-note-body">{{ t('Follow up call scheduled for next week. Client interested in premium blend.') }}</p>
                        </div>
                        <div class="dlb-prev-note">
                          <div class="dlb-prev-note-header"><strong>Rizal Candra</strong><span class="dlb-prev-note-date">18 Sep 2026, 09:15</span></div>
                          <p class="dlb-prev-note-body">{{ t('Initial meeting went well. Sent catalog and price list.') }}</p>
                        </div>
                      </div>
                    </template>
                    <template v-else-if="previewActiveTab === 'files'">
                      <table class="dlb-prev-table">
                        <thead><tr><th>{{ t('File name') }}</th><th>{{ t('Size') }}</th><th>{{ t('Uploaded by') }}</th><th>{{ t('Date') }}</th></tr></thead>
                        <tbody>
                          <tr><td>Proposal_Espresso_2026.pdf</td><td>2.4 MB</td><td>Dewi Lestari</td><td>19 Sep 2026</td></tr>
                          <tr><td>Price_List_Q4.xlsx</td><td>156 KB</td><td>Rizal Candra</td><td>18 Sep 2026</td></tr>
                        </tbody>
                      </table>
                    </template>
                    <template v-else-if="previewActiveTab === 'orders'">
                      <table class="dlb-prev-table">
                        <thead><tr><th>{{ t('Transaction no.') }}</th><th>{{ t('Date') }}</th><th>{{ t('Customer') }}</th><th>{{ t('Amount') }}</th><th>{{ t('Status') }}</th></tr></thead>
                        <tbody>
                          <tr><td>SO-20260920-001</td><td>20 Sep 2026</td><td>Kopi Kenangan Pusat</td><td>Rp 19.200.000</td><td><span class="dlb-prev-status dlb-prev-status--open">Open</span></td></tr>
                        </tbody>
                      </table>
                    </template>
                  </div>
                </div>
              </template>
              <!-- Form preview — hardcoded copy of NewCrmDealPage structure -->
              <template v-else>
                <div class="si-form-page dlb-prev-form-page">
                  <div class="si-form-stage">
                    <!-- Section 1: Deal name — standalone, dashed divider -->
                    <section class="si-header1 si-dashed-divider">
                      <MpFormControl id="fp-deal-name" class="si-field" style="flex:0 0 var(--si-field-wide)">
                        <MpFormLabel>{{ t('Deal name') }}</MpFormLabel>
                        <MpInput id="fp-deal-name-inp" is-full-width disabled />
                      </MpFormControl>
                    </section>

                    <!-- Section 2: Contact + Company + Deal value -->
                    <section class="si-header1 si-dashed-divider">
                      <MpFormControl id="fp-contact" class="si-field" style="flex:0 0 var(--si-field-wide)" is-required>
                        <MpFormLabel>{{ t('Contact') }}</MpFormLabel>
                        <MpAutocomplete id="fp-contact-inp" :data="[]" :placeholder="t('Select contact')" is-full-width use-portal disabled />
                      </MpFormControl>
                      <MpFormControl id="fp-company" class="si-field" style="flex:0 0 var(--si-field-wide)">
                        <MpFormLabel>{{ t('Company') }}</MpFormLabel>
                        <MpAutocomplete id="fp-company-inp" :data="[]" :placeholder="t('Select company')" is-full-width use-portal disabled />
                      </MpFormControl>
                      <div class="si-header1-total">
                        <h3 class="si-header1-total-value">{{ t('Deal value') }} Rp 0</h3>
                      </div>
                    </section>

                    <!-- Section 3: Header fields — 4 columns like the real form -->
                    <section class="si-header2">
                      <!-- Col 1: Billing address + Requires shipping -->
                      <div class="si-header2-col">
                        <MpFormControl id="fp-billing" class="si-field">
                          <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
                          <MpTextarea id="fp-billing-inp" is-full-width disabled />
                        </MpFormControl>
                        <MpCheckbox id="fp-requires-shipping" :is-checked="false" disabled>{{ t('Requires shipping') }}</MpCheckbox>
                      </div>
                      <!-- Col 2: Dates + terms -->
                      <div class="si-header2-col">
                        <MpFormControl id="fp-tx-date" class="si-field">
                          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
                          <MpDatePicker id="fp-tx-date-inp" class="dlb-fp-datepicker" format="DD/MM/YYYY" value-type="format" use-portal disabled />
                        </MpFormControl>
                        <MpFormControl id="fp-close-date" class="si-field">
                          <MpFormLabel>{{ t('Close date') }}</MpFormLabel>
                          <MpDatePicker id="fp-close-date-inp" class="dlb-fp-datepicker" format="DD/MM/YYYY" value-type="format" use-portal disabled />
                        </MpFormControl>
                        <MpFormControl id="fp-payment" class="si-field">
                          <MpFormLabel>{{ t('Payment terms') }}</MpFormLabel>
                          <MpAutocomplete id="fp-payment-inp" :data="[]" is-full-width use-portal disabled />
                        </MpFormControl>
                      </div>
                      <!-- Col 3: References -->
                      <div class="si-header2-col">
                        <MpFormControl id="fp-tx-no" class="si-field">
                          <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
                          <MpInput id="fp-tx-no-inp" :placeholder="t('Auto')" is-disabled is-full-width />
                        </MpFormControl>
                        <MpFormControl id="fp-ref" class="si-field">
                          <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
                          <MpInput id="fp-ref-inp" is-full-width disabled />
                        </MpFormControl>
                        <MpFormControl id="fp-warehouse" class="si-field">
                          <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
                          <MpAutocomplete id="fp-warehouse-inp" :data="[]" :placeholder="t('Select warehouse')" is-full-width use-portal disabled />
                        </MpFormControl>
                      </div>
                    </section>

                    <!-- Line items -->
                    <section class="si-items-section">
                      <div class="si-items-header-row">
                        <MpCheckbox id="fp-price-incl-tax" :is-checked="false" disabled>{{ t('Price includes tax') }}</MpCheckbox>
                      </div>
                      <div class="si-items-scroll">
                        <table class="si-items-table">
                          <colgroup>
                            <col class="si-col-drag" /><col class="si-col-product" /><col class="si-col-desc" />
                            <col class="si-col-qty" /><col class="si-col-unit" /><col class="si-col-price" />
                            <col class="si-col-discount" /><col class="si-col-tax" /><col class="si-col-amount" />
                            <col class="si-col-del" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th class="si-th si-th--drag" />
                              <th class="si-th">{{ t('Product') }}</th>
                              <th class="si-th">{{ t('Description') }}</th>
                              <th class="si-th">{{ t('Qty') }}</th>
                              <th class="si-th">{{ t('Unit') }}</th>
                              <th class="si-th">{{ t('Unit price') }}</th>
                              <th class="si-th">{{ t('Discount') }}</th>
                              <th class="si-th">{{ t('Tax') }}</th>
                              <th class="si-th">{{ t('Amount') }}</th>
                              <th class="si-th si-th--del" />
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td class="si-td si-td--drag si-td--border"><MpIcon name="drag" size="sm" /></td>
                              <td class="si-td si-td--input si-td--border"><MpInput is-full-width disabled :placeholder="t('Select product')" /></td>
                              <td class="si-td si-td--input si-td--border"><MpInput is-full-width disabled /></td>
                              <td class="si-td si-td--input si-td--border"><MpInput type="number" model-value="1" is-full-width disabled /></td>
                              <td class="si-td si-td--border si-td--affix si-td--calc"><div class="si-affix-cell"><span class="si-unit-ro">—</span></div></td>
                              <td class="si-td si-td--input si-td--border si-td--affix"><div class="si-affix-cell"><span class="si-affix">Rp</span><MpInput type="number" model-value="0" is-full-width disabled class="dlb-fp-affix-input" /></div></td>
                              <td class="si-td si-td--input si-td--border si-td--affix"><div class="si-affix-cell"><MpInput type="number" model-value="0" is-full-width disabled class="dlb-fp-affix-input" /><span class="si-affix">%</span></div></td>
                              <td class="si-td si-td--input si-td--border"><MpAutocomplete :data="[]" is-full-width use-portal disabled /></td>
                              <td class="si-td si-td--border si-td--affix si-td--calc"><div class="si-affix-cell"><span class="si-affix">Rp</span><span class="si-affix-value">0</span></div></td>
                              <td class="si-td si-td--del" />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <!-- Bottom: Message + Memo + Attachment (left) | Totals (right) -->
                    <section class="si-bottom-section">
                      <div class="si-notes-col">
                        <MpFormControl id="fp-message" class="si-note-field">
                          <MpFormLabel>{{ t('Message') }}</MpFormLabel>
                          <MpTextarea id="fp-message-inp" is-full-width disabled />
                        </MpFormControl>
                        <MpFormControl id="fp-memo" class="si-note-field">
                          <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
                          <MpTextarea id="fp-memo-inp" is-full-width disabled />
                          <span class="si-field-caption">{{ t('Only visible to you and your team') }}</span>
                        </MpFormControl>
                        <div class="si-attachment-section">
                          <span class="si-attachment-label">{{ t('Attachment') }}</span>
                          <MpUpload id="fp-attachment" :button-text="t('Choose file')" :placeholder="t('or drag and drop here')" is-full-width disabled />
                          <p class="si-field-caption">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
                        </div>
                      </div>
                      <div class="si-totals-col">
                        <div class="si-totals-row si-totals-row--h3"><span>{{ t('Subtotal') }}</span><span>Rp 0</span></div>
                        <div class="si-discount-block">
                          <div class="si-discount-rows">
                            <div class="si-totals-row"><span>{{ t('Discount per line') }}</span><span class="si-deduction">(Rp 0)</span></div>
                            <div class="si-totals-row">
                              <span class="si-inline-field-label">
                                <span>{{ t('Global discount') }}</span>
                                <MpInputGroup id="fp-global-discount-group" class="si-unit-field">
                                  <MpInputLeftAddon has-background class="si-unit-addon"><span class="dlb-fp-unit-label">Rp</span></MpInputLeftAddon>
                                  <MpInput type="number" model-value="0" is-full-width disabled />
                                </MpInputGroup>
                              </span>
                              <span class="si-deduction">(Rp 0)</span>
                            </div>
                          </div>
                        </div>
                        <div class="si-totals-row"><span>{{ t('Tax') }}</span><span>Rp 0</span></div>
                        <div class="si-total-rule" />
                        <div class="si-totals-row si-totals-row--h3"><span>{{ t('Total') }}</span><span>Rp 0</span></div>
                      </div>
                    </section>

                    <!-- Footer -->
                    <MpButtonGroup class="erp-action-footer si-form-footer">
                      <MpButton variant="ghost" is-rounded disabled>{{ t('Cancel') }}</MpButton>
                      <MpButton variant="primary" is-rounded disabled>{{ t('Save') }}</MpButton>
                    </MpButtonGroup>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dlb { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Title block */
.dlb-titleblock { display: flex; flex-direction: column; gap: 2px; }
.dlb-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
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
  box-shadow: none; /* pixel-police-allow-shadow — resetting shadow on drag placeholder */
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
  box-shadow: 0 12px 28px var(--mp-colors-overlay, rgba(8, 13, 14, 0.18)), 0 2px 6px var(--mp-colors-overlay, rgba(8, 13, 14, 0.12)); /* pixel-police-allow-shadow — drag ghost */
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

/* System tabs (Activity / Notes / Files / ERP transactions) */
.dlb-system-tab { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-10, 40px) var(--mp-spacing-6); text-align: center; }
.dlb-system-icon { color: var(--mp-colors-icon-default, #536062); }
.dlb-system-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.dlb-system-desc { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); margin: 0; max-width: 360px; }
.dlb-erp-picker { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); width: 100%; max-width: 320px; text-align: left; }
.dlb-erp-picker-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-erp-select { width: 100%; }
.dlb-erp-select :deep(.efs), .dlb-erp-select :deep(.efs-trigger) { width: 100%; }

/* Preview layout drawer (full screen) */
.dlb-preview-overlay { position: fixed; inset: 0; z-index: 9999; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: center; align-items: stretch; }
.dlb-preview-panel { margin: 12px; width: calc(100% - 24px); height: calc(100% - 24px); border-radius: 12px; background: var(--mp-colors-background-neutral, #fff); display: flex; flex-direction: column; overflow: hidden; }
.dlb-preview-header { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4) var(--mp-spacing-6); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.dlb-preview-header :deep(.mp-segmented-control) { width: auto; flex-shrink: 0; }
.dlb-preview-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.dlb-preview-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-8); }
/* Preview record — mirrors CrmDealDetailPage layout */
.dlb-prev-record { display: flex; flex-direction: column; gap: 0; }
/* Title bar */
.dlb-prev-titlebar { padding-bottom: var(--mp-spacing-4); }
.dlb-prev-breadcrumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); margin-bottom: var(--mp-spacing-1); }
.dlb-prev-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.dlb-prev-dealname { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); margin: 0; flex: 1; }
.dlb-prev-action-btn { display: inline-flex; align-items: center; padding: var(--mp-spacing-1-5) var(--mp-spacing-4); background: var(--mp-colors-background-success-bold, #16b364); color: var(--mp-colors-text-on-color, #fff); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); cursor: default; }
/* Pipeline stepper */
.dlb-prev-stepper { padding: var(--mp-spacing-2) 0 var(--mp-spacing-5); }
.dlb-prev-stepper-labels { display: flex; margin-bottom: var(--mp-spacing-1); }
.dlb-prev-step-label { flex: 1; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-prev-step-label--active { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.dlb-prev-stepper-bar { display: flex; gap: 2px; }
.dlb-prev-bar-seg { flex: 1; height: 12px; background: var(--mp-color-neutral-40, #d0d5dd); }
.dlb-prev-bar-seg--filled { background: var(--mp-border-selected, #029861); }
/* Tabs (styled like MpTabs in the detail page) */
.dlb-prev-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); margin-bottom: var(--mp-spacing-5); }
.dlb-prev-tab-btn { background: none; border: none; border-bottom: 2px solid transparent; padding: var(--mp-spacing-3) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); cursor: pointer; white-space: nowrap; }
.dlb-prev-tab-btn:hover { color: var(--mp-colors-text-default, #080d0e); }
.dlb-prev-tab-btn--active { color: var(--mp-colors-text-default, #080d0e); font-weight: var(--mp-font-weights-semi-bold, 600); border-bottom-color: var(--mp-colors-background-success-bold, #16b364); }
/* Tab content area */
.dlb-prev-tab-content { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
/* Sections */
.dlb-prev-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.dlb-prev-sec-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
/* Content-list grid (mirrors content-list-grid from CrmDealDetailPage) */
.dlb-prev-content-grid { display: grid; grid-template-columns: minmax(0, var(--mp-sizes-80, 318px)) repeat(var(--dlb-cols, 1), minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: 0; }
.dlb-prev-content-col { display: flex; flex-direction: column; min-width: 0; }
.dlb-prev-cl { display: flex; flex-direction: column; gap: 2px; padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-colors-border-subtle, #f0f2f3); }
.dlb-prev-cl-label { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-prev-cl-value { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }
/* Placeholder for system tabs */
.dlb-prev-placeholder { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); margin: 0; padding: var(--mp-spacing-10) 0; text-align: center; border: 1px dashed var(--mp-colors-border-default, #e3e7e9); border-radius: 8px; }
/* Product table */
.dlb-prev-products { border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: 0; overflow: hidden; }
.dlb-prev-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md, 14px); }
.dlb-prev-table th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-colors-background-neutral-subtle, #f7f8f8); font-weight: var(--mp-font-weights-semi-bold, 600); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.dlb-prev-table td { padding: var(--mp-spacing-2) var(--mp-spacing-3); color: var(--mp-colors-text-default, #080d0e); vertical-align: top; }
.dlb-prev-th--num, .dlb-prev-td--num { text-align: right; }
.dlb-prev-td--muted { color: var(--mp-colors-text-secondary, #6b7678); }
/* Notes tab dummy */
.dlb-prev-notes-list { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.dlb-prev-note { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-colors-border-subtle, #f0f2f3); }
.dlb-prev-note-header { display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm, 12px); }
.dlb-prev-note-date { color: var(--mp-colors-text-secondary, #6b7678); }
.dlb-prev-note-body { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
/* Status badge */
.dlb-prev-status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); }
.dlb-prev-status--open { background: var(--mp-colors-background-info-subtle, #e8f4fd); color: var(--mp-colors-text-info, #1d6fb8); }
/* Form preview — copies si-* layout rules from NewCrmDealPage (scoped there, so duplicated here) */
.dlb-prev-form-page {
  --si-field-wide: 318px;
  --si-field: 228px;
  height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.dlb-prev-form-page .si-form-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.dlb-prev-form-page .si-dashed-divider { padding-bottom: var(--mp-spacing-5); border-bottom: 1px dashed var(--mp-border-default, #e3e7e9); }
.dlb-prev-form-page .si-header1 { display: flex; align-items: flex-start; gap: 16px 24px; flex-wrap: wrap; }
.dlb-prev-form-page .si-header1 > .si-field { flex: 0 0 var(--si-field-wide); }
.dlb-prev-form-page .si-header1-total { margin-left: auto; align-self: flex-end; padding-bottom: var(--mp-spacing-2); }
.dlb-prev-form-page .si-header1-total-value { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.dlb-prev-form-page .si-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.dlb-prev-form-page .si-header2-col { flex: 0 0 var(--si-field-wide); min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.dlb-prev-form-page .si-field { min-width: 0; }
.dlb-prev-form-page .si-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.dlb-prev-form-page .si-items-header-row { display: flex; justify-content: flex-end; }
.dlb-prev-form-page .si-items-scroll { overflow-x: auto; }
.dlb-prev-form-page .si-items-table { width: 100%; min-width: 1340px; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.dlb-prev-form-page .si-col-drag { width: 44px; }
.dlb-prev-form-page .si-col-product { width: 280px; }
.dlb-prev-form-page .si-col-desc { width: auto; }
.dlb-prev-form-page .si-col-qty { width: 64px; }
.dlb-prev-form-page .si-col-unit { width: 104px; }
.dlb-prev-form-page .si-col-price { width: 164px; }
.dlb-prev-form-page .si-col-discount { width: 88px; }
.dlb-prev-form-page .si-col-tax { width: 128px; }
.dlb-prev-form-page .si-col-amount { width: 164px; }
.dlb-prev-form-page .si-col-del { width: 52px; }
.dlb-prev-form-page .si-th {
  height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.dlb-prev-form-page .si-th--drag, .dlb-prev-form-page .si-th--del { padding: 0; }
.dlb-prev-form-page .si-td {
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); vertical-align: middle;
}
.dlb-prev-form-page .si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.dlb-prev-form-page .si-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.dlb-prev-form-page .si-td--del { padding: 0; text-align: center; }
.dlb-prev-form-page .si-td--input { padding: 0; }
.dlb-prev-form-page .si-td--affix { padding: 0; }
.dlb-prev-form-page .si-td--calc, .dlb-prev-form-page .si-td--calc .si-affix, .dlb-prev-form-page .si-td--calc .si-affix-value { background: var(--mp-background-neutral-strong, #f1f3f5); }
.dlb-prev-form-page .si-affix-cell { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.dlb-prev-form-page .si-affix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.dlb-prev-form-page .si-affix-value { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 var(--mp-spacing-2); white-space: nowrap; }
.dlb-prev-form-page .si-unit-ro { flex: 1; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); color: var(--mp-text-secondary, #64748b); }
.dlb-prev-form-page .si-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.dlb-prev-form-page .si-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.dlb-prev-form-page .si-note-field { display: flex; flex-direction: column; }
.dlb-prev-form-page .si-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1, 4px); }
.dlb-prev-form-page .si-totals-col { margin-left: auto; width: 428px; flex-shrink: 0; display: flex; flex-direction: column; }
.dlb-prev-form-page .si-totals-row { display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dlb-prev-form-page .si-totals-row--h3 { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg); }
.dlb-prev-form-page .si-deduction { color: var(--mp-text-secondary); white-space: nowrap; }
.dlb-prev-form-page .si-total-rule {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-2) 0;
  background: repeating-linear-gradient(to right, var(--mp-border-default) 0, var(--mp-border-default) 4px, transparent 4px, transparent 8px);
}
.dlb-prev-form-page .si-form-footer { margin-top: auto; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-6); }
/* Form preview extras */
.dlb-fp-datepicker { width: 100%; }
.dlb-fp-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.dlb-fp-affix-input { flex: 1 1 0; min-width: 0; }
.dlb-fp-affix-input :deep(.mp-input__root) { flex: 1 1 0; min-width: 0; width: auto; border: none; border-radius: 0; box-shadow: none; /* pixel-police-allow-shadow — resetting Pixel's default ring */ }
.dlb-fp-affix-input :deep(.mp-input__control) { height: var(--mp-sizes-10, 40px); min-width: 0; width: 100%; border: none; border-radius: 0; box-shadow: none; /* pixel-police-allow-shadow */ }
.dlb-fp-unit-label { padding: 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.dlb-prev-form-page .si-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); width: var(--si-field-wide); }
.dlb-prev-form-page .si-attachment-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-md, 20px); }
.dlb-prev-form-page .si-discount-block { position: relative; }
.dlb-prev-form-page .si-discount-rows { display: flex; flex-direction: column; }
.dlb-prev-form-page .si-inline-field-label { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.dlb-prev-form-page .si-unit-field { width: 180px; flex-shrink: 0; }
.dlb-prev-form-page .si-unit-addon :deep(.mp-input-addon__root) { padding: 0; background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-md); }
.dlb-prev-form-page .si-td--input :deep([class*='input']),
.dlb-prev-form-page .si-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
.dlb-prev-form-page .si-td--input :deep(.mp-input__root),
.dlb-prev-form-page .si-td--input :deep(.mp-select__root) { height: var(--mp-sizes-10, 40px); background: transparent; }
.dlb-prev-form-page .si-td--input :deep(.mp-input__control),
.dlb-prev-form-page .si-td--input :deep(.mp-select__control) { height: var(--mp-sizes-10, 40px); min-width: 0; width: 100%; border: none; border-radius: 0; box-shadow: none; /* pixel-police-allow-shadow */ }
.dlb-prev-fields { display: grid; gap: var(--mp-spacing-4); }
.dlb-prev-col { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
/* Transitions */
.dlb-preview-enter-active, .dlb-preview-leave-active { transition: opacity 0.2s ease; }
.dlb-preview-enter-active .dlb-preview-panel, .dlb-preview-leave-active .dlb-preview-panel { transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1); }
.dlb-preview-enter-from, .dlb-preview-leave-to { opacity: 0; }
.dlb-preview-enter-from .dlb-preview-panel { transform: scale(0.96); }
.dlb-preview-leave-to .dlb-preview-panel { transform: scale(0.96); }

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

/* ── Readonly mode — hide interactive affordances ── */
.dlb--readonly .dlb-drag,
.dlb--readonly .dlb-kebab,
.dlb--readonly .dlb-tab-kebab,
.dlb--readonly .dlb-add-section { display: none; }
.dlb--readonly .dlb-prop { cursor: default; }
.dlb--readonly .dlb-section { cursor: default; }
</style>
