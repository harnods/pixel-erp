<script setup lang="ts">
/**
 * IntangibleCodePicker: the statutory code of an intangible asset (OD-47).
 *
 * Offers the eleven codes of the filing's intangible schedule and nothing
 * else, so a building or tangible code cannot be chosen for an intangible
 * (FG9-AC3). The tax group picker is a separate control and is not this.
 *
 * Two modes: bound to a draft (v-model, on New asset) or bound to a
 * recorded asset (asset-id), where choosing a code sets it at once.
 */
import { computed, ref } from 'vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { INTANGIBLE_CODES } from '~/data/assetIntangibles'
import { setStatutoryCode, canChangeValue, viewAs } from '~/data/assetStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{
  id: string
  modelValue?: string
  /** When set, choosing a code records it on this asset. */
  assetId?: string
  current?: string | null
  /** Goodwill keeps its code; the list is read-only for it. */
  isGoodwill?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { t } = useLocale()
const error = ref('')

const options = computed(() =>
  INTANGIBLE_CODES
    .filter((c) => (props.assetId ? !!props.isGoodwill === (c.code === '0607') : true))
    .map((c) => ({ value: `${c.code} ${c.label}`, label: `${c.code} · ${c.label}` })),
)

const value = computed({
  // Matched on the code: a record may carry a shorter label ('0603 Brand').
  get: () => {
    const cur = props.assetId ? props.current ?? '' : props.modelValue ?? ''
    const code = cur.slice(0, 4)
    return options.value.find((o) => o.value.startsWith(code))?.value ?? cur
  },
  set: (v: string) => {
    error.value = ''
    if (!props.assetId) { emit('update:modelValue', v); return }
    if (!v || v.slice(0, 4) === (props.current ?? '').slice(0, 4)) return
    if (!canChangeValue.value) { error.value = `Viewing as ${viewAs.value}. Only Owner or Accounting can set the intangible code.`; return }
    const r = setStatutoryCode(props.assetId, v)
    if (!r.ok) { error.value = r.reason; return }
    successToast(t(`Intangible code set to ${v}`))
  },
})
</script>

<template>
  <div class="icp">
    <ErpFilterSelect :id="id" v-model="value" :placeholder="t('Select intangible code')" :options="options" width="100%" :is-clearable="false" />
    <p v-if="error" class="icp__error">{{ t(error) }}</p>
    <p v-else-if="isGoodwill && assetId" class="icp__hint">{{ t('Goodwill always uses code 0607') }}</p>
  </div>
</template>

<style scoped>
.icp { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.icp__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; line-height: var(--mp-line-heights-sm); }
.icp__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); margin: 0; line-height: var(--mp-line-heights-sm); }
</style>
