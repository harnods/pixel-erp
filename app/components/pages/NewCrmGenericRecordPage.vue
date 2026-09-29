<script setup lang="ts">
/**
 * NewCrmGenericRecordPage — create/edit form for ANY custom module record.
 * Mirrors the Deals "New deal" form layout (title bar → scrollable stage → footer)
 * but fields are dynamically derived from the module's properties placed in the
 * detail layout, not hardcoded.
 */
import { ref, computed, reactive } from 'vue'
import {
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpInput, MpTextarea,
  MpDatePicker, MpTextlink,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
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
const layoutProps = computed<DealProperty[]>(() => {
  const detailTab = stores.value.detailLayout.tabs.find((tab) => tab.key === 'details')
  if (!detailTab?.sections?.length) return []
  const allPropIds: string[] = []
  for (const section of detailTab.sections) {
    for (const col of section.cols) {
      for (const propId of col) allPropIds.push(propId)
    }
  }
  return allPropIds
    .filter((id) => id !== 'record-name')
    .map((id) => stores.value.properties.find((p) => p.id === id))
    .filter((p): p is DealProperty => !!p && p.type !== 'Product list' && p.type !== 'Related list')
})

const formValues = reactive<Record<string, any>>({})
const recordName = ref('')

function initFromRecord(rec: GenericModuleRecord) {
  recordName.value = rec.name
  for (const p of layoutProps.value) {
    formValues[p.id] = rec.values[p.variableName] ?? rec.values[p.id] ?? ''
  }
  if (hasKanban.value) formValues.__stage = rec.stage
}

function initNew() {
  recordName.value = ''
  for (const p of layoutProps.value) formValues[p.id] = ''
  if (hasKanban.value && stages.value.length) formValues.__stage = stages.value[0]!.name
}

if (isEdit.value) {
  const existing = getGenericRecord(moduleId.value, props.orderId)
  if (existing) initFromRecord(existing)
} else {
  initNew()
}

function back() { router.push(`/crm/${moduleId.value}`) }

function onSave() {
  if (isEdit.value) {
    const rec = getGenericRecord(moduleId.value, props.orderId)
    if (!rec) return
    rec.name = recordName.value
    for (const p of layoutProps.value) {
      rec.values[p.variableName] = formValues[p.id]
      rec.values[p.id] = formValues[p.id]
    }
    if (hasKanban.value && formValues.__stage) rec.stage = formValues.__stage
    persistGenericRecordEdit()
    router.push(`/crm/${moduleId.value}/${props.orderId}`)
  } else {
    const rec = createGenericRecord(moduleId.value)
    rec.name = recordName.value
    for (const p of layoutProps.value) {
      rec.values[p.variableName] = formValues[p.id]
      rec.values[p.id] = formValues[p.id]
    }
    if (hasKanban.value && formValues.__stage) rec.stage = formValues.__stage
    persistGenericRecordEdit()
    router.push(`/crm/${moduleId.value}/${rec.id}`)
  }
}

function propInputType(type: string): 'text' | 'number' | 'date' | 'textarea' | 'select' {
  if (['Number', 'Percentage', 'Currency'].includes(type)) return 'number'
  if (['Date picker', 'Date and time picker', 'Date range'].includes(type)) return 'date'
  if (['Multi-line text'].includes(type)) return 'textarea'
  if (['Dropdown select', 'Radio select', 'pick_list', 'radio_select'].includes(type)) return 'select'
  return 'text'
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
      <section class="si-section">
        <MpFormControl id="f-record-name" class="si-field si-field--wide" is-required>
          <MpFormLabel>{{ t('Record name') }}</MpFormLabel>
          <MpInput v-model="recordName" is-full-width :placeholder="t('Enter record name')" />
        </MpFormControl>
      </section>

      <section v-if="hasKanban" class="si-section">
        <MpFormControl id="f-stage" class="si-field">
          <MpFormLabel>{{ t('Stage') }}</MpFormLabel>
          <ErpFilterSelect
            id="f-stage-select"
            :model-value="formValues.__stage ?? ''"
            :options="stages.map((s) => ({ value: s.name, label: s.name }))"
            :is-clearable="false"
            is-full-width
            @update:model-value="(v: string) => (formValues.__stage = v)"
          />
        </MpFormControl>
      </section>

      <section v-if="layoutProps.length" class="si-section si-section--grid">
        <template v-for="prop in layoutProps" :key="prop.id">
          <MpFormControl :id="`f-${prop.id}`" class="si-field" :is-required="false">
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
              is-full-width
              @update:model-value="(v: string) => (formValues[prop.id] = v)"
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
      </section>

      <MpButtonGroup class="si-form-footer">
        <MpButton variant="ghost" is-rounded @click="back">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
      </MpButtonGroup>
    </div>
  </div>
</template>

<style scoped>
.si-form-page {
  --si-field-wide: 318px;
  --si-field: 228px;
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
.si-section--grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-5); }
.si-field { min-width: 0; }
.si-field--wide { max-width: var(--si-field-wide); }
.si-form-footer {
  margin-top: auto;
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-6);
}
</style>
