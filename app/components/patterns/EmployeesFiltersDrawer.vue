<script lang="ts">
// Runtime export + shared types live in this companion block — `<script setup>`
// below cannot hold plain `export function`s.
export interface FilterScope {
  key: string
  label: string
  items: { id: string; name: string }[]
}
/** Committed filter value: per-scope selected ids + which scopes are shown. */
export interface EmployeesFiltersValue {
  filters: Record<string, string[]>
  scopes: string[]
}
export function emptyEmployeesFilters(): EmployeesFiltersValue {
  return { filters: {}, scopes: [] }
}
/** Active-filter count = number of scopes with at least one selection. */
export function employeesFiltersCount(v: EmployeesFiltersValue): number {
  return Object.values(v.filters).filter((s) => s && s.length).length
}
</script>

<script setup lang="ts">
/**
 * Employee directory — "All filters" drawer. Scope-builder format + behaviour
 * ported from talenta-performance-d's PxAllFiltersDrawer: start blank → "Add
 * filter" (searchable scope list) → each scope is a collapsible, removable
 * multi-select with search + Select all. Draft-then-commit: edits are local and
 * only applied on "Apply filter"; Cancel/close discards them. (Uses the same
 * custom Teleport shell as the other ERP drawers — MpDrawer has no structural CSS
 * in this Pixel3 build.)
 */
import { reactive, ref, computed, watch } from 'vue'
import {
  MpIcon, MpCheckbox, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

const props = defineProps<{
  isOpen: boolean
  scopes: FilterScope[]
  appliedFilters: Record<string, string[]>
  appliedScopes: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: EmployeesFiltersValue): void
}>()

const scopeByKey = computed(() => Object.fromEntries(props.scopes.map((s) => [s.key, s])) as Record<string, FilterScope>)

// ── Draft state ──────────────────────────────────────────────────────────────
const form = reactive<Record<string, string[]>>({})
const addedScopes = ref<string[]>([])
const openScopes = reactive<Record<string, boolean>>({})
const scopeSearch = reactive<Record<string, string>>({})
const addSearch = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(form)) delete form[k]
  for (const s of props.scopes) form[s.key] = [...(props.appliedFilters[s.key] ?? [])]
  addedScopes.value = [...props.appliedScopes]
  addSearch.value = ''
  for (const k of Object.keys(openScopes)) delete openScopes[k]
}, { immediate: true })

const hasAddedScopes = computed(() => addedScopes.value.length > 0)
const availableScopes = computed(() =>
  props.scopes.filter((s) => !addedScopes.value.includes(s.key) && s.label.toLowerCase().includes(addSearch.value.toLowerCase())))

function addScope(key: string) {
  if (!addedScopes.value.includes(key)) addedScopes.value.push(key)
  openScopes[key] = true
  if (!form[key]) form[key] = []
  addSearch.value = ''
}
function removeScope(key: string) {
  addedScopes.value = addedScopes.value.filter((k) => k !== key)
  form[key] = []
}
function toggleItem(key: string, id: string) {
  const list = form[key] ?? []
  form[key] = list.includes(id) ? list.filter((v) => v !== id) : [...list, id]
}
function filteredItems(key: string) {
  const q = (scopeSearch[key] ?? '').toLowerCase()
  return (scopeByKey.value[key]?.items ?? []).filter((it) => it.name.toLowerCase().includes(q))
}
function allChecked(key: string) {
  const items = scopeByKey.value[key]?.items ?? []
  return items.length > 0 && items.every((it) => form[key]?.includes(it.id))
}
function someChecked(key: string) {
  const items = scopeByKey.value[key]?.items ?? []
  return items.some((it) => form[key]?.includes(it.id)) && !allChecked(key)
}
function toggleAll(key: string) {
  const items = scopeByKey.value[key]?.items ?? []
  form[key] = allChecked(key) ? [] : items.map((it) => it.id)
}
function selectedPreview(key: string) {
  const n = form[key]?.length ?? 0
  const lower = (scopeByKey.value[key]?.label ?? '').toLowerCase()
  return n === 0 ? `No selected ${lower}` : `${n} selected ${lower}`
}

