<script setup lang="ts">
/**
 * ExportModal — shared export dialog extracted from BillsIndexPage / ProductsPage.
 *
 * Export scope (radio) + column selector (search + All-columns master checkbox
 * + 3-column grid) + optional custom fields. Emits the chosen scope and the
 * checked column keys (always including `required` columns).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpRadio, MpCheckbox, MpButton, MpIcon,
} from '@mekari/pixel3'
import { computed, reactive, ref, watch } from 'vue'

type ExportScope = 'all' | 'page' | 'selected'
type ExportFormat = 'xlsx' | 'csv'
interface ExportColumn { key: string; label: string; required?: boolean }

const props = withDefaults(defineProps<{
  open: boolean
  title: string                    // e.g. "Export sales invoices"
  entityLabel: string              // e.g. "sales invoices" (for the scope radio labels)
  columns: ExportColumn[]          // flat list; rendered into a 3-col grid
  customFields?: string[]
  total: number                    // count for "All"
  selectedCount?: number           // for "Selected N" (default 0)
  /** Hide the "Search column" box — for a short column list where searching adds
   *  no value (e.g. Contacts' 7 columns). Defaults to true (shown). */
  showColumnSearch?: boolean
  /** Offer a file-format choice (e.g. ['xlsx', 'csv']). The first is preselected and the
   *  pick is emitted as `format`. Omitted → no format section (every existing caller). */
  formats?: ExportFormat[]
  /** Hide the scope radios — for exporting one record (a detail page), where All /
   *  Current page / Selected don't apply. */
  hideScope?: boolean
  /** Overrides the "Select columns to export" heading (e.g. "Select sections to export"). */
  columnsLabel?: string
}>(), {
  customFields: () => [],
  selectedCount: 0,
  showColumnSearch: true,
  formats: () => [],
  hideScope: false,
  columnsLabel: '',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'export', payload: { scope: ExportScope; columns: string[]; format?: ExportFormat }): void
}>()

const { t } = useLocale()

// ─── Internal state ───────────────────────────────────────────────────────────
const scope = ref<ExportScope>('all')
const format = ref<ExportFormat>('xlsx')
const FORMAT_LABELS: Record<ExportFormat, string> = { xlsx: 'Excel (.xlsx)', csv: 'CSV (.csv)' }
const columnChecked = reactive<Record<string, boolean>>({})
const customFieldChecked = reactive<Record<string, boolean>>({})
const columnSearch = ref('')

const columnKeys = computed(() => props.columns.map(c => c.key))

function isRequired(key: string): boolean {
  return !!props.columns.find(c => c.key === key)?.required
}

// Reset all internal state whenever the modal opens.
function resetState() {
  scope.value = (props.selectedCount ?? 0) > 0 ? 'selected' : 'all'
  format.value = props.formats[0] ?? 'xlsx'
  columnSearch.value = ''
  props.columns.forEach((c) => { columnChecked[c.key] = true }) // all checked by default; required stay checked
  ;(props.customFields ?? []).forEach((f) => { customFieldChecked[f] = false })
}

watch(() => props.open, (isOpen) => {
  if (isOpen) resetState()
}, { immediate: true })

// ─── Column selector helpers ────────────────────────────────────────────────
const visibleColumns = computed(() =>
  props.columns.filter(c => c.label.toLowerCase().includes(columnSearch.value.toLowerCase())),
)

const allColumnsChecked = computed(() => columnKeys.value.every(k => columnChecked[k]))
const someColumnsChecked = computed(
  () => columnKeys.value.some(k => columnChecked[k]) && !allColumnsChecked.value,
)

function toggleAllColumns() {
  const next = !allColumnsChecked.value
  props.columns.forEach((c) => {
    columnChecked[c.key] = c.required ? true : next
  })
}

function toggleColumn(key: string) {
  if (isRequired(key)) return
  columnChecked[key] = !columnChecked[key]
}

function toggleCustomField(field: string) {
  customFieldChecked[field] = !customFieldChecked[field]
}

// ─── Actions ────────────────────────────────────────────────────────────────
function onCancel() { emit('close') }

