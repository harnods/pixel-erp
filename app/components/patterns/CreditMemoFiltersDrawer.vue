<script lang="ts">
/**
 * Credit Memo report — "All filters" drawer. Mirrors the Bills/Expenses filter
 * pattern: a Keywords field (free text + column scope) and a Customer field
 * styled as tags with an "Is any of / Is none of" comparator (type + Enter →
 * chip), plus a Transaction-type checklist. Same right-hand overlay pattern as
 * the other ERP filter drawers; edits a local draft, commits on Apply.
 */
import type { CmMutationType, CmComparator } from '~/data/creditMemoReport'
export interface CmDrawerValue {
  keyword: string
  keywordColumn: string
  customerComparator: CmComparator
  customers: string[]
  txnTypes: CmMutationType[]
}
</script>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import { CM_MUTATION_TYPES } from '~/data/creditMemoReport'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CmDrawerValue
  customerOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CmDrawerValue): void
}>()

const KEYWORD_COLUMNS = [
  { key: 'all', label: 'All columns' },
  { key: 'number', label: 'Number' },
  { key: 'description', label: 'Description' },
]
const COMPARATORS: { key: CmComparator; label: string }[] = [
  { key: 'isAnyOf', label: 'Is any of' },
  { key: 'isNoneOf', label: 'Is none of' },
]
const TXN_LABELS: Record<CmMutationType, string> = {
  Issued: 'Credit memo issued', Applied: 'Credit memo applied', Refund: 'Credit memo refund', Reversal: 'Credit memo reversal',
}

const draft = reactive<CmDrawerValue>(clone(props.modelValue))
function clone(v: CmDrawerValue): CmDrawerValue {
  return { keyword: v.keyword, keywordColumn: v.keywordColumn, customerComparator: v.customerComparator, customers: [...v.customers], txnTypes: [...v.txnTypes] }
}
watch(() => props.isOpen, (open) => { if (open) { Object.assign(draft, clone(props.modelValue)); custDraft.value = '' } })

const keywordColOpen = ref(false)
const keywordColLabel = () => KEYWORD_COLUMNS.find((c) => c.key === draft.keywordColumn)?.label ?? 'All columns'
const comparatorOpen = ref(false)
const comparatorLabel = () => COMPARATORS.find((c) => c.key === draft.customerComparator)?.label ?? 'Is any of'

// Customer tags — type a name → a filtered suggestion popover appears (only while
// typing). Enter adds the first match (or free text) as a chip; backspace on the
// empty input removes the last chip.
const custDraft = ref('')
const custFocused = ref(false)
// Suggestions matching what the user typed, minus what's already chosen.
const filteredCustomers = computed(() => {
  const q = custDraft.value.trim().toLowerCase()
  if (!q) return []
  return props.customerOptions.filter((c) => c.toLowerCase().includes(q) && !draft.customers.includes(c)).slice(0, 8)
})
// The popover is shown only while the field is focused AND the typing matches.
const custSuggestOpen = computed(() => custFocused.value && filteredCustomers.value.length > 0)
function addCust() {
  const v = filteredCustomers.value[0] ?? custDraft.value.trim()
  if (v && !draft.customers.includes(v)) draft.customers = [...draft.customers, v]
  custDraft.value = ''
}
function pickCust(name: string) {
  if (!draft.customers.includes(name)) draft.customers = [...draft.customers, name]
  custDraft.value = ''
}
function removeCust(i: number) { draft.customers = draft.customers.filter((_, idx) => idx !== i) }
function onCustBackspace() { if (!custDraft.value && draft.customers.length) draft.customers = draft.customers.slice(0, -1) }
// Delay blur so a suggestion click (which briefly blurs the input) still registers.
function onCustBlur() { setTimeout(() => { custFocused.value = false }, 120) }

