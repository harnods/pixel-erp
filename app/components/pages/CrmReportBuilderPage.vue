<script setup lang="ts">
/**
 * CRM — Report builder (/crm/reports/new, /crm/reports/:id/edit).
 *
 * The PRD's stepper: Source → Columns → Filters → Group & summarize → Preview
 * → Save. Persistent stage nav (not a wizard that discards state going back —
 * all stage state lives in one reactive draft for the whole component
 * lifetime). `orderId` is 'new' for create, or an existing report id for edit
 * — see app/pages/[...slug].vue's Reports routing branch.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpInput, MpTextarea, MpFormControl, MpFormLabel, MpFormErrorMessage, MpIcon, MpCheckbox, MpRadio } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { successToast } from '~/utils/toasts'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import {
  getCrmReport, addCrmReport, updateCrmReport, reportSourceModules, reportableFieldsFor,
  moduleHasProductList, OPERATORS_BY_TYPE, runCrmReport, measureKey, REPORT_NAME_MAX, DESCRIPTION_MAX,
  crmTeamOptions, REPORT_OWNER_OPTIONS,
  type ReportGrain, type ReportCriterion, type CriteriaLogic, type ReportGrouping, type ReportMeasure,
  type ReportVisibility, type ReportAggFn, type DateBucket, type CrmReportInput,
} from '~/data/crmReports'
import { CRM_CURRENT_USER } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const isEdit = computed(() => props.orderId !== 'new')
const existing = computed(() => (isEdit.value ? getCrmReport(props.orderId) : undefined))

// ─── Draft state (all stages share one draft; nothing resets on navigation) ──
const primaryModuleId = ref(existing.value?.primaryModuleId ?? '')
const grain = ref<ReportGrain>(existing.value?.grain ?? 'record')
const columns = reactive<string[]>([...(existing.value?.columns ?? [])])
const criteria = reactive<ReportCriterion[]>(existing.value?.criteria.map((c) => ({ ...c })) ?? [])
const criteriaLogic = ref<CriteriaLogic>(existing.value?.criteriaLogic ?? 'AND')
const groupFieldId = ref(existing.value?.grouping?.fieldId ?? '')
const groupBucket = ref<DateBucket | ''>(existing.value?.grouping?.dateBucket ?? '')
const showDetailRows = ref(existing.value?.grouping?.showDetailRows ?? true)
const measures = reactive<ReportMeasure[]>(existing.value?.measures.map((m) => ({ ...m })) ?? [{ fn: 'count' }])
const sortFieldId = ref(existing.value?.sort?.fieldId ?? '')
const sortDir = ref<'asc' | 'desc'>(existing.value?.sort?.direction ?? 'asc')
const name = ref(existing.value?.name ?? '')
const description = ref(existing.value?.description ?? '')
const visibility = ref<ReportVisibility>(existing.value?.visibility ?? 'private')
const sharedUserIds = reactive<string[]>([...(existing.value?.sharedUserIds ?? [])])
const sharedTeamIds = reactive<string[]>([...(existing.value?.sharedTeamIds ?? [])])

const dirty = ref(false)
function markDirty() { dirty.value = true }

// ─── Stage navigation ───────────────────────────────────────────────────────
type Stage = 'source' | 'columns' | 'filters' | 'group' | 'preview' | 'save'
const STAGES: { key: Stage; label: string }[] = [
  { key: 'source', label: 'Source' },
  { key: 'columns', label: 'Columns' },
  { key: 'filters', label: 'Filters' },
  { key: 'group', label: 'Group & summarize' },
  { key: 'preview', label: 'Preview' },
  { key: 'save', label: 'Save' },
]
const stage = ref<Stage>('source')
function goStage(s: Stage) { stage.value = s }
function nextStage() {
  const i = STAGES.findIndex((s) => s.key === stage.value)
  if (i < STAGES.length - 1) stage.value = STAGES[i + 1].key
}
function prevStage() {
  const i = STAGES.findIndex((s) => s.key === stage.value)
  if (i > 0) stage.value = STAGES[i - 1].key
}

// ─── Source ─────────────────────────────────────────────────────────────────
const moduleOptions = computed(() => reportSourceModules.value.map((m) => ({ value: m.id, label: m.name })))
const showGrainToggle = computed(() => moduleHasProductList(primaryModuleId.value))
function selectModule(v: string) {
  if (v !== primaryModuleId.value) {
    primaryModuleId.value = v
    grain.value = 'record'
    columns.splice(0, columns.length)
    criteria.splice(0, criteria.length)
    groupFieldId.value = ''
    sortFieldId.value = ''
    markDirty()
  }
}

// ─── Columns ────────────────────────────────────────────────────────────────
const columnSearch = ref('')
const allFields = computed(() => reportableFieldsFor(primaryModuleId.value, grain.value))
const availableFields = computed(() =>
  allFields.value.filter((f) => !columns.includes(f.id) && f.label.toLowerCase().includes(columnSearch.value.toLowerCase())),
)
function fieldLabelOf(id: string) { return allFields.value.find((f) => f.id === id)?.label ?? id }
function addColumn(id: string) { columns.push(id); markDirty() }
function removeColumn(id: string) { const i = columns.indexOf(id); if (i >= 0) columns.splice(i, 1); markDirty() }
function moveColumn(id: string, dir: -1 | 1) {
  const i = columns.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= columns.length) return
  ;[columns[i], columns[j]] = [columns[j], columns[i]]
  markDirty()
}

// ─── Filters ────────────────────────────────────────────────────────────────
function fieldType(id: string) { return allFields.value.find((f) => f.id === id)?.type ?? 'text' }
function operatorsFor(id: string) { return OPERATORS_BY_TYPE[fieldType(id)] ?? [] }
const filterError = ref('')
function addCriterion() {
  if (!primaryModuleId.value) { filterError.value = t('Select a source module first.'); return }
  filterError.value = ''
  const first = allFields.value[0]
  if (!first) return
  criteria.push({ id: `c-${Date.now()}-${criteria.length}`, fieldId: first.id, operator: operatorsFor(first.id)[0]?.value ?? 'equals' })
  markDirty()
}
function removeCriterion(id: string) { const i = criteria.findIndex((c) => c.id === id); if (i >= 0) criteria.splice(i, 1); markDirty() }
function onCriterionFieldChange(c: ReportCriterion, fieldId: string) {
  c.fieldId = fieldId
  c.operator = operatorsFor(fieldId)[0]?.value ?? 'equals'
  c.value = undefined; c.value2 = undefined
  markDirty()
}
function needsValue(c: ReportCriterion) { return operatorsFor(c.fieldId).find((o) => o.value === c.operator)?.needsValue ?? true }
function needsSecondValue(c: ReportCriterion) { return operatorsFor(c.fieldId).find((o) => o.value === c.operator)?.needsSecondValue ?? false }

// ─── Group & summarize ──────────────────────────────────────────────────────
const groupableFields = computed(() => allFields.value.filter((f) => f.type !== 'product-list'))
const numericFields = computed(() => allFields.value.filter((f) => f.type === 'number' || f.type === 'currency'))
const AGG_LABELS: Record<ReportAggFn, string> = { count: 'Count', sum: 'Sum', average: 'Average', min: 'Minimum', max: 'Maximum' }
function addMeasure() { measures.push({ fn: 'sum', fieldId: numericFields.value[0]?.id }); markDirty() }
function removeMeasure(i: number) { measures.splice(i, 1); markDirty() }

// ─── Preview ────────────────────────────────────────────────────────────────
const draftDefinition = computed<CrmReportInput>(() => ({
  name: name.value.trim(),
  description: description.value.trim() || undefined,
  primaryModuleId: primaryModuleId.value,
  grain: grain.value,
  columns: [...columns],
  criteria: criteria.map((c) => ({ ...c })),
  criteriaLogic: criteriaLogic.value,
  grouping: groupFieldId.value ? { fieldId: groupFieldId.value, dateBucket: groupBucket.value || undefined, showDetailRows: showDetailRows.value } : undefined,
  measures: measures.map((m) => ({ ...m })),
  sort: sortFieldId.value ? { fieldId: sortFieldId.value, direction: sortDir.value } : undefined,
  visibility: visibility.value,
  sharedUserIds: visibility.value === 'selected' ? [...sharedUserIds] : undefined,
  sharedTeamIds: visibility.value === 'selected' ? [...sharedTeamIds] : undefined,
}))
const previewResult = computed(() => {
  if (!primaryModuleId.value || !columns.length) return null
  return runCrmReport({ ...draftDefinition.value, id: 'preview', ownerId: CRM_CURRENT_USER, status: 'active', createdAt: '', updatedAt: '', updatedBy: '' }, { limit: 50 })
})

function previewCellText(col: string, value: unknown): string {
  if (value == null || value === '') return '—'
  const type = fieldType(col)
  if (type === 'date') return formatDate(String(value))
  if (type === 'currency') return formatIDR(Number(value))
  return String(value)
}

// ─── Validation ─────────────────────────────────────────────────────────────
const canPreview = computed(() => !!primaryModuleId.value && (columns.length > 0 || measures.length > 0))
const nameError = ref('')
const saveError = ref('')
function validateName(): boolean {
  const v = name.value.trim()
  nameError.value = !v ? t('You must give this report a name') : v.length > REPORT_NAME_MAX ? t('Name is too long') : ''
  return !nameError.value
}

// ─── Unsaved-changes guard ──────────────────────────────────────────────────
const discardConfirmOpen = ref(false)
function discardAndLeave() {
  if (dirty.value) { discardConfirmOpen.value = true; return }
  router.push('/crm/reports')
}
function confirmDiscard() { discardConfirmOpen.value = false; router.push('/crm/reports') }

// ─── Save ───────────────────────────────────────────────────────────────────
function save() {
  if (!validateName()) { stage.value = 'save'; return }
  if (!canPreview.value) { saveError.value = t('Select a source and at least one column before saving.'); stage.value = 'columns'; return }
  saveError.value = ''
  const input = draftDefinition.value
  if (isEdit.value && existing.value) {
    updateCrmReport(existing.value.id, input)
    successToast(t('Report saved'))
    router.push(`/crm/reports/${existing.value.id}`)
  } else {
    const created = addCrmReport(input)
    successToast(t('Report created'))
    router.push(`/crm/reports/${created.id}`)
  }
}

function moduleLabel(id: string) { return moduleOptions.value.find((m) => m.value === id)?.label ?? id }
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ isEdit ? t('Edit report') : t('Create report') }}</h1>
      </div>
      <div class="crm-titlebar__right">
        <button class="btn-enterprise btn-enterprise--ghost" @click="discardAndLeave">{{ t('Cancel') }}</button>
        <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
      </div>
    </header>

    <nav class="cc-viewtabs">
      <button v-for="s in STAGES" :key="s.key" class="page-tab" :class="{ 'page-tab--active': stage === s.key }" type="button" @click="goStage(s.key)">
        {{ t(s.label) }}
      </button>
    </nav>

    <div class="cc-stage">
      <!-- ── Source ── -->
      <section v-show="stage === 'source'" class="rb-section">
        <h2 class="rb-section-title">{{ t('Choose a primary source') }}</h2>
        <p class="rb-section-desc">{{ t('Your report starts from one authorized module.') }}</p>
        <ErpFilterSelect id="rb-module" :model-value="primaryModuleId" :placeholder="t('Primary module')" :options="moduleOptions" width="320px" :is-disabled="isEdit" @update:model-value="selectModule" />
        <p v-if="isEdit" class="rb-hint" data-devchange="crm-reports-builder-source-lock">{{ t('The primary source cannot be changed after a report is saved. Use Create report for a different source.') }}</p>

        <div v-if="showGrainToggle" class="rb-grain">
          <h3 class="rb-subtitle">{{ t('Result grain') }}</h3>
          <label class="rb-radio-row">
            <MpRadio id="rb-grain-record" name="rb-grain" value="record" :is-checked="grain === 'record'" @change="grain = 'record'; markDirty()" />
            <span>{{ t('CRM record') }} — {{ t('one row per authorized primary record') }}</span>
          </label>
          <label class="rb-radio-row">
            <MpRadio id="rb-grain-line" name="rb-grain" value="product-line" :is-checked="grain === 'product-line'" @change="grain = 'product-line'; markDirty()" />
            <span>{{ t('Product List line') }} — {{ t('one row per stored product line; parent fields repeat') }}</span>
          </label>
        </div>

        <p v-if="!primaryModuleId" class="rb-hint">{{ t('No eligible source is selected yet.') }}</p>
      </section>

      <!-- ── Columns ── -->
      <section v-show="stage === 'columns'" class="rb-section">
        <h2 class="rb-section-title">{{ t('Choose columns') }}</h2>
        <div class="rb-columns-grid">
          <div class="rb-col-panel">
            <h3 class="rb-subtitle">{{ t('Available fields') }}</h3>
            <input v-model="columnSearch" class="rb-search-input" type="text" :placeholder="t('Search fields...')">
            <ul class="rb-field-list">
              <li v-for="f in availableFields" :key="f.id" class="rb-field-item">
                <span>{{ f.label }}</span>
                <button class="rb-icon-btn" type="button" :aria-label="t('Add column')" @click="addColumn(f.id)"><MpIcon name="add" size="sm" /></button>
              </li>
              <li v-if="!availableFields.length" class="rb-field-empty">{{ t('No more fields to add.') }}</li>
            </ul>
          </div>
          <div class="rb-col-panel">
            <h3 class="rb-subtitle">{{ t('Selected columns') }} ({{ columns.length }})</h3>
            <ul class="rb-field-list">
              <li v-for="(id, i) in columns" :key="id" class="rb-field-item">
                <span>{{ fieldLabelOf(id) }}</span>
                <span class="rb-field-actions">
                  <button class="rb-icon-btn" type="button" :aria-label="t('Move up')" :disabled="i === 0" @click="moveColumn(id, -1)"><MpIcon name="caret-up" size="sm" /></button>
                  <button class="rb-icon-btn" type="button" :aria-label="t('Move down')" :disabled="i === columns.length - 1" @click="moveColumn(id, 1)"><MpIcon name="caret-down" size="sm" /></button>
                  <button class="rb-icon-btn" type="button" :aria-label="t('Remove column')" @click="removeColumn(id)"><MpIcon name="close" size="sm" /></button>
                </span>
              </li>
              <li v-if="!columns.length" class="rb-field-empty">{{ t('Add at least one column, or configure a summary-only report in Group & summarize.') }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ── Filters ── -->
      <section v-show="stage === 'filters'" class="rb-section">
        <h2 class="rb-section-title">{{ t('Saved filters') }}</h2>
        <div v-if="criteria.length > 1" class="rb-logic-toggle">
          <span>{{ t('Match') }}</span>
          <label class="rb-radio-row rb-radio-row--inline"><MpRadio id="rb-logic-and" name="rb-logic" value="AND" :is-checked="criteriaLogic === 'AND'" @change="criteriaLogic = 'AND'; markDirty()" /><span>{{ t('all conditions (AND)') }}</span></label>
          <label class="rb-radio-row rb-radio-row--inline"><MpRadio id="rb-logic-or" name="rb-logic" value="OR" :is-checked="criteriaLogic === 'OR'" @change="criteriaLogic = 'OR'; markDirty()" /><span>{{ t('any condition (OR)') }}</span></label>
        </div>

        <div v-for="c in criteria" :key="c.id" class="rb-criterion-row">
          <ErpFilterSelect :id="`rb-crit-field-${c.id}`" :model-value="c.fieldId" :placeholder="t('Field')" :options="allFields.map(f => ({ value: f.id, label: f.label }))" width="200px" @update:model-value="(v: string) => onCriterionFieldChange(c, v)" />
          <ErpFilterSelect :id="`rb-crit-op-${c.id}`" v-model="c.operator" :placeholder="t('Operator')" :options="operatorsFor(c.fieldId)" width="160px" :is-clearable="false" @update:model-value="markDirty" />
          <input v-if="needsValue(c)" v-model="c.value" class="rb-value-input" type="text" :placeholder="t('Value')" @input="markDirty">
          <input v-if="needsSecondValue(c)" v-model="c.value2" class="rb-value-input" type="text" :placeholder="t('And')" @input="markDirty">
          <button class="rb-icon-btn" type="button" :aria-label="t('Remove filter')" @click="removeCriterion(c.id)"><MpIcon name="close" size="sm" /></button>
        </div>
        <button class="btn-enterprise btn-enterprise--secondary rb-add-btn" type="button" @click="addCriterion">
          <MpIcon name="add" size="sm" /> {{ t('Add filter') }}
        </button>
        <p v-if="filterError" class="rb-error">{{ filterError }}</p>
        <p v-else-if="!criteria.length" class="rb-hint">{{ t('No filters — every authorized record is included.') }}</p>
      </section>

      <!-- ── Group & summarize ── -->
      <section v-show="stage === 'group'" class="rb-section">
        <h2 class="rb-section-title">{{ t('Row grouping') }}</h2>
        <div class="rb-group-row">
          <ErpFilterSelect id="rb-group-field" v-model="groupFieldId" :placeholder="t('No grouping')" :options="groupableFields.map(f => ({ value: f.id, label: f.label }))" width="240px" @update:model-value="markDirty" />
          <ErpFilterSelect v-if="groupFieldId && fieldType(groupFieldId) === 'date'" id="rb-group-bucket" v-model="groupBucket" :placeholder="t('Bucket')" :options="[{value:'day',label:t('Day')},{value:'week',label:t('Week')},{value:'month',label:t('Month')},{value:'quarter',label:t('Quarter')},{value:'year',label:t('Year')}]" width="140px" @update:model-value="markDirty" />
        </div>
        <MpCheckbox v-if="groupFieldId" id="rb-show-detail" :is-checked="showDetailRows" :aria-label="t('Show detail rows')" @change="(on: boolean) => { showDetailRows = on; markDirty() }" />
        <span v-if="groupFieldId" class="rb-checkbox-label">{{ t('Show detail rows under each group') }}</span>

        <h2 class="rb-section-title rb-section-title--spaced">{{ t('Summaries') }}</h2>
        <div v-for="(m, i) in measures" :key="i" class="rb-measure-row">
          <ErpFilterSelect :id="`rb-measure-fn-${i}`" v-model="m.fn" :placeholder="t('Function')" :options="Object.entries(AGG_LABELS).map(([value,label]) => ({value, label: t(label)}))" width="160px" :is-clearable="false" @update:model-value="markDirty" />
          <ErpFilterSelect v-if="m.fn !== 'count'" :id="`rb-measure-field-${i}`" v-model="m.fieldId" :placeholder="t('Field')" :options="numericFields.map(f => ({ value: f.id, label: f.label }))" width="200px" @update:model-value="markDirty" />
          <button class="rb-icon-btn" type="button" :aria-label="t('Remove summary')" @click="removeMeasure(i)"><MpIcon name="close" size="sm" /></button>
        </div>
        <button class="btn-enterprise btn-enterprise--secondary rb-add-btn" type="button" @click="addMeasure">
          <MpIcon name="add" size="sm" /> {{ t('Add summary') }}
        </button>

        <h2 class="rb-section-title rb-section-title--spaced">{{ t('Sort') }}</h2>
        <div class="rb-group-row">
          <ErpFilterSelect id="rb-sort-field" v-model="sortFieldId" :placeholder="t('No sort (default order)')" :options="allFields.map(f => ({ value: f.id, label: f.label }))" width="240px" @update:model-value="markDirty" />
          <ErpFilterSelect v-if="sortFieldId" id="rb-sort-dir" v-model="sortDir" :placeholder="t('Direction')" :options="[{value:'asc',label:t('Ascending')},{value:'desc',label:t('Descending')}]" width="140px" :is-clearable="false" @update:model-value="markDirty" />
        </div>
      </section>

      <!-- ── Preview ── -->
      <section v-show="stage === 'preview'" class="rb-section">
        <h2 class="rb-section-title">{{ t('Preview') }}</h2>
        <p v-if="!canPreview" class="rb-hint">{{ t('Choose a source and at least one column to preview.') }}</p>
        <template v-else-if="previewResult">
          <p class="rb-section-desc">{{ t('Showing the first') }} {{ previewResult.rows.length }} {{ t('rows using your current access.') }}</p>
          <div class="rb-table-wrap">
            <table class="rb-table">
              <thead>
                <tr>
                  <th v-for="col in previewResult.columns" :key="col">{{ fieldLabelOf(col) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in previewResult.rows" :key="row.key">
                  <td v-for="col in previewResult.columns" :key="col">{{ previewCellText(col, row.cells[col]) }}</td>
                </tr>
                <tr v-if="!previewResult.rows.length"><td :colspan="previewResult.columns.length || 1" class="rb-empty-cell">{{ t('No records match this definition yet.') }}</td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <!-- ── Save ── -->
      <section v-show="stage === 'save'" class="rb-section rb-section--narrow">
        <h2 class="rb-section-title">{{ t('Name and share') }}</h2>
        <MpFormControl :is-invalid="!!nameError">
          <MpFormLabel is-required>{{ t('Report name') }}</MpFormLabel>
          <MpInput v-model="name" :maxlength="REPORT_NAME_MAX" @blur="validateName" @update:model-value="markDirty" />
          <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl class="rb-field-spaced">
          <MpFormLabel>{{ t('Description') }}</MpFormLabel>
          <MpTextarea v-model="description" :maxlength="DESCRIPTION_MAX" @update:model-value="markDirty" />
        </MpFormControl>

        <h3 class="rb-subtitle rb-field-spaced">{{ t('Visibility') }}</h3>
        <label class="rb-radio-row"><MpRadio id="rb-vis-private" name="rb-vis" value="private" :is-checked="visibility === 'private'" @change="visibility = 'private'; markDirty()" /><span>{{ t('Private') }} — {{ t('only you (and report managers) can discover it') }}</span></label>
        <label class="rb-radio-row"><MpRadio id="rb-vis-selected" name="rb-vis" value="selected" :is-checked="visibility === 'selected'" @change="visibility = 'selected'; markDirty()" /><span>{{ t('Selected Users/Teams') }}</span></label>
        <label class="rb-radio-row"><MpRadio id="rb-vis-everyone" name="rb-vis" value="everyone" :is-checked="visibility === 'everyone'" @change="visibility = 'everyone'; markDirty()" /><span>{{ t('Everyone eligible') }} — {{ t('anyone who independently qualifies for the source') }}</span></label>

        <div v-if="visibility === 'selected'" class="rb-share-pickers">
          <ErpFilterSelect id="rb-share-user" :model-value="''" :placeholder="t('Add a user')" :options="REPORT_OWNER_OPTIONS.filter(o => !sharedUserIds.includes(o)).map(o => ({value:o,label:o}))" width="220px" @update:model-value="(v: string) => { if (v) { sharedUserIds.push(v); markDirty() } }" />
          <div class="rb-chip-list">
            <span v-for="u in sharedUserIds" :key="u" class="rb-chip">{{ u }} <button type="button" :aria-label="t('Remove')" @click="sharedUserIds.splice(sharedUserIds.indexOf(u), 1); markDirty()"><MpIcon name="close" size="sm" /></button></span>
          </div>
          <ErpFilterSelect id="rb-share-team" :model-value="''" :placeholder="t('Add a team')" :options="crmTeamOptions().filter(o => !sharedTeamIds.includes(o.value))" width="220px" @update:model-value="(v: string) => { if (v) { sharedTeamIds.push(v); markDirty() } }" />
          <div class="rb-chip-list">
            <span v-for="tid in sharedTeamIds" :key="tid" class="rb-chip">{{ crmTeamOptions().find(o => o.value === tid)?.label ?? tid }} <button type="button" :aria-label="t('Remove')" @click="sharedTeamIds.splice(sharedTeamIds.indexOf(tid), 1); markDirty()"><MpIcon name="close" size="sm" /></button></span>
          </div>
          <p class="rb-hint">{{ t('Sharing grants discovery and Run only — not edit, export, or underlying data access.') }}</p>
        </div>

        <p v-if="saveError" class="rb-error">{{ saveError }}</p>

        <div class="rb-save-summary">
          <p><strong>{{ t('Source') }}:</strong> {{ moduleLabel(primaryModuleId) || '—' }}</p>
          <p><strong>{{ t('Columns') }}:</strong> {{ columns.length }}</p>
          <p><strong>{{ t('Filters') }}:</strong> {{ criteria.length }}</p>
          <p><strong>{{ t('Grouping') }}:</strong> {{ groupFieldId ? fieldLabelOf(groupFieldId) : t('None') }}</p>
          <p><strong>{{ t('Summaries') }}:</strong> {{ measures.length }}</p>
        </div>
      </section>

      <!-- ── Stage footer nav ── -->
      <div class="rb-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" :disabled="stage === 'source'" @click="prevStage">{{ t('Back') }}</button>
        <button v-if="stage !== 'save'" class="btn-enterprise btn-enterprise--primary" type="button" @click="nextStage">{{ t('Next') }}</button>
        <MpButton v-else variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
      </div>
    </div>

    <ConfirmModal
      :is-open="discardConfirmOpen"
      :title="t('Discard changes?')"
      :description="t('You have unsaved changes. If you leave now, they will be lost.')"
      :confirm-label="t('Discard')"
      :is-danger="true"
      @update:is-open="(v) => { if (!v) discardConfirmOpen = false }"
      @confirm="confirmDiscard"
    />
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.crm-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.cc-viewtabs { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-1); padding: 0 var(--mp-spacing-6); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); overflow-x: auto; }
.page-tab { border: none; background: none; cursor: pointer; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 2px solid transparent; white-space: nowrap; }
.page-tab--active { color: var(--mp-text-link, #165082); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-border-brand-bold, #029861); }

.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-6, 24px); display: flex; flex-direction: column; }
.rb-section { max-width: 900px; }
.rb-section--narrow { max-width: 600px; }
.rb-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rb-section-title--spaced { margin-top: var(--mp-spacing-6); }
.rb-section-desc { margin: 0 0 var(--mp-spacing-4); color: var(--mp-text-secondary); }
.rb-subtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: var(--mp-spacing-4) 0 var(--mp-spacing-2); }
.rb-hint { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.rb-error { color: var(--mp-text-danger); font-size: var(--mp-font-sizes-sm); }

.rb-grain { margin-top: var(--mp-spacing-4); }
.rb-radio-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.rb-radio-row--inline { margin-bottom: 0; }
.rb-radio-row input { margin-top: 3px; }

.rb-columns-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); }
.rb-col-panel { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); padding: var(--mp-spacing-3); }
.rb-search-input { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); }
.rb-field-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
.rb-field-item { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default, #f1f5f9); font-size: var(--mp-font-sizes-md); }
.rb-field-empty { padding: var(--mp-spacing-3); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.rb-field-actions { display: flex; gap: var(--mp-spacing-1); }
.rb-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-md); }
.rb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rb-icon-btn:hover:not(:disabled) { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rb-logic-toggle { display: flex; align-items: center; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.rb-criterion-row { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.rb-value-input { padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); width: 160px; }
.rb-add-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); margin-top: var(--mp-spacing-2); }

.rb-group-row { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.rb-checkbox-label { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rb-measure-row { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }

.rb-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); }
.rb-table { width: 100%; border-collapse: collapse; }
.rb-table thead th { text-align: left; text-transform: uppercase; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f5f9); padding: var(--mp-spacing-2) var(--mp-spacing-3); white-space: nowrap; }
.rb-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.rb-empty-cell { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }

.rb-field-spaced { margin-top: var(--mp-spacing-4); }
.rb-share-pickers { margin-top: var(--mp-spacing-3); display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-items: flex-start; }
.rb-chip-list { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.rb-chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: 2px var(--mp-spacing-2); background: var(--mp-background-neutral-subtle, #f1f5f9); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm); }
.rb-chip button { display: inline-flex; border: none; background: none; cursor: pointer; padding: 0; color: var(--mp-text-secondary); }

.rb-save-summary { margin-top: var(--mp-spacing-6); padding: var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-md); }
.rb-save-summary p { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rb-footer { margin-top: auto; padding-top: var(--mp-spacing-6); display: flex; justify-content: space-between; gap: var(--mp-spacing-3); }
</style>
