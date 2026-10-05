<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_account_mapping.html.haml -->
<script setup lang="ts">
import {
  MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionIcon, MpAccordionPanel,
  MpTooltip, MpIcon, toast,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  MAPPING_GROUPS, getAccountMapping, saveAccountMapping, mappingOptions, mappingAccountLabel,
  type AccountMapping, type MappingField,
} from '~/data/companySettings'

const { t } = useLocale()

const committed = reactive<AccountMapping>(getAccountMapping())
const draft = reactive<AccountMapping>({ ...committed })
const errors = reactive<Record<string, string>>({})

const isEditing = ref(false)
const isSaving = ref(false)
const discardOpen = ref(false)
const hasChanges = computed(() => Object.keys(committed).some(k => draft[k] !== committed[k]))

const optionsFor = (f: MappingField) => mappingOptions(f).map(o => ({ value: o.value, label: o.label }))

function startEdit() { Object.assign(draft, committed); isEditing.value = true }
function requestCancel() { if (hasChanges.value) discardOpen.value = true; else exitEdit() }
function exitEdit() {
  Object.assign(draft, committed)
  Object.keys(errors).forEach(k => delete errors[k])
  isEditing.value = false
  discardOpen.value = false
}
async function submit() {
  Object.keys(errors).forEach(k => delete errors[k])
  for (const g of MAPPING_GROUPS) {
    for (const f of [...g.left, ...g.right]) {
      if (!draft[f.key]) errors[f.key] = t('Select an account')
    }
  }
  if (Object.keys(errors).length) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  Object.assign(committed, draft)
  saveAccountMapping({ ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: t('Account mapping saved'), maxWidth: 'max-content' })
}
</script>

<template>
  <div class="ws-page">
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">{{ t('Mapping list') }}</h2>
          <p class="ws-section-desc">{{ t('Choose default account for each label to help the system create your journal entry automatically from transactions. All fields are required.') }}</p>
        </div>
        <button v-if="!isEditing" class="btn-enterprise btn-enterprise--secondary" @click="startEdit">{{ t('Edit') }}</button>
      </div>

      <MpAccordion is-allow-multiple is-allow-toggle class="da-accordion">
        <MpAccordionItem
          v-for="(g, gi) in MAPPING_GROUPS"
          :id="`da-acc-${g.key}`"
          :key="g.key"
          :is-default-open="gi === 0"
          icon-position="start"
        >
          <MpAccordionHeader>
            <MpAccordionIcon />
            <span class="da-group-label">{{ t(g.label) }}</span>
          </MpAccordionHeader>
          <MpAccordionPanel>
            <div class="da-grid">
              <div v-for="col in [g.left, g.right]" :key="col[0]?.key" class="da-col">
                <div v-for="f in col" :key="f.key" class="da-field">
                  <div class="da-label">
                    <span>{{ t(f.label) }}</span>
                    <MpTooltip :label="t(f.tooltip)" placement="top">
                      <span class="da-help"><MpIcon name="help" size="sm" color="icon.secondary" /></span>
                    </MpTooltip>
                  </div>
                  <template v-if="isEditing && !f.lockedReason">
                    <ErpFilterSelect
                      :id="`da-${f.key}`"
                      v-model="draft[f.key]!"
                      :placeholder="t('Select account')"
                      :options="optionsFor(f)"
                      :is-clearable="false"
                      width="100%"
                      empty-text="No matching account found"
                    />
                    <span v-if="errors[f.key]" class="da-error">{{ errors[f.key] }}</span>
                  </template>
                  <template v-else>
                    <span class="da-value">{{ mappingAccountLabel(committed[f.key] ?? '') }}</span>
                    <span v-if="f.lockedReason" class="da-note">{{ t(f.lockedReason) }}</span>
                  </template>
                </div>
              </div>
            </div>
          </MpAccordionPanel>
        </MpAccordionItem>
      </MpAccordion>

      <div v-if="isEditing" class="ws-action-bar">
        <span class="da-reminder">{{ t('Reset account will take effect after you submit this account mapping') }}</span>
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="submit">
          {{ isSaving ? t('Saving…') : t('Submit') }}
        </button>
      </div>
    </section>

    <ConfirmModal
      v-model:is-open="discardOpen"
      :title="t('Discard unsaved changes?')"
      :description="t('Your changes will not be saved.')"
      :confirm-label="t('Discard')"
      :cancel-label="t('Keep editing')"
      @confirm="exitEdit"
    />
  </div>
</template>

<style scoped>
.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
}
.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}
.ws-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}
.ws-section-meta { grid-column: 1 / 9; display: flex; flex-direction: column; }
.ws-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}
.ws-section-header > button { grid-column: 9 / -1; justify-self: end; }

.da-accordion { grid-column: 1 / -1; }
.da-group-label {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.da-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-2) 0 var(--mp-spacing-4);
}
.da-col { display: flex; flex-direction: column; }
.da-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) 0;
}
.da-label {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}
.da-help { display: inline-flex; cursor: help; }
.da-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.da-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.da-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.ws-action-bar {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}
.ws-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.da-reminder {
  margin-right: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}
</style>
