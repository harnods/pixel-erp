<script setup lang="ts">
/**
 * CRM ▸ Settings ▸ ERP Integration Settings ▸ module editor
 * (/crm/settings/erp-integrations/:moduleId).
 *
 * PRD "ERP Transaction Conversion Settings V1" §Product Design → Module integration
 * editor. Configures ONE module's conversion: enable/disable, ONE target (Sales
 * Quote OR Sales Order), the single field mapping (mandatory always visible +
 * optional collapsed), and — for custom modules — one blocking criterion. A
 * readiness/dependencies side panel and a Validate/Preview step sit alongside; a
 * sticky footer carries the save semantics.
 *
 * Key PRD rules honoured here:
 *  • Manual-only: an explicit notice states conversion is never automatic. No
 *    trigger-timing / prompt-condition section exists.
 *  • Footer actions are ALWAYS present, never disabled (CLAUDE.md) — clicking Save
 *    with an incomplete mapping shows inline errors, it doesn't grey out.
 *  • Enabled "Save changes" warns that it applies immediately to NEW conversions.
 *  • Deals mapping is protected/system — rows are read-only; target still switchable.
 *  • All edits happen on a local `draft`; Save applies to the real config.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon, MpToggle, MpRadio, MpTextlink, MpFormControl, MpFormLabel, MpModal, MpModalOverlay, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import CrmMappingRow from '~/components/patterns/CrmMappingRow.vue'
import { getCrmModule, type CrmModule } from '~/data/crm'
import {
  ensureConversionConfig, getConversionConfig, saveConfig,
  erpTargetFields, evalEntry,
  type ConvTarget, type MappingEntry, type BlockingCriterion, type CriterionOperator,
} from '~/data/crmConversion'
import { successToast } from '~/utils/toasts'

// Route `/crm/settings/erp-integrations/:moduleId` binds `:orderId` = the module id
// (the shared [...slug].vue detail renderer passes the id as `orderId`).
const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const mod = computed<CrmModule | undefined>(() => getCrmModule(props.orderId))
const isDeals = computed(() => props.orderId === 'deals')

// ── Local editable draft (applied on Save) ──────────────────────────────────
const draft = reactive<{ enabled: boolean; target: ConvTarget; mappings: MappingEntry[]; criterion: BlockingCriterion | null }>({
  enabled: false, target: 'sales-order', mappings: [], criterion: null,
})
function loadDraft() {
  const c = getConversionConfig(props.orderId)
  draft.enabled = c?.enabled ?? false
  draft.target = c?.target ?? 'sales-order'
  draft.mappings = c ? JSON.parse(JSON.stringify(c.mappings)) : []
  draft.criterion = c?.criterion ? { ...c.criterion } : null
  ensureMappingsForTarget()
}
watch(() => props.orderId, loadDraft, { immediate: true })

// Ensure every target field has a draft entry (unmapped by default).
function ensureMappingsForTarget() {
  const fields = erpTargetFields(draft.target)
  const next: MappingEntry[] = fields.map((f) => {
    const existing = draft.mappings.find((m) => m.targetKey === f.key)
    return existing ?? { targetKey: f.key, strategy: 'unmapped' as const }
  })
  draft.mappings = next
}
watch(() => draft.target, ensureMappingsForTarget)

const allFields = computed(() => erpTargetFields(draft.target))
const mandatoryFields = computed(() => allFields.value.filter((f) => f.requirement !== 'optional'))
const optionalFields = computed(() => allFields.value.filter((f) => f.requirement === 'optional'))
function entryFor(key: string): MappingEntry {
  return draft.mappings.find((m) => m.targetKey === key) ?? { targetKey: key, strategy: 'unmapped' }
}
function setEntry(next: MappingEntry) {
  const i = draft.mappings.findIndex((m) => m.targetKey === next.targetKey)
  if (i >= 0) draft.mappings[i] = next
  else draft.mappings.push(next)
}

// ── Custom-module blocking criterion (one field + operator + value) ──────────
const criterionEnabled = ref(false)
watch(() => props.orderId, () => { criterionEnabled.value = !!getConversionConfig(props.orderId)?.criterion }, { immediate: true })
// Fields eligible for the criterion: scalar text/option/number/date/boolean — not
// customer / product-list / user (PRD §Custom-module conversion limitation criterion).
const criterionFieldOptions = computed(() =>
  (mod.value?.fields ?? [])
    .filter((f) => ['text', 'number', 'date', 'pick-list', 'radio'].includes(f.type))
    .map((f) => ({ value: f.id, label: f.label })),
)
const operatorOptions = computed(() => {
  const f = mod.value?.fields.find((x) => x.id === draft.criterion?.fieldId)
  // Contains only applies to free-text-like fields.
  if (f && f.type === 'text') return [{ value: 'equals', label: 'Equals' }, { value: 'contains', label: 'Contains' }]
  return [{ value: 'equals', label: 'Equals' }]
})
function ensureCriterion() {
  if (!draft.criterion) draft.criterion = { fieldId: criterionFieldOptions.value[0]?.value ?? '', operator: 'equals', value: '' }
}
watch(criterionEnabled, (on) => { if (on) ensureCriterion(); else draft.criterion = null })

// Blocking validation errors (mandatory unmapped/incompatible + broken optional) —
// gate the enabled save and surface inline (no side panel).
const validationErrors = computed(() => {
  const errs: string[] = []
  for (const f of allFields.value) {
    const r = evalEntry(entryFor(f.key), f, mod.value ?? ({ fields: [] } as unknown as CrmModule))
    if (r.status === 'missing' || r.status === 'incompatible') errs.push(r.message ?? `${t(f.label)} is not mapped correctly.`)
  }
  return errs
})

// ── Actions ──────────────────────────────────────────────────────────────────
const saveError = ref('')
const enableConfirmOpen = ref(false)
const previewOpen = ref(false)

function goBack() { router.push('/crm/settings/erp-integrations') }

function applySave() {
  saveConfig(props.orderId, {
    enabled: draft.enabled, target: draft.target,
    mappings: JSON.parse(JSON.stringify(draft.mappings)),
    criterion: draft.criterion ? { ...draft.criterion } : null,
  })
  saveError.value = ''
  successToast(t('Conversion settings saved'))
}
function onSave() {
  // Enabled + incomplete → block with inline error (button never disabled per rule).
  if (draft.enabled && validationErrors.value.length) {
    saveError.value = t('Resolve the mapping errors below before enabling conversion.')
    return
  }
  // Enabled save applies immediately to new conversions → confirm first.
  if (draft.enabled) { enableConfirmOpen.value = true; return }
  applySave()
}
function confirmEnabledSave() { enableConfirmOpen.value = false; applySave() }

// Preview: resolve each target field to its source description for a sample record.
function sourceSummary(e: MappingEntry): string {
  if (e.strategy === 'unmapped') return t('Not mapped')
  if (e.strategy === 'crm-field') return mod.value?.fields.find((f) => f.id === e.sourceFieldId)?.label ?? '—'
  if (e.strategy === 'system') return t('System value')
  if (e.strategy === 'fixed') return e.fixedLabel ?? '—'
  return t('ERP default')
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/settings/erp-integrations">{{ t('ERP integrations') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ mod ? mod.name : t('Module not found') }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!mod" class="editor-empty">
        <MpIcon name="folder-close" size="xl" />
        <p class="editor-empty-title">{{ t('Module not found') }}</p>
        <MpButton class="btn-enterprise--secondary" is-rounded @click="goBack">{{ t('Back to ERP integrations') }}</MpButton>
      </div>

      <div v-else class="editor-main">
          <!-- 1. Conversion -->
          <section class="ed-section">
            <!-- Header list: H2 + desc (0 gap between them), 12px to the content below. -->
            <div class="ed-headerlist">
              <h2 class="ed-section-title">{{ t('Conversion') }}</h2>
              <p class="ed-headerlist-desc">{{ t('Set up how records in this module are turned into an ERP transaction.') }}</p>
            </div>
            <div class="ed-body">
              <div class="ed-toggle-row">
                <MpToggle v-model:is-checked="draft.enabled" :aria-label="t('Allow this module to create ERP transactions')" />
                <div class="ed-toggle-text">
                  <span class="ed-toggle-label">{{ t('Allow this module to create ERP transactions') }}</span>
                  <span class="ed-toggle-cap">{{ t('When on, authorized users can manually create one ERP transaction from a record in this module.') }}</span>
                </div>
              </div>

              <!-- Target + manual-only banner only appear once conversion is on. -->
              <template v-if="draft.enabled">
                <MpFormControl id="ed-target" class="ed-target-control">
                  <MpFormLabel>{{ t('Transaction target') }}</MpFormLabel>
                  <div class="ed-radio-group">
                    <MpRadio id="ed-target-so" :is-checked="draft.target === 'sales-order'" @change="draft.target = 'sales-order'">
                      {{ t('Sales Order') }}
                      <template #description>{{ t('Creates a sales order in ERP.') }}</template>
                    </MpRadio>
                    <MpRadio id="ed-target-sq" :is-checked="draft.target === 'sales-quote'" @change="draft.target = 'sales-quote'">
                      {{ t('Sales Quote') }}
                      <template #description>{{ t('Creates a price quote in ERP.') }}</template>
                    </MpRadio>
                  </div>
                </MpFormControl>
                <div class="ed-notice">
                  <MpIcon name="info" size="sm" />
                  <span>{{ t('Conversion is always manual. A record is only converted when a user explicitly creates the ERP transaction, never automatically by stage, status, or schedule.') }}</span>
                </div>
              </template>
            </div>
          </section>

          <!-- 2. Mappings — only when conversion is enabled. -->
          <section v-if="draft.enabled" class="ed-section">
            <div class="ed-maphead">
              <div class="ed-headerlist">
                <h2 class="ed-section-title">{{ t('Mappings') }}</h2>
                <p class="ed-headerlist-desc">{{ t('Every required and conditional ERP field must map to a compatible source.') }}</p>
              </div>
              <MpTextlink class="ed-preview-link" @click="previewOpen = true">{{ t('Preview') }}</MpTextlink>
            </div>
            <div class="ed-body">
              <!-- Mandatory fields -->
              <div class="ed-maplist">
                <h3 class="ed-maplist-title">{{ t('Mandatory fields') }}</h3>
                <div class="map-table">
                  <div class="map-head">
                    <span>{{ t('ERP field') }}</span>
                    <span>{{ t('Source') }}</span>
                    <span>{{ t('CRM field') }}</span>
                  </div>
                  <CrmMappingRow
                    v-for="f in mandatoryFields"
                    :key="f.key"
                    :field="f"
                    :entry="entryFor(f.key)"
                    :mod="mod"
                    @update:entry="setEntry"
                  />
                </div>
              </div>

              <!-- Optional fields -->
              <div class="ed-maplist">
                <h3 class="ed-maplist-title">{{ t('Optional fields') }}</h3>
                <div class="map-table">
                  <div class="map-head">
                    <span>{{ t('ERP field') }}</span>
                    <span>{{ t('Source') }}</span>
                    <span>{{ t('CRM field') }}</span>
                  </div>
                  <CrmMappingRow
                    v-for="f in optionalFields"
                    :key="f.key"
                    :field="f"
                    :entry="entryFor(f.key)"
                    :mod="mod"
                    @update:entry="setEntry"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- 4. Conversion limitation — only when conversion is enabled. -->
          <section v-if="draft.enabled" class="ed-section">
            <h2 class="ed-section-title">{{ t('Conversion limitation') }}</h2>
            <!-- Deals: fixed Lost-stage rule (read-only). -->
            <div v-if="isDeals" class="ed-notice ed-notice--muted">
              <MpIcon name="info" size="sm" />
              <span>{{ t('Deals in the Lost stage can never be converted. This rule is fixed and cannot be changed.') }}</span>
            </div>
            <!-- Custom modules: at most one blocking criterion. -->
            <template v-else>
              <p class="ed-section-cap">{{ t('Optionally block conversion when a record matches one condition.') }}</p>
              <div class="ed-toggle-row">
                <MpToggle v-model:is-checked="criterionEnabled" :aria-label="t('Block conversion when a condition is met')" />
                <div class="ed-toggle-text">
                  <span class="ed-toggle-label">{{ t('Block conversion when a condition is met') }}</span>
                </div>
              </div>
              <div v-if="criterionEnabled && draft.criterion" class="ed-criterion">
                <ErpFilterSelect
                  id="ed-crit-field"
                  :model-value="draft.criterion.fieldId"
                  placeholder="Select field"
                  :options="criterionFieldOptions"
                  @update:model-value="(v: string) => draft.criterion && (draft.criterion.fieldId = v)"
                />
                <ErpFilterSelect
                  id="ed-crit-op"
                  :model-value="draft.criterion.operator"
                  placeholder="Operator"
                  :options="operatorOptions"
                  @update:model-value="(v: string) => draft.criterion && (draft.criterion.operator = v as CriterionOperator)"
                />
                <MpInput
                  id="ed-crit-value"
                  :model-value="draft.criterion.value"
                  :placeholder="t('Value')"
                  @update:model-value="(v: string) => draft.criterion && (draft.criterion.value = v)"
                />
              </div>
            </template>
          </section>

          <p v-if="saveError" class="ed-save-error">{{ saveError }}</p>
      </div>

      <!-- Action bar — lives INSIDE the stage/main area, sticky to its bottom.
           Buttons ALWAYS present, never disabled (CLAUDE.md). -->
      <footer v-if="mod" class="ed-footer">
        <MpButton class="btn-enterprise--ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ draft.enabled ? t('Save changes') : t('Save draft') }}</MpButton>
      </footer>
    </div>

    <!-- Enabled-save confirmation: applies immediately to NEW conversions. -->
    <MpModal :is-open="enableConfirmOpen" @close="enableConfirmOpen = false">
      <MpModalOverlay />
      <MpModalContent>
        <MpModalHeader>{{ t('Save and apply to new conversions?') }}</MpModalHeader>
        <MpModalBody>{{ t('This mapping is enabled. Saving applies it immediately to every new conversion. Transactions already in progress are unaffected.') }}</MpModalBody>
        <MpModalFooter>
          <MpButton class="btn-enterprise--ghost" is-rounded @click="enableConfirmOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmEnabledSave">{{ t('Save changes') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>

    <!-- Preview: how each ERP field resolves for a sample record (read-only). -->
    <MpModal :is-open="previewOpen" @close="previewOpen = false">
      <MpModalOverlay />
      <MpModalContent>
        <MpModalHeader>{{ t('Mapping preview') }}</MpModalHeader>
        <MpModalBody>
          <p class="prev-cap">{{ t('How each ERP field would be filled when a record is converted.') }}</p>
          <ul class="prev-list">
            <li v-for="f in allFields" :key="f.key">
              <span class="prev-target">{{ t(f.label) }}</span>
              <span class="prev-arrow"><MpIcon name="arrows-right" size="sm" /></span>
              <span class="prev-source">{{ sourceSummary(entryFor(f.key)) }}</span>
            </li>
          </ul>
        </MpModalBody>
        <MpModalFooter>
          <MpButton variant="primary" is-rounded @click="previewOpen = false">{{ t('Close') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.detail-breadcrumb { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-link, #165082); text-align: left; }
.detail-breadcrumb:hover { text-decoration: underline; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; }

.editor-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-10) 0; color: var(--mp-text-secondary); }
.editor-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Full-width single column (the readiness/dependencies side panel was removed). */
.editor-main { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

/* .ed-section stacks [header-list, body] with a 12px gap between them. No divider
   between sections (the editor-main gap separates them). */
.ed-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
/* Header list: H2 title over its description, ZERO gap between them. */
.ed-headerlist { display: flex; flex-direction: column; gap: 0; }
/* Mappings header row: the header-list on the left, a Preview text link on the right. */
.ed-maphead { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.ed-preview-link { flex-shrink: 0; }
.ed-headerlist-desc { margin: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }
/* Section headings are H2 → xl/20px semibold (rule/type-scale: H1 24, H2 20, H3 16). */
.ed-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }
.ed-section-cap { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
/* Body: form controls stacked with the standard 20px form row gap (Form.md). */
.ed-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ed-toggle-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.ed-toggle-text { display: flex; flex-direction: column; gap: 2px; }
.ed-toggle-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.ed-toggle-cap { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
/* Transaction target: MpFormLabel gives the semibold label + its 4px gap to the
   radio group; radios stack 12px apart, captions are the built-in 12px/regular. */
.ed-target-control { max-width: 420px; }
.ed-radio-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
/* MpRadio renders the option title + description as two identical 14px <p>s inside
   .mp-radio__label; the caption (2nd) must be 12px/regular per the type scale. */
.ed-radio-group :deep(.mp-radio__label > p:nth-child(2)) { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.ed-notice { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-info-subtle, #eaf2fb); color: var(--mp-text-default); font-size: var(--mp-font-sizes-sm, 12px); }
.ed-notice--muted { background: var(--mp-background-neutral-subtle, #eef0f3); color: var(--mp-text-secondary); }
/* Mapping list: an H3 group ("Mandatory fields" / "Optional fields") + a 3-column
   table (ERP field · Source · CRM field), with a header row above the rows. */
.ed-maplist { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ed-maplist-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.map-table { display: flex; flex-direction: column; }
.map-head { display: grid; grid-template-columns: minmax(220px, 1.2fr) 200px minmax(220px, 1.4fr); gap: var(--mp-spacing-4); padding-bottom: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default, #c8cdd0); }
.map-head span { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-secondary); }
/* Strip the divider on the final mapping row of each list. */
.map-table :deep(.map-row:last-child) { border-bottom: none; }
.ed-criterion { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--mp-spacing-3); max-width: 560px; }
.ed-save-error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #a8352d); }


/* Action bar inside the stage — sticky to the bottom of the scrollable white area.
   Negative margins bleed it to the stage edges (the stage has spacing-6 padding);
   margin-top pushes it below the content with a divider. */
.ed-footer { position: sticky; bottom: calc(-1 * var(--mp-spacing-6)); margin: var(--mp-spacing-6) calc(-1 * var(--mp-spacing-6)) calc(-1 * var(--mp-spacing-6)); display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-6); background: var(--mp-background-stage, #ffffff); border-top: 1px solid var(--mp-border-subtle, #e6e8eb); }

.prev-cap { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.prev-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.prev-list li { display: grid; grid-template-columns: 1fr 24px 1fr; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 14px); }
.prev-target { color: var(--mp-text-default); }
.prev-arrow { color: var(--mp-text-subtle); display: flex; justify-content: center; }
.prev-source { color: var(--mp-text-secondary); }
</style>
