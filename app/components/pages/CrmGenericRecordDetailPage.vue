<script setup lang="ts">
import { computed } from 'vue'
import { MpButton, MpTextlink, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import {
  getCrmModule, getGenericRecord, genericModuleStages, moveGenericRecordStage,
  genericPipelineFieldId, moduleStores,
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
    const cols: DealProperty[][] = []
    for (const col of section.cols) {
      const colFields: DealProperty[] = []
      for (const propId of col) {
        if (propId === 'record-name') continue
        const prop = stores.value.properties.find((p) => p.id === propId)
        if (prop && prop.type !== 'Product list' && prop.type !== 'Related list') colFields.push(prop)
      }
      if (colFields.length) cols.push(colFields)
    }
    return { ...section, cols, hasFields: cols.some((c) => c.length > 0) }
  })
})

function back() { router.push(`/crm/${moduleId.value}`) }
function moveStage(stage: string) {
  if (!rec.value || stage === rec.value.stage) return
  moveGenericRecordStage(moduleId.value, props.orderId, stage)
}
function getFieldValue(prop: DealProperty): string {
  if (!rec.value) return '—'
  const v = rec.value.values[prop.variableName] ?? rec.value.values[prop.id]
  return v != null && v !== '' ? String(v) : '—'
}
function gridClass(colCount: number): string {
  if (colCount <= 2) return 'content-list-grid content-list-grid--2'
  if (colCount === 3) return 'content-list-grid content-list-grid--3'
  return 'content-list-grid content-list-grid--4'
}
</script>

<template>
  <div v-if="rec" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink :id="`${moduleId}-breadcrumb`" as="a" class="detail-breadcrumb" @click.prevent="back">{{ moduleName }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ rec.name }}</h1>
        </div>
      </div>
      <div class="detail-titlerow-right">
        <MpButton variant="ghost" is-rounded left-icon="edit" @click="router.push(`/crm/${moduleId}/${orderId}/edit`)">{{ t('Edit') }}</MpButton>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Pipeline stepper (only when kanban configured) -->
      <section v-if="hasKanban" class="deal-stepper">
        <div class="deal-stepper-labels">
          <div
            v-for="(s, i) in stages" :key="s.name"
            class="deal-step"
            :class="{ 'deal-step--current': i === currentIndex, 'deal-step--done': i <= currentIndex }"
            role="button" tabindex="0"
            @click="moveStage(s.name)"
          >
            <span class="deal-step-name">{{ s.name }}</span>
          </div>
        </div>
        <div class="deal-stepper-bar">
          <span
            v-for="(s, i) in stages" :key="s.name"
            class="deal-bar-seg"
            :class="{ 'deal-bar-seg--filled': i <= currentIndex }"
          />
        </div>
      </section>

      <!-- ── Tabs ── -->
      <MpTabs :key="rec.id" :id="`${moduleId}-tabs`" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab :id="`${moduleId}-tab-details`" value="details">{{ t('Record details') }}</MpTab>
          <MpTab :id="`${moduleId}-tab-activity`" value="activity">{{ t('Activity') }}</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- ── Record details ── -->
          <MpTabPanel value="details">
            <template v-for="section in detailSections" :key="section.id">
              <section v-if="section.hasFields" class="detail-summary">
                <h3 class="detail-section-title">{{ t(section.name) }}</h3>
                <div :class="gridClass(section.cols.length)">
                  <div v-for="(col, ci) in section.cols" :key="ci" class="content-list-col">
                    <ContentList
                      v-for="prop in col" :key="prop.id"
                      :label="t(prop.name)"
                      :value="getFieldValue(prop)"
                    />
                  </div>
                </div>
              </section>
            </template>

            <section v-if="!detailSections.length" class="detail-summary">
              <h3 class="detail-section-title">{{ t('Overview') }}</h3>
              <div class="content-list-grid content-list-grid--2">
                <div class="content-list-col">
                  <ContentList :label="t('Record name')" :value="rec.name" />
                  <ContentList :label="t('Owner')" :value="rec.owner || '—'" />
                </div>
              </div>
            </section>
          </MpTabPanel>

          <!-- ── Activity (placeholder) ── -->
          <MpTabPanel value="activity">
            <div class="detail-empty">
              <p class="detail-empty-text">{{ t('No activity yet.') }}</p>
            </div>
          </MpTabPanel>

        </MpTabPanels>
      </MpTabs>
    </div>
  </div>

  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink :id="`${moduleId}-breadcrumb`" as="a" class="detail-breadcrumb" @click.prevent="back">{{ moduleName }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Not found') }}</h1>
        </div>
      </div>
    </header>
    <div class="detail-stage">
      <div class="detail-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="detail-empty-illustration" width="288" height="240" />
        <p class="detail-empty-title">{{ t('Record not found') }}</p>
        <p class="detail-empty-caption">{{ t('This record does not exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="back">{{ t('Back') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

/* ── Stage ── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Pipeline stepper ── */
.deal-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.deal-stepper-labels { display: flex; gap: var(--mp-spacing-2); }
.deal-step { flex: 1; display: flex; flex-direction: column; min-width: 0; cursor: pointer; }
.deal-step-name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal-step--current .deal-step-name { color: var(--mp-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.deal-stepper-bar { display: flex; gap: 3px; }
.deal-bar-seg { flex: 1; height: 6px; border-radius: 3px; background: var(--mp-background-neutral-subtle, #eef1f1); }
.deal-bar-seg--filled { background: var(--mp-border-selected, #029861); }

/* ── Tabs ── */
.detail-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.detail-tabs :deep([data-pixel-component="MpTabPanels"]) { flex: 1; min-height: 0; overflow-y: auto; }

/* ── Section headings ── */
.detail-section-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin: 0 0 var(--mp-spacing-4) 0;
}
.detail-summary { display: flex; flex-direction: column; margin-top: var(--mp-spacing-6); }

/* ── Content grids ── */
.content-list-grid { display: grid; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.content-list-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.content-list-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }

/* ── Empty ── */
.detail-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.detail-empty-illustration { max-width: 288px; height: auto; }
.detail-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.detail-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-empty-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
