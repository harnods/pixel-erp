<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import {
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpInput, MpTextarea,
  MpDatePicker, MpTextlink, MpUpload,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import NewSalesOrderPage from '~/components/pages/NewSalesOrderPage.vue'
import {
  getCrmModule, moduleStores, genericPipelineFieldId,
  genericModuleStages, createGenericRecord, getGenericRecord,
  persistGenericRecordEdit, CRM_CURRENT_USER,
  type DealProperty, type GenericModuleRecord,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const isEdit = computed(() => props.orderId !== 'new')

const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const moduleId = computed(() => route.path.split('/').filter(Boolean)[1] ?? '')
const moduleName = computed(() => getCrmModule(moduleId.value)?.name ?? moduleId.value)

const pipelineFieldId = computed(() => genericPipelineFieldId(moduleId.value))
const hasKanban = computed(() => !!pipelineFieldId.value)
const stages = computed(() => genericModuleStages(moduleId.value))

const stores = computed(() => moduleStores(moduleId.value))

interface FormSection {
  id: string
  columns: number
  cols: { props: DealProperty[] }[]
  hasPrimary: boolean
}

const formSections = computed<FormSection[]>(() => {
  const detailTab = stores.value.detailLayout.tabs.find((tab) => tab.key === 'details')
  if (!detailTab?.sections?.length) return []
  return detailTab.sections.map((section) => {
    let hasPrimary = false
    const cols = section.cols.map((col) => {
      const colProps: DealProperty[] = []
      for (const propId of col) {
        if (propId === 'record-name') { hasPrimary = true; continue }
        const prop = stores.value.properties.find((p) => p.id === propId)
        if (prop) colProps.push(prop)
      }
      return { props: colProps }
    })
    return { id: section.id, columns: section.columns || 2, cols, hasPrimary }
  })
})

const formValues = reactive<Record<string, any>>({})
const recordName = ref('')

function initFromRecord(rec: GenericModuleRecord) {
  recordName.value = rec.name
  for (const section of formSections.value) {
    for (const col of section.cols) {
      for (const p of col.props) {
        formValues[p.id] = rec.values[p.variableName] ?? rec.values[p.id] ?? ''
      }
    }
  }
  if (hasKanban.value) formValues.__stage = rec.stage
}

function initNew() {
  recordName.value = ''
  for (const section of formSections.value) {
    for (const col of section.cols) {
      for (const p of col.props) formValues[p.id] = ''
    }
  }
  if (hasKanban.value && stages.value.length) formValues.__stage = stages.value[0]!.name
}

if (isEdit.value) {
  const existing = getGenericRecord(moduleId.value, props.orderId)
  if (existing) initFromRecord(existing)
} else {
  initNew()
}

function back() { router.push(`/crm/${moduleId.value}`) }

function allFormProps(): DealProperty[] {
  const all: DealProperty[] = []
  for (const section of formSections.value) {
    for (const col of section.cols) {
      for (const p of col.props) all.push(p)
    }
  }
  return all
}

function onSave() {
  const formProps = allFormProps()
  if (isEdit.value) {
    const rec = getGenericRecord(moduleId.value, props.orderId)
    if (!rec) return
    rec.name = recordName.value
    for (const p of formProps) {
      rec.values[p.variableName] = formValues[p.id]
      rec.values[p.id] = formValues[p.id]
    }
    if (hasKanban.value && formValues.__stage) rec.stage = formValues.__stage
    persistGenericRecordEdit()
    router.push(`/crm/${moduleId.value}/${props.orderId}`)
  } else {
    const rec = createGenericRecord(moduleId.value)
    rec.name = recordName.value
    for (const p of formProps) {
      rec.values[p.variableName] = formValues[p.id]
      rec.values[p.id] = formValues[p.id]
    }
    if (hasKanban.value && formValues.__stage) rec.stage = formValues.__stage
    persistGenericRecordEdit()
    router.push(`/crm/${moduleId.value}/${rec.id}`)
  }
}

function propInputType(type: string): 'text' | 'number' | 'date' | 'textarea' | 'select' | 'product-list' | 'related-list' | 'file' {
  if (type === 'Product list') return 'product-list'
  if (type === 'Related list') return 'related-list'
  if (['File', 'Image'].includes(type)) return 'file'
  if (['Number', 'Percentage', 'Currency'].includes(type)) return 'number'
  if (['Date picker', 'Date and time picker', 'Date range'].includes(type)) return 'date'
  if (['Multi-line text'].includes(type)) return 'textarea'
  if (['Dropdown select', 'Radio select', 'pick_list', 'radio_select'].includes(type)) return 'select'
  return 'text'
}
function isEmbeddedListType(type: string): boolean {
  return type === 'Product list' || type === 'Related list'
}
function propOptions(prop: DealProperty): { value: string; label: string }[] {
  return (prop.config?.options ?? []).map((o) => ({ value: o.label, label: o.label }))
}
</script>

<template>
  <div class="si-form-page">
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="back">{{ moduleName }}</MpTextlink>
        <h1 class="si-form-h1">{{ isEdit ? t('Edit record') : t('New record') }}</h1>
      </div>
    </header>

    <div class="si-form-stage">
      <!-- Record name (from Overview section, always first & full-width) -->
      <section class="si-section">
        <MpFormControl id="f-record-name" class="si-field si-field--wide" is-required>
          <MpFormLabel>{{ t('Record name') }}</MpFormLabel>
          <MpInput v-model="recordName" is-full-width :placeholder="t('Enter record name')" />
        </MpFormControl>
      </section>

      <!-- Stage selector (only when kanban configured) -->
      <section v-if="hasKanban" class="si-section">
        <MpFormControl id="f-stage" class="si-field">
          <MpFormLabel>{{ t('Stage') }}</MpFormLabel>
          <ErpFilterSelect
            id="f-stage-select"
            :model-value="formValues.__stage ?? ''"
            :options="stages.map((s) => ({ value: s.name, label: s.name }))"
            :is-clearable="false"
            width="100%"
            @update:model-value="(v: string) => (formValues.__stage = v)"
          />
        </MpFormControl>
      </section>

      <!-- Sections from layout — each section rendered as a grid matching its cols -->
      <template v-for="section in formSections" :key="section.id">
        <!-- Product list — embedded line-item table -->
        <template v-for="col in section.cols" :key="`emb-${section.id}`">
          <template v-for="prop in col.props" :key="`emb-${prop.id}`">
            <section v-if="prop.type === 'Product list'" class="si-section si-product-list">
              <div class="si-product-list-wrap">
                <NewSalesOrderPage embedded products-only @cancel="back" />
              </div>
            </section>
            <section v-else-if="prop.type === 'Related list'" class="si-section si-embedded-list">
              <h3 class="si-embedded-list-title">{{ t(prop.name) }}</h3>
              <div class="si-embedded-list-empty">
                <p class="si-embedded-list-text">{{ t('No items added yet.') }}</p>
                <MpButton variant="secondary" is-rounded left-icon="add" size="sm">{{ t('Add item') }}</MpButton>
              </div>
            </section>
          </template>
        </template>

        <!-- Regular fields — rendered in column grid -->
        <section
          v-if="section.cols.some((c) => c.props.some((p) => !isEmbeddedListType(p.type)))"
          class="si-section si-section--cols"
          :style="{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }"
        >
          <div v-for="(col, ci) in section.cols" :key="ci" class="si-col">
            <template v-for="prop in col.props" :key="prop.id">
              <MpFormControl v-if="!isEmbeddedListType(prop.type)" :id="`f-${prop.id}`" class="si-field">
                <MpFormLabel>{{ t(prop.name) }}</MpFormLabel>

                <MpTextarea
                  v-if="propInputType(prop.type) === 'textarea'"
                  :model-value="formValues[prop.id] ?? ''"
                  is-full-width
                  :rows="3"
                  @update:model-value="(v: string) => (formValues[prop.id] = v)"
                />
                <MpDatePicker
                  v-else-if="propInputType(prop.type) === 'date'"
                  :model-value="formValues[prop.id] ?? ''"
                  format="DD/MM/YYYY"
                  value-type="format"
                  use-portal
                  @update:model-value="(v: string) => (formValues[prop.id] = v)"
                />
                <ErpFilterSelect
                  v-else-if="propInputType(prop.type) === 'select'"
                  :id="`f-${prop.id}-select`"
                  :model-value="formValues[prop.id] ?? ''"
                  :options="propOptions(prop)"
                  width="100%"
                  @update:model-value="(v: string) => (formValues[prop.id] = v)"
                />
                <MpUpload
                  v-else-if="propInputType(prop.type) === 'file'"
                  :id="`f-${prop.id}-upload`"
                  :button-text="t('Choose file')"
                  :placeholder="t('or drag and drop here')"
                  is-full-width
                />
                <MpInput
                  v-else
                  :model-value="formValues[prop.id] ?? ''"
                  is-full-width
                  :type="propInputType(prop.type) === 'number' ? 'number' : 'text'"
                  @update:model-value="(v: string) => (formValues[prop.id] = v)"
                />
              </MpFormControl>
            </template>
          </div>
        </section>
      </template>

      <MpButtonGroup class="si-form-footer">
        <MpButton variant="ghost" is-rounded @click="back">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
      </MpButtonGroup>
    </div>
  </div>
</template>

<style scoped>
.si-form-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.si-form-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.si-form-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.si-crumb {
  align-self: flex-start;
  background: none; border: none; padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.si-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.si-form-h1 {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}
.si-form-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}
.si-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.si-section--cols { display: grid; gap: var(--mp-spacing-5); }
.si-col { display: flex; flex-direction: column; gap: var(--mp-spacing-5); min-width: 0; }
.si-field { min-width: 0; }
.si-field :deep(.efs) { display: flex; width: 100%; }
.si-field--wide { max-width: 318px; }
.si-embedded-list { border: 1px solid var(--mp-border-default, #dde1e1); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4) var(--mp-spacing-5); }
.si-embedded-list-title { margin: 0 0 var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.si-embedded-list-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-6) 0; }
.si-embedded-list-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.si-product-list-wrap :deep(.si-form-footer),
.si-product-list-wrap :deep(.erp-action-footer) { display: none; }
.si-form-footer {
  margin-top: auto;
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-6);
}
</style>
