<!-- prod-parity: jurnal-frontend-app/src/pages/settings/pages/custom-fields/ (custom-fields.vue, CustomFieldDrawer, DrawerFieldPosition, custom-field-log-modal) -->
<script setup lang="ts">
/**
 * Settings › Custom fields — quota header, status filter + search, the field
 * list (name, type, page, status, last modified) with row actions (Edit,
 * Delete, Deactivate/Activate, View changelog), the Add / Edit / Details
 * drawer with a live preview, Reorder custom fields, and the changelog modal.
 */
import {
  MpButton, MpIcon, MpInput, MpCheckbox, MpRadio, MpFormControl, MpFormLabel, MpFormErrorMessage, MpProgress,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatDateTime } from '~/utils/date'
import {
  customFields, getCustomField, usedCustomFieldQuota, isCustomFieldNameUsed, nextCustomFieldId,
  CUSTOM_FIELD_QUOTA, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_FEATURES, CUSTOM_FIELD_SUB_FEATURES,
  type CustomField, type CustomFieldType, type CustomFieldFeature, type CustomFieldStatus,
} from '~/data/customFields'

const { t } = useLocale()
const actions = useParityActions()
const ME = 'Rizal Candra'
const NAME_MAX = 25

// ─── Quota ───────────────────────────────────────────────────────────────────
const used = computed(() => usedCustomFieldQuota())
const remaining = computed(() => CUSTOM_FIELD_QUOTA - used.value)
const usedPct = computed(() => String(Math.round((used.value / CUSTOM_FIELD_QUOTA) * 100)))

// ─── Table ───────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<CustomFieldStatus, string> = {
  active: 'Active', inactive: 'Inactive', 'inactive-system': 'Inactive by system', deleted: 'Deleted',
}
const STATUS_TYPE: Record<CustomFieldStatus, 'completed' | 'announcement' | 'critical'> = {
  active: 'completed', inactive: 'announcement', 'inactive-system': 'announcement', deleted: 'critical',
}
const statusOptions = [
  { value: 'active', label: t('Active') },
  { value: 'inactive', label: t('Inactive') },
  { value: 'deleted', label: t('Deleted') },
]
const statusFilter = ref('')

const columns: TableColumn[] = [
  { key: 'name', label: t('Custom field name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'type', label: t('Custom field type') },
  { key: 'feature', label: t('Page'), kind: 'address' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'updatedAt', label: t('Last modified'), kind: 'date', sortable: true, sortType: 'date' },
]

const rows = computed(() => customFields.filter((f) => {
  if (!statusFilter.value) return true
  if (statusFilter.value === 'inactive') return f.status === 'inactive' || f.status === 'inactive-system'
  return f.status === statusFilter.value
}))
const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<CustomField>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
})
const hasActiveFilter = computed(() => !!statusFilter.value)
function clearFilters() { statusFilter.value = '' }
function clearAll() { statusFilter.value = ''; search.value = '' }

// ─── View all sub pages ──────────────────────────────────────────────────────
const viewAll = ref<CustomField | null>(null)

// ─── Add / edit / details drawer ─────────────────────────────────────────────
type Mode = 'create' | 'edit' | 'detail'
const drawerOpen = ref(false)
const mode = ref<Mode>('create')
const editingId = ref<string | null>(null)
const showErrors = ref(false)
const leaveOpen = ref(false)

const form = reactive({
  name: '',
  feature: '' as CustomFieldFeature | '',
  subFeatures: [] as string[],
  type: '' as CustomFieldType | '',
  hasMaxChar: false,
  maxChar: '',
  useDecimal: false,
  additional: 'none' as 'none' | 'prefix' | 'suffix',
  additionalText: '',
  defaultToday: false,
  multiSelect: false,
  options: [''] as string[],
  mainOption: false,
  required: false,
})

const typeOptions = CUSTOM_FIELD_TYPES.map((x) => ({ value: x.value, label: t(x.value) }))
const featureOptions = CUSTOM_FIELD_FEATURES.map((f) => ({ value: f, label: t(f) }))
const subOptions = computed(() => (form.feature === 'Sales' || form.feature === 'Purchases') ? CUSTOM_FIELD_SUB_FEATURES[form.feature] : [])
const editingField = computed(() => (editingId.value ? getCustomField(editingId.value) : undefined))
const drawerTitle = computed(() => mode.value === 'create' ? t('Add custom field') : mode.value === 'edit' ? t('Edit custom field') : t('Custom field details'))
/** Only a dropdown's options can change once saved. */
const lockCore = computed(() => mode.value === 'edit')

