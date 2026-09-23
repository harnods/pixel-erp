<script setup lang="ts">
import { ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput, MpTooltip } from '@mekari/pixel3'
import type { DealProperty, DealPropertyOption } from '~/data/crm'

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
  <Teleport to="body">
    <Transition name="eod">
      <div v-if="open && property" class="eod-overlay">
        <div class="eod-panel" role="dialog" :aria-label="t('Edit options')">
          <header class="eod-header">
            <h2 class="eod-title">{{ t('Edit options') }} — {{ property.name }}</h2>
            <MpButton class="eod-close" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="eod-body">
            <p v-if="scope === 'rename'" class="eod-hint">{{ t('You can rename options. Adding or removing options is not allowed for this property.') }}</p>
            <p v-else class="eod-hint">{{ t('Add, rename, or remove options for this property.') }}</p>

            <div class="eod-opt-cols">
              <span class="eod-opt-col">{{ t('Label') }}</span>
              <span class="eod-opt-col">{{ t('Variable name') }}</span>
              <span v-if="canAddDelete()" class="eod-opt-col--x" aria-hidden="true" />
            </div>
            <div v-for="(opt, i) in options" :key="i" class="eod-opt-row" :class="{ 'eod-opt-row--no-del': !canAddDelete() }">
              <MpInput :id="`eod-opt-label-${i}`" v-model="opt.label" is-full-width :aria-label="t('Label')" />
              <MpInput :id="`eod-opt-value-${i}`" v-model="opt.value" is-full-width :aria-label="t('Variable name')" :is-read-only="scope === 'rename'" />
              <MpTooltip v-if="canAddDelete()" :id="`eod-opt-rm-${i}`" :label="t('Remove')" placement="top" use-portal>
                <button type="button" class="eod-opt-remove" :aria-label="t('Remove')" @click="removeOption(i)"><MpIcon name="minus-circular" size="md" /></button>
              </MpTooltip>
            </div>
            <MpButton v-if="canAddDelete()" class="eod-add-opt" variant="secondary" is-rounded left-icon="add" @click="addOption">{{ t('Add option') }}</MpButton>
          </div>

          <footer class="eod-footer">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="save">{{ t('Save changes') }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.eod-enter-active, .eod-leave-active { transition: background-color 220ms ease; }
.eod-enter-from, .eod-leave-to { background-color: transparent; }
.eod-enter-active :deep(.eod-panel) { transition: transform 300ms ease-out; }
.eod-leave-active :deep(.eod-panel) { transition: transform 220ms ease-in; }
.eod-enter-from :deep(.eod-panel), .eod-leave-to :deep(.eod-panel) { transform: translateX(calc(100% + 12px)); }

.eod-overlay { position: fixed; inset: 0; z-index: 1400; background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.eod-panel { margin: var(--mp-spacing-3); width: min(520px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-colors-background-stage, #fff); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.eod-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.eod-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.eod-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); min-width: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; cursor: pointer; color: var(--mp-colors-icon-default, #536062); }
.eod-close:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3) !important; }

.eod-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.eod-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }

.eod-opt-cols, .eod-opt-row { display: grid; grid-template-columns: 1fr 1fr 32px; gap: var(--mp-spacing-2); align-items: center; }
.eod-opt-row--no-del { grid-template-columns: 1fr 1fr; }
.eod-opt-cols { grid-template-columns: 1fr 1fr 32px; }
.eod-opt-col { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.eod-opt-remove { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0; border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.eod-opt-remove:hover { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-text-danger, #a8352d); }
.eod-add-opt { align-self: flex-start; margin-top: var(--mp-spacing-1); }

.eod-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }
</style>
