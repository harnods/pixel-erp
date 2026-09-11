<script setup lang="ts">
/**
 * CRM Module builder — the "Manage" screen of Settings ▸ Modules settings.
 *
 * Route `/crm/settings/modules/:moduleId` binds `:orderId` = the module id
 * (e.g. 'deals'). PRD: "ERP - Customizable CRM Platform and Deals V1" (§7.1/§8.2).
 * A module = named fields laid out in sections + saved List/Kanban views. Stage
 * is just a Pick List field, edited here like any other options field.
 *
 * Full-bleed shell mirrors CrmSettingsPage / CrmCustomerDetailPage: `.detail-page`
 * > `.detail-bar` (72px, neutral-subtle, breadcrumb-above-title gap:0) +
 * `.detail-stage`. Two green MpTabs — Fields & layout · Views. All edits happen on
 * a local editable deep-clone `draft`; "Save changes" applies it to the real
 * module + persists. Every dropdown is `ErpFilterSelect`; every modal is `MpModal`.
 */
import { computed, reactive, ref, watch, onMounted } from 'vue'
import {
  MpButton, MpIcon, MpToggle, MpInput, MpInputGroup, MpInputLeftAddon, MpCheckbox, MpRadio, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import {
  getCrmModule, persistCrmModule,
  CRM_FIELD_TYPE_LABELS, CRM_OWNERS,
  dealPipelines, persistDealPipelines,
  dealPipelineDisplay, persistDealPipelineDisplay, CRM_MODULE_ICONS,
  dealModuleSetup, persistDealModuleSetup,
  type CrmModule, type CrmModuleField, type CrmFieldType,
  type CrmModuleView, type CrmModuleViewType, type CrmModuleViewVisibility,
  type DealPipeline, type DealPipelineStage,
  type DealPipelineDisplay, type DealModuleSetup,
} from '~/data/crm'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const AUTHOR = 'Rizal Candra'
function nowStamp(): string { return new Date().toISOString().slice(0, 19) }
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T }

const mod = computed<CrmModule | undefined>(() => getCrmModule(props.orderId))

// ── Local editable deep-clone ────────────────────────────────────────────────
const UNUSED = '__unused__'
const MODULE_NAME_MAX = 25
interface Draft {
  name: string
  icon: string
  sections: string[]
  fields: CrmModuleField[]
  views: CrmModuleView[]
  layoutDriver: string // '' = none
}
const draft = reactive<Draft>({ name: '', icon: 'pipeline', sections: [], fields: [], views: [], layoutDriver: '' })

function loadDraft() {
  const m = mod.value
  if (!m) return
  draft.name = m.name
  draft.icon = m.icon ?? 'pipeline'
  draft.sections = clone(m.sections)
  draft.fields = clone(m.fields)
  draft.views = clone(m.views)
  draft.layoutDriver = m.layoutDriver ?? ''
}
// Icon picker (the Name-field prefix) — opens a small grid of module icons.
const iconMenuOpen = ref(false)
function pickIcon(icon: string) { draft.icon = icon; iconMenuOpen.value = false }

// ── Setup tab (Deals) — a local editable clone; Save changes applies it. ──
const setup = reactive<DealModuleSetup>(JSON.parse(JSON.stringify(dealModuleSetup)))
function loadSetup() { Object.assign(setup, JSON.parse(JSON.stringify(dealModuleSetup))) }
const CURRENCY_OPTIONS = [{ value: 'IDR', label: 'Indonesian Rupiah (Rp)' }]
const CLOSE_PERIOD_OPTIONS = [
  { value: 'this-month', label: t('This month') },
  { value: 'next-month', label: t('Next month') },
]
const CLOSE_UNIT_OPTIONS = [
  { value: 'days', label: t('Days') },
  { value: 'weeks', label: t('Weeks') },
  { value: 'months', label: t('Months') },
]
// Access picker (drawer) — options are the CRM staff (name + email caption).
const OWNER_EMAIL: Record<string, string> = {
  'Dewi Lestari': 'dewi.lestari@centralperk.co.id',
  'Fajar Nugroho': 'fajar.nugroho@centralperk.co.id',
  'Rizal Candra': 'rizal.candra@centralperk.co.id',
}
function ownerEmail(name: string): string {
  return OWNER_EMAIL[name] || `${name.toLowerCase().replace(/\s+/g, '.')}@centralperk.co.id`
}
const accessDrawerOpen = ref(false)
const accessOptions = CRM_OWNERS.map((n) => ({ id: n, name: n, subtitle: ownerEmail(n) }))
function onAccessSaved(ids: string[]) { setup.access = ids; accessDrawerOpen.value = false }
function removeAccess(id: string) { setup.access = setup.access.filter((x) => x !== id) }

onMounted(() => { loadDraft(); loadSetup() })
watch(() => props.orderId, () => { loadDraft(); loadSetup() })

// ── Header status badge ──────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { status: string; label: string }> = {
  published: { status: 'active', label: 'Published' },
  draft: { status: 'draft', label: 'Draft' },
  incomplete: { status: 'pending', label: 'Incomplete' },
}
const statusBadge = computed(() => STATUS_BADGE[mod.value?.status ?? 'draft'] ?? STATUS_BADGE.draft!)

// ── Tabs (v-model = index) ───────────────────────────────────────────────────
// Deals gets Pipeline + Layout; custom modules keep Fields & layout + Views.
const isDeals = computed(() => !!mod.value?.system)
const tabs = computed(() => isDeals.value
  ? [{ key: 'setup', label: 'Setup' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'layout', label: 'Layout' }]
  : [{ key: 'fields', label: 'Fields & layout' }, { key: 'views', label: 'Views' }])
const activeTab = ref<string>(getCrmModule(props.orderId)?.system ? 'setup' : 'fields')
const isLayoutTab = computed(() => activeTab.value === 'fields' || activeTab.value === 'layout')

// ── Pipeline config (deals only) — a local editable clone; Save changes applies it. ──
const pipeDraft = ref<DealPipeline[]>(JSON.parse(JSON.stringify(dealPipelines)))
const selectedPipeId = ref<string>(pipeDraft.value[0]?.id ?? 'default')
const currentPipe = computed<DealPipeline | undefined>(() => pipeDraft.value.find((p) => p.id === selectedPipeId.value) ?? pipeDraft.value[0])
const pipeOptions = computed(() => pipeDraft.value.map((p) => ({ value: p.id, label: p.name })))
// Every stage renders as a Kanban swimlane (open flow + Won + Lost alike).
const pipeStages = computed<DealPipelineStage[]>(() => currentPipe.value?.stages ?? [])
let stageSeq = 100
const newStageId = () => `s-new-${stageSeq++}`


// Inline rename — the pencil toggles a stage's name into an editable field.
const editingStageId = ref<string | null>(null)
function editStage(id: string) { editingStageId.value = id }
function commitStageName(s: DealPipelineStage) {
  if (!s.name.trim()) s.name = t('Untitled stage')
  editingStageId.value = null
}