function loadForm(f?: CustomField) {
  form.name = f?.name ?? ''
  form.feature = f?.feature ?? ''
  form.subFeatures = [...(f?.subFeatures ?? [])]
  form.type = f?.type ?? ''
  form.hasMaxChar = f?.maxChar != null
  form.maxChar = f?.maxChar != null ? String(f.maxChar) : ''
  form.useDecimal = f?.useDecimal ?? false
  form.additional = f?.prefix ? 'prefix' : f?.suffix ? 'suffix' : 'none'
  form.additionalText = f?.prefix || f?.suffix || ''
  form.defaultToday = f?.defaultToday ?? false
  form.multiSelect = f?.multiSelect ?? false
  form.options = f?.options.length ? [...f.options] : ['']
  form.mainOption = false
  form.required = f?.required ?? false
  showErrors.value = false
}

function openCreate() {
  if (remaining.value <= 0) { runoutOpen.value = true; return }
  mode.value = 'create'; editingId.value = null; loadForm(); drawerOpen.value = true
}
function openDetail(id: string) { mode.value = 'detail'; editingId.value = id; loadForm(getCustomField(id)); drawerOpen.value = true }
function openEdit(f: CustomField) {
  if (f.type !== 'Dropdown') { toast.notify({ variant: 'info', title: t('Other than a dropdown custom field, you cannot edit it once saved.'), maxWidth: 'max-content' }); return }
  if (f.status !== 'active') { toast.notify({ variant: 'info', title: t('You cannot edit this custom field because it is inactive.'), maxWidth: 'max-content' }); return }
  mode.value = 'edit'; editingId.value = f.id; loadForm(f); drawerOpen.value = true
}
function requestClose() {
  if (mode.value === 'create' && (form.name || form.feature || form.type)) { leaveOpen.value = true; return }
  drawerOpen.value = false
}
function leaveDrawer() { leaveOpen.value = false; drawerOpen.value = false }
watch(() => actions.newCustomField, openCreate)

function addOption() { form.options.push('') }
function removeOption(i: number) { form.options.splice(i, 1) }

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.name.trim()) e.name = t('You must enter custom field name')
  else if (mode.value === 'create' && isCustomFieldNameUsed(form.name)) e.name = t('Name has been used. Please enter another name')
  if (!form.feature) e.feature = t('You must select page')
  else if (subOptions.value.length && !form.subFeatures.length) e.sub = t('You must select sub page')
  if (!form.type) e.type = t('You must select custom field type')
  if (form.type === 'Text' && form.hasMaxChar && !(Number(form.maxChar) > 0)) e.maxChar = t('You must enter the maximum characters')
  if (form.type === 'Number' && form.additional !== 'none' && !form.additionalText.trim()) e.additional = form.additional === 'prefix' ? t('You must enter prefix') : t('You must enter suffix')
  if (form.type === 'Dropdown') {
    const seen = new Set<string>()
    form.options.forEach((o, i) => {
      const v = o.trim().toLowerCase()
      if (!v) e[`opt${i}`] = t('You must enter option')
      else if (seen.has(v)) e[`opt${i}`] = t('You must enter a different option')
      seen.add(v)
    })
  }
  return e
})

const confirmOpen = ref(false)
function requestSave() {
  showErrors.value = true
  if (Object.keys(errors.value).length) return
  if (mode.value === 'edit') { commit(); return }
  confirmOpen.value = true
}
function commit() {
  confirmOpen.value = false
  const now = new Date().toISOString()
  if (mode.value === 'edit' && editingField.value) {
    const f = editingField.value
    const added = form.options.map((o) => o.trim()).filter((o) => !f.options.includes(o))
    f.options = form.options.map((o) => o.trim())
    f.updatedAt = now; f.updatedBy = ME
    added.forEach((o) => f.logs.unshift({ at: now, user: ME, description: `Added ${o} option` }))
    toast.notify({ variant: 'success', title: t('Custom field changes saved') })
  } else {
    const name = form.name.trim()
    customFields.unshift({
      id: nextCustomFieldId(), name, type: form.type as CustomFieldType, feature: form.feature as CustomFieldFeature,
      subFeatures: [...form.subFeatures], status: 'active', required: form.required,
      maxChar: form.type === 'Text' && form.hasMaxChar ? Number(form.maxChar) : null,
      useDecimal: form.type === 'Number' && form.useDecimal,
      prefix: form.type === 'Number' && form.additional === 'prefix' ? form.additionalText.trim() : '',
      suffix: form.type === 'Number' && form.additional === 'suffix' ? form.additionalText.trim() : '',
      defaultToday: form.type === 'Date' && form.defaultToday,
      options: form.type === 'Dropdown' ? form.options.map((o) => o.trim()) : [],
      multiSelect: form.type === 'Dropdown' && form.multiSelect,
      position: customFields.filter((x) => x.feature === form.feature).length + 1,
      updatedAt: now, updatedBy: ME,
      logs: [{ at: now, user: ME, description: `Added a custom field: ${name}` }],
    })
    toast.notify({ variant: 'success', title: t('Custom field saved') })
  }
  drawerOpen.value = false
}