function close() { emit('update:isOpen', false) }
function clearAll() { draft.keyword = ''; draft.keywordColumn = 'all'; draft.customerComparator = 'isAnyOf'; draft.customers = []; draft.txnTypes = [] }
function apply() { emit('apply', clone(draft)); close() }
function toggle<T extends string>(list: T[], v: T) { const i = list.indexOf(v); if (i === -1) list.push(v); else list.splice(i, 1) }
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" width="400px" @close="close">
    <template #body>
      <!-- Keywords — text + column scope -->
      <MpFormControl :id="`${id}-kw`">
        <MpFormLabel>Keywords</MpFormLabel>
        <div class="cmfd-keyword">
          <input v-model="draft.keyword" class="cmfd-keyword-input" type="text" placeholder="Search keywords..." @keydown.enter.prevent="apply" />
          <MpPopover :id="`${id}-kwcol`" is-manual :is-open="keywordColOpen" use-portal :is-keep-alive="false" @open="keywordColOpen = true" @close="keywordColOpen = false">
            <MpPopoverTrigger>
              <MpButton class="cmfd-keyword-scope" @click.stop="keywordColOpen = !keywordColOpen"><span>{{ keywordColLabel() }}</span><MpIcon name="chevrons-down" size="sm" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })" @blur="keywordColOpen = false" @escape="keywordColOpen = false">
              <MpPopoverList>
                <MpPopoverListItem v-for="c in KEYWORD_COLUMNS" :key="c.key" :is-active="draft.keywordColumn === c.key" @click="draft.keywordColumn = c.key">{{ c.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </MpFormControl>

      <!-- Customer — tags with Is any of / Is none of -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">Customer</span>
        <div class="cmfd-tags">
          <MpPopover :id="`${id}-cmp`" is-manual :is-open="comparatorOpen" use-portal :is-keep-alive="false" placement="bottom-start" @open="comparatorOpen = true" @close="comparatorOpen = false">
            <MpPopoverTrigger>
              <MpButton class="cmfd-tags-prefix" @click.stop="comparatorOpen = !comparatorOpen"><span>{{ comparatorLabel() }}</span><MpIcon name="chevrons-down" size="sm" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })" @blur="comparatorOpen = false" @escape="comparatorOpen = false">
              <MpPopoverList>
                <MpPopoverListItem v-for="c in COMPARATORS" :key="c.key" :is-active="draft.customerComparator === c.key" @click="draft.customerComparator = c.key; comparatorOpen = false">{{ c.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <MpPopover :id="`${id}-cust-sug`" class="cmfd-cust-pop" is-manual :is-open="custSuggestOpen" use-portal :is-keep-alive="false" is-adaptive-width placement="bottom-start">
            <MpPopoverTrigger>
              <div class="cmfd-tags-field">
                <span v-for="(tag, i) in draft.customers" :key="`${i}-${tag}`" class="cmfd-tag-chip">
                  {{ tag }}
                  <MpButton type="button" class="cmfd-tag-remove" variant="ghost" :aria-label="`Remove ${tag}`" @click="removeCust(i)"><MpIcon name="close" size="sm" /></MpButton>
                </span>
                <input :id="`${id}-cust`" v-model="custDraft" class="cmfd-tag-input" type="text" autocomplete="off" :placeholder="draft.customers.length ? '' : 'Type a customer and press Enter'" @focus="custFocused = true" @blur="onCustBlur" @keydown.enter.prevent="addCust" @keydown.delete="onCustBackspace" />
              </div>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ maxHeight: '240px', overflowY: 'auto' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="c in filteredCustomers" :key="c" @mousedown.prevent @click="pickCust(c)">{{ c }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Transaction type -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">Transaction type</span>
        <ul class="cmfd-checklist">
          <li v-for="tt in CM_MUTATION_TYPES" :key="tt" class="cmfd-check-item" @click="toggle(draft.txnTypes, tt)">
            <span @click.stop><MpCheckbox :id="`${id}-tt-${tt}`" :is-checked="draft.txnTypes.includes(tt)" @change="() => toggle(draft.txnTypes, tt)" /></span>
            <span class="cmfd-check-label">{{ TXN_LABELS[tt] }}</span>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <MpButton class="cmfd-btn cmfd-btn--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <div class="cmfd-foot-right">
        <MpButton class="cmfd-btn cmfd-btn--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="cmfd-btn cmfd-btn--primary" variant="ghost" type="button" @click="apply">Apply</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cmfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Keywords — input + column-scope dropdown suffix (one merged box). */
.cmfd-keyword { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 2px 2px 2px var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); }
.cmfd-keyword:focus-within { border-color: var(--mp-border-brand, #0a6e4e); }
.cmfd-keyword-input { flex: 1 0 0; min-width: 0; height: 20px; border: none; outline: none; background: transparent; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmfd-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.cmfd-keyword-scope { flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1); min-width: 0 !important; padding: var(--mp-spacing-2) !important; border: none !important; cursor: pointer; background: var(--mp-background-neutral-subtle, #f0f1f3) !important; border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); white-space: nowrap; }
.cmfd-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }

/* Customer tags — comparator prefix + typeable chips (one merged box). */
.cmfd-tags { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%; padding: 2px var(--mp-spacing-3, 12px) 2px 2px; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); }
.cmfd-tags:focus-within { border-color: var(--mp-border-brand, #0a6e4e); }
.cmfd-tags-prefix { flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1); min-width: 0 !important; padding: var(--mp-spacing-2, 6px) !important; background: var(--mp-background-neutral-subtle, #f0f1f3) !important; border: none !important; border-radius: var(--mp-radii-sm, 4px) 0 0 var(--mp-radii-sm, 4px) !important; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); cursor: pointer; white-space: nowrap; }
.cmfd-tags-prefix:hover { background: var(--mp-background-neutral-hovered) !important; }
/* The suggestion popover wraps the tag field — keep it filling the row so the
   input still grows to the remaining width. */
.cmfd-cust-pop { flex: 1; min-width: 0; display: flex; }
.cmfd-cust-pop > :deep(*) { flex: 1; min-width: 0; display: flex; }
.cmfd-tags-field { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1); padding: 2px 0; }
.cmfd-tag-chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: 0 var(--mp-spacing-1) 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-sm, 4px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap; }
.cmfd-tag-remove { display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }
.cmfd-tag-remove:hover { color: var(--mp-text-default); }
.cmfd-tag-input { flex: 1; min-width: 80px; height: 20px; border: none; outline: none; background: transparent; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmfd-tag-input::placeholder { color: var(--mp-text-placeholder); }

.cmfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmfd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.cmfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cmfd-foot-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cmfd-btn { height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); cursor: pointer; border: 1px solid transparent; }
.cmfd-btn--ghost { background: transparent; color: var(--mp-text-default); }
.cmfd-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.cmfd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; }
.cmfd-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
</style>
