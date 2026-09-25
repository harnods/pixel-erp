<script setup lang="ts">
/**
 * CrmPropertyDrawer — create / edit a Deals-module property (Modules ▸ Deals ▸
 * Properties ▸ "+ New property"). A form drawer (custom Teleport shell per
 * CLAUDE.md — NOT MpDrawer): Property name (25-char limit) + Field type, then a
 * per-type config section: default value, date display, option list, file access,
 * boolean labels, text size, currency digits, etc. Cancel discards, Save commits —
 * overlay clicks are ignored so in-progress input is never lost.
 */
import { reactive, ref, computed, watch } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpTextarea, MpCheckbox, MpRadio, MpDatePicker,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpTooltip,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvanceDateFilter from '~/components/patterns/AdvanceDateFilter.vue'
import { TODAY } from '~/data/master'
import type { DateFilterValue } from '~/utils/dateFilter'
import {
  NEW_PROPERTY_TYPES, DEAL_PROPERTY_TYPE_ICON, toVariableName,
  type DealProperty, type DealPropertyType, type DealPropertyConfig, type DealPropertyOption,
} from '~/data/crm'

const props = defineProps<{ open: boolean; mode: 'add' | 'edit'; property: DealProperty | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; save: [{ name: string; variableName: string; type: DealPropertyType; config: DealPropertyConfig }] }>()
const { t } = useLocale()

const NAME_MAX = 25
const OPTION_TYPES: DealPropertyType[] = ['Multiple checkboxes', 'Radio select', 'Dropdown select']

const name = ref('')
const nameError = ref('')
// Variable name auto-follows the property name (snake_case) until the user edits it.
const variableName = ref('')
watch(name, (n) => { variableName.value = toVariableName(n) })
const type = ref<DealPropertyType>('Single-line text')
const config = reactive<DealPropertyConfig>({})
const typeOptions = NEW_PROPERTY_TYPES.map((tp) => ({ value: tp, label: tp }))
const isOptionType = computed(() => OPTION_TYPES.includes(type.value))

function freshOptions(): DealPropertyOption[] {
  return [
    { label: 'Option 1', value: 'option_1', inForms: true },
    { label: 'Option 2', value: 'option_2', inForms: true },
  ]
}
// Reset config to that type's defaults.
function seedConfig(tp: DealPropertyType) {
  for (const k of Object.keys(config)) delete (config as Record<string, unknown>)[k]
  if (tp === 'Multi-line text') config.textSize = 'small'
  if (tp === 'Date picker') { config.dateDisplay = 'date-only'; config.datePickerStyle = 'simple'; config.defaultDateAdvance = null }
  if (tp === 'Single checkbox') { config.defaultBool = ''; config.booleanYesLabel = 'Yes'; config.booleanNoLabel = 'No' }
  if (tp === 'File') config.fileAccess = 'private'
  if (tp === 'Image') config.imageAccess = 'private'
  if (tp === 'URL') { config.defaultLinkText = ''; config.allowModifyLinkText = false; config.defaultUrl = '' }
  if (tp === 'Currency') { config.currencyMaxDigits = 16; config.currencyDecimalPlaces = 2 }
  if (OPTION_TYPES.includes(tp)) { config.options = freshOptions(); config.defaultOption = '' }
}

watch(() => props.open, (o) => {
  if (!o) return
  nameError.value = ''
  if (props.mode === 'edit' && props.property) {
    name.value = props.property.name
    variableName.value = props.property.variableName || toVariableName(props.property.name)
    type.value = NEW_PROPERTY_TYPES.includes(props.property.type) ? props.property.type : 'Single-line text'
    seedConfig(type.value)
    if (props.property.config) Object.assign(config, JSON.parse(JSON.stringify(props.property.config)))
  } else {
    name.value = ''
    variableName.value = ''
    type.value = 'Single-line text'
    seedConfig('Single-line text')
  }
})
function onTypeChange(v: string) { type.value = (v || 'Single-line text') as DealPropertyType; seedConfig(type.value) }