// Preview — what the field looks like on its page.
const previewLabel = computed(() => form.name || t('Custom field name'))
const previewValue = computed(() => {
  switch (form.type) {
    case 'Number': return `${form.additional === 'prefix' ? form.additionalText : ''}${form.useDecimal ? '1.250,50' : '1.250'}${form.additional === 'suffix' ? ` ${form.additionalText}` : ''}`
    case 'Date': return form.defaultToday ? '22/08/2026' : ''
    case 'Dropdown': return form.options[0] || ''
    default: return ''
  }
})

// ─── Activate / deactivate / delete ──────────────────────────────────────────
const confirmKind = ref<'delete' | 'deactivate' | null>(null)
const target = ref<CustomField | null>(null)
function ask(kind: 'delete' | 'deactivate', f: CustomField) { target.value = f; confirmKind.value = kind }
function log(f: CustomField, description: string) { const now = new Date().toISOString(); f.updatedAt = now; f.updatedBy = ME; f.logs.unshift({ at: now, user: ME, description }) }
function confirmAction() {
  const f = target.value
  if (!f) return
  if (confirmKind.value === 'delete') { f.status = 'deleted'; log(f, 'Deleted the custom field'); toast.notify({ variant: 'success', title: t('Custom field deleted') }) }
  if (confirmKind.value === 'deactivate') { f.status = 'inactive'; log(f, 'Deactivated the custom field'); toast.notify({ variant: 'success', title: t('Custom field deactivated') }) }
  confirmKind.value = null; target.value = null
}
function activate(f: CustomField) {
  if (remaining.value <= 0) { toast.notify({ variant: 'error', title: t('Failed to activate the custom field. Your quota is insufficient for this subscription package'), maxWidth: 'max-content' }); return }
  f.status = 'active'; log(f, 'Activated the custom field')
  toast.notify({ variant: 'success', title: t('Custom field activated') })
}

// ─── Changelog ───────────────────────────────────────────────────────────────
const logField = ref<CustomField | null>(null)

// ─── Quota modals ────────────────────────────────────────────────────────────
const quotaOpen = ref(false)
const runoutOpen = ref(false)
function contactTeam() { quotaOpen.value = false; runoutOpen.value = false; toast.notify({ variant: 'info', title: t('Not in this prototype') }) }

// ─── Reorder ─────────────────────────────────────────────────────────────────
const reorderOpen = ref(false)
const reorderFeature = ref<CustomFieldFeature | ''>('')
const reorderSub = ref('')
const reorderList = ref<CustomField[]>([])
const reorderError = ref('')
watch(() => actions.reorderCustomFields, () => {
  reorderFeature.value = ''; reorderSub.value = ''; reorderList.value = []; reorderError.value = ''; reorderOpen.value = true
})
const reorderSubOptions = computed(() => (reorderFeature.value === 'Sales' || reorderFeature.value === 'Purchases') ? CUSTOM_FIELD_SUB_FEATURES[reorderFeature.value] : [])
watch([reorderFeature, reorderSub], () => {
  reorderError.value = ''
  reorderList.value = customFields
    .filter((f) => f.status === 'active' && f.feature === reorderFeature.value && (!reorderSubOptions.value.length || f.subFeatures.includes(reorderSub.value)))
    .sort((a, b) => a.position - b.position)
})
const sortable = usePointerSortable({
  axis: 'y', itemSelector: '.cfo-item',
  move: (from, to) => { const [x] = reorderList.value.splice(from, 1); reorderList.value.splice(to, 0, x!) },
})
function saveReorder() {
  if (!reorderFeature.value) { reorderError.value = t('You must select page'); return }
  if (reorderSubOptions.value.length && !reorderSub.value) { reorderError.value = t('You must select subpage'); return }
  reorderList.value.forEach((f, i) => { f.position = i + 1 })
  reorderOpen.value = false
  toast.notify({ variant: 'success', title: t('Field order changes saved') })
}
</script>

