<script setup lang="ts">
/**
 * ClassifyDrawer: set or change one asset's statutory classification (OD-02).
 *
 * rule/drawer-custom-shell, copied from NewAssetDrawer. The group picker only
 * offers what the asset's type and class accept, so a building cannot be
 * given Kelompok 1 to 4 and an intangible cannot be given a building group.
 * The fiscal life follows the group. Only LM authority (Owner) may move it
 * away; any other role sees the field locked and is refused if it tries
 * (FG1-AC6). The store repeats every check, so the drawer cannot be the
 * only gate.
 */
import { ref, watch, computed } from 'vue'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { fixedAssets, viewAs } from '~/data/assetStore'
import {
  allowedGroupsFor, classifyAsset, groupLifeMonths, hasLmAuthority, canClassify, intangibleCodeOptions,
} from '~/data/assetTaxbook'
import { formatMonths } from '~/data/assetUiDuration'

const props = defineProps<{ isOpen: boolean; assetId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done', message: string): void
}>()

const { t } = useLocale()

const asset = computed(() => fixedAssets.value.find((a) => a.id === props.assetId) ?? null)
const groups = computed(() => (asset.value ? allowedGroupsFor(asset.value.type, asset.value.class) : []))

const group = ref('')
const code = ref('')
const lifeYears = ref('')
const errors = ref<Record<string, string>>({})

watch(() => [props.isOpen, props.assetId], () => {
  if (!props.isOpen || !asset.value) return
  group.value = asset.value.taxGroup ?? ''
  code.value = asset.value.statutoryCode ?? ''
  lifeYears.value = asset.value.fiscalLifeMonths ? String(asset.value.fiscalLifeMonths / 12) : ''
  errors.value = {}
}, { immediate: true })

/** Choosing a group sets the life it fixes. Nothing else is typed. */
watch(group, (g) => {
  const m = groupLifeMonths(g)
  if (m) lifeYears.value = String(m / 12)
})

const statutoryMonths = computed(() => groupLifeMonths(group.value))
const lifeLocked = computed(() => !hasLmAuthority.value)

function submit() {
  const a = asset.value
  if (!a) return
  const e: Record<string, string> = {}
  if (!group.value) e.group = 'You must select tax group'
  const years = Number(lifeYears.value.replace(',', '.'))
  if (!years || years <= 0) e.fiscalLife = 'You must fill in tax life'
  if (a.type === 'Intangible' && !code.value) e.statutoryCode = 'You must select intangible code'
  errors.value = e
  if (Object.keys(e).length) return
  const r = classifyAsset(a.id, { group: group.value, statutoryCode: code.value || null, fiscalLifeMonths: Math.round(years * 12) })
  if (!r.ok) {
    const refusedLife = r.field === 'fiscalLife' && lifeLocked.value
    errors.value = { [r.field ?? 'form']: refusedLife && statutoryMonths.value ? `${group.value} sets a tax life of ${formatMonths(statutoryMonths.value)}. Only the Owner can change it` : r.reason }
    return
  }
  emit('done', r.message)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cld">
      <div v-if="isOpen && asset" class="cld-overlay">
        <div class="cld-panel" role="dialog" :aria-label="asset.taxGroup ? t('Change tax group') : t('Set tax group')">
          <header class="cld-head">
            <div>
              <div class="cld-title">{{ asset.taxGroup ? t('Change tax group') : t('Set tax group') }}</div>
              <div class="cld-sub">{{ asset.id }} {{ asset.name }} · {{ asset.class }} · {{ t(asset.type) }}</div>
            </div>
            <MpButton class="cld-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="cld-body" data-tour="cls-body">
            <p v-if="!canClassify" class="cld-note">
              {{ t(`Viewing as ${viewAs}. Only Owner, Accounting or Tax can change the tax group.`) }}
            </p>
            <div class="cld-field">
              <label class="cld-label" for="cld-group">{{ t('Tax group') }}</label>
              <ErpFilterSelect id="cld-group" v-model="group" :placeholder="t('Select tax group')" :options="groups" width="100%" :is-clearable="false" />
              <p v-if="errors.group" class="cld-error">{{ t(errors.group) }}</p>
              <p v-else class="cld-hint">
                <template v-if="asset.type === 'Intangible'">{{ t('Intangibles use Tax group 1 to 4') }}</template>
                <template v-else-if="asset.class === 'Buildings'">{{ t('Buildings use Permanent or Non-permanent building') }}</template>
                <template v-else>{{ t('Building groups apply to buildings only') }}</template>
              </p>
            </div>
            <div v-if="asset.type === 'Intangible'" class="cld-field">
              <label class="cld-label" for="cld-code">{{ t('Intangible code') }}</label>
              <ErpFilterSelect id="cld-code" v-model="code" :placeholder="t('Select intangible code')" :options="intangibleCodeOptions" width="100%" :is-clearable="false" />
              <p v-if="errors.statutoryCode" class="cld-error">{{ t(errors.statutoryCode) }}</p>
            </div>
            <div class="cld-field">
              <label class="cld-label" for="cld-life">{{ t('Tax life (years)') }}</label>
              <MpInput id="cld-life" v-model="lifeYears" :is-invalid="!!errors.fiscalLife" />
              <p v-if="errors.fiscalLife" class="cld-error">{{ t(errors.fiscalLife) }}</p>
              <p v-else-if="lifeLocked && statutoryMonths" class="cld-hint">
                {{ t(`${group} sets ${formatMonths(statutoryMonths)}. Only the Owner can change it`) }}
              </p>
              <p v-else-if="statutoryMonths" class="cld-hint">
                {{ t(`${group} sets ${formatMonths(statutoryMonths)}. A different life is recorded in the history`) }}
              </p>
            </div>
            <div class="cld-field">
              <span class="cld-label">{{ t('Tax method') }}</span>
              <span class="cld-static">{{ t('Straight line (Pasal 11)') }}</span>
            </div>
            <p class="cld-note">{{ t('The tax book is recalculated from the in-service date. No journal is posted.') }}</p>
          </div>

          <footer class="cld-foot">
            <p v-if="errors.form" class="cld-error cld-foot-error">{{ t(errors.form) }}</p>
            <div class="cld-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded data-tour="dlg-primary" :is-disabled="!canClassify" @click="submit">{{ t('Save tax group') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100. */
.cld-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.cld-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
/* rule/drawer-header-fill: the header has a fill; the panel has no shadow. */
.cld-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.cld-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cld-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.cld-close { flex: none; }
.cld-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.cld-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); }
.cld-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cld-static { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cld-hint, .cld-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; line-height: var(--mp-line-heights-sm); }
.cld-note { margin-bottom: var(--mp-spacing-4); }
/* rule/form-errors-inline: the error sits with the field, not in a toast. */
.cld-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; line-height: var(--mp-line-heights-sm); }
.cld-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none; border-top: 1px solid var(--mp-border-default);
}
.cld-foot-error { flex: 1; }
.cld-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.cld-enter-active, .cld-leave-active { transition: opacity 0.16s ease; }
.cld-enter-from, .cld-leave-to { opacity: 0; }
.cld-leave-active { pointer-events: none; }
</style>
