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
  MpButton, MpIcon, MpToggle, MpInput,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  getCrmModule, persistCrmModule,
  CRM_FIELD_TYPE_LABELS,
  type CrmModule, type CrmModuleField, type CrmFieldType,
  type CrmModuleView, type CrmModuleViewType, type CrmModuleViewVisibility,
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
interface Draft {
  name: string
  sections: string[]
  fields: CrmModuleField[]
  views: CrmModuleView[]
  layoutDriver: string // '' = none
}
const draft = reactive<Draft>({ name: '', sections: [], fields: [], views: [], layoutDriver: '' })

function loadDraft() {
  const m = mod.value
  if (!m) return
  draft.name = m.name
  draft.sections = clone(m.sections)
  draft.fields = clone(m.fields)
  draft.views = clone(m.views)
  draft.layoutDriver = m.layoutDriver ?? ''
}
onMounted(loadDraft)
watch(() => props.orderId, loadDraft)

// ── Header status badge ──────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { status: string; label: string }> = {
  published: { status: 'active', label: 'Published' },
  draft: { status: 'draft', label: 'Draft' },
  incomplete: { status: 'pending', label: 'Incomplete' },
}
const statusBadge = computed(() => STATUS_BADGE[mod.value?.status ?? 'draft'] ?? STATUS_BADGE.draft!)

// ── Tabs (v-model = index) ───────────────────────────────────────────────────
const activeTab = ref(0)

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
  Object.assign(m, {
    sections: [...draft.sections],
    fields: clone(draft.fields),
    views: clone(draft.views),
    layoutDriver: draft.layoutDriver || undefined,
  })
  if (!m.system) m.name = draft.name.trim() || m.name
  persistCrmModule(m, AUTHOR, nowStamp())
  successToast(t('Module saved'))
}
function cancel() { router.push('/crm/settings/modules') }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/settings/modules">{{ t('Modules settings') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 v-if="!mod || mod.system" class="detail-title">{{ mod ? mod.name : t('Module not found') }}</h1>
          <MpInput v-else id="builder-title" v-model="draft.name" class="builder-title-input" :aria-label="t('Module name')" />
          <ErpStatusBadge v-if="mod" :status="statusBadge.status" :label="t(statusBadge.label)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="saveChanges">{{ t('Save changes') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Module not found ── -->
      <div v-if="!mod" class="builder-empty">
        <MpIcon name="folder-close" size="xl" />
        <p class="builder-empty-title">{{ t('Module not found') }}</p>
        <p class="builder-empty-caption">{{ t('This module doesn’t exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="cancel">{{ t('Back to Modules settings') }}</MpButton>
      </div>

      <MpTabs v-else id="cmb-tabs" v-model="activeTab" is-manual variant-color="green" class="builder-tabs">
        <MpTabList>
          <MpTab id="cmb-tab-fields" value="fields">{{ t('Fields & layout') }}</MpTab>
          <MpTab id="cmb-tab-views" value="views">{{ t('Views') }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ════════ FIELDS & LAYOUT ════════ -->
          <MpTabPanel value="fields">
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
                      <MpPopoverListItem class="builder-item--danger" @click="deleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem>
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
                      <MpButton variant="ghost" is-rounded size="sm" @click="openEditField(f)">{{ t('Edit') }}</MpButton>
                      <MpButton variant="ghost" is-rounded size="sm" @click="removeFieldFromLayout(f)">{{ t('Remove') }}</MpButton>
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
                    <MpButton variant="secondary" is-rounded size="sm" @click="openEditField(f)">{{ t('Add to layout') }}</MpButton>
                  </div>
                </li>
              </ul>
            </div>
          </MpTabPanel>

          <!-- ════════ VIEWS ════════ -->
          <MpTabPanel value="views">
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
                  <MpButton variant="ghost" is-rounded size="sm" @click="openEditView(v)">{{ t('Edit') }}</MpButton>
                  <MpButton variant="ghost" is-rounded size="sm" @click="removeView(v)">{{ t('Remove') }}</MpButton>
                </div>
              </li>
            </ul>
            <p v-if="viewsError" class="builder-inline-error">{{ viewsError }}</p>
            <div class="builder-add-section">
              <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddView">{{ t('Add view') }}</MpButton>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

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
            <MpButton variant="primary" is-rounded @click="saveField">{{ fieldModalMode === 'edit' ? t('Save changes') : t('Add field') }}</MpButton>
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
            <MpButton variant="primary" is-rounded @click="saveSection">{{ sectionModalMode === 'rename' ? t('Save changes') : t('Add section') }}</MpButton>
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
            <MpButton variant="primary" is-rounded @click="saveView">{{ viewModalMode === 'edit' ? t('Save changes') : t('Add view') }}</MpButton>
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
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
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

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.builder-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5); }
.builder-tabs :deep([data-pixel-component="MpTabPanel"]) { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* ── Module not found ── */
.builder-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.builder-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Layout driver ── */
.builder-driver { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral); }
.builder-driver-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.builder-driver-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-driver-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Section card ── */
.builder-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral); }
.builder-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.builder-section-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.builder-column { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.builder-field { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle); }
.builder-field-main { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.builder-field-labelrow { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.builder-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-field-lock { color: var(--mp-text-subtle); flex-shrink: 0; }
.builder-field-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.builder-field-required { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-field-actions { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.builder-section-foot { display: flex; }

.builder-chip { display: inline-flex; align-items: center; background: var(--mp-background-neutral); color: var(--mp-text-secondary); border: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-sm); white-space: nowrap; }
.builder-chip--soft { background: var(--mp-background-neutral-subtle); border: none; }

.builder-add-section { display: flex; }

/* ── Unused fields ── */
.builder-unused { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral); }
.builder-unused-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-unused-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-unused-list { list-style: none; margin: var(--mp-spacing-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-unused-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle); }
.builder-unused-action { margin-left: auto; }

/* ── Views ── */
.builder-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.builder-viewrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
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
.builder-option-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle); }
.builder-option-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.builder-option-add { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.builder-option-add :deep([data-pixel-component="MpInput"]) { flex: 1; }
</style>
