<!--
  DimensionDetailDrawer — read-only "View details" panel for a Settings >
  Dimensions row, opened from the kebab menu. Figma fileKey
  nZdSEnyXOmQVbSWYhcwyGT, node 4845:28605 ("Drawer / Detail Classification").
  Same Teleport-free overlay convention as DimensionFormDrawer.vue.

  Footer "Actions" (green, chevron) opens a popover with Edit / Archive-Activate
  / Delete — same operations as the row kebab, so this drawer doesn't duplicate
  their logic: it just emits and lets DimensionsIndexPage.vue's existing
  handlers run (closing itself first).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpSelect, MpTooltip, toast,
} from '@mekari/pixel3'
import {
  transactionTypeLabel, dimensions, isDimensionInUse, transferDimensionValue,
  DIMENSION_TRANSACTION_TYPE_OPTIONS, type Dimension,
} from '~/data/dimensions'

const props = defineProps<{
  id: string
  isOpen: boolean
  dimension: Dimension | null
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'edit', dim: Dimension): void
  (e: 'toggle-status', dim: Dimension): void
  (e: 'delete', dim: Dimension): void
}>()

const { t } = useLocale()

const valueSearch = ref('')
watch(() => props.isOpen, (open) => { if (open) valueSearch.value = '' })

const filteredValues = computed(() => {
  const dim = props.dimension
  if (!dim) return []
  const s = valueSearch.value.trim().toLowerCase()
  return s ? dim.values.filter((v) => v.name.toLowerCase().includes(s)) : dim.values
})
function userAccessText(userIds: string[]) {
  if (userIds.length === 0) return t('Open to all')
  return userIds.length === 1 ? t('1 user') : `${userIds.length} ${t('users')}`
}

// See DimensionsIndexPage's isAllTransactionTypes — the create/edit form never
// stores the legacy 'all' sentinel, only an explicit array, so "every type
// selected" needs its own check here too.
function isAllTransactionTypes(dim: Dimension): boolean {
  return dim.transactionTypes === 'all' || dim.transactionTypes.length === DIMENSION_TRANSACTION_TYPE_OPTIONS.length
}

function close() { emit('update:isOpen', false) }
function act(kind: 'edit' | 'toggle-status' | 'delete') {
  if (!props.dimension) return
  emit(kind, props.dimension)
  close()
}

// ── Delete gate — a dimension already tagged on a recorded transaction can't
//    be deleted (would silently orphan those tags); Archive/Edit stay available. ──
const deleteBlocked = computed(() => !!props.dimension && isDimensionInUse(props.dimension.id))

// ── "Transfer to another dimension" — moves one value off this dimension onto
//    a different one (distinct from DimensionFormDrawer's same-dimension merge
//    Transfer). Needs at least one other dimension to exist. Mutates the live
//    `dimensions` store directly (this drawer is a read view of already-saved
//    data, not a staged draft like the create/edit form). ──────────────────────
const canTransfer = computed(() => dimensions.length > 1)
const transferOpen = ref(false)
const transferValueName = ref('')
const transferTargetId = ref('')
const transferTargetOptions = computed(() =>
  props.dimension ? dimensions.filter((d) => d.id !== props.dimension!.id) : [])
const transferTargetLabel = computed(() =>
  transferTargetOptions.value.find((d) => d.id === transferTargetId.value)?.name ?? '')

function openTransfer(valueName: string) {
  transferValueName.value = valueName
  transferTargetId.value = ''
  transferOpen.value = true
}
function closeTransfer() { transferOpen.value = false }
function confirmTransfer() {
  if (!props.dimension || !transferTargetId.value) return
  transferDimensionValue(props.dimension.id, transferValueName.value, transferTargetId.value)
  closeTransfer()
  toast.notify({ variant: 'success', title: t('Value transferred'), maxWidth: 'max-content' })
}
</script>