// Options editor
let optSeq = 100
function addOption() { config.options = [...(config.options ?? []), { label: '', value: `option_${optSeq++}`, inForms: true }] }
function removeOption(i: number) { config.options = (config.options ?? []).filter((_, x) => x !== i) }
function clearOptions() { config.options = [] }
function sortOptionsAZ() {
  config.options = [...(config.options ?? [])].sort((a, b) => a.label.localeCompare(b.label))
}
const defaultOptionOptions = computed(() =>
  (config.options ?? []).filter((o) => o.label.trim()).map((o) => ({ value: o.value, label: o.label })),
)


function close() { emit('update:open', false) }
function save() {
  if (!name.value.trim()) { nameError.value = t('Enter a property name.'); return }
  const vn = variableName.value.trim() || toVariableName(name.value)
  emit('save', { name: name.value.trim(), variableName: vn, type: type.value, config: JSON.parse(JSON.stringify(config)) })
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cpd">
      <div v-if="open" class="cpd-overlay">
        <div class="cpd-panel" role="dialog" :aria-label="mode === 'edit' ? t('Edit property') : t('New property')">
          <header class="cpd-header">
            <h2 class="cpd-title">{{ mode === 'edit' ? t('Edit property') : t('New property') }}</h2>
            <MpButton class="cpd-close" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="cpd-body">
            <!-- Property name -->
            <MpFormControl id="cpd-name-fc" :is-invalid="!!nameError">
              <div class="cpd-labelrow">
                <MpFormLabel>{{ t('Property name') }}</MpFormLabel>
                <span class="cpd-counter">{{ name.length }} / {{ NAME_MAX }}</span>
              </div>
              <MpInput id="cpd-name" v-model="name" is-full-width :maxlength="NAME_MAX" @update:model-value="nameError = ''" />
              <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Field type -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Field type') }}</span>
              <ErpFilterSelect
                id="cpd-type" class="cpd-half" :model-value="type" :options="typeOptions" :is-clearable="false"
                is-full-width @update:model-value="onTypeChange"
              />
            </div>

            <!-- ── Per-type config ── -->

            <!-- Single-line text: default value -->
            <div v-if="type === 'Single-line text'" class="cpd-field">
              <span class="cpd-label">{{ t('Default value') }}</span>
              <MpInput id="cpd-def-text" v-model="config.defaultText" is-full-width />
              <span class="cpd-caption">{{ t('This value is filled in automatically when a new record is created.') }}</span>
            </div>

            <!-- Multi-line text: default value + text size -->
            <template v-else-if="type === 'Multi-line text'">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default value') }}</span>
                <MpTextarea id="cpd-def-textarea" v-model="config.defaultText" is-full-width :rows="3" />
                <span class="cpd-caption">{{ t('This value is filled in automatically when a new record is created.') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Maximum characters') }}</span>
                <ErpFilterSelect
                  id="cpd-text-size" class="cpd-half" :model-value="config.textSize || 'small'"
                  :options="[{ value: 'small', label: t('Small (2,000 chars)') }, { value: 'large', label: t('Large (10,000 chars)') }]"
                  :is-clearable="false" is-full-width
                  @update:model-value="(v: string) => (config.textSize = (v || 'small') as 'small' | 'large')"
                />
              </div>
            </template>

            <!-- Number: no additional setup per PRD -->
            <!-- Percentage: no additional setup per PRD -->
            <!-- Email: no additional setup per PRD -->
            <!-- Phone: no additional setup per PRD -->
            <!-- URL: no additional setup per PRD (keeping existing link text config) -->
            <template v-else-if="type === 'URL'">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default link text') }}</span>
                <MpInput id="cpd-link-text" v-model="config.defaultLinkText" is-full-width />
                <label class="cpd-inline-check">
                  <MpCheckbox id="cpd-allow-link" :is-checked="!!config.allowModifyLinkText" @change="config.allowModifyLinkText = !config.allowModifyLinkText" />
                  <span>{{ t('Allow users to modify link text') }}</span>
                </label>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default value') }}</span>
                <MpInput id="cpd-def-url" v-model="config.defaultUrl" is-full-width />
                <span class="cpd-caption">{{ t('This value is filled in automatically when a new record is created.') }}</span>
              </div>
            </template>

            <!-- Single checkbox (boolean): configurable labels + default value -->
            <template v-else-if="type === 'Single checkbox'">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Checkbox labels') }}</span>
                <div class="cpd-bool-labels">
                  <MpFormControl id="cpd-bool-yes-fc">
                    <MpFormLabel>{{ t('Checked') }}</MpFormLabel>
                    <MpInput id="cpd-bool-yes" v-model="config.booleanYesLabel" is-full-width />
                  </MpFormControl>
                  <MpFormControl id="cpd-bool-no-fc">
                    <MpFormLabel>{{ t('Unchecked') }}</MpFormLabel>
                    <MpInput id="cpd-bool-no" v-model="config.booleanNoLabel" is-full-width />
                  </MpFormControl>
                </div>
                <span class="cpd-caption">{{ t('Configure the display names for checked and unchecked states.') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default value') }}</span>
                <ErpFilterSelect
                  id="cpd-def-bool" class="cpd-half" :model-value="config.defaultBool || ''"
                  :options="[{ value: 'Yes', label: config.booleanYesLabel || t('Yes') }, { value: 'No', label: config.booleanNoLabel || t('No') }]"
                  is-full-width @update:model-value="(v: string) => (config.defaultBool = (v as '' | 'Yes' | 'No'))"
                />
                <span class="cpd-caption">{{ t('This value is filled in automatically when a new record is created.') }}</span>
              </div>
            </template>

            <!-- File upload: public/private access -->
            <template v-else-if="type === 'File'">
              <div class="cpd-note">
                <MpIcon name="protection" size="sm" class="cpd-note-icon" />
                <span>{{ t('File access isn\'t controlled by property permissions — avoid sharing file URLs with unauthorized users.') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('External file access') }}</span>
                <label class="cpd-radio">
                  <MpRadio id="cpd-file-private" name="cpd-file-access" value="private" :is-checked="config.fileAccess === 'private'" @change="config.fileAccess = 'private'" />
                  <span class="cpd-radio-text"><span>{{ t('Private') }}</span><span class="cpd-caption">{{ t('Only users in your workspace can access these files.') }}</span></span>
                </label>
                <label class="cpd-radio">
                  <MpRadio id="cpd-file-public" name="cpd-file-access" value="public" :is-checked="config.fileAccess === 'public'" @change="config.fileAccess = 'public'" />
                  <span class="cpd-radio-text"><span>{{ t('Public') }}</span><span class="cpd-caption">{{ t('Anyone with the file URL can access these files.') }}</span></span>
                </label>
                <span class="cpd-caption">{{ t('Can these files be accessed outside the workspace?') }}</span>
              </div>
            </template>

            <!-- Image upload: public/private access -->
            <template v-else-if="type === 'Image'">
              <div class="cpd-note">
                <MpIcon name="protection" size="sm" class="cpd-note-icon" />
                <span>{{ t('Image access isn\'t controlled by property permissions — avoid sharing image URLs with unauthorized users.') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('External image access') }}</span>
                <label class="cpd-radio">
                  <MpRadio id="cpd-img-private" name="cpd-img-access" value="private" :is-checked="config.imageAccess === 'private'" @change="config.imageAccess = 'private'" />
                  <span class="cpd-radio-text"><span>{{ t('Private') }}</span><span class="cpd-caption">{{ t('Only users in your workspace can access these images.') }}</span></span>
                </label>
                <label class="cpd-radio">
                  <MpRadio id="cpd-img-public" name="cpd-img-access" value="public" :is-checked="config.imageAccess === 'public'" @change="config.imageAccess = 'public'" />
                  <span class="cpd-radio-text"><span>{{ t('Public') }}</span><span class="cpd-caption">{{ t('Anyone with the image URL can access these images.') }}</span></span>
                </label>
                <span class="cpd-caption">{{ t('Can these images be accessed outside the workspace?') }}</span>
              </div>
            </template>

            <!-- Date picker: calendar type + default value + date display -->
            <template v-else-if="type === 'Date picker'">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Date picker type') }}</span>
                <ErpFilterSelect
                  id="cpd-date-style" class="cpd-half" :model-value="config.datePickerStyle || 'simple'"
                  :options="[{ value: 'simple', label: t('Basic') }, { value: 'advance', label: t('Advanced') }]"
                  :is-clearable="false" is-full-width
                  @update:model-value="(v: string) => (config.datePickerStyle = (v || 'simple') as 'simple' | 'advance')"
                />
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default value') }}</span>
                <AdvanceDateFilter
                  v-if="config.datePickerStyle === 'advance'"
                  id="cpd-def-date-adv" :model-value="(config.defaultDateAdvance as DateFilterValue | null) ?? null"
                  :today="TODAY" :placeholder="t('Select date')"
                  @update:model-value="(v: DateFilterValue | null) => (config.defaultDateAdvance = v)"
                />
                <MpDatePicker v-else id="cpd-def-date" v-model="config.defaultDate" format="DD/MM/YYYY" value-type="format" use-portal />
                <span class="cpd-caption">{{ t('Default value is always today\'s date.') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('How should this date appear on records?') }}</span>
                <label class="cpd-radio">
                  <MpRadio id="cpd-date-only" name="cpd-date-display" value="date-only" :is-checked="config.dateDisplay === 'date-only'" @change="config.dateDisplay = 'date-only'" />
                  <span class="cpd-radio-text"><span>{{ t('Show date only') }}</span><span class="cpd-caption">{{ t('Example: 27/08/2026') }}</span></span>
                </label>
                <label class="cpd-radio">
                  <MpRadio id="cpd-date-relative" name="cpd-date-display" value="relative" :is-checked="config.dateDisplay === 'relative'" @change="config.dateDisplay = 'relative'" />
                  <span class="cpd-radio-text"><span>{{ t('Show date with relative time') }}</span><span class="cpd-caption">{{ t('Example: 27/08/2026 (15 days ago)') }}</span></span>
                </label>
              </div>
            </template>

            <!-- Date and time picker: no additional setup per PRD -->
            <!-- Date range: no additional setup per PRD -->

            <!-- Currency: max digits + decimal places -->
            <template v-else-if="type === 'Currency'">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Maximum digits') }}</span>
                <MpInput
                  id="cpd-currency-digits" class="cpd-quarter" type="number"
                  :model-value="config.currencyMaxDigits ?? 16" :min="1" :max="16"
                  @update:model-value="(v: string | number) => (config.currencyMaxDigits = Math.min(16, Math.max(1, Number(v) || 16)))"
                />
                <span class="cpd-caption">{{ t('Maximum number of digits allowed (up to 16).') }}</span>
              </div>
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Decimal places') }}</span>
                <MpInput
                  id="cpd-currency-decimals" class="cpd-quarter" type="number"
                  :model-value="config.currencyDecimalPlaces ?? 2" :min="0" :max="6"
                  @update:model-value="(v: string | number) => (config.currencyDecimalPlaces = Math.min(6, Math.max(0, Number(v) || 0)))"
                />
                <span class="cpd-caption">{{ t('Number of decimal places allowed (0 to 6). Set to 0 to disallow decimals.') }}</span>
              </div>
            </template>

            <!-- Multiple checkboxes / Radio / Dropdown — options editor with sort -->
            <template v-if="isOptionType">
              <div class="cpd-field">
                <span class="cpd-label">{{ t('Default value') }}</span>
                <ErpFilterSelect
                  id="cpd-def-option" class="cpd-half" :model-value="config.defaultOption || ''" :options="defaultOptionOptions"
                  is-full-width @update:model-value="(v: string) => (config.defaultOption = v)"
                />
              </div>
              <div class="cpd-field">
                <div class="cpd-opt-head">
                  <span class="cpd-label">{{ t('Options') }} ({{ (config.options ?? []).length }})</span>
                  <div class="cpd-opt-actions">
                    <MpButton v-if="(config.options ?? []).length > 1" variant="link" class="cpd-link" @click="sortOptionsAZ">{{ t('Sort A–Z') }}</MpButton>
                    <MpButton v-if="(config.options ?? []).length" variant="link" class="cpd-link" @click="clearOptions">{{ t('Clear all') }}</MpButton>
                  </div>
                </div>
                <div v-for="(opt, i) in (config.options ?? [])" :key="i" class="cpd-opt-row">
                  <MpInput :id="`cpd-opt-label-${i}`" :model-value="opt.label" is-full-width :aria-label="t('Label')" @update:model-value="(v: string) => { opt.label = v; opt.value = toVariableName(v) }" />
                  <MpTooltip :id="`cpd-opt-rm-${i}`" :label="t('Remove')" placement="top" use-portal>
                    <button type="button" class="cpd-opt-remove" :aria-label="t('Remove')" @click="removeOption(i)"><MpIcon name="minus-circular" size="md" /></button>
                  </MpTooltip>
                </div>
                <MpButton class="cpd-add-opt" variant="secondary" is-rounded left-icon="add" @click="addOption">{{ t('Add option') }}</MpButton>
              </div>
            </template>
          </div>

          <footer class="cpd-footer">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="save">{{ mode === 'edit' ? t('Save changes') : t('Create property') }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cpd-enter-active, .cpd-leave-active { transition: background-color 220ms ease; }
.cpd-enter-from, .cpd-leave-to { background-color: transparent; }
.cpd-enter-active :deep(.cpd-panel) { transition: transform 300ms ease-out; }
.cpd-leave-active :deep(.cpd-panel) { transition: transform 220ms ease-in; }
.cpd-enter-from :deep(.cpd-panel), .cpd-leave-to :deep(.cpd-panel) { transform: translateX(calc(100% + 12px)); }

.cpd-overlay { position: fixed; inset: 0; z-index: 1400; background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cpd-panel { margin: var(--mp-spacing-3); width: min(520px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-colors-background-stage, #fff); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.cpd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.cpd-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.cpd-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); min-width: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; cursor: pointer; color: var(--mp-colors-icon-default, #536062); }
.cpd-close:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3) !important; }

.cpd-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cpd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* Dropdowns in this drawer sit at 50% of the field width (~3 of 6 grid cols). */
/* ErpFilterSelect's trigger is a fixed 176px inline-flex; force it to fill a 50% box. */
.cpd-half { width: 50%; }
.cpd-half :deep(.efs) { width: 100%; }
.cpd-half :deep(.efs-trigger) { width: 100%; }
.cpd-quarter { width: 25%; }
.cpd-labelrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.cpd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.cpd-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); font-variant-numeric: tabular-nums; }
.cpd-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.cpd-inline-check { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }
.cpd-radio { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer; }
.cpd-radio-text { display: flex; flex-direction: column; gap: 2px; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }
.cpd-bool-labels { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }

/* Info note (file/image access) */
.cpd-note { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-warning, #e8b931); border-radius: var(--mp-radii-md, 6px); background: var(--mp-colors-background-warning-subtle, #fdf6e3); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); }
.cpd-note-icon { color: var(--mp-colors-icon-warning, #b7791f); flex-shrink: 0; margin-top: 1px; }

/* Options editor */
.cpd-opt-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.cpd-opt-actions { display: flex; gap: var(--mp-spacing-3); }
.cpd-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-link, #165082); }
.cpd-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cpd-opt-row { display: grid; grid-template-columns: 1fr 32px; gap: var(--mp-spacing-2); align-items: center; }
.cpd-opt-col { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.cpd-opt-remove { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0; border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.cpd-opt-remove:hover { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-text-danger, #a8352d); }
.cpd-add-opt { align-self: flex-start; margin-top: var(--mp-spacing-1); }

.cpd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }
</style>
