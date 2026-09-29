<script setup lang="ts">
/**
 * BulkEditDrawer (OD-34): one field and one value across the selected
 * assets. The drawer states how many assets will change, shows a sample of
 * before and after, and names every asset left out and why, before anything
 * is applied. The applied operation reverses as one unit from the register.
 */
import { ref, watch, computed } from 'vue'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { BULK_FIELDS, planBulkEdit, applyBulkEdit, statutoryGroupOptions, type BulkField } from '~/data/assetBulkEdit'
import { assetClassMaster } from '~/data/assetTaxbook'

const props = defineProps<{ isOpen: boolean; ids: string[]; initialField?: BulkField }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done', message: string): void
}>()

const { t } = useLocale()

const field = ref<BulkField>('taxGroup')
const value = ref('')
const error = ref('')
const SAMPLE = 5

watch(() => props.isOpen, (open) => {
  if (!open) return
  field.value = props.initialField ?? 'taxGroup'
  value.value = ''
  error.value = ''
})
watch(field, () => { value.value = ''; error.value = '' })

const fieldOptions = BULK_FIELDS.map((f) => ({ value: f.key, label: f.label }))
const fieldHint = computed(() => BULK_FIELDS.find((f) => f.key === field.value)!.hint)
const valueOptions = computed(() =>
  field.value === 'taxGroup' ? statutoryGroupOptions : assetClassMaster.value.map((c) => c.class),
)
const isFreeText = computed(() => field.value === 'location' || field.value === 'custodian')

const plan = computed(() => planBulkEdit(props.ids, field.value, value.value))

function apply() {
  const r = applyBulkEdit(plan.value)
  if (!r.ok) { error.value = r.reason; return }
  const n = r.op.items.length
  emit('done', `${r.op.number} applied to ${n} ${n === 1 ? 'asset' : 'assets'}. Reverse it from the register if it was wrong.`)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bed">
      <div v-if="isOpen" class="bed-overlay">
        <div class="bed-panel" role="dialog" :aria-label="t('Bulk edit')">
          <header class="bed-head">
            <div>
              <div class="bed-title">{{ t('Bulk edit') }}</div>
              <div class="bed-sub">{{ ids.length }} {{ t(ids.length === 1 ? 'asset selected' : 'assets selected') }}</div>
            </div>
            <MpButton class="bed-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="bed-body">
            <div class="bed-row">
              <div class="bed-field">
                <label class="bed-label" for="bed-field">{{ t('Field') }}</label>
                <ErpFilterSelect id="bed-field" v-model="field" :placeholder="t('Field')" :options="fieldOptions" width="100%" :is-clearable="false" />
              </div>
              <div class="bed-field">
                <label class="bed-label" for="bed-value">{{ t('New value') }}</label>
                <MpInput v-if="isFreeText" id="bed-value" v-model="value" />
                <ErpFilterSelect v-else id="bed-value" v-model="value" :placeholder="t('Choose')" :options="valueOptions" width="100%" :is-clearable="false" />
              </div>
            </div>
            <p class="bed-hint">{{ t(fieldHint) }}</p>

            <template v-if="plan.value && !plan.refusal">
              <div class="bed-count">
                <strong>{{ plan.affected.length }}</strong>
                {{ t(plan.affected.length === 1 ? 'asset will change' : 'assets will change') }}<template v-if="plan.skipped.length">,
                  <strong>{{ plan.skipped.length }}</strong> {{ t(plan.skipped.length === 1 ? 'is left out' : 'are left out') }}</template>
              </div>

              <div v-if="plan.affected.length" class="bed-card">
                <div class="bed-cardhead">
                  {{ t('Sample') }} · {{ Math.min(SAMPLE, plan.affected.length) }} {{ t('of') }} {{ plan.affected.length }}
                </div>
                <table class="bed-table">
                  <thead>
                    <tr>
                      <th class="bed-th">{{ t('Asset') }}</th>
                      <th class="bed-th">{{ t('Now') }}</th>
                      <th class="bed-th">{{ t('After') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="l in plan.affected.slice(0, SAMPLE)" :key="l.id">
                      <td class="bed-td"><span class="bed-id">{{ l.id }}</span> {{ l.name }}</td>
                      <td class="bed-td">{{ l.before }}</td>
                      <td class="bed-td bed-td--after">{{ l.after }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="plan.skipped.length" class="bed-card">
                <div class="bed-cardhead">{{ t('Left out') }}</div>
                <ul class="bed-skips">
                  <li v-for="l in plan.skipped" :key="l.id"><span class="bed-id">{{ l.id }}</span> {{ l.name }} · {{ t(l.skip ?? '') }}</li>
                </ul>
              </div>
              <p class="bed-hint">{{ t('Applied as one operation with its own number, and reversed as one.') }}</p>
            </template>
            <p v-else-if="plan.refusal && plan.value" class="bed-error">{{ t(plan.refusal) }}</p>
          </div>

          <footer class="bed-foot">
            <p v-if="error" class="bed-error bed-foot-error">{{ t(error) }}</p>
            <div class="bed-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded :is-disabled="!!plan.refusal || !plan.affected.length" @click="apply">
                {{ plan.value && !plan.refusal && plan.affected.length ? t(`Apply to ${plan.affected.length} ${plan.affected.length === 1 ? 'asset' : 'assets'}`) : t('Apply') }}
              </MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100. */
.bed-overlay { position: fixed; inset: 0; background: var(--mp-background-overlay); z-index: 1300; }
.bed-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 600px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
/* rule/drawer-header-fill: the header has a fill; the panel has no shadow. */
.bed-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.bed-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bed-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.bed-close { flex: none; }
.bed-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.bed-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.bed-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.bed-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bed-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-2) 0 var(--mp-spacing-4); }
.bed-count { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.bed-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; margin-bottom: var(--mp-spacing-3); }
.bed-cardhead { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.bed-table { width: 100%; border-collapse: collapse; }
.bed-th { text-align: left; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.bed-td { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.bed-td--after { font-weight: var(--mp-font-weights-semi-bold); }
.bed-id { color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.bed-skips { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-6); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
/* rule/form-errors-inline: the error sits with the form, not in a toast. */
.bed-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); margin: 0; }
.bed-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none; border-top: 1px solid var(--mp-border-default);
}
.bed-foot-error { flex: 1; }
.bed-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.bed-enter-active, .bed-leave-active { transition: opacity 0.16s ease; }
.bed-enter-from, .bed-leave-to { opacity: 0; }
.bed-leave-active { pointer-events: none; }
</style>