// Drag-reorder the swimlanes.
const dragSrc = ref<number | null>(null)
const dragOver = ref<number | null>(null)
function onStageDragStart(i: number, e: DragEvent) {
  dragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
  // Drag the whole lane as the ghost (not just the handle) — this is what makes
  // the reorder feel like the Deals board's card drag.
  const lane = (e.target as HTMLElement).closest('.pipe-lane') as HTMLElement | null
  if (lane) e.dataTransfer!.setDragImage(lane, 24, 24)
}
// Live sortable: as the dragged lane hovers over another, swap them in place so the
// board physically opens a slot where it'll drop (animated via <TransitionGroup>).
function onStageDragOver(i: number, e: DragEvent) {
  e.preventDefault(); e.dataTransfer!.dropEffect = 'move'
  const pipe = currentPipe.value
  if (!pipe || dragSrc.value === null || dragSrc.value === i) return
  const arr = [...pipe.stages]
  const [m] = arr.splice(dragSrc.value, 1)
  arr.splice(i, 0, m!)
  pipe.stages = arr
  dragSrc.value = i // the dragged lane now lives at index i
}
function onStageDrop() { dragSrc.value = null; dragOver.value = null }
function onStageDragEnd() { dragSrc.value = null; dragOver.value = null }

function addStage() {
  const pipe = currentPipe.value; if (!pipe) return
  const id = newStageId()
  pipe.stages.push({ id, name: t('New stage'), kind: 'open' })
  editingStageId.value = id
}
// Inline "can't delete the last stage" note keyed by pipeline id.
const stageDeleteError = ref('')
function removeStage(id: string) {
  const pipe = currentPipe.value; if (!pipe) return
  if (pipe.stages.length <= 1) { stageDeleteError.value = t('A pipeline must keep at least one stage.'); return }
  stageDeleteError.value = ''
  pipe.stages = pipe.stages.filter((s) => s.id !== id)
}

// ── Board DISPLAY settings (right-hand panel) — a local editable clone; Save
//    changes applies it. Drives which fields show on cards + stage/column props. ──
const disp = reactive<DealPipelineDisplay>(JSON.parse(JSON.stringify(dealPipelineDisplay)))
const enabledCardFields = computed(() => disp.cardFields.filter((f) => f.on))
const ownerFieldOn = computed(() => disp.cardFields.some((f) => f.key === 'owner' && f.on))

// Drag-reorder the card-property rows (order = the order fields stack on a card).
const fieldDragSrc = ref<number | null>(null)
const fieldDragOver = ref<number | null>(null)
function onFieldDragStart(i: number, e: DragEvent) {
  fieldDragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
  const row = (e.target as HTMLElement).closest('.pipe-side-row') as HTMLElement | null
  if (row) e.dataTransfer!.setDragImage(row, 12, 12)
}
// Live sortable (same feel as the swimlanes): swap rows in place on hover.
function onFieldDragOver(i: number, e: DragEvent) {
  e.preventDefault(); e.dataTransfer!.dropEffect = 'move'
  if (fieldDragSrc.value === null || fieldDragSrc.value === i) return
  const arr = [...disp.cardFields]
  const [m] = arr.splice(fieldDragSrc.value, 1)
  arr.splice(i, 0, m!)
  disp.cardFields = arr
  fieldDragSrc.value = i
}
function onFieldDrop() { fieldDragSrc.value = null; fieldDragOver.value = null }
function onFieldDragEnd() { fieldDragSrc.value = null; fieldDragOver.value = null }

// ── Field type options + labels ──────────────────────────────────────────────
const FIELD_TYPE_OPTIONS = (Object.entries(CRM_FIELD_TYPE_LABELS) as [CrmFieldType, string][])
  .map(([value, label]) => ({ value, label }))
function typeLabel(type: CrmFieldType): string { return CRM_FIELD_TYPE_LABELS[type] }
function hasOptions(type: CrmFieldType): boolean { return type === 'pick-list' || type === 'radio' }

// Single-choice fields feed the Layout driver + Kanban "Categorize by".
const choiceFieldOptions = computed(() =>
  draft.fields.filter((f) => hasOptions(f.type)).map((f) => ({ value: f.id, label: f.label })),
)
const layoutDriverOptions = computed(() => [{ value: '', label: t('None') }, ...choiceFieldOptions.value])
function fieldLabelOf(id?: string): string {
  if (!id) return ''
  return draft.fields.find((f) => f.id === id)?.label ?? id
}

// ── Fields grouped by section / column ───────────────────────────────────────
function sectionColumnFields(section: string, col: 1 | 2): CrmModuleField[] {
  return draft.fields.filter((f) => f.section === section && f.column === col)
}
const unusedFields = computed(() => draft.fields.filter((f) => !f.section))
// A protected field (system + required) can't leave the layout.
function isProtected(f: CrmModuleField): boolean { return f.system && f.required }

// Inline "can't remove" notes keyed by field id.
const removeErrors = reactive<Record<string, string>>({})
function removeFieldFromLayout(f: CrmModuleField) {
  if (isProtected(f)) {
    removeErrors[f.id] = t('This field is required by the system and must stay in the layout.')
    return
  }
  delete removeErrors[f.id]
  f.section = undefined
  f.column = undefined
}

// ── Field modal ──────────────────────────────────────────────────────────────
const fieldModalOpen = ref(false)
const fieldModalMode = ref<'add' | 'edit'>('add')
const editingFieldId = ref<string | null>(null)
interface FieldForm {
  label: string
  type: CrmFieldType
  required: boolean
  options: string[]
  section: string // section name or UNUSED
  column: string // '1' | '2'
  system: boolean
}
const fieldForm = reactive<FieldForm>({ label: '', type: 'text', required: false, options: [], section: UNUSED, column: '1', system: false })
const fieldLabelError = ref('')
const newOption = ref('')
const optionError = ref('')

const sectionSelectOptions = computed(() => [
  ...draft.sections.map((s) => ({ value: s, label: s })),
  { value: UNUSED, label: t('Unused') },
])
const COLUMN_OPTIONS = [
  { value: '1', label: t('Column 1') },
  { value: '2', label: t('Column 2') },
]
// Editing a system field's type is locked (keep control, show a note).
const typeLocked = computed(() => fieldModalMode.value === 'edit' && fieldForm.system)
const fieldModalTitle = computed(() => (fieldModalMode.value === 'edit' ? t('Edit field') : t('Add field')))

function openAddField(section?: string, column?: 1 | 2) {
  fieldModalMode.value = 'add'
  editingFieldId.value = null
  fieldLabelError.value = ''
  optionError.value = ''
  newOption.value = ''
  Object.assign(fieldForm, {
    label: '', type: 'text', required: false, options: [],
    section: section ?? UNUSED, column: String(column ?? 1), system: false,
  })
  fieldModalOpen.value = true
}
function openEditField(f: CrmModuleField) {
  fieldModalMode.value = 'edit'
  editingFieldId.value = f.id
  fieldLabelError.value = ''
  optionError.value = ''
  newOption.value = ''
  Object.assign(fieldForm, {
    label: f.label,
    type: f.type,
    required: f.required,
    options: f.options ? [...f.options] : [],
    section: f.section ?? UNUSED,
    column: String(f.column ?? 1),
    system: f.system,
  })
  fieldModalOpen.value = true
}
function onFieldTypeChange(v: string) {
  if (typeLocked.value) return // locked — ignore (note shown below)
  fieldForm.type = (v || 'text') as CrmFieldType
}
function addOption() {
  const v = newOption.value.trim()
  if (!v) { optionError.value = t('Enter an option name.'); return }
  if (fieldForm.options.includes(v)) { optionError.value = t('This option already exists.'); return }
  fieldForm.options.push(v)
  newOption.value = ''
  optionError.value = ''
}
function removeOption(i: number) { fieldForm.options.splice(i, 1) }