<template>
  <Transition name="ddd">
    <div v-if="isOpen && dimension" class="ddd-overlay">
      <div class="ddd-panel" role="dialog" :aria-label="`${dimension.name} ${t('preview')}`">
        <header class="ddd-header">
          <span class="ddd-title">{{ dimension.name }} {{ t('preview') }}</span>
          <button class="ddd-close" type="button" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></button>
        </header>

        <div class="ddd-body">
          <!-- Overview -->
          <div class="ddd-section">
            <h3 class="ddd-section-title">{{ t('Overview') }}</h3>
            <div class="ddd-list-row">
              <span class="ddd-list-label">{{ t('Dimension name') }}</span>
              <span class="ddd-list-value">{{ dimension.name }}</span>
            </div>
            <div class="ddd-list-row">
              <span class="ddd-list-label">{{ t('Transaction type') }}</span>
              <span v-if="isAllTransactionTypes(dimension)" class="ddd-list-value">{{ t('All transactions') }}</span>
              <ul v-else class="ddd-list-value ddd-type-list">
                <li v-for="tt in dimension.transactionTypes" :key="tt">{{ t(transactionTypeLabel(tt)) }}</li>
              </ul>
            </div>
          </div>

          <!-- Values -->
          <div class="ddd-section">
            <h3 class="ddd-section-title">{{ t('Values') }}</h3>
            <div class="ddd-search">
              <MpIcon name="search" size="sm" />
              <input v-model="valueSearch" class="ddd-search-input" type="text" :placeholder="t('Search value')" />
            </div>
            <div class="ddd-values-table">
              <div class="ddd-values-header">
                <span class="ddd-values-th">{{ t('Values') }}</span>
                <span class="ddd-values-th">{{ t('User access') }}</span>
                <span v-if="canTransfer" class="ddd-values-th ddd-values-th--spacer" />
              </div>
              <div v-if="filteredValues.length" class="ddd-values-body">
                <div v-for="v in filteredValues" :key="v.name" class="ddd-values-row">
                  <span class="ddd-values-cell">{{ v.name }}</span>
                  <span class="ddd-values-cell ddd-values-cell--muted">{{ userAccessText(v.userIds) }}</span>
                  <button
                    v-if="canTransfer"
                    v-tooltip="{ label: t('Transfer to another dimension'), placement: 'top' }"
                    class="ddd-icon-btn ddd-icon-btn--transfer" type="button"
                    :aria-label="`${t('Transfer to another dimension')} — ${v.name}`"
                    @click="openTransfer(v.name)"
                  >
                    <MpIcon name="transfer" size="sm" />
                  </button>
                </div>
              </div>
              <p v-else class="ddd-values-none">{{ t('No values match your search.') }}</p>
              <div class="ddd-values-footer">{{ t('Showing') }} {{ filteredValues.length }} {{ t('of') }} {{ dimension.values.length }} {{ t('values') }}</div>
            </div>
          </div>

          <!-- Additional settings -->
          <div class="ddd-section">
            <h3 class="ddd-section-title">{{ t('Additional settings') }}</h3>
            <div class="ddd-list-row">
              <span class="ddd-list-label">{{ t('Mandatory to fill') }}</span>
              <span class="ddd-list-value">{{ dimension.mandatory ? t('Yes') : t('No') }}</span>
            </div>
          </div>
        </div>

        <footer class="ddd-footer">
          <button class="ddd-btn ddd-btn--ghost" type="button" @click="close">{{ t('Close') }}</button>
          <MpPopover id="ddd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="ddd-btn ddd-btn--primary" type="button">
                {{ t('Actions') }}
                <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="act('edit')">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="act('toggle-status')">
                  {{ dimension.status === 'active' ? t('Archive') : t('Activate') }}
                </MpPopoverListItem>
                <MpPopoverListItem
                  v-if="!deleteBlocked"
                  :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
                  @click="act('delete')"
                >
                  {{ t('Delete') }}
                </MpPopoverListItem>
                <MpPopoverListItem v-else class="ddd-menu-item--disabled" @click.stop>
                  <MpTooltip
                    :id="`ddd-delete-tip-${dimension.id}`"
                    :label="t('Cannot delete. Transaction has been recorded with this dimension.')"
                    placement="left" use-portal class="ddd-menu-tip"
                  >
                    <span class="ddd-menu-disabled-label">{{ t('Delete') }}</span>
                  </MpTooltip>
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </footer>
      </div>
    </div>
  </Transition>

  <!-- ── Transfer value — moves one value from this dimension onto another. ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="ddd-transfer-modal"
    :is-open="transferOpen"
    size="sm"
    :is-keep-alive="false"
    @close="closeTransfer"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Transfer value') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="ddd-transfer-field">
          <span class="ddd-transfer-label">{{ t('Transfer to') }}<span class="ddd-transfer-required">*</span></span>
          <MpPopover id="ddd-transfer-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpSelect
                id="ddd-transfer-select-input"
                :placeholder="t('Select dimension')"
                :model-value="transferTargetId"
                is-full-width
                @mousedown.prevent
              >
                <option v-if="transferTargetId" :value="transferTargetId">{{ transferTargetLabel }}</option>
              </MpSelect>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="opt in transferTargetOptions"
                  :key="opt.id"
                  :is-active="opt.id === transferTargetId"
                  @click="transferTargetId = opt.id"
                >
                  {{ opt.name }}
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="ddd-transfer-footer-btns">
          <button class="ddd-btn ddd-btn--ghost" type="button" @click="closeTransfer">{{ t('Cancel') }}</button>
          <button class="ddd-btn ddd-btn--primary" type="button" :disabled="!transferTargetId" @click="confirmTransfer">{{ t('Transfer') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ddd-enter-active, .ddd-leave-active { transition: background-color 250ms ease; }
.ddd-enter-from, .ddd-leave-to { background-color: transparent; }
.ddd-enter-active .ddd-panel { transition: transform 350ms ease-out; }
.ddd-leave-active .ddd-panel { transition: transform 250ms ease-in; }
.ddd-enter-from .ddd-panel, .ddd-leave-to .ddd-panel { transform: translateX(calc(100% + 12px)); }

.ddd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ddd-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }

.ddd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ddd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ddd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); padding: 0; }
.ddd-close:hover { background: var(--mp-background-neutral-hovered); }

