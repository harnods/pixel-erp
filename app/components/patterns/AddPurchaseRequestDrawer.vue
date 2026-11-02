<script setup lang="ts">
/**
 * AddPurchaseRequestModal — dual-pane transfer picker used by the purchase-order
 * form's "+ Add purchase request" affordance (Figma 7181-77149). Left pane lists
 * every purchase request not yet chosen (with Search + Requestor filter + Add all);
 * right pane lists the current selection (with Search + Remove all + per-row ⊖).
 * Commits only on Save. Overlay click is ignored — it's a form, so closing is via
 * the header ×, Cancel, or Save.
 */
import { MpIcon, MpButton, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import { formatDate } from '~/utils/date'
import { purchaseRequests } from '~/data'
import type { PurchaseRequest } from '~/data'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  selectedIds: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', ids: string[]): void
}>()

// Draft selection (re-synced from the parent on every open).
const draft = ref<string[]>([...props.selectedIds])
watch(() => props.isOpen, (open) => { if (open) draft.value = [...props.selectedIds] })

const leftSearch = ref('')
const rightSearch = ref('')
const requestorFilter = ref('')

const requestors = computed(() => [...new Set(purchaseRequests.map(pr => pr.procurementStaff))].sort())

function matches(pr: PurchaseRequest, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return String(pr.number).includes(s) || pr.procurementStaff.toLowerCase().includes(s)
}

// Left = everything not yet selected, filtered by search + requestor.
const available = computed(() =>
  purchaseRequests
    .filter(pr => !draft.value.includes(pr.id))
    .filter(pr => !requestorFilter.value || pr.procurementStaff === requestorFilter.value)
    .filter(pr => matches(pr, leftSearch.value))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
)

const selected = computed(() =>
  draft.value
    .map(id => purchaseRequests.find(pr => pr.id === id))
    .filter((pr): pr is PurchaseRequest => !!pr)
    .filter(pr => matches(pr, rightSearch.value))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
)

function add(id: string) { if (!draft.value.includes(id)) draft.value = [...draft.value, id] }
function remove(id: string) { draft.value = draft.value.filter(x => x !== id) }
function addAll() { draft.value = [...new Set([...draft.value, ...available.value.map(pr => pr.id)])] }
function removeAll() {
  const visible = new Set(selected.value.map(pr => pr.id))
  draft.value = draft.value.filter(id => !visible.has(id))
}

function close() { emit('update:isOpen', false) }
function save() { emit('save', [...draft.value]); close() }
</script>

