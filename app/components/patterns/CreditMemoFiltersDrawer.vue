<script lang="ts">
/**
 * Credit Memo report — "All filters" drawer (PRD OD-05). Filters by Customer
 * (searchable / server-autocomplete analogue) AND Transaction Type (CM Issued /
 * Applied / Refund / Reversal). Both combine as AND. Reset clears the filters
 * only — the date range is owned by the page and preserved. Same right-hand
 * overlay pattern as the other ERP filter drawers.
 */
import type { CmMutationType } from '~/data/creditMemoReport'
export interface CmDrawerValue {
  customers: string[]
  txnTypes: CmMutationType[]
}
</script>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'
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

const TXN_LABELS: Record<CmMutationType, string> = {
  Issued: 'CM Issued', Applied: 'CM Applied', Refund: 'CM Refund', Reversal: 'CM Reversal',
}

const draft = reactive<CmDrawerValue>(clone(props.modelValue))
function clone(v: CmDrawerValue): CmDrawerValue { return { customers: [...v.customers], txnTypes: [...v.txnTypes] } }
watch(() => props.isOpen, (open) => { if (open) { Object.assign(draft, clone(props.modelValue)); custSearch.value = '' } })

const custSearch = ref('')
const filteredCustomers = computed(() => {
  const q = custSearch.value.trim().toLowerCase()
  return q ? props.customerOptions.filter((c) => c.toLowerCase().includes(q)) : props.customerOptions
})

function close() { emit('update:isOpen', false) }
function clearAll() { draft.customers = []; draft.txnTypes = [] }
function apply() { emit('apply', clone(draft)); close() }
function toggle<T extends string>(list: T[], v: T) { const i = list.indexOf(v); if (i === -1) list.push(v); else list.splice(i, 1) }
</script>

<template>
  <Transition name="cmfd">
    <div v-if="isOpen" class="cmfd-overlay">
      <div class="cmfd-panel" role="dialog" aria-label="All filters">
        <header class="cmfd-head">
          <span class="cmfd-title">All filters</span>
          <MpButton class="cmfd-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="cmfd-body">
          <!-- Customer (searchable autocomplete analogue) -->
          <div class="cmfd-field">
            <span class="cmfd-field-label">Customer</span>
            <div class="cmfd-search">
              <MpIcon name="search" size="sm" />
              <input v-model="custSearch" class="cmfd-search-input" type="text" placeholder="Search customer…" />
              <MpIcon v-if="custSearch" name="close" size="sm" class="cmfd-search-clear" role="button" @click="custSearch = ''" />
            </div>
            <ul class="cmfd-checklist cmfd-checklist--scroll">
              <li v-for="c in filteredCustomers" :key="c" class="cmfd-check-item" @click="toggle(draft.customers, c)">
                <span @click.stop><MpCheckbox :id="`${id}-cu-${c}`" :is-checked="draft.customers.includes(c)" @change="() => toggle(draft.customers, c)" /></span>
                <span class="cmfd-check-label">{{ c }}</span>
              </li>
              <li v-if="!filteredCustomers.length" class="cmfd-empty">No customer found</li>
            </ul>
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
        </div>

        <footer class="cmfd-foot">
          <button class="cmfd-btn cmfd-btn--ghost" type="button" @click="clearAll">Reset filter</button>
          <div class="cmfd-foot-right">
            <button class="cmfd-btn cmfd-btn--ghost" type="button" @click="close">Cancel</button>
            <button class="cmfd-btn cmfd-btn--primary" type="button" @click="apply">Apply</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cmfd-enter-active, .cmfd-leave-active { transition: background-color 250ms ease; }
.cmfd-enter-from, .cmfd-leave-to { background-color: transparent; }
.cmfd-enter-active .cmfd-panel { transition: transform 350ms ease-out; }
.cmfd-enter-from .cmfd-panel, .cmfd-leave-to .cmfd-panel { transform: translateX(calc(100% + 12px)); }

.cmfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cmfd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.cmfd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cmfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmfd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cmfd-close:hover { background: var(--mp-background-neutral-hovered); }

.cmfd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.cmfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmfd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); height: 36px; padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); color: var(--mp-text-secondary); }
.cmfd-search:focus-within { border-color: var(--mp-border-brand, #0a6e4e); }
.cmfd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmfd-search-clear { cursor: pointer; }
.cmfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmfd-checklist--scroll { max-height: 240px; overflow-y: auto; }
.cmfd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.cmfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmfd-empty { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding: var(--mp-spacing-1) 0; }

.cmfd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cmfd-foot-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cmfd-btn { height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); cursor: pointer; border: 1px solid transparent; }
.cmfd-btn--ghost { background: transparent; color: var(--mp-text-default); }
.cmfd-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.cmfd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; }
.cmfd-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
</style>
