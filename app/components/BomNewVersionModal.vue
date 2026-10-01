<script setup lang="ts">
/**
 * Save a new BOM version (V-03, V-10) — opened by Save on the "Create new version"
 * form. The user fills in the reason here (10–500 characters, inline error), and,
 * when anything uses this BOM, sees the impact before confirming: where-used
 * across every level — direct parent BOMs (they show a "sub-BOM has a new version"
 * banner) and indirect ancestors ("via") — with open work orders and the per-unit
 * cost delta ("Δ n/a" when unpriced). Work orders already created keep their
 * version. If where-used can't be computed, saving is still allowed behind a
 * degraded banner. Nothing is saved until the user confirms here.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpBanner, MpBannerIcon, MpBannerDescription, MpBadge,
  MpFormControl, MpFormLabel, MpTextarea, MpFormHelpText, MpFormErrorMessage,
} from '@mekari/pixel3'
import { billOfMaterials, bomUnitCost, bomWhereUsed, VERSION_REASON_MIN, VERSION_REASON_MAX, type BomContent, type BomWhereUsedRow } from '~/data/billOfMaterials'
import { workOrders, workOrderClosed } from '~/data/workOrders'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; bomId: string; nextVersion: number; content?: BomContent }>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const { t } = useLocale()

const reason = ref('')
const reasonError = ref('')
watch(() => props.isOpen, (o) => { if (o) { reason.value = ''; reasonError.value = '' } })
function confirm() {
  const n = reason.value.trim().length
  reasonError.value = n < VERSION_REASON_MIN
    ? t('Reason is required (min 10 characters)')
    : n > VERSION_REASON_MAX ? t('Reason can be at most 500 characters') : ''
  if (!reasonError.value) emit('confirm', reason.value)
}

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
const impact = computed<{ rows: BomWhereUsedRow[]; openOnSelf: number } | null>(() => {
  const b = record.value
  if (!b || !props.content) return null
  try {
    const to = bomUnitCost(props.content)
    const from = bomUnitCost(b)
    const delta = to === undefined || from === undefined ? undefined : Math.round(to - from)
    return { rows: bomWhereUsed(b.id, delta), openOnSelf: workOrders.filter(w => w.bomId === b.id && !workOrderClosed(w)).length }
  } catch {
    return null
  }
})
const rows = computed(() => [...(impact.value?.rows ?? [])].sort((a, z) => a.depth - z.depth))
const hasImpact = computed(() => !impact.value || rows.value.length > 0 || impact.value.openOnSelf > 0)
const openWos = (bomId: string) => workOrders.filter(w => w.bomId === bomId && !workOrderClosed(w)).length
const signed = (n?: number) => (n === undefined ? `Δ ${t('n/a')}` : n > 0 ? `Δ +${formatIDR(n)}` : n < 0 ? `Δ −${formatIDR(Math.abs(n))}` : `Δ ${formatIDR(0)}`)
</script>

<template>
  <MpModal
    id="bom-new-version-modal" :is-open="isOpen" :size="hasImpact ? 'lg' : 'md'"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent data-devchange="bom-version-impact">
      <MpModalHeader>{{ t('Save as') }} v{{ nextVersion }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody class="bvi-body">
        <MpFormControl id="bvi-reason" is-required :is-invalid="!!reasonError" data-devchange="bom-version-reason">
          <MpFormLabel>{{ t('Reason for new version') }}</MpFormLabel>
          <MpTextarea id="bvi-reason-input" v-model="reason" @update:model-value="reasonError = ''" />
          <MpFormHelpText v-if="!reasonError">{{ t('Why is this revision needed? (min 10 characters)') }} · {{ reason.trim().length }}/{{ VERSION_REASON_MAX }}</MpFormHelpText>
          <MpFormErrorMessage>{{ reasonError }}</MpFormErrorMessage>
        </MpFormControl>
        <p class="bvi-caption">{{ t('Work orders already created keep the version they were created from. Only work orders created after saving use') }} v{{ nextVersion }}.</p>
        <MpBanner v-if="!impact" id="bvi-degraded" variant="warning">
          <MpBannerIcon />
          <MpBannerDescription>{{ t('Impact list unavailable — affected owners will still be notified') }}</MpBannerDescription>
        </MpBanner>
        <template v-else>
          <section v-if="rows.length">
            <h3 class="bvi-group">{{ t('Standard BOMs') }} ({{ rows.length }})</h3>
            <table class="bvi-table">
              <thead><tr><th>{{ t('Bill of materials') }}</th><th>{{ t('Level') }}</th><th class="bvi-num">{{ t('Open work orders') }}</th><th class="bvi-num">{{ t('Cost per unit') }}</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.bom.id">
                  <td>{{ r.bom.name }} <span class="bvi-sub">{{ r.bom.number }} · v{{ r.bom.version }}</span></td>
                  <td>
                    <MpBadge v-if="r.depth === 1" :id="`bvi-direct-${r.bom.id}`" for="tableStatus" type="information">{{ t('Uses it directly') }}</MpBadge>
                    <span v-else class="bvi-sub">{{ t('via') }} {{ r.via?.name }}</span>
                  </td>
                  <td class="bvi-num">{{ openWos(r.bom.id) }}</td>
                  <td class="bvi-num">{{ signed(r.delta) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="bvi-caption">{{ t('Direct parents show a banner that this sub-BOM has a new version. Parents never get a new version automatically — sub-BOMs resolve to their Active version when a work order is created.') }}</p>
          </section>
          <section v-if="impact.openOnSelf">
            <h3 class="bvi-group">{{ t('Open work orders on this BOM') }} ({{ impact.openOnSelf }})</h3>
          </section>
        </template>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ hasImpact && rows.length ? t('Save & notify owners') : `${t('Save')} v${nextVersion}` }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bvi-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.bvi-group { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); }
.bvi-caption { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.bvi-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.bvi-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }
.bvi-table th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-colors-text-secondary); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.bvi-table td { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: top; }
.bvi-num { text-align: right !important; white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