function saveField() {
  if (!fieldForm.label.trim()) { fieldLabelError.value = t('Enter a field label.'); return }
  const inLayout = fieldForm.section !== UNUSED
  const section = inLayout ? fieldForm.section : undefined
  const column = inLayout ? (Number(fieldForm.column) as 1 | 2) : undefined
  const options = hasOptions(fieldForm.type) ? [...fieldForm.options] : undefined

  if (fieldModalMode.value === 'edit' && editingFieldId.value) {
    const f = draft.fields.find((x) => x.id === editingFieldId.value)
    if (f) {
      f.label = fieldForm.label.trim()
      if (!f.system) f.type = fieldForm.type // system field type is locked
      f.required = fieldForm.required
      f.options = hasOptions(f.type) ? options : undefined
      f.section = section
      f.column = column
      if (section) delete removeErrors[f.id]
    }
  } else {
    draft.fields.push({
      id: `f-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      label: fieldForm.label.trim(),
      type: fieldForm.type,
      required: fieldForm.required,
      system: false,
      options,
      section,
      column,
    })
  }
  fieldModalOpen.value = false
}

// ── Section modal (add / rename) + delete ────────────────────────────────────
const sectionModalOpen = ref(false)
const sectionModalMode = ref<'add' | 'rename'>('add')
const sectionOriginal = ref('')
const sectionNameInput = ref('')
const sectionNameError = ref('')
const sectionDeleteError = reactive<Record<string, string>>({})

const sectionModalTitle = computed(() => (sectionModalMode.value === 'rename' ? t('Rename section') : t('Add section')))

function openAddSection() {
  sectionModalMode.value = 'add'
  sectionOriginal.value = ''
  sectionNameInput.value = ''
  sectionNameError.value = ''
  sectionModalOpen.value = true
}
function openRenameSection(section: string) {
  sectionModalMode.value = 'rename'
  sectionOriginal.value = section
  sectionNameInput.value = section
  sectionNameError.value = ''
  sectionModalOpen.value = true
}
function saveSection() {
  const name = sectionNameInput.value.trim()
  if (!name) { sectionNameError.value = t('Enter a section name.'); return }
  const clash = draft.sections.some((s) => s.toLowerCase() === name.toLowerCase() && s !== sectionOriginal.value)
  if (clash) { sectionNameError.value = t('A section with this name already exists.'); return }
  if (sectionModalMode.value === 'add') {
    draft.sections.push(name)
  } else {
    const i = draft.sections.indexOf(sectionOriginal.value)
    if (i !== -1) draft.sections.splice(i, 1, name)
    draft.fields.forEach((f) => { if (f.section === sectionOriginal.value) f.section = name })
  }
  sectionModalOpen.value = false
}
function deleteSection(section: string) {
  const blocked = draft.fields.some((f) => f.section === section && isProtected(f))
  if (blocked) {
    sectionDeleteError[section] = t('This section holds a system-required field and can’t be deleted.')
    return
  }
  delete sectionDeleteError[section]
  // Move its fields to Unused, then drop the section.
  draft.fields.forEach((f) => { if (f.section === section) { f.section = undefined; f.column = undefined } })
  const i = draft.sections.indexOf(section)
  if (i !== -1) draft.sections.splice(i, 1)
}

// ── View modal ───────────────────────────────────────────────────────────────
const VISIBILITY_LABELS: Record<CrmModuleViewVisibility, string> = { private: 'Private', team: 'Team', everyone: 'Everyone' }
const VIEW_TYPE_OPTIONS = [
  { value: 'list', label: t('List') },
  { value: 'kanban', label: t('Kanban') },
]
const VISIBILITY_OPTIONS = [
  { value: 'private', label: t('Private') },
  { value: 'team', label: t('Team') },
  { value: 'everyone', label: t('Everyone') },
]

const viewsError = ref('')
function removeView(v: CrmModuleView) {
  if (draft.views.length <= 1) { viewsError.value = t('A module must keep at least one view.'); return }
  viewsError.value = ''
  const i = draft.views.findIndex((x) => x.id === v.id)
  if (i !== -1) draft.views.splice(i, 1)
}

const viewModalOpen = ref(false)
const viewModalMode = ref<'add' | 'edit'>('add')
const editingViewId = ref<string | null>(null)
interface ViewForm { name: string; type: CrmModuleViewType; categorizeBy: string; visibility: CrmModuleViewVisibility }
const viewForm = reactive<ViewForm>({ name: '', type: 'list', categorizeBy: '', visibility: 'private' })
const viewNameError = ref('')
const viewCatError = ref('')
const viewModalTitle = computed(() => (viewModalMode.value === 'edit' ? t('Edit view') : t('Add view')))

function openAddView() {
  viewModalMode.value = 'add'
  editingViewId.value = null
  viewNameError.value = ''
  viewCatError.value = ''
  Object.assign(viewForm, { name: '', type: 'list', categorizeBy: '', visibility: 'private' })
  viewModalOpen.value = true
}
function openEditView(v: CrmModuleView) {
  viewModalMode.value = 'edit'
  editingViewId.value = v.id
  viewNameError.value = ''
  viewCatError.value = ''
  Object.assign(viewForm, { name: v.name, type: v.type, categorizeBy: v.categorizeBy ?? '', visibility: v.visibility })
  viewModalOpen.value = true
}
function saveView() {
  if (!viewForm.name.trim()) { viewNameError.value = t('Enter a view name.'); return }
  if (viewForm.type === 'kanban' && !viewForm.categorizeBy) { viewCatError.value = t('Choose a field to categorize the board by.'); return }
  const categorizeBy = viewForm.type === 'kanban' ? viewForm.categorizeBy : undefined
  if (viewModalMode.value === 'edit' && editingViewId.value) {
    const v = draft.views.find((x) => x.id === editingViewId.value)
    if (v) { v.name = viewForm.name.trim(); v.type = viewForm.type; v.categorizeBy = categorizeBy; v.visibility = viewForm.visibility }
  } else {
    draft.views.push({
      id: `v-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      name: viewForm.name.trim(),
      type: viewForm.type,
      categorizeBy,
      visibility: viewForm.visibility,
    })
  }
  viewModalOpen.value = false
}