function onExport() {
  const cols = columnKeys.value.filter(k => columnChecked[k] || isRequired(k))
  const fields = (props.customFields ?? []).filter(f => customFieldChecked[f])
  emit('export', {
    scope: scope.value,
    columns: [...cols, ...fields],
    ...(props.formats.length ? { format: format.value } : {}),
  })
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    :is-open="open"
    size="lg"
    :is-keep-alive="false"
    @close="onCancel"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ title }}
        <MpModalCloseButton />
      </MpModalHeader>

      <MpModalBody>
        <div class="export-modal-body">
          <!-- Export scope -->
          <div v-if="!hideScope" class="export-section">
            <p class="export-section__label">{{ t('Export scope') }}</p>
            <div class="export-radio-group">
              <label class="export-radio-item">
                <MpRadio
                  name="export-scope"
                  value="all"
                  :is-checked="scope === 'all'"
                  @change="scope = 'all'"
                />
                <span>{{ t('All') }} {{ entityLabel }} ({{ total }})</span>
              </label>
              <label class="export-radio-item">
                <MpRadio
                  name="export-scope"
                  value="page"
                  :is-checked="scope === 'page'"
                  @change="scope = 'page'"
                />
                <span>{{ t('Current page') }}</span>
              </label>
              <label
                class="export-radio-item"
                :class="{ 'export-radio-item--disabled': (selectedCount ?? 0) === 0 }"
              >
                <MpRadio
                  name="export-scope"
                  value="selected"
                  :is-checked="scope === 'selected'"
                  :is-disabled="(selectedCount ?? 0) === 0"
                  @change="(selectedCount ?? 0) > 0 && (scope = 'selected')"
                />
                <span>{{ t('Selected') }} {{ selectedCount ?? 0 }} {{ entityLabel }}</span>
              </label>
            </div>
          </div>

          <!-- File format (opt-in via `formats`) -->
          <div v-if="formats.length" class="export-section">
            <p class="export-section__label">{{ t('File format') }}</p>
            <div class="export-radio-group">
              <label v-for="f in formats" :key="f" class="export-radio-item">
                <MpRadio
                  name="export-format"
                  :value="f"
                  :is-checked="format === f"
                  @change="format = f"
                />
                <span>{{ t(FORMAT_LABELS[f]) }}</span>
              </label>
            </div>
          </div>

          <!-- Select columns -->
          <div class="export-section">
            <p class="export-section__label">{{ columnsLabel || t('Select columns to export') }}</p>

            <!-- Search (sanctioned search field — placeholder allowed); hidden when
                 the column list is short enough to scan without it. -->
            <div v-if="showColumnSearch" class="export-col-search">
              <MpIcon name="search" size="md" />
              <input
                v-model="columnSearch"
                class="export-col-search__input"
                type="text"
                :placeholder="t('Search column')"
              />
            </div>

            <!-- All columns master toggle -->
            <div class="export-col-all">
              <MpCheckbox
                :is-checked="allColumnsChecked"
                :is-indeterminate="someColumnsChecked"
                @change="toggleAllColumns"
                @click.stop
              />
              <span class="export-col-label">{{ t('All columns') }}</span>
            </div>

            <!-- Column grid (3 columns) -->
            <div class="export-col-grid">
              <label
                v-for="col in visibleColumns"
                :key="col.key"
                class="export-col-item"
                :class="{ 'export-col-item--disabled': col.required }"
              >
                <MpCheckbox
                  :is-checked="columnChecked[col.key]"
                  :is-disabled="col.required"
                  @change="toggleColumn(col.key)"
                  @click.stop
                />
                <span class="export-col-label">{{ col.label }}</span>
              </label>
            </div>
          </div>

          <!-- Custom fields -->
          <div v-if="(customFields?.length ?? 0) > 0" class="export-section">
            <p class="export-section__label">{{ t('Custom fields') }}</p>
            <div class="export-col-grid">
              <label
                v-for="field in customFields"
                :key="field"
                class="export-col-item"
              >
                <MpCheckbox
                  :is-checked="customFieldChecked[field]"
                  @change="toggleCustomField(field)"
                  @click.stop
                />
                <span class="export-col-label">{{ field }}</span>
              </label>
            </div>
          </div>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="modal-footer-btns">
          <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="onExport">{{ t('Export') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.export-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.export-section__label {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.export-radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}

.export-radio-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  user-select: none;
}

.export-radio-item--disabled {
  color: var(--mp-text-disabled);
  cursor: default;
}

.export-col-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-colors-border-default, #d5dadd);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral, #ffffff);
  color: var(--mp-text-secondary);
}
/* Focus/active = neutral border-bold + 1px inset ring, never green
   (rule/form-focus-border-bold). :focus-within because the input is borderless. */
.export-col-search:focus-within {
  border-color: var(--mp-border-bold, #8c9596);
  box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596);
}

.export-col-search__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}
.export-col-search__input::placeholder { color: var(--mp-text-placeholder); }

.export-col-all {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}

.export-col-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-spacing-2) var(--mp-spacing-6);
  align-items: start;
  width: 100%;
}

.export-col-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  cursor: pointer;
  user-select: none;
  min-width: 0;
}

.export-col-item--disabled {
  cursor: default;
}

.export-col-label {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  width: 100%;
}
</style>
