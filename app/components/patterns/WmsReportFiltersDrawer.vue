<script setup lang="ts">
/**
 * WMS Inbound accuracy report — "All filters" drawer (Figma node 4545-45929).
 * Custom Teleport-style overlay (MpDrawer has no structural CSS in this Pixel3
 * build). SKU is an MpInputTag tag-field (searchable suggestions, no create-new);
 * Source and Completion state are borderless checkbox groups (fixed small option
 * sets). Edits a local draft; commits to the parent only on Apply, so
 * Cancel/close-outside discards. */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel, MpInputTag, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, type DataInterface } from '@mekari/pixel3'

export interface WmsReportFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  skus: string[]
  sources: string[]
  receiveStates: string[]
}

const props = defineProps<{
  isOpen: boolean
  modelValue: WmsReportFiltersValue
  /** searchable columns for the keyword scope dropdown */
  columns: { key: string; label: string }[]
  skuOptions: string[]
  sourceOptions: { id: string; name: string }[]
  receiveStateOptions: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: WmsReportFiltersValue): void
}>()

const { t } = useLocale()

// SKU selections live as DataInterface[] (MpInputTag's shape); Source and
// completion-state checkboxes stay plain string[].
function toData(arr: string[]): DataInterface[] {
  return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false }))
}
const keyword = ref(props.modelValue.keyword)
const keywordColumn = ref(props.modelValue.keywordColumn)
const skuData = ref<DataInterface[]>(toData(props.modelValue.skus))
const sources = ref<string[]>([...props.modelValue.sources])
const receiveStates = ref<string[]>([...props.modelValue.receiveStates])

watch(() => props.isOpen, (open) => {
  if (open) {
    keyword.value = props.modelValue.keyword
    keywordColumn.value = props.modelValue.keywordColumn
    skuData.value = toData(props.modelValue.skus)
    sources.value = [...props.modelValue.sources]
    receiveStates.value = [...props.modelValue.receiveStates]
  }
})

// Label for the keyword-scope suffix — "All columns" or the chosen column.
const keywordColumnLabel = computed(() =>
  keywordColumn.value === 'all'
    ? t('All columns')
    : t(props.columns.find((c) => c.key === keywordColumn.value)?.label ?? 'All columns'),
)

function toggle(list: Ref<string[]>, id: string) {
  list.value = list.value.includes(id) ? list.value.filter((v) => v !== id) : [...list.value, id]
}
function onSkuChange(data: DataInterface[]) { skuData.value = data }
function toggleSource(id: string) { toggle(sources, id) }
function toggleReceiveState(id: string) { toggle(receiveStates, id) }

function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', {
    keyword: keyword.value.trim(),
    keywordColumn: keywordColumn.value,
    skus: skuData.value.map((d) => String(d.value ?? d.text)),
    sources: [...sources.value],
    receiveStates: [...receiveStates.value],
  })
  close()
}
function clearAll() {
  keyword.value = ''; keywordColumn.value = 'all'
  skuData.value = []; sources.value = []; receiveStates.value = []
}
</script>

<template>
  <Transition name="wrf-filters">
    <div v-if="isOpen" class="wrf-filters-overlay" @click.self="close">
      <div class="wrf-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="wrf-filters-header">
          <span class="wrf-filters-title">{{ t('All filters') }}</span>
          <button class="wrf-filters-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="wrf-filters-body">
          <MpFormControl id="wrf-filters-keyword-fc">
            <MpFormLabel>{{ t('Keywords') }}</MpFormLabel>
            <div class="wrf-keyword">
              <input
                v-model="keyword"
                class="wrf-keyword-input"
                type="text"
                :placeholder="t('Search keywords...')"
                @keydown.enter.prevent="apply"
              />
              <MpPopover id="wrf-filters-keyword-scope" :is-close-on-select="true">
                <MpPopoverTrigger>
                  <button type="button" class="wrf-keyword-scope">
                    <span class="wrf-keyword-scope-label">{{ keywordColumnLabel }}</span>
                    <svg class="wrf-keyword-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem :is-active="keywordColumn === 'all'" @click="keywordColumn = 'all'">
                      {{ t('All columns') }}
                    </MpPopoverListItem>
                    <MpPopoverListItem
                      v-for="col in columns"
                      :key="col.key"
                      :is-active="keywordColumn === col.key"
                      @click="keywordColumn = col.key"
                    >
                      {{ t(col.label) }}
                    </MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>
          </MpFormControl>

          <MpFormControl id="wrf-filters-sku-fc">
            <MpFormLabel>{{ t('Product name') }}</MpFormLabel>
            <MpInputTag
              id="wrf-filters-sku"
              :data="skuData"
              :suggestions="skuOptions"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :placeholder="t('Search product name...')"
              @change="onSkuChange"
            />
          </MpFormControl>

          <MpFormControl id="wrf-filters-source-fc">
            <MpFormLabel>{{ t('Source') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in sourceOptions" :key="opt.id" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-source-${opt.id.replace(/\s+/g, '-')}`"
                  :is-checked="sources.includes(opt.id)"
                  @change="toggleSource(opt.id)"
                >
                  {{ t(opt.name) }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="wrf-filters-state-fc">
            <MpFormLabel>{{ t('Completion state') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in receiveStateOptions" :key="opt.id" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-state-${opt.id}`"
                  :is-checked="receiveStates.includes(opt.id)"
                  @change="toggleReceiveState(opt.id)"
                >
                  {{ t(opt.name) }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="wrf-filters-footer">
          <button class="wrf-filters-reset" type="button" @click="clearAll">{{ t('Reset') }}</button>
          <div class="wrf-filters-footer-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.wrf-filters-enter-active { transition: background-color 250ms ease; }
.wrf-filters-leave-active { transition: background-color 250ms ease; }
.wrf-filters-enter-from, .wrf-filters-leave-to { background-color: transparent; }
.wrf-filters-enter-active .wrf-filters-panel { transition: transform 350ms ease-out; }
.wrf-filters-leave-active .wrf-filters-panel { transition: transform 250ms ease-in; }
.wrf-filters-enter-from .wrf-filters-panel,
.wrf-filters-leave-to .wrf-filters-panel { transform: translateX(calc(100% + 12px)); }

.wrf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.wrf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.wrf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.wrf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wrf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.wrf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.wrf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
/* Keywords — text input with an inline column-scope dropdown suffix (Figma
   4546-46593). White box + form border; the suffix hugs the right edge with a
   subtle fill and rounded-right corners. */
.wrf-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: 2px 2px 2px var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.wrf-keyword:focus-within {
  border-color: var(--mp-border-brand, #4b61dc);
  box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc);
}
.wrf-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.wrf-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.wrf-keyword-scope {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  min-width: 32px; padding: var(--mp-spacing-2);
  border: none; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-radius: 0 4px 4px 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.wrf-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb); }
.wrf-keyword-scope-label { white-space: nowrap; }
.wrf-keyword-chev { flex-shrink: 0; color: var(--mp-icon-default); }

/* Completion state — plain checkbox group, no border box. */
.wrf-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.wrf-filters-checkbox-item { display: flex; align-items: flex-start; }

/* Action group — no top border (per Figma). */
.wrf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4);
}
.wrf-filters-footer-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.wrf-filters-reset {
  border: none; background: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
}
.wrf-filters-reset:hover { text-decoration: underline; }
</style>