<template>
  <Transition name="aprm">
    <div v-if="isOpen" class="aprm-overlay">
      <div class="aprm-modal" role="dialog" aria-label="Add purchase request">
        <header class="aprm-header">
          <span class="aprm-title">{{ t('Add purchase request') }}</span>
          <MpButton class="aprm-close" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="aprm-body">
          <!-- Left pane — available -->
          <section class="aprm-pane aprm-pane--left">
            <div class="aprm-toolbar">
              <div class="aprm-search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input v-model="leftSearch" class="aprm-search-input" type="text" :placeholder="t('Search...')" />
              </div>
              <MpPopover id="aprm-requestor" placement="bottom-end" use-portal is-close-on-select>
                <MpPopoverTrigger>
                  <MpButton type="button" class="aprm-requestor-trigger" variant="ghost">
                    <span class="aprm-requestor-label" :class="{ 'aprm-requestor-label--placeholder': !requestorFilter }">{{ requestorFilter || t('Requestor') }}</span>
                    <MpIcon name="chevrons-down" size="sm" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px', maxHeight: '260px', overflowY: 'auto' })">
                  <MpPopoverList>
                    <MpPopoverListItem :is-active="!requestorFilter" @click="requestorFilter = ''">{{ t('All requestors') }}</MpPopoverListItem>
                    <MpPopoverListItem v-for="r in requestors" :key="r" :is-active="r === requestorFilter" @click="requestorFilter = r">{{ r }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>

            <div class="aprm-pane-head">
              <span class="aprm-pane-title">{{ t('Purchase requests') }} ({{ available.length }})</span>
              <a class="aprm-link" @click="addAll">{{ t('Add all') }}</a>
            </div>

            <div class="aprm-scroll">
              <table class="aprm-table">
                <thead>
                  <tr>
                    <th class="aprm-th">{{ t('Date') }}</th>
                    <th class="aprm-th">{{ t('Number') }}</th>
                    <th class="aprm-th">{{ t('Requestor') }}</th>
                    <th class="aprm-th aprm-th--action" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pr in available" :key="pr.id" class="aprm-row" @click="add(pr.id)">
                    <td class="aprm-td aprm-td--date">{{ formatDate(pr.date) }}</td>
                    <td class="aprm-td">
                      <span class="aprm-num">{{ t('Purchase Request') }} #{{ pr.number }}</span>
                      <span class="aprm-sub">{{ pr.totalProducts }} {{ t('products') }}</span>
                    </td>
                    <td class="aprm-td">{{ pr.procurementStaff }}</td>
                    <td class="aprm-td aprm-td--action">
                      <MpTooltip :id="`aprm-add-tt-${pr.id}`" :label="t('Add')" placement="top" use-portal>
                        <MpButton class="aprm-add-btn" :aria-label="`Add Purchase Request #${pr.number}`" @click.stop="add(pr.id)">
                          <MpIcon name="add" size="sm" />
                        </MpButton>
                      </MpTooltip>
                    </td>
                  </tr>
                  <tr v-if="!available.length"><td class="aprm-empty" colspan="4">{{ t('No purchase requests') }}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <div class="aprm-divider" />

          <!-- Right pane — selected -->
          <section class="aprm-pane aprm-pane--right">
            <div class="aprm-toolbar aprm-toolbar--right">
              <div class="aprm-search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input v-model="rightSearch" class="aprm-search-input" type="text" :placeholder="t('Search...')" />
              </div>
            </div>

            <div class="aprm-pane-head">
              <span class="aprm-pane-title">{{ t('Selected purchase requests') }} ({{ selected.length }})</span>
              <a class="aprm-link" @click="removeAll">{{ t('Remove all') }}</a>
            </div>

            <div class="aprm-scroll">
              <table class="aprm-table">
                <thead>
                  <tr>
                    <th class="aprm-th">{{ t('Date') }}</th>
                    <th class="aprm-th">{{ t('Number') }}</th>
                    <th class="aprm-th">{{ t('Requestor') }}</th>
                    <th class="aprm-th aprm-th--action" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pr in selected" :key="pr.id" class="aprm-row aprm-row--static">
                    <td class="aprm-td aprm-td--date">{{ formatDate(pr.date) }}</td>
                    <td class="aprm-td">
                      <span class="aprm-num">{{ t('Purchase Request') }} #{{ pr.number }}</span>
                      <span class="aprm-sub">{{ pr.totalProducts }} {{ t('products') }}</span>
                    </td>
                    <td class="aprm-td">{{ pr.procurementStaff }}</td>
                    <td class="aprm-td aprm-td--action aprm-td--action-top">
                      <MpTooltip :id="`aprm-remove-tt-${pr.id}`" :label="t('Remove')" placement="top" use-portal>
                        <MpButton class="aprm-remove" :aria-label="`Remove Purchase Request #${pr.number}`" @click="remove(pr.id)">
                          <MpIcon name="minus-circular" size="sm" />
                        </MpButton>
                      </MpTooltip>
                    </td>
                  </tr>
                  <tr v-if="!selected.length"><td class="aprm-empty" colspan="4">{{ t('No purchase requests selected') }}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer class="aprm-footer">
          <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="save">{{ t('Save') }}</MpButton>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Right-side drawer — slides in from the right (same motion as SalesOrderFiltersDrawer). */
.aprm-enter-active { transition: background-color 250ms ease; }
.aprm-leave-active { transition: background-color 250ms ease; }
.aprm-enter-from, .aprm-leave-to { background-color: transparent; }
.aprm-enter-active .aprm-modal { transition: transform 350ms ease-out; }
.aprm-leave-active .aprm-modal { transition: transform 250ms ease-in; }
.aprm-enter-from .aprm-modal,
.aprm-leave-to .aprm-modal { transform: translateX(calc(100% + 12px)); }

.aprm-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.aprm-modal {
  margin: var(--mp-spacing-3);
  width: min(920px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px; overflow: hidden;
}
.aprm-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.aprm-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aprm-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.aprm-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.aprm-body { flex: 1; min-height: 0; display: flex; }
.aprm-divider { width: 1px; background: var(--mp-border-default, #e3e7e9); flex-shrink: 0; }
.aprm-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: var(--mp-spacing-5); gap: var(--mp-spacing-4); }

.aprm-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.aprm-toolbar--right { min-height: var(--mp-sizes-9, 36px); }
.aprm-search {
  flex: 1; display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.aprm-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.aprm-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Requestor filter — custom trigger so the chevron stays inside the bordered box */
.aprm-requestor-trigger {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 160px; height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-colors-border-form, #1d1f2429);
  border-radius: var(--mp-radii-md); cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.aprm-requestor-trigger:hover { border-color: var(--mp-border-bold); }
.aprm-requestor-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aprm-requestor-label--placeholder { color: var(--mp-text-placeholder); }

.aprm-pane-head { display: flex; align-items: center; justify-content: space-between; }
.aprm-pane-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aprm-link { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.aprm-link:hover { text-decoration: underline; }

.aprm-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.aprm-table { width: 100%; border-collapse: collapse; }
.aprm-th {
  position: sticky; top: 0; z-index: 1;
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.aprm-th--action { width: 40px; }
.aprm-row { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); cursor: pointer; }
.aprm-row:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.aprm-row--static { cursor: default; }
.aprm-row--static:hover { background: transparent; }
.aprm-td {
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
}
.aprm-td--date { white-space: nowrap; }
.aprm-td--action { width: 40px; text-align: center; vertical-align: middle; }
.aprm-td--action-top { vertical-align: top; }
/* Left-pane add affordance — revealed on row hover */
.aprm-add-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); opacity: 0; transition: opacity 120ms ease;
}
.aprm-row:hover .aprm-add-btn { opacity: 1; }
.aprm-add-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; color: var(--mp-text-default); }
.aprm-num { display: block; color: var(--mp-text-default); }
.aprm-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.aprm-empty { padding: var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.aprm-remove {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary);
}
.aprm-remove:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; color: var(--mp-text-danger); }

.aprm-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
</style>