.ddd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.ddd-section { display: flex; flex-direction: column; gap: 0; width: 100%; }
.ddd-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ddd-list-row { display: flex; align-items: flex-start; width: 100%; }
.ddd-list-label { width: 200px; flex-shrink: 0; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ddd-list-value { flex: 1; min-width: 0; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ddd-type-list { margin: 0; padding-left: var(--mp-spacing-4); list-style: disc; }

.ddd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); color: var(--mp-icon-default); }
.ddd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ddd-search-input::placeholder { color: var(--mp-text-placeholder); }

.ddd-values-table { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); overflow: hidden; }
.ddd-values-header { display: flex; background: var(--mp-background-surface, #f1f5f9); }
.ddd-values-th { flex: 1; height: 28px; display: flex; align-items: center; padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); }
.ddd-values-th--spacer { flex: 0 0 44px; padding: 0; }
.ddd-values-body { display: flex; flex-direction: column; max-height: 260px; overflow-y: auto; }
.ddd-values-row { display: flex; align-items: center; min-height: 40px; padding: var(--mp-spacing-2) 0; border-top: 1px solid var(--mp-border-default); }
.ddd-values-row:first-child { border-top: none; }
.ddd-values-cell { flex: 1; padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ddd-values-cell--muted { color: var(--mp-text-secondary); }
.ddd-values-none { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ddd-values-footer { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-top: 1px solid var(--mp-border-default); }

.ddd-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-right: var(--mp-spacing-2); border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0; padding: 0; }
.ddd-icon-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
/* Transfer only appears while its row is hovered — same convention as the
   create drawer's per-row Delete (DimensionFormDrawer's .dfd-icon-btn--delete). */
.ddd-icon-btn--transfer { visibility: hidden; }
.ddd-values-row:hover .ddd-icon-btn--transfer { visibility: visible; }

.ddd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ddd-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); cursor: pointer; border: 1px solid transparent; }
.ddd-btn--ghost { background: transparent; color: var(--mp-text-secondary); }
.ddd-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.ddd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-weight: var(--mp-font-weights-semi-bold); }
.ddd-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
.ddd-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.ddd-btn--primary:disabled:hover { background: var(--mp-background-brand-bold, #0a6e4e); }

/* Disabled "Delete" menu item (dimension in use) — mirrors CashManagementDetailPage's
   .row-menu-item--disabled/.row-menu-disabled-label/.cmd-menu-tip convention. */
.ddd-menu-item--disabled { color: var(--mp-text-disabled); cursor: not-allowed; }
.ddd-menu-disabled-label { color: var(--mp-text-disabled); }
.ddd-menu-tip { display: block; }

/* Transfer value modal */
.ddd-transfer-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 100%; }
.ddd-transfer-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ddd-transfer-required { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }
.ddd-transfer-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