<template>
  <div class="cf-page">
    <!-- Quota -->
    <div class="cf-quota">
      <template v-if="used === 0">
        <p class="cf-quota-title">{{ t('Custom field quota') }}: <strong>{{ remaining }}</strong></p>
        <p class="cf-quota-note">
          {{ t('Start setting custom fields as needed for your business. Need more custom fields?') }}
          <span class="cell-link" @click="quotaOpen = true">{{ t('Add custom field quota') }}</span>
        </p>
      </template>
      <template v-else>
        <p class="cf-quota-title">{{ t('You have been using') }} {{ used }} {{ t('out of') }} {{ CUSTOM_FIELD_QUOTA }} {{ t('custom fields') }}</p>
        <MpProgress :value="usedPct" size="sm" color="information" class="cf-quota-bar" />
        <p class="cf-quota-note">
          {{ t('Use more custom fields to manage data as needed for your business.') }}
          <span class="cell-link" @click="quotaOpen = true">{{ t('Add custom field quota') }}</span>
        </p>
      </template>
    </div>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-filter="hasActiveFilter"
      :has-active-search="!!search"
      :search="search"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
      @clear-search="search = ''"
      @clear-all="clearAll"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="cf-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search custom field')" />
          </div>
        </div>
      </template>

      <template #cell-name="{ row, value }">
        <span class="cell-link cell-text" @click.stop="openDetail((row as unknown as CustomField).id)">{{ value }}</span>
      </template>
      <template #cell-type="{ value }">{{ t(value as string) }}</template>
      <template #cell-feature="{ row }">
        <div v-if="(row as unknown as CustomField).subFeatures.length" class="cf-page-cell">
          <span>{{ t((row as unknown as CustomField).feature) }}:</span>
          <ul class="cf-bullets">
            <li v-for="s in (row as unknown as CustomField).subFeatures.slice(0, 3)" :key="s">{{ t(s) }}</li>
          </ul>
          <span v-if="(row as unknown as CustomField).subFeatures.length > 3" class="cell-link" @click.stop="viewAll = row as unknown as CustomField">{{ t('View all') }}</span>
        </div>
        <span v-else>{{ t((row as unknown as CustomField).feature) }}</span>
      </template>
      <template #cell-status="{ row }">
        <ErpStatusBadge :status="(row as unknown as CustomField).status" :label="t(STATUS_LABEL[(row as unknown as CustomField).status])" :type="STATUS_TYPE[(row as unknown as CustomField).status]" />
      </template>
      <template #cell-updatedAt="{ row }">
        <div class="cf-lu">
          <span>{{ formatDateTime((row as unknown as CustomField).updatedAt) }}</span>
          <span class="cf-lu-by">{{ (row as unknown as CustomField).updatedBy || t('System') }}</span>
        </div>
      </template>

      <template #actions="{ row }">
        <MpPopover v-if="(row as unknown as CustomField).status !== 'deleted'" :id="`cf-row-${(row as unknown as CustomField).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openDetail((row as unknown as CustomField).id)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openEdit(row as unknown as CustomField)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="ask('delete', row as unknown as CustomField)">{{ t('Delete') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="(row as unknown as CustomField).status === 'active'" @click="ask('deactivate', row as unknown as CustomField)">{{ t('Deactivate') }}</MpPopoverListItem>
              <MpPopoverListItem v-else @click="activate(row as unknown as CustomField)">{{ t('Activate') }}</MpPopoverListItem>
              <MpPopoverListItem @click="logField = row as unknown as CustomField">{{ t('View changelog') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Custom fields list will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Add custom field through button') }} <strong>{{ t('Add custom field') }}</strong></p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <!-- ── Add / edit / details drawer ── -->
  <Teleport to="body">
    <Transition name="cfd">
      <div v-if="drawerOpen" class="cfd-overlay">
        <div class="cfd-panel" role="dialog" :aria-label="drawerTitle">
          <header class="cfd-header">
            <span class="cfd-title">{{ drawerTitle }}</span>
            <MpButton class="cfd-close" is-rounded :aria-label="t('Close')" @click="requestClose">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="cfd-body">
            <!-- Details -->
            <div v-if="mode === 'detail' && editingField" class="cfd-form">
              <ContentList :label="t('Custom field name')" :value="editingField.name" />
              <ContentList :label="t('Page')" :value="editingField.subFeatures.length ? `${t(editingField.feature)}: ${editingField.subFeatures.map((s) => t(s)).join(', ')}` : t(editingField.feature)" />
              <ContentList :label="t('Custom field type')" :value="t(editingField.type)" />
              <ContentList v-if="editingField.type === 'Text'" :label="t('Maximum characters')" :value="editingField.maxChar ?? '-'" />
              <ContentList v-if="editingField.type === 'Number'" :label="t('Additional text')" :value="editingField.prefix ? `${t('Prefix')}: ${editingField.prefix}` : editingField.suffix ? `${t('Suffix')}: ${editingField.suffix}` : t('Without addition')" />
              <ContentList v-if="editingField.type === 'Date'" :label="t('Date selection in custom field')" :value="editingField.defaultToday ? t('Today\'s date') : t('Empty')" />
              <ContentList v-if="editingField.type === 'Dropdown'" :label="`${t('Options')} (${editingField.options.length})`" :value="editingField.options.join(', ')" />
              <ContentList :label="t('Additional settings')" :value="editingField.required ? t('Custom field must be filled in') : '-'" />
              <ContentList :label="t('Status')">
                <ErpStatusBadge :status="editingField.status" :label="t(STATUS_LABEL[editingField.status])" :type="STATUS_TYPE[editingField.status]" />
              </ContentList>
            </div>

            <!-- Create / edit -->
            <div v-else class="cfd-form">
              <MpFormControl id="cfd-name" is-required :is-invalid="showErrors && !!errors.name" :is-disabled="lockCore">
                <MpFormLabel>
                  {{ t('Custom field name') }}
                  <template #icon><span class="cfd-counter">{{ form.name.length }}/{{ NAME_MAX }}</span></template>
                </MpFormLabel>
                <MpInput id="cfd-name-input" v-model="form.name" :maxlength="NAME_MAX" autocomplete="off" />
                <MpFormErrorMessage>{{ errors.name }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="cfd-page" is-required :is-invalid="showErrors && (!!errors.feature || !!errors.sub)" :is-disabled="lockCore">
                <MpFormLabel>{{ t('Page') }}</MpFormLabel>
                <ErpFilterSelect id="cfd-page-select" :model-value="form.feature" :placeholder="t('Select page')" :options="featureOptions" width="100%" :is-disabled="lockCore" @update:model-value="(v: string) => { form.feature = v as CustomFieldFeature; form.subFeatures = [] }" />
                <MultiSelectDropdown v-if="subOptions.length" id="cfd-sub-select" v-model="form.subFeatures" :options="subOptions" :placeholder="t('Select page')" select-all-label="Select all" is-full-width :is-invalid="showErrors && !!errors.sub" class="cfd-sub" />
                <MpFormErrorMessage>{{ errors.feature || errors.sub }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="cfd-type" is-required :is-invalid="showErrors && !!errors.type" :is-disabled="lockCore">
                <MpFormLabel>{{ t('Custom field type') }}</MpFormLabel>
                <ErpFilterSelect id="cfd-type-select" :model-value="form.type" :placeholder="t('Select custom field type')" :options="typeOptions" width="100%" :is-disabled="lockCore" @update:model-value="(v: string) => (form.type = v as CustomFieldType)" />
                <MpFormErrorMessage>{{ errors.type }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Type-specific settings -->
              <template v-if="form.type === 'Text'">
                <MpCheckbox id="cfd-maxchar" :is-checked="form.hasMaxChar" :is-disabled="lockCore" @change="form.hasMaxChar = !form.hasMaxChar">{{ t('Has a maximum character of') }}</MpCheckbox>
                <MpFormControl v-if="form.hasMaxChar" id="cfd-maxchar-fc" :is-invalid="showErrors && !!errors.maxChar">
                  <div class="cfd-inline"><MpInput id="cfd-maxchar-input" v-model="form.maxChar" type="number" /><span>{{ t('Characters') }}</span></div>
                  <MpFormErrorMessage>{{ errors.maxChar }}</MpFormErrorMessage>
                </MpFormControl>
              </template>
              <template v-else-if="form.type === 'Number'">
                <MpCheckbox id="cfd-decimal" :is-checked="form.useDecimal" :is-disabled="lockCore" @change="form.useDecimal = !form.useDecimal">{{ t('Use fractions (decimals)') }}</MpCheckbox>
                <div class="cfd-group">
                  <span class="cfd-group-title">{{ t('Additional text') }}</span>
                  <MpRadio id="cfd-add-none" name="cfd-add" value="none" :is-checked="form.additional === 'none'" @change="form.additional = 'none'">{{ t('Without addition') }}</MpRadio>
                  <MpRadio id="cfd-add-prefix" name="cfd-add" value="prefix" :is-checked="form.additional === 'prefix'" @change="form.additional = 'prefix'">{{ t('Prefix') }}</MpRadio>
                  <span class="cfd-hint">{{ t('Text is added before number.') }} {{ t('Example: Currency symbol (Rp50.000)') }}</span>
                  <MpRadio id="cfd-add-suffix" name="cfd-add" value="suffix" :is-checked="form.additional === 'suffix'" @change="form.additional = 'suffix'">{{ t('Suffix') }}</MpRadio>
                  <span class="cfd-hint">{{ t('Text is added after number.') }} {{ t('Example: Product length (5 cm)') }}</span>
                  <MpFormControl v-if="form.additional !== 'none'" id="cfd-add-text-fc" :is-invalid="showErrors && !!errors.additional" class="cfd-indent">
                    <MpInput id="cfd-add-text" v-model="form.additionalText" />
                    <MpFormErrorMessage>{{ errors.additional }}</MpFormErrorMessage>
                  </MpFormControl>
                </div>
              </template>
              <template v-else-if="form.type === 'Date'">
                <div class="cfd-group">
                  <span class="cfd-group-title">{{ t('Date selection in custom field') }}</span>
                  <MpRadio id="cfd-date-empty" name="cfd-date" value="empty" :is-checked="!form.defaultToday" @change="form.defaultToday = false">{{ t('Empty') }}</MpRadio>
                  <span class="cfd-hint">{{ t('Date must be selected manually') }}</span>
                  <MpRadio id="cfd-date-today" name="cfd-date" value="today" :is-checked="form.defaultToday" @change="form.defaultToday = true">{{ t('Today\'s date') }}</MpRadio>
                  <span class="cfd-hint">{{ t('Auto-selected when you\'re creating/adding transactions, products, & contacts') }}</span>
                </div>
              </template>
              <template v-else-if="form.type === 'Dropdown'">
                <MpCheckbox id="cfd-multi" :is-checked="form.multiSelect" :is-disabled="lockCore" @change="form.multiSelect = !form.multiSelect">{{ t('Can select more than one option') }}</MpCheckbox>
                <div class="cfd-group">
                  <span class="cfd-group-title">{{ t('Option') }} ({{ form.options.length }})</span>
                  <div v-for="(_, i) in form.options" :key="i" class="cfd-option">
                    <MpFormControl :id="`cfd-opt-${i}`" :is-invalid="showErrors && !!errors[`opt${i}`]" :is-disabled="lockCore && i < (editingField?.options.length ?? 0)" class="cfd-option-fc">
                      <MpInput :id="`cfd-opt-input-${i}`" v-model="form.options[i]" />
                      <MpFormErrorMessage>{{ errors[`opt${i}`] }}</MpFormErrorMessage>
                    </MpFormControl>
                    <MpButton v-if="i > 0 && !(lockCore && i < (editingField?.options.length ?? 0))" variant="ghost" left-icon="minus-circular" :aria-label="t('Remove')" is-rounded @click="removeOption(i)" />
                  </div>
                  <div><button class="btn-enterprise btn-enterprise--secondary" type="button" @click="addOption">{{ t('Add option') }}</button></div>
                </div>
              </template>

              <div class="cfd-group">
                <span class="cfd-group-title cfd-group-title--lg">{{ t('Additional settings') }}</span>
                <MpCheckbox id="cfd-required" :is-checked="form.required" :is-disabled="lockCore" @change="form.required = !form.required">{{ t('Custom field must be filled in') }}</MpCheckbox>
              </div>
            </div>

            <!-- Preview -->
            <div class="cfd-preview">
              <span class="cfd-group-title">{{ t('Preview') }}</span>
              <div class="cfd-preview-stage">
                <div v-if="!form.feature" class="cfd-preview-empty">
                  <MpIcon name="table-view-filter" variant="duotone" size="md" />
                  <p class="empty-full-title">{{ t('Custom field preview will appear here') }}</p>
                  <p class="empty-full-desc">{{ t('Please select page first.') }}</p>
                </div>
                <div v-else class="cfd-preview-card">
                  <p class="cfd-preview-page">{{ t(form.feature) }}{{ form.subFeatures[0] ? ` · ${t(form.subFeatures[0])}` : '' }}</p>
                  <div class="cfd-preview-field">
                    <span class="cfd-group-title">{{ previewLabel }}<span v-if="form.required" class="cfd-req">*</span></span>
                    <div class="cfd-preview-input">
                      <span>{{ previewValue }}</span>
                      <MpIcon v-if="form.type === 'Date'" name="calendar" size="sm" />
                    </div>
                    <span v-if="form.type === 'Text' && form.hasMaxChar && form.maxChar" class="cfd-hint">0/{{ form.maxChar }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <footer class="cfd-footer">
            <span />
            <div class="cfd-footer-right">
              <template v-if="mode === 'detail'">
                <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="drawerOpen = false">{{ t('Close') }}</button>
              </template>
              <template v-else>
                <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="requestClose">{{ t('Cancel') }}</button>
                <button class="btn-enterprise btn-enterprise--primary" type="button" @click="requestSave">{{ t('Save') }}</button>
              </template>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Reorder custom fields ── -->
  <Teleport to="body">
    <Transition name="cfd">
      <div v-if="reorderOpen" class="cfd-overlay">
        <div class="cfd-panel cfd-panel--narrow" role="dialog" :aria-label="t('Reorder custom fields')">
          <header class="cfd-header">
            <span class="cfd-title">{{ t('Reorder custom fields') }}</span>
            <MpButton class="cfd-close" is-rounded :aria-label="t('Close')" @click="reorderOpen = false"><MpIcon name="close" size="md" /></MpButton>
          </header>
          <div class="cfd-body cfd-body--col">
            <MpFormControl id="cfo-page" is-required :is-invalid="!!reorderError">
              <MpFormLabel>{{ t('Page') }}</MpFormLabel>
              <ErpFilterSelect id="cfo-page-select" :model-value="reorderFeature" :placeholder="t('Select page')" :options="featureOptions" width="100%" @update:model-value="(v: string) => { reorderFeature = v as CustomFieldFeature; reorderSub = '' }" />
              <ErpFilterSelect v-if="reorderSubOptions.length" id="cfo-sub-select" :model-value="reorderSub" :placeholder="t('Select subpage')" :options="reorderSubOptions" width="100%" class="cfd-sub" @update:model-value="(v: string) => (reorderSub = v)" />
              <MpFormErrorMessage>{{ reorderError }}</MpFormErrorMessage>
            </MpFormControl>
            <div class="cfd-group">
              <span class="cfd-group-title">{{ t('Custom field order') }}</span>
              <span class="cfd-hint">{{ t('Only show active fields.') }}</span>
              <div v-if="reorderList.length" class="cfo-list">
                <div v-for="(f, i) in reorderList" :key="f.id" class="cfo-item" :class="{ 'is-dragging': sortable.dragIndex.value === i }">
                  <span class="cfo-handle" @pointerdown="sortable.start(i, $event)"><MpIcon name="drag" size="sm" /></span>
                  <span class="cfo-n">{{ i + 1 }}</span>
                  <span>{{ f.name }}</span>
                </div>
              </div>
              <div v-else-if="reorderFeature" class="cfd-preview-empty">
                <p class="empty-full-title">{{ t('The page has no custom field yet') }}</p>
                <p class="empty-full-desc">{{ t('Please add custom field.') }}</p>
              </div>
            </div>
          </div>
          <footer class="cfd-footer">
            <span />
            <div class="cfd-footer-right">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="reorderOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="saveReorder">{{ t('Save changes') }}</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <div v-if="sortable.ghost.value && sortable.dragIndex.value !== null" class="cfo-item cfo-ghost" :style="{ left: `${sortable.ghost.value.x}px`, top: `${sortable.ghost.value.y}px`, width: `${sortable.ghost.value.w}px` }">
      <span class="cfo-handle"><MpIcon name="drag" size="sm" /></span>
      <span class="cfo-n">{{ sortable.dragIndex.value + 1 }}</span>
      <span>{{ reorderList[sortable.dragIndex.value]?.name }}</span>
    </div>
  </Teleport>

  <!-- ── Save confirmation ── -->
  <MpModal id="cf-confirm" :is-open="confirmOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="confirmOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Custom field save confirmation') }}</MpModalHeader>
      <MpModalBody>{{ form.type === 'Dropdown' ? t('Once saved, the dropdown custom field cannot be edited, except for adding options.') : t('Once saved, the custom field cannot be edited.') }}</MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="confirmOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="commit">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── Leave confirmation ── -->
  <MpModal id="cf-leave" :is-open="leaveOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="leaveOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Leave this process?') }}</MpModalHeader>
      <MpModalBody>{{ t('Data you have filled will not be saved.') }}</MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="leaveOpen = false">{{ t('Continue addition') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="leaveDrawer">{{ t('Leave') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── Delete / deactivate ── -->
  <MpModal id="cf-action" :is-open="!!confirmKind" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="confirmKind = null">
    <MpModalContent>
      <MpModalHeader>{{ confirmKind === 'delete' ? t('Delete custom field?') : t('Deactivate custom field?') }}</MpModalHeader>
      <MpModalBody>
        <template v-if="confirmKind === 'delete'">
          <p>{{ t('Impacts of deleting custom field:') }}</p>
          <ul class="cf-bullets">
            <li>{{ t('The custom field quota will be restored as many as the deleted field.') }}</li>
            <li>{{ t('The deleted custom field cannot be restored.') }}</li>
          </ul>
        </template>
        <template v-else>
          <p>{{ t('Impacts of deactivating custom field:') }}</p>
          <ul class="cf-bullets">
            <li>{{ t('Unable to be edited when it is inactive.') }}</li>
            <li>{{ t('Will not appear on sales, purchases, and reports.') }}</li>
            <li>{{ t('The custom field quota will be restored as many as the deactivated field.') }}</li>
          </ul>
        </template>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="confirmKind = null">{{ t('Cancel') }}</MpButton>
          <MpButton variant="danger" is-rounded @click="confirmAction">{{ confirmKind === 'delete' ? t('Delete') : t('Deactivate') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── View all sub pages ── -->
  <MpModal id="cf-viewall" :is-open="!!viewAll" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="viewAll = null">
    <MpModalContent>
      <MpModalHeader>{{ t('Custom field') }} "{{ viewAll?.name }}"</MpModalHeader>
      <MpModalBody>
        <p class="cfd-group-title">{{ t('Custom field will be applied on:') }}</p>
        <div v-for="s in viewAll?.subFeatures ?? []" :key="s" class="cf-viewall-row">{{ t(s) }}</div>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="viewAll = null">{{ t('Close') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── Changelog ── -->
  <MpModal id="cf-log" :is-open="!!logField" size="lg" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="logField = null">
    <MpModalContent>
      <MpModalHeader>{{ t('Custom field log') }}</MpModalHeader>
      <MpModalBody>
        <div class="cf-log">
          <div class="cf-log-row cf-log-row--head"><span>{{ t('Change time') }}</span><span>{{ t('User') }}</span><span>{{ t('Description') }}</span></div>
          <div v-for="(l, i) in logField?.logs ?? []" :key="i" class="cf-log-row">
            <span>{{ formatDateTime(l.at) }}</span><span>{{ l.user }}</span><span>{{ l.description }}</span>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" is-rounded @click="logField = null">{{ t('Close') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── Quota ── -->
  <MpModal id="cf-quota" :is-open="quotaOpen || runoutOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="quotaOpen = false; runoutOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ runoutOpen ? t('Unable to add custom field') : t('Add custom field quota') }}</MpModalHeader>
      <MpModalBody>
        <p v-if="runoutOpen" class="cfd-group-title">{{ t('Insufficient custom field quota') }}</p>
        <p v-else class="cfd-group-title">Rp199.000 {{ t('per custom field per year') }}</p>
        <p class="cfd-hint">{{ t('Please contact Jurnal team through the button or send an email to halojurnal@mekari.com to add your quota.') }}</p>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="quotaOpen = false; runoutOpen = false">{{ t('Ok, got it') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="contactTeam">{{ t('Contact Jurnal team') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.cf-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.cf-quota { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cf-quota-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cf-quota-bar { width: 320px; }
.cf-quota-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.filter-left { flex: 1 1 auto; display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.cf-page-cell { display: flex; flex-direction: column; align-items: flex-start; }
.cf-bullets { list-style: disc outside; padding-left: var(--mp-spacing-5); margin: 0; }
.cf-bullets li { display: list-item; }
.cf-lu { display: flex; flex-direction: column; }
.cf-lu-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cf-viewall-row { padding: var(--mp-spacing-1) 0; border-bottom: 1px solid var(--mp-border-default); }

.cf-log { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cf-log-row { display: grid; grid-template-columns: 180px 160px 1fr; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); }
.cf-log-row--head { border-top: none; background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Drawer — same shell as BillsFiltersDrawer (rule/drawer-custom-shell), wide for the preview. */
.cfd-enter-active, .cfd-leave-active { transition: background-color 250ms ease; }
.cfd-enter-from, .cfd-leave-to { background-color: transparent; }
.cfd-enter-active .cfd-panel { transition: transform 350ms ease-out; }
.cfd-leave-active .cfd-panel { transition: transform 250ms ease-in; }
.cfd-enter-from .cfd-panel, .cfd-leave-to .cfd-panel { transform: translateX(calc(100% + 12px)); }
.cfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cfd-panel {
  margin: var(--mp-spacing-3); width: min(880px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column; background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px); overflow: hidden;
}
.cfd-panel--narrow { width: min(480px, calc(100% - 24px)); }
.cfd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.cfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cfd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default);
}
.cfd-close:hover { background: var(--mp-background-neutral-hovered); }
.cfd-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; gap: var(--mp-spacing-8); padding: var(--mp-spacing-4); }
.cfd-body--col { flex-direction: column; gap: var(--mp-spacing-5); }
.cfd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cfd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.cfd-form { width: 312px; min-width: 312px; display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cfd-counter { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.cfd-sub { margin-top: var(--mp-spacing-1); }
.cfd-inline { display: flex; align-items: center; gap: var(--mp-spacing-2); white-space: nowrap; }
.cfd-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cfd-group-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cfd-group-title--lg { font-size: var(--mp-font-sizes-lg); }
.cfd-hint { padding-left: var(--mp-spacing-7); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cfd-indent { padding-left: var(--mp-spacing-7); }
.cfd-option { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); }
.cfd-option-fc { flex: 1; }
.cfd-req { color: var(--mp-text-danger); margin-left: var(--mp-spacing-0\.5); }

.cfd-preview { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cfd-preview-stage { flex: 1; padding: var(--mp-spacing-5); background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cfd-preview-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) 0; text-align: center; color: var(--mp-colors-icon-default); }
.cfd-preview-card { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); background: var(--mp-background-stage, #fff); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cfd-preview-page { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cfd-preview-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 280px; }
.cfd-preview-field .cfd-hint { padding-left: 0; align-self: flex-end; }
.cfd-preview-input {
  display: flex; align-items: center; justify-content: space-between; min-height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: var(--mp-background-stage, #fff);
}

.cfo-list { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cfo-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); background: var(--mp-background-stage, #fff); font-size: var(--mp-font-sizes-md); }
.cfo-item:first-child { border-top: none; }
.cfo-item.is-dragging { opacity: 0.4; border: 1px dashed var(--mp-border-default); }
.cfo-handle { display: inline-flex; cursor: grab; touch-action: none; user-select: none; color: var(--mp-colors-icon-default); }
.cfo-n { width: var(--mp-spacing-5); color: var(--mp-text-secondary); }
.cfo-ghost { position: fixed; z-index: 1500; pointer-events: none; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
</style>
