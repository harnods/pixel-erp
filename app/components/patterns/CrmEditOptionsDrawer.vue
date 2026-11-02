<script setup lang="ts">
import { ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput, MpTooltip } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { toVariableName, type DealProperty, type DealPropertyOption } from '~/data/crm'

const props = defineProps<{ open: boolean; property: DealProperty | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; save: [{ id: string; options: DealPropertyOption[] }] }>()
const { t } = useLocale()

const options = ref<DealPropertyOption[]>([])
const scope = ref<'rename' | 'add-delete-rename'>('rename')
const canAddDelete = () => scope.value === 'add-delete-rename'

let optSeq = 100

watch(() => props.open, (o) => {
  if (!o || !props.property) return
  scope.value = props.property.editableScope ?? 'rename'
  options.value = JSON.parse(JSON.stringify(props.property.config?.options ?? []))
})

function addOption() {
  options.value = [...options.value, { label: '', value: `option_${optSeq++}`, inForms: true }]
}
function removeOption(i: number) { options.value = options.value.filter((_, x) => x !== i) }

function close() { emit('update:open', false) }
function save() {
  if (!props.property) return
  emit('save', { id: props.property.id, options: JSON.parse(JSON.stringify(options.value)) })
  emit('update:open', false)
}
</script>

<template>
  <ErpDrawer :is-open="open && !!property" :title="`${t('Edit options')}: ${property?.name ?? ''}`" width="520px" @close="close">
    <template #body>
      <p v-if="scope === 'rename'" class="eod-hint">{{ t('You can rename options. Adding or removing options is not allowed for this property.') }}</p>
      <p v-else class="eod-hint">{{ t('Add, rename, or remove options for this property.') }}</p>

      <div class="eod-opt-section">
        <div v-for="(opt, i) in options" :key="i" class="eod-opt-row" :class="{ 'eod-opt-row--no-del': !canAddDelete() }">
          <MpInput :id="`eod-opt-label-${i}`" :model-value="opt.label" is-full-width :aria-label="t('Label')" @update:model-value="(v: string) => { opt.label = v; if (canAddDelete()) opt.value = toVariableName(v) || opt.value }" />
          <MpTooltip v-if="canAddDelete()" :id="`eod-opt-rm-${i}`" :label="t('Remove')" placement="top" use-portal>
            <MpButton class="eod-opt-remove" :aria-label="t('Remove')" @click="removeOption(i)"><MpIcon name="minus-circular" size="md" /></MpButton>
          </MpTooltip>
        </div>
        <MpButton v-if="canAddDelete()" class="eod-add-opt" variant="secondary" is-rounded left-icon="add" @click="addOption">{{ t('Add option') }}</MpButton>
      </div>
    </template>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ t('Save changes') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.eod-hint { margin: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }

.eod-opt-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.eod-opt-row { display: grid; grid-template-columns: 1fr 32px; gap: var(--mp-spacing-2); align-items: center; }
.eod-opt-row--no-del { grid-template-columns: 1fr; }
.eod-opt-col { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.eod-opt-remove { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0; border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.eod-opt-remove:hover { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-text-danger, #a8352d); }
.eod-add-opt { align-self: flex-start; margin-top: var(--mp-spacing-1); }

</style>
