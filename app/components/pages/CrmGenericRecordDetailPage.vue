<script setup lang="ts">
import { computed } from 'vue'
import { MpButton, MpIcon, MpInput, MpTextarea, MpDatePicker } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  getCrmModule, getGenericRecord, genericModuleStages, moveGenericRecordStage,
  persistGenericRecordEdit, genericPipelineFieldId, moduleStores,
  type DealProperty,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const moduleId = computed(() => route.path.split('/').filter(Boolean)[1] ?? '')

const moduleName = computed(() => getCrmModule(moduleId.value)?.name ?? moduleId.value)
const rec = computed(() => getGenericRecord(moduleId.value, props.orderId))

const pipelineFieldId = computed(() => genericPipelineFieldId(moduleId.value))
const hasKanban = computed(() => !!pipelineFieldId.value)
const stages = computed(() => genericModuleStages(moduleId.value))
const currentIndex = computed(() => stages.value.findIndex((s) => s.name === rec.value?.stage))

const stores = computed(() => moduleStores(moduleId.value))
const detailSections = computed(() => {
  const detailTab = stores.value.detailLayout.tabs.find((tab) => tab.key === 'details')
  if (!detailTab?.sections?.length) return []
  return detailTab.sections.map((section) => {
    const fields: DealProperty[] = []
    for (const col of section.cols) {
      for (const propId of col) {
        if (propId === 'record-name') continue
        const prop = stores.value.properties.find((p) => p.id === propId)
        if (prop && prop.type !== 'Product list' && prop.type !== 'Related list') fields.push(prop)
      }
    }
    return { ...section, fields }
  })
})

function back() { router.push(`/crm/${moduleId.value}`) }
function onFieldChange() { persistGenericRecordEdit() }
function moveStage(stage: string) {
  if (!rec.value || stage === rec.value.stage) return
  moveGenericRecordStage(moduleId.value, props.orderId, stage)
}

function propInputType(type: string): 'text' | 'number' | 'date' | 'textarea' | 'select' {
  if (['Number', 'Percentage', 'Currency'].includes(type)) return 'number'
  if (['Date picker', 'Date and time picker', 'Date range'].includes(type)) return 'date'
  if (['Multi-line text'].includes(type)) return 'textarea'
  if (['Dropdown select', 'Radio select', 'pick_list', 'radio_select'].includes(type)) return 'select'
  return 'text'
}
function propOptions(prop: DealProperty): { value: string; label: string }[] {
  return (prop.config?.options ?? []).map((o: any) => ({ value: o.label, label: o.label }))
}
function getFieldValue(prop: DealProperty): any {
  if (!rec.value) return ''
  return rec.value.values[prop.variableName] ?? rec.value.values[prop.id] ?? ''
}
function setFieldValue(prop: DealProperty, v: any) {
  if (!rec.value) return
  rec.value.values[prop.variableName] = v
  rec.value.values[prop.id] = v
  onFieldChange()
}
</script>

<template>
  <div class="detail-page">
    <template v-if="rec">
      <header class="detail-bar">
        <div class="detail-bar-left">
          <a class="detail-breadcrumb" @click="back">{{ moduleName }}</a>
          <MpInput v-model="rec.name" class="grd-title-input" is-full-width @update:model-value="onFieldChange" />
        </div>
        <div class="detail-bar-right">
          <MpButton variant="ghost" is-rounded left-icon="edit" @click="router.push(`/crm/${moduleId}/${orderId}/edit`)">{{ t('Edit') }}</MpButton>
        </div>
      </header>

      <div class="detail-stage">
        <section v-if="hasKanban" class="grd-stepper">
          <MpButton
            v-for="(s, i) in stages" :key="s.name" type="button" class="grd-step"
            :class="{ 'grd-step--done': i <= currentIndex, 'grd-step--current': i === currentIndex }"
            @click="moveStage(s.name)"
          >
            <span class="grd-step-label">{{ s.name }}</span>
            <span class="grd-step-bar" />
          </MpButton>
        </section>

        <template v-for="section in detailSections" :key="section.id">
          <section v-if="section.fields.length" class="grd-section">
            <h3 v-if="section.name" class="grd-section-title">{{ t(section.name) }}</h3>
            <div class="grd-grid" :style="{ gridTemplateColumns: `repeat(${Math.min(section.columns || 2, 3)}, minmax(0, 1fr))` }">
              <template v-for="prop in section.fields" :key="prop.id">
                <div v-if="propInputType(prop.type) === 'textarea'" class="grd-field grd-field--wide">
                  <label class="grd-label">{{ t(prop.name) }}</label>
                  <MpTextarea :model-value="getFieldValue(prop)" is-full-width :rows="3" @update:model-value="(v: string) => setFieldValue(prop, v)" />
                </div>
                <div v-else class="grd-field">
                  <label class="grd-label">{{ t(prop.name) }}</label>
                  <MpDatePicker
                    v-if="propInputType(prop.type) === 'date'"
                    :model-value="getFieldValue(prop)"
                    format="DD/MM/YYYY" value-type="format" use-portal
                    @update:model-value="(v: string) => setFieldValue(prop, v)"
                  />
                  <ErpFilterSelect
                    v-else-if="propInputType(prop.type) === 'select'"
                    :id="`grd-${prop.id}`"
                    :model-value="getFieldValue(prop)"
                    :options="propOptions(prop)"
                    is-full-width
                    @update:model-value="(v: string) => setFieldValue(prop, v)"
                  />
                  <MpInput
                    v-else
                    :model-value="getFieldValue(prop)"
                    is-full-width
                    :type="propInputType(prop.type) === 'number' ? 'number' : 'text'"
                    @update:model-value="(v: string) => setFieldValue(prop, v)"
                  />
                </div>
              </template>
            </div>
          </section>
        </template>

        <div v-if="!detailSections.length" class="grd-grid">
          <div class="grd-field">
            <label class="grd-label">{{ t('Owner') }}</label>
            <MpInput :model-value="rec.owner" is-full-width disabled />
          </div>
        </div>
      </div>
    </template>

    <div v-else class="detail-stage">
      <div class="grd-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="grd-empty-illustration" width="288" height="240" />
        <p class="grd-empty-title">{{ t('Record not found') }}</p>
        <p class="grd-empty-caption">{{ t('This record does not exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="back">{{ t('Back') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.detail-breadcrumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; text-decoration: none; }
.detail-breadcrumb:hover { text-decoration: underline; }
.grd-title-input { max-width: 420px; margin-top: var(--mp-spacing-1); }
.grd-title-input :deep(input) { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); }

.grd-stepper { display: flex; gap: var(--mp-spacing-2); }
.grd-step { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; border: none; background: none; padding: 0; cursor: pointer; text-align: left; }
.grd-step-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grd-step--current .grd-step-label { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.grd-step-bar { display: block; height: 6px; border-radius: 3px; background: var(--mp-colors-background-neutral-subtle, #eef1f1); }
.grd-step--done .grd-step-bar { background: var(--mp-colors-background-success-bold, #16b364); }

.grd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.grd-section-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.grd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-5); }
.grd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.grd-field--wide { grid-column: 1 / -1; }
.grd-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #6b7678); }

.grd-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-colors-text-secondary, #6b7678); }
.grd-empty-illustration { max-width: 288px; height: auto; }
.grd-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.grd-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