function close() { emit('update:isOpen', false) }
function resetAll() {
  addedScopes.value = []
  for (const k of Object.keys(form)) form[k] = []
}
function applyFilter() {
  const filters: Record<string, string[]> = {}
  for (const key of addedScopes.value) filters[key] = [...(form[key] ?? [])]
  emit('apply', { filters, scopes: [...addedScopes.value] })
  close()
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" width="440px" @close="close">
    <template #body>
      <!-- Blank slate — Add filter sits directly under the caption -->
      <div v-if="!hasAddedScopes" class="ef-blank">
        <MpIcon name="filter" :class="css({ width: '56px', height: '56px', color: 'var(--mp-icon-secondary, #6e7a7c)' })" />
        <div class="ef-blank-text">
          <p class="ef-blank-title">No filters have been set yet</p>
          <p class="ef-blank-sub">Your filter will be displayed here</p>
        </div>
        <MpPopover id="ef-add-filter-blank" is-close-on-select use-portal :is-keep-alive="false" placement="bottom" @close="addSearch = ''">
          <MpPopoverTrigger>
            <MpButton type="button" class="ef-add-btn" variant="ghost"><MpIcon name="add" size="sm" />Add filter</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
            <div class="ef-add-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input v-model="addSearch" type="text" placeholder="Search" class="ef-scope-search-input" @click.stop />
            </div>
            <MpPopoverList>
              <MpPopoverListItem v-for="s in availableScopes" :key="s.key" @click="addScope(s.key)">{{ s.label }}</MpPopoverListItem>
              <p v-if="!availableScopes.length" class="ef-scope-empty">No filters found</p>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <template v-else>
        <!-- Added scopes — separated by a bottom border, no box -->
        <div class="ef-scopes">
          <div v-for="key in addedScopes" :key="key" class="ef-scope">
            <MpButton type="button" class="ef-scope-head" variant="ghost" @click="openScopes[key] = !openScopes[key]">
              <span class="ef-scope-head-text">
                <span class="ef-scope-label">{{ scopeByKey[key].label }}</span>
                <span class="ef-scope-preview">{{ selectedPreview(key) }}</span>
              </span>
              <span class="ef-scope-actions">
                <span class="ef-scope-icon" role="button" aria-label="Remove filter" @click.stop="removeScope(key)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </span>
                <span class="ef-scope-icon">
                  <svg class="ef-scope-chevron" :class="{ 'ef-scope-chevron--open': openScopes[key] }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
              </span>
            </MpButton>

            <div v-if="openScopes[key]" class="ef-scope-panel">
              <div class="ef-scope-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <input v-model="scopeSearch[key]" type="text" placeholder="Search" class="ef-scope-search-input" />
              </div>
              <div class="ef-scope-option ef-scope-option--all">
                <MpCheckbox :id="`ef-scope-all-${key}`" :is-checked="allChecked(key)" :is-indeterminate="someChecked(key)" @change="toggleAll(key)">Select all {{ scopeByKey[key].label.toLowerCase() }}</MpCheckbox>
              </div>
              <div class="ef-scope-list">
                <div v-for="item in filteredItems(key)" :key="item.id" class="ef-scope-option">
                  <MpCheckbox :id="`ef-scope-${key}-${item.id}`" :is-checked="form[key]?.includes(item.id) ?? false" @change="toggleItem(key, item.id)">{{ item.name }}</MpCheckbox>
                </div>
                <p v-if="!filteredItems(key).length" class="ef-scope-empty">No items found</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Add filter -->
        <div class="ef-add-row">
          <MpPopover id="ef-add-filter" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @close="addSearch = ''">
            <MpPopoverTrigger>
              <MpButton type="button" class="ef-add-btn" variant="ghost"><MpIcon name="add" size="sm" />Add filter</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
              <div class="ef-add-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <input v-model="addSearch" type="text" placeholder="Search" class="ef-scope-search-input" @click.stop />
              </div>
              <MpPopoverList>
                <MpPopoverListItem v-for="s in availableScopes" :key="s.key" @click="addScope(s.key)">{{ s.label }}</MpPopoverListItem>
                <p v-if="!availableScopes.length" class="ef-scope-empty">No filters found</p>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </template>
    </template>

    <template #footer>
      <MpButton variant="ghost" is-rounded :is-disabled="!hasAddedScopes" @click="resetAll">Reset all</MpButton>
      <div class="ef-footer-right">
        <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
        <MpButton variant="primary" is-rounded @click="applyFilter">Apply filter</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
/* Blank slate */
.ef-blank { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-10, 40px) 0; }
.ef-blank-text { text-align: center; }
.ef-blank-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ef-blank-sub { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Scopes — no box, just a bottom-border separator between rows */
.ef-scopes { display: flex; flex-direction: column; }
.ef-scope { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ef-scope-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) 0; background: transparent; border: none; cursor: pointer; text-align: left; }
.ef-scope-head-text { display: flex; flex-direction: column; min-width: 0; }
.ef-scope-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ef-scope-preview { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ef-scope-actions { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.ef-scope-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--mp-radii-md); color: var(--mp-text-secondary); cursor: pointer; }
.ef-scope-icon:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }
.ef-scope-chevron { transition: transform 150ms; }
.ef-scope-chevron--open { transform: rotate(180deg); }
.ef-scope-panel { padding: 0 0 var(--mp-spacing-3); }
.ef-scope-search { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md); color: var(--mp-text-subtle); }
.ef-scope-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.ef-scope-search-input::placeholder { color: var(--mp-text-placeholder); }
.ef-scope-option { padding: var(--mp-spacing-2) 0; }
.ef-scope-option--all { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); margin-top: var(--mp-spacing-1); }
.ef-scope-list { max-height: 220px; overflow-y: auto; }
.ef-scope-empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Add filter — secondary PILL button (border + text default, rounded-full) */
.ef-add-row { display: flex; margin-top: var(--mp-spacing-4); }
.ef-add-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-text-default, #080d0e); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ef-add-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.ef-add-search { display: flex; align-items: center; gap: var(--mp-spacing-2); margin: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md); color: var(--mp-text-subtle); }

.ef-footer-right { display: flex; gap: var(--mp-spacing-3); }
</style>