// ── Header actions ───────────────────────────────────────────────────────────
function saveChanges() {
  const m = mod.value
  if (!m) return
  // Deals: persist the pipeline config too.
  if (m.system) {
    dealPipelines.splice(0, dealPipelines.length, ...JSON.parse(JSON.stringify(pipeDraft.value)))
    persistDealPipelines()
    Object.assign(dealPipelineDisplay, JSON.parse(JSON.stringify(disp)))
    persistDealPipelineDisplay()
    Object.assign(dealModuleSetup, JSON.parse(JSON.stringify(setup)))
    persistDealModuleSetup()
  }
  Object.assign(m, {
    sections: [...draft.sections],
    fields: clone(draft.fields),
    views: clone(draft.views),
    layoutDriver: draft.layoutDriver || undefined,
  })
  // Renaming/re-iconing the module (incl. the Deals system module) also updates
  // its nav item.
  m.name = draft.name.trim() || m.name
  m.icon = draft.icon
  persistCrmModule(m, AUTHOR, nowStamp())
  successToast(t(m.system ? 'Pipeline saved' : 'Module saved'))
}
// Every module (Deals system module included) is edited from the Modules index.
function cancel() { router.push('/crm/settings/modules') }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink v-if="mod" class="detail-breadcrumb" to="/crm/settings/modules">{{ t('Modules') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 v-if="!mod || mod.system" class="detail-title">{{ mod ? mod.name : t('Module not found') }}</h1>
          <MpInput v-else id="builder-title" v-model="draft.name" class="builder-title-input" :aria-label="t('Module name')" />
          <ErpStatusBadge v-if="mod && !mod.system" :status="statusBadge.status" :label="t(statusBadge.label)" badge-for="additionalInformation" />
        </div>
      </div>
    </header>

    <!-- Section tabs — OUTSIDE the white stage (rule/erp-tabs-pattern: section tabs
         sit on the neutral-subtle bar below the title, not as MpTabs in the stage). -->
    <div v-if="mod" class="page-tabs-bar">
      <button v-for="tab in tabs" :key="tab.key" type="button" class="page-tab" :class="{ 'page-tab--active': activeTab === tab.key }" @click="activeTab = tab.key">{{ t(tab.label) }}</button>
    </div>

    <div class="detail-stage">
      <!-- ── Module not found ── -->
      <div v-if="!mod" class="builder-empty">
        <MpIcon name="folder-close" size="xl" />
        <p class="builder-empty-title">{{ t('Module not found') }}</p>
        <p class="builder-empty-caption">{{ t('This module doesn’t exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="cancel">{{ t('Back to Modules') }}</MpButton>
      </div>

      <template v-else>
          <!-- ════════ SETUP (Deals) ════════ -->
          <div v-show="activeTab === 'setup'" class="builder-panel">
            <div class="setup-form">
              <!-- Module name — full-width (6-col) MpFormControl; icon-prefix picker + counter -->
              <MpFormControl id="setup-name-fc">
                <div class="setup-labelrow">
                  <MpFormLabel>{{ t('Module name') }}</MpFormLabel>
                  <span class="setup-counter">{{ draft.name.length }} / {{ MODULE_NAME_MAX }}</span>
                </div>
                <MpInputGroup id="setup-name-group" size="md">
                  <MpInputLeftAddon id="setup-name-addon" has-background>
                    <MpPopover id="module-icon-menu" :is-open="iconMenuOpen" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @close="iconMenuOpen = false">
                      <MpPopoverTrigger>
                        <button type="button" class="setup-icon-trigger" :aria-label="t('Change icon')" @click="iconMenuOpen = !iconMenuOpen">
                          <MpIcon :name="draft.icon" size="md" />
                          <MpIcon name="chevrons-down" size="sm" class="setup-icon-caret" />
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ padding: 'var(--mp-spacing-2)' })">
                        <div class="pipe-icon-grid">
                          <button
                            v-for="ic in CRM_MODULE_ICONS" :key="ic" type="button"
                            class="pipe-icon-choice" :class="{ 'pipe-icon-choice--active': draft.icon === ic }"
                            :aria-label="ic" @click="pickIcon(ic)"
                          ><MpIcon :name="ic" size="md" /></button>
                        </div>
                      </MpPopoverContent>
                    </MpPopover>
                  </MpInputLeftAddon>
                  <MpInput id="setup-module-name" v-model="draft.name" :maxlength="MODULE_NAME_MAX" is-full-width />
                </MpInputGroup>
              </MpFormControl>

              <!-- Base currency -->
              <MpFormControl id="setup-currency-fc">
                <MpFormLabel>{{ t('Base currency') }}</MpFormLabel>
                <ErpFilterSelect
                  id="setup-currency" :model-value="setup.baseCurrency" :options="CURRENCY_OPTIONS"
                  :is-clearable="false" width="280px"
                  @update:model-value="(v: string) => (setup.baseCurrency = v || 'IDR')"
                />
              </MpFormControl>

              <!-- Default close date — checkbox (title + #description caption, box top-aligned) -->
              <div class="setup-field">
                <MpCheckbox id="setup-closedate" :is-checked="setup.applyCloseDate" @change="setup.applyCloseDate = !setup.applyCloseDate">
                  {{ t('Apply default close date to new records') }}
                  <template #description>{{ t('Select the default close date when creating a Deal.') }}</template>
                </MpCheckbox>

                <div v-if="setup.applyCloseDate" class="setup-indent">
                  <MpRadio id="close-period" name="close-mode" value="period" :is-checked="setup.closeMode === 'period'" @change="setup.closeMode = 'period'">{{ t('End of a certain period') }}</MpRadio>
                  <div v-if="setup.closeMode === 'period'" class="setup-radio-detail">
                    <ErpFilterSelect
                      id="close-period-opt" :model-value="setup.closePeriod" :options="CLOSE_PERIOD_OPTIONS"
                      :is-clearable="false" width="224px"
                      @update:model-value="(v: string) => (setup.closePeriod = (v || 'this-month') as DealModuleSetup['closePeriod'])"
                    />
                  </div>

                  <MpRadio id="close-fromcreation" name="close-mode" value="fromCreation" :is-checked="setup.closeMode === 'fromCreation'" @change="setup.closeMode = 'fromCreation'">{{ t('Time from record creation') }}</MpRadio>
                  <div v-if="setup.closeMode === 'fromCreation'" class="setup-radio-detail setup-amount">
                    <MpInput id="close-amount" v-model.number="setup.closeAmount" type="number" class="setup-amount-input" :aria-label="t('Amount')" />
                    <ErpFilterSelect
                      id="close-unit" :model-value="setup.closeUnit" :options="CLOSE_UNIT_OPTIONS"
                      :is-clearable="false" width="104px"
                      @update:model-value="(v: string) => (setup.closeUnit = (v || 'days') as DealModuleSetup['closeUnit'])"
                    />
                  </div>
                </div>
              </div>

              <!-- Access — selected users listed with an email caption + (−) remove -->
              <div class="setup-field">
                <div class="setup-labelgroup">
                  <span class="setup-fieldlabel">{{ t('Access') }}</span>
                  <span class="setup-caption">{{ t('Choose who can access this module.') }}</span>
                </div>
                <ul v-if="setup.access.length" class="setup-user-list">
                  <li v-for="id in setup.access" :key="id" class="setup-user-row">
                    <span class="setup-user-info">
                      <span class="setup-user-name">{{ id }}</span>
                      <span class="setup-user-email">{{ ownerEmail(id) }}</span>
                    </span>
                    <MpTooltip :id="`acc-rm-${id}`" :label="t('Remove')" placement="top" use-portal>
                      <button type="button" class="setup-user-remove" :aria-label="`${t('Remove')} ${id}`" @click="removeAccess(id)">
                        <MpIcon name="minus-circular" size="md" />
                      </button>
                    </MpTooltip>
                  </li>
                </ul>
                <p v-else class="setup-access-empty">{{ t('No users selected') }}</p>
                <MpButton class="setup-access-btn" variant="secondary" is-rounded left-icon="add" @click="accessDrawerOpen = true">{{ t('Add users') }}</MpButton>
              </div>
            </div>
          </div>

          <!-- ════════ PIPELINE (Deals) — swimlane editor + settings sidebar ════════ -->
          <div v-show="activeTab === 'pipeline'" class="builder-panel builder-panel--pipeline">
            <template v-if="currentPipe">
              <div class="pipe-layout">
                <!-- Board: one Kanban lane per stage, cards = live deals in it -->
                <div class="pipe-board">
                  <p v-if="stageDeleteError" class="builder-inline-error pipe-board-error">{{ stageDeleteError }}</p>
                  <TransitionGroup name="lane" tag="div" class="pipe-lanes">
                  <div
                    v-for="(s, i) in pipeStages" :key="s.id"
                    class="pipe-lane"
                    :class="{ 'is-dragging': dragSrc === i, [`pipe-lane--${s.kind}`]: disp.colorColumns }"
                    @dragover="onStageDragOver(i, $event)" @drop="onStageDrop()"
                  >
                    <div class="pipe-lane-head">
                      <span
                        class="pipe-lane-drag" draggable="true" :aria-label="t('Drag to reorder')"
                        @dragstart="onStageDragStart(i, $event)" @dragend="onStageDragEnd"
                      ><MpIcon name="drag" size="md" /></span>
                      <div class="pipe-lane-label">
                        <MpInput
                          v-if="editingStageId === s.id" :id="`lane-${s.id}`" v-model="s.name" class="pipe-lane-input"
                          :aria-label="t('Stage name')" @blur="commitStageName(s)" @keydown.enter.prevent="commitStageName(s)"
                        />
                        <template v-else>
                          <span class="pipe-lane-name">{{ s.name }}</span>
                          <button class="pipe-lane-edit" type="button" :aria-label="t('Rename stage')" @click="editStage(s.id)"><MpIcon name="edit" size="sm" /></button>
                        </template>
                      </div>
                    </div>

                    <!-- Preview cards — placeholder field labels (a layout preview,
                         not live data); populated on the first lane only, per Figma. -->
                    <div class="pipe-lane-cards">
                      <template v-if="i === 0">
                        <div v-for="n in 2" :key="n" class="pipe-card">
                          <template v-for="f in enabledCardFields" :key="f.key">
                            <span v-if="f.key === 'company'" class="pipe-card-company">{{ t('Company name') }}</span>
                            <span v-else-if="f.key === 'dealName'" class="pipe-card-deal">{{ t('Deal name') }}</span>
                            <span v-else-if="f.key === 'contactPerson'" class="pipe-card-sub">{{ t('Contact person') }}</span>
                            <span v-else-if="f.key === 'dealValue'" class="pipe-card-value">{{ t('Deal value') }}</span>
                            <div v-else-if="f.key === 'owner'" class="pipe-card-foot">
                              <span class="pipe-card-owner">{{ t('Deal owner') }}</span>
                              <span v-if="disp.showAging" class="pipe-card-aging">2d</span>
                            </div>
                            <span v-else-if="f.key === 'date'" class="pipe-card-sub">{{ t('Date') }}</span>
                            <span v-else-if="f.key === 'note'" class="pipe-card-sub">{{ t('Note') }}</span>
                          </template>
                          <!-- Aging still shows even if Owner is hidden -->
                          <div v-if="disp.showAging && !ownerFieldOn" class="pipe-card-foot pipe-card-foot--end">
                            <span class="pipe-card-aging">2d</span>
                          </div>
                        </div>
                      </template>
                    </div>

                    <div v-if="disp.stageTotal" class="pipe-lane-total">
                      <span class="pipe-lane-total-label">{{ t('Total deal value') }}</span>
                    </div>

                    <button class="pipe-lane-delete" type="button" @click="removeStage(s.id)">
                      <MpIcon name="delete" size="sm" /><span>{{ t('Delete stage') }}</span>
                    </button>
                  </div>
                  </TransitionGroup>

                  <!-- + New stage -->
                  <MpButton class="pipe-newstage" variant="ghost" is-rounded left-icon="add" @click="addStage">{{ t('New stage') }}</MpButton>
                </div>

                <!-- Settings — kept in the Pipeline right column -->
                <aside class="pipe-sidebar">
                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title">{{ t('Stage properties') }}</h3>
                    <div class="pipe-side-row">
                      <MpToggle id="disp-total" :is-checked="disp.stageTotal" :aria-label="t('Total deal value')" @update:is-checked="(v: boolean) => (disp.stageTotal = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Total deal value') }}</span>
                    </div>
                    <div class="pipe-side-row">
                      <MpToggle id="disp-color" :is-checked="disp.colorColumns" :aria-label="t('Color stage columns')" @update:is-checked="(v: boolean) => (disp.colorColumns = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Color stage columns') }}</span>
                    </div>
                  </section>

                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title">{{ t('Card properties') }}</h3>
                    <TransitionGroup name="row" tag="div" class="pipe-side-rows">
                      <div
                        v-for="(f, i) in disp.cardFields" :key="f.key"
                        class="pipe-side-row pipe-side-row--drag"
                        :class="{ 'is-dragging': fieldDragSrc === i }"
                        @dragover="onFieldDragOver(i, $event)" @drop="onFieldDrop()"
                      >
                        <MpToggle :id="`disp-${f.key}`" :is-checked="f.on" :aria-label="t(f.label)" @update:is-checked="(v: boolean) => (f.on = v)" />
                        <span class="pipe-side-rowlabel">{{ t(f.label) }}</span>
                        <span
                          class="pipe-side-drag" draggable="true" :aria-label="t('Drag to reorder')"
                          @dragstart="onFieldDragStart(i, $event)" @dragend="onFieldDragEnd"
                        ><MpIcon name="drag" size="md" /></span>
                      </div>
                    </TransitionGroup>
                    <div class="pipe-side-row pipe-side-row--sep">
                      <MpToggle id="disp-aging" :is-checked="disp.showAging" :aria-label="t('Rotting in (days)')" @update:is-checked="(v: boolean) => (disp.showAging = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Rotting in (days)') }}</span>
                    </div>
                  </section>
                </aside>
              </div>
            </template>
          </div>

          <!-- ════════ LAYOUT / FIELDS ════════ -->
          <div v-show="isLayoutTab" class="builder-panel">
            <!-- Layout driver -->
            <div class="builder-driver">
              <div class="builder-driver-text">
                <span class="builder-driver-label">{{ t('Layout driver') }}</span>
                <span class="builder-driver-caption">{{ t('A single-choice field whose value can drive conditional layout rules.') }}</span>
              </div>
              <ErpFilterSelect
                id="cmb-driver"
                :model-value="draft.layoutDriver"
                :placeholder="t('None')"
                :options="layoutDriverOptions"
                width="240px"
                @update:model-value="(v: string) => (draft.layoutDriver = v)"
              />
            </div>

            <!-- Sections -->
            <div v-for="section in draft.sections" :key="section" class="builder-section">
              <header class="builder-section-head">
                <span class="builder-section-name">{{ section }}</span>
                <MpPopover :id="`cmb-sec-${section}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton class="builder-kebab" :aria-label="t('Section actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openRenameSection(section)">{{ t('Rename section') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </header>

              <p v-if="sectionDeleteError[section]" class="builder-inline-error">{{ sectionDeleteError[section] }}</p>

              <div class="builder-columns">
                <div v-for="col in ([1, 2] as (1 | 2)[])" :key="col" class="builder-column">
                  <div
                    v-for="f in sectionColumnFields(section, col)"
                    :key="f.id"
                    class="builder-field"
                  >
                    <div class="builder-field-main">
                      <div class="builder-field-labelrow">
                        <span class="builder-field-label">{{ f.label }}</span>
                        <MpIcon v-if="f.system" name="security" size="sm" class="builder-field-lock" :aria-label="t('System field')" />
                      </div>
                      <div class="builder-field-meta">
                        <span class="builder-chip">{{ t(typeLabel(f.type)) }}</span>
                        <span v-if="f.required" class="builder-field-required">{{ t('Required') }}</span>
                      </div>
                      <p v-if="removeErrors[f.id]" class="builder-inline-error">{{ removeErrors[f.id] }}</p>
                    </div>
                    <div class="builder-field-actions">
                      <MpButton variant="ghost" is-rounded @click="openEditField(f)">{{ t('Edit') }}</MpButton>
                      <MpButton variant="ghost" is-rounded @click="removeFieldFromLayout(f)">{{ t('Remove') }}</MpButton>
                    </div>
                  </div>
                </div>
              </div>

              <div class="builder-section-foot">
                <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddField(section, 1)">{{ t('Add field') }}</MpButton>
              </div>
            </div>

            <div class="builder-add-section">
              <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddSection">{{ t('Add section') }}</MpButton>
            </div>

            <!-- Unused fields -->
            <div v-if="unusedFields.length" class="builder-unused">
              <span class="builder-unused-title">{{ t('Unused fields') }}</span>
              <p class="builder-unused-caption">{{ t('Fields not placed in the layout. Add one to a section to show it on records.') }}</p>
              <ul class="builder-unused-list">
                <li v-for="f in unusedFields" :key="f.id" class="builder-unused-row">
                  <div class="builder-field-labelrow">
                    <span class="builder-field-label">{{ f.label }}</span>
                    <MpIcon v-if="f.system" name="security" size="sm" class="builder-field-lock" :aria-label="t('System field')" />
                  </div>
                  <span class="builder-chip">{{ t(typeLabel(f.type)) }}</span>
                  <div class="builder-unused-action">
                    <MpButton variant="secondary" is-rounded @click="openEditField(f)">{{ t('Add to layout') }}</MpButton>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- ════════ VIEWS ════════ -->
          <div v-show="activeTab === 'views'" class="builder-panel">
            <ul class="builder-viewlist">
              <li v-for="v in draft.views" :key="v.id" class="builder-viewrow">
                <div class="builder-view-main">
                  <div class="builder-field-labelrow">
                    <span class="builder-view-name">{{ v.name }}</span>
                    <span class="builder-chip">{{ v.type === 'kanban' ? t('Kanban') : t('List') }}</span>
                    <span class="builder-chip builder-chip--soft">{{ t(VISIBILITY_LABELS[v.visibility]) }}</span>
                  </div>
                  <span v-if="v.type === 'kanban'" class="builder-view-caption">{{ t('Categorized by') }} {{ fieldLabelOf(v.categorizeBy) }}</span>
                </div>
                <div class="builder-field-actions">
                  <MpButton variant="ghost" is-rounded @click="openEditView(v)">{{ t('Edit') }}</MpButton>
                  <MpButton variant="ghost" is-rounded @click="removeView(v)">{{ t('Remove') }}</MpButton>
                </div>
              </li>
            </ul>
            <p v-if="viewsError" class="builder-inline-error">{{ viewsError }}</p>
            <div class="builder-add-section">
              <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddView">{{ t('Add view') }}</MpButton>
            </div>
          </div>
      </template>
    </div>

    <!-- Sticky action footer (rule/btn-responsive-footer): Cancel + Save changes -->
    <footer v-if="mod" class="builder-footer">
      <MpButtonGroup class="erp-action-footer">
        <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="saveChanges">{{ t('Save changes') }}</MpButton>
      </MpButtonGroup>
    </footer>

    <!-- ════════ Access drawer (Setup ▸ Access) ════════ -->
    <SelectAccessDrawer
      :open="accessDrawerOpen"
      :title="t('Select users')"
      :list-title="t('Users')"
      :options="accessOptions"
      :model-value="setup.access"
      :empty-title="t('No users selected')"
      :empty-caption="t('Pick who can access this module.')"
      @update:open="accessDrawerOpen = $event"
      @save="onAccessSaved($event)"
    />

    <!-- ════════ Field modal ════════ -->
    <MpModal id="cmb-field-modal" :is-open="fieldModalOpen" size="md" is-close-on-esc :is-keep-alive="false" @close="fieldModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ fieldModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-field-label-fc" :is-invalid="!!fieldLabelError">
              <MpFormLabel>{{ t('Label') }}</MpFormLabel>
              <MpInput id="cmb-field-label" v-model="fieldForm.label" is-full-width @update:model-value="fieldLabelError = ''" />
              <MpFormErrorMessage v-if="fieldLabelError">{{ fieldLabelError }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Type') }}</span>
              <ErpFilterSelect
                id="cmb-field-type"
                :model-value="fieldForm.type"
                :placeholder="t('Type')"
                :options="FIELD_TYPE_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="onFieldTypeChange"
              />
              <span v-if="typeLocked" class="builder-form-note">{{ t('This is a system field — its type can’t be changed.') }}</span>
            </div>

            <div class="builder-form-field builder-form-field--toggle">
              <MpToggle
                id="cmb-field-required"
                :is-checked="fieldForm.required"
                :aria-label="t('Required')"
                @update:is-checked="(v: boolean) => (fieldForm.required = v)"
              />
              <span class="builder-form-label">{{ t('Required') }}</span>
            </div>

            <div v-if="hasOptions(fieldForm.type)" class="builder-form-field">
              <span class="builder-form-label">{{ t('Options') }}</span>
              <ul v-if="fieldForm.options.length" class="builder-option-list">
                <li v-for="(opt, i) in fieldForm.options" :key="`${opt}-${i}`" class="builder-option-row">
                  <span class="builder-option-name">{{ opt }}</span>
                  <MpButton class="builder-option-remove" variant="ghost" is-rounded left-icon="close" :aria-label="`${t('Remove')} ${opt}`" @click="removeOption(i)" />
                </li>
              </ul>
              <div class="builder-option-add">
                <MpInput id="cmb-new-option" v-model="newOption" is-full-width :aria-label="t('New option')" @update:model-value="optionError = ''" @keydown.enter.prevent="addOption" />
                <MpButton variant="secondary" is-rounded @click="addOption">{{ t('Add') }}</MpButton>
              </div>
              <span v-if="optionError" class="builder-inline-error">{{ optionError }}</span>
            </div>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Section') }}</span>
              <ErpFilterSelect
                id="cmb-field-section"
                :model-value="fieldForm.section"
                :placeholder="t('Section')"
                :options="sectionSelectOptions"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (fieldForm.section = v)"
              />
            </div>

            <div v-if="fieldForm.section !== UNUSED" class="builder-form-field">
              <span class="builder-form-label">{{ t('Column') }}</span>
              <ErpFilterSelect
                id="cmb-field-column"
                :model-value="fieldForm.column"
                :placeholder="t('Column')"
                :options="COLUMN_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (fieldForm.column = v)"
              />
            </div>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="fieldModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveField">{{ fieldModalMode === 'edit' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ════════ Section modal ════════ -->
    <MpModal id="cmb-section-modal" :is-open="sectionModalOpen" size="md" is-close-on-esc :is-keep-alive="false" @close="sectionModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ sectionModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-section-name-fc" :is-invalid="!!sectionNameError">
              <MpFormLabel>{{ t('Section name') }}</MpFormLabel>
              <MpInput id="cmb-section-name" v-model="sectionNameInput" is-full-width @update:model-value="sectionNameError = ''" @keydown.enter.prevent="saveSection" />
              <MpFormErrorMessage v-if="sectionNameError">{{ sectionNameError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="sectionModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveSection">{{ sectionModalMode === 'rename' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ════════ View modal ════════ -->
    <MpModal id="cmb-view-modal" :is-open="viewModalOpen" size="md" is-close-on-esc :is-keep-alive="false" @close="viewModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ viewModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-view-name-fc" :is-invalid="!!viewNameError">
              <MpFormLabel>{{ t('Name') }}</MpFormLabel>
              <MpInput id="cmb-view-name" v-model="viewForm.name" is-full-width @update:model-value="viewNameError = ''" />
              <MpFormErrorMessage v-if="viewNameError">{{ viewNameError }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Type') }}</span>
              <ErpFilterSelect
                id="cmb-view-type"
                :model-value="viewForm.type"
                :placeholder="t('Type')"
                :options="VIEW_TYPE_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (viewForm.type = (v || 'list') as CrmModuleViewType)"
              />
            </div>

            <div v-if="viewForm.type === 'kanban'" class="builder-form-field">
              <span class="builder-form-label">{{ t('Categorize by') }}</span>
              <ErpFilterSelect
                id="cmb-view-categorize"
                :model-value="viewForm.categorizeBy"
                :placeholder="t('Choose a field')"
                :options="choiceFieldOptions"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => { viewForm.categorizeBy = v; viewCatError = '' }"
              />
              <span v-if="viewCatError" class="builder-inline-error">{{ viewCatError }}</span>
            </div>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Visibility') }}</span>
              <ErpFilterSelect
                id="cmb-view-visibility"
                :model-value="viewForm.visibility"
                :placeholder="t('Visibility')"
                :options="VISIBILITY_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (viewForm.visibility = (v || 'private') as CrmModuleViewVisibility)"
              />
            </div>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="viewModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveView">{{ viewModalMode === 'edit' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
/* ── Shell (mirrors CrmSettingsPage / CrmCustomerDetailPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.builder-title-input {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
  border: 1px solid transparent; border-radius: var(--mp-radii-md); background: transparent;
  padding: 0 var(--mp-spacing-2); max-width: 420px;
}
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* Top spacing is padding (not a border) so the sidebar's left divider can extend
   into it and reach the very top of the stage without being clipped by overflow. */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* Section tabs — neutral-subtle bar below the title, OUTSIDE the white stage
   (rule/erp-tabs-pattern; mirrors the .page-tab pattern in [...slug].vue). */
.page-tabs-bar { display: flex; align-items: flex-end; gap: var(--mp-spacing-5); padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle, #f8f9f9); flex-shrink: 0; }
.page-tab { position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; }
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected, #0f6d4d); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-border-selected, #029861); }

/* Each tab panel stacks its rows with the standard 20px gap. */
.builder-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* ── Pipeline tab — swimlane editor + right settings panel (Figma 4240-18081) ── */
/* The pipeline panel fills the stage so the sidebar can run full-height + sticky. */
.builder-panel--pipeline { flex: 1; min-height: 0; }
.pipe-layout { display: flex; align-items: stretch; gap: 0; flex: 1; min-height: 0; }
.builder-panel--pipeline .pipe-board { flex: 1; min-height: 0; }

/* The board: horizontal Kanban lanes; scrolls sideways if they overflow. */
.pipe-board { flex: 1; min-width: 0; display: flex; align-items: stretch; gap: var(--mp-spacing-2); overflow-x: auto; padding-bottom: var(--mp-spacing-2); }
.pipe-board-error { flex: 0 0 100%; }
/* The TransitionGroup wrapper lays out transparently so lanes stay direct flex
   items of the board; .lane-move FLIP-animates them sliding aside on reorder. */
.pipe-lanes { display: contents; }
.lane-move { transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.pipe-lane {
  flex: 0 0 250px; width: 250px;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-colors-background-neutral-subtle, #f8f9f9);
  transition: opacity 0.12s ease, border-color 0.12s ease;
}
.pipe-lane--over { border-color: var(--mp-colors-border-selected, #029861); }
.pipe-lane.is-dragging { opacity: 0.4; }
/* Color stage columns (toggle): tint the lane by outcome. */
.pipe-lane--won  { background: var(--mp-colors-background-brand-subtle, #eafaf1); border-color: var(--mp-colors-border-selected, #029861); }
.pipe-lane--lost { background: var(--mp-colors-background-critical-subtle, #fdeceb); border-color: var(--mp-colors-border-danger, #dc2626); }
.pipe-lane--open { background: var(--mp-colors-background-information-subtle, #eaf1fb); border-color: var(--mp-colors-border-information, #2f6fd0); }

.pipe-lane-head { display: flex; align-items: center; gap: var(--mp-spacing-3); min-height: 36px; }
.pipe-lane-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-subtle, #97a0af); cursor: grab; flex-shrink: 0; }
.pipe-lane-label { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; flex: 1; }
.pipe-lane-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-lane-input { flex: 1; min-width: 0; }
.pipe-lane-edit {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-colors-icon-subtle, #97a0af);
  opacity: 0; transition: opacity 0.12s ease;
}
/* The rename pencil only reveals on swimlane hover (or keyboard focus). */
.pipe-lane:hover .pipe-lane-edit, .pipe-lane-edit:focus-visible { opacity: 1; }
.pipe-lane-edit:hover { color: var(--mp-colors-text-default, #080d0e); }

/* Card list grows to fill the lane so the total + delete pin to the bottom. */
.pipe-lane-cards { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pipe-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 8px); background: var(--mp-colors-background-stage, #fff);
}
.pipe-card-head { display: flex; flex-direction: column; min-width: 0; }
.pipe-card-company { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-deal { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-card-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.pipe-card-owner { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-note { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pipe-card-foot--end { justify-content: flex-end; }
.pipe-card-aging {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 var(--mp-spacing-1); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-placeholder, #8690a2);
  font-size: var(--mp-font-sizes-xs, 10px); line-height: 1;
}

.pipe-lane-total { display: flex; flex-direction: column; gap: 2px; }
.pipe-lane-total-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #3a4749); }
.pipe-lane-total-value { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); }

.pipe-lane-delete {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start;
  padding: 0 var(--mp-spacing-0\.5, 2px); border: none; background: none; cursor: pointer;
  color: var(--mp-colors-text-secondary, #3a4749); font-size: var(--mp-font-sizes-md);
}
.pipe-lane-delete:hover { color: var(--mp-colors-text-danger, #a8352d); }

.pipe-newstage { flex-shrink: 0; align-self: flex-start; }

/* ── Settings panel — sticky at the far right ── */
.pipe-sidebar {
  flex: 0 0 304px; width: 304px; align-self: stretch;
  box-sizing: border-box;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  /* Pull the divider into the stage's top/bottom padding so the line runs the
     full height (top → bottom); padding keeps the content itself aligned. */
  margin: calc(-1 * var(--mp-spacing-6)) 0;
  padding: var(--mp-spacing-6) 0 var(--mp-spacing-6) var(--mp-spacing-4);
  border-left: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.pipe-side-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pipe-side-labelrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.pipe-side-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); font-variant-numeric: tabular-nums; }

/* Name field = clickable icon prefix + borderless text input, one bordered pill. */
.pipe-name-field { display: flex; align-items: stretch; border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); background: var(--mp-colors-background-neutral, #fff); overflow: hidden; }
.pipe-name-field:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.pipe-name-prefix { display: inline-flex; align-items: center; gap: var(--mp-spacing-0\.5, 2px); flex-shrink: 0; padding: 0 var(--mp-spacing-2); border: none; border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); background: var(--mp-colors-background-neutral-subtle, #f8f9f9); cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.pipe-name-prefix:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-name-prefix-caret { color: var(--mp-colors-icon-subtle, #97a0af); }
.pipe-name-input-el { flex: 1; min-width: 0; border: none; outline: none; background: transparent; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }

.pipe-icon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--mp-spacing-1); max-height: 264px; overflow-y: auto; }
.pipe-icon-choice { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid transparent; border-radius: var(--mp-radii-md, 6px); background: none; cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.pipe-icon-choice:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-icon-choice--active { border-color: var(--mp-colors-border-selected, #029861); color: var(--mp-colors-text-selected, #0f6d4d); background: var(--mp-colors-background-brand-subtle, #eafaf1); }

/* ── Setup tab form (6-col form: 558px max, 20px row gap — rule/form-field-stacking) ── */
.setup-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); max-width: 558px; }
.setup-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.setup-labelrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.setup-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); font-variant-numeric: tabular-nums; }
.setup-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.setup-labelgroup { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.setup-fieldlabel { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
/* Module-name icon prefix (inside MpInputLeftAddon) */
.setup-icon-trigger { display: inline-flex; align-items: center; gap: var(--mp-spacing-0\.5, 2px); padding: 0 var(--mp-spacing-1, 4px); border: none; background: none; cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.setup-icon-caret { color: var(--mp-colors-icon-default, #536062); }
/* Default close-date — indented radios; the box top-aligns natively via #description slot */
.setup-indent { display: flex; flex-direction: column; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); margin-left: var(--mp-spacing-7, 28px); }
.setup-radio-detail { margin-left: var(--mp-spacing-7, 28px); }
/* "Time from record creation" input + unit = 3 grid cols (~279px) */
.setup-amount { display: flex; flex-direction: row; align-items: center; gap: var(--mp-spacing-2); max-width: 224px; }
.setup-amount-input { flex: 1; min-width: 0; }
/* Access — selected users list (mirrors the Team members list: name + email + (−)) */
.setup-user-list { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; }
.setup-user-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.setup-user-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.setup-user-name { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setup-user-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setup-user-remove { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0; border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.setup-user-remove:hover { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-text-danger, #a8352d); }
.setup-access-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }
.setup-access-btn { align-self: flex-start; margin-top: var(--mp-spacing-2); }
.pipe-side-section { display: flex; flex-direction: column; }
.pipe-side-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-row { position: relative; display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2); border-radius: var(--mp-radii-sm); transition: opacity 0.12s ease, background 0.12s ease; }
.pipe-side-row--drag:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-side-rowlabel { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-subtle, #97a0af); cursor: grab; flex-shrink: 0; }
.pipe-side-drag:active { cursor: grabbing; }
/* Drop-target insertion line (top edge) + faded source, like the Deals board drag. */
.pipe-side-row--over::before { content: ''; position: absolute; left: 0; right: 0; top: -1px; height: 2px; border-radius: 2px; background: var(--mp-colors-border-selected, #029861); }
.pipe-side-row.is-dragging { opacity: 0.4; }
.pipe-side-row--sep { border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); margin-top: var(--mp-spacing-1); }
/* Live reorder — rows slide to make room (FLIP), same feel as the swimlanes. */
.pipe-side-rows { display: contents; }
.row-move { transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1); }

/* Sticky action footer — Cancel + Save changes, right-aligned, always visible. */
.builder-footer { flex-shrink: 0; padding: var(--mp-spacing-3) var(--mp-spacing-6); background: var(--mp-colors-background-stage, #fff); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }

/* ── Module not found ── */
.builder-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.builder-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Layout driver ── */
.builder-driver { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-driver-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.builder-driver-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-driver-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Section card ── */
.builder-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.builder-section-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.builder-column { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.builder-field { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-field-main { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.builder-field-labelrow { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.builder-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-field-lock { color: var(--mp-text-subtle); flex-shrink: 0; }
.builder-field-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.builder-field-required { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-field-actions { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.builder-section-foot { display: flex; }

.builder-chip { display: inline-flex; align-items: center; background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-secondary); border: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm); padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-sm); white-space: nowrap; }
.builder-chip--soft { background: var(--mp-background-neutral-subtle, #f8f9f9); border: none; }

.builder-add-section { display: flex; }

/* ── Unused fields ── */
.builder-unused { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-unused-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-unused-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-unused-list { list-style: none; margin: var(--mp-spacing-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-unused-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-unused-action { margin-left: auto; }

/* ── Views ── */
.builder-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.builder-viewrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.builder-viewrow:last-child { border-bottom: none; }
.builder-view-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.builder-view-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-view-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Kebab ── */
.builder-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.builder-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }
.builder-item--danger :deep(*), .builder-item--danger { color: var(--mp-colors-text-danger, #a8352d); }

/* ── Inline errors ── */
.builder-inline-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger, #a8352d); }

/* ── Modals ── */
.builder-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.builder-form-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-form-field--toggle { flex-direction: row; align-items: center; gap: 12px; }
.builder-form-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-form-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-option-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-option-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-option-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.builder-option-add { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.builder-option-add :deep([data-pixel-component="MpInput"]) { flex: 1; }
</style>
