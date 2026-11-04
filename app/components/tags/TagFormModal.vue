<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tags/components/TagFormModal.vue + TagCategoryFormModal.vue + TagTransferModal.vue -->
<script setup lang="ts">
/**
 * One dialog for the three small Tags forms prod ships as separate modals:
 *  - mode 'tag'      → New tag / Edit tag (name + optional category)
 *  - mode 'category' → New category / Edit category (name only)
 *  - mode 'transfer' → Transfer tag (target category only)
 * Closes only via × or Cancel (rule/modal-drawer-close-explicit-only).
 */
import { MpButton, MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  tagCategories, tagNameTaken, tagCategoryNameTaken, TAG_NAME_MAX_LENGTH,
} from '~/data/tags'

const props = withDefaults(defineProps<{
  isOpen: boolean
  mode: 'tag' | 'category' | 'transfer'
  /** Record being edited; omit for create. */
  editId?: string | null
  initialName?: string
  initialCategoryId?: string | null
  /** Creating from a category page files the tag there and locks the picker. */
  categoryLocked?: boolean
  /** Transfer: the selection's current category, excluded from the picker. */
  excludeCategoryId?: string | null
  transferCount?: number
}>(), {
  editId: null, initialName: '', initialCategoryId: null, categoryLocked: false, excludeCategoryId: null, transferCount: 0,
})
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'submit', v: { name: string; categoryId: string | null }): void
}>()

const { t } = useLocale()

const name = ref('')
const categoryId = ref('')
const nameError = ref('')
const categoryError = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  name.value = props.initialName
  categoryId.value = props.initialCategoryId ?? ''
  nameError.value = ''
  categoryError.value = ''
}, { immediate: true })

const title = computed(() => {
  if (props.mode === 'transfer') return t('Transfer tag')
  if (props.mode === 'category') return props.editId ? t('Edit category') : t('New category')
  return props.editId ? t('Edit tag') : t('New tag')
})
const nameLabel = computed(() => props.mode === 'category' ? t('Category name') : t('Tag name'))
const categoryOptions = computed(() =>
  tagCategories.filter(c => c.id !== props.excludeCategoryId).map(c => ({ value: c.id, label: c.name })))

function close() { emit('update:isOpen', false) }

function submit() {
  if (props.mode === 'transfer') {
    categoryError.value = categoryId.value ? '' : t('Select tag category')
    if (categoryError.value) return
    emit('submit', { name: '', categoryId: categoryId.value })
    return
  }
  const n = name.value.trim()
  nameError.value = ''
  if (!n) nameError.value = t('Name is required')
  else if (n.length > TAG_NAME_MAX_LENGTH) nameError.value = `${t('Name must be at most')} ${TAG_NAME_MAX_LENGTH} ${t('characters')}`
  else if (/\p{Extended_Pictographic}/u.test(n)) nameError.value = t('Name cannot contain emoji')
  else if (props.mode === 'tag' && tagNameTaken(n, props.editId ?? undefined)) nameError.value = t('Tag name already exists')
  else if (props.mode === 'category' && tagCategoryNameTaken(n, props.editId ?? undefined)) nameError.value = t('Category name already exists')
  if (nameError.value) return
  emit('submit', { name: n, categoryId: categoryId.value || null })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tfm">
      <div v-if="isOpen" class="tfm-overlay">
        <div class="tfm-panel" role="dialog" aria-modal="true" :aria-label="title">
          <header class="tfm-header">
            <span class="tfm-title">{{ title }}</span>
            <MpButton class="tfm-close" is-rounded :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="tfm-body">
            <p v-if="mode === 'transfer'" class="tfm-text">{{ transferCount }} {{ transferCount === 1 ? t('tag selected') : t('tags selected') }}</p>
            <MpFormControl v-if="mode !== 'transfer'" id="tfm-name" is-required :is-invalid="!!nameError">
              <div class="tfm-label-row">
                <MpFormLabel>{{ nameLabel }}</MpFormLabel>
                <span class="tfm-counter">{{ name.length }}/{{ TAG_NAME_MAX_LENGTH }}</span>
              </div>
              <MpInput id="tfm-name-input" v-model="name" :maxlength="TAG_NAME_MAX_LENGTH" is-full-width @keyup.enter="submit" @update:model-value="nameError = ''" />
              <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl v-if="mode !== 'category'" id="tfm-category" :is-required="mode === 'transfer'" :is-invalid="!!categoryError">
              <MpFormLabel>{{ mode === 'transfer' ? t('Transfer to') : t('Category') }}</MpFormLabel>
              <ErpFilterSelect
                id="tfm-category-select"
                :model-value="categoryId"
                :placeholder="mode === 'transfer' ? 'Select tag category' : 'Select category'"
                :options="categoryOptions"
                :is-clearable="mode === 'tag' && !categoryLocked"
                :is-disabled="categoryLocked"
                width="100%"
                empty-text="No category found"
                @update:model-value="(v: string) => { categoryId = v; categoryError = '' }"
              />
              <MpFormHelpText v-if="mode === 'tag'">
                {{ categoryLocked ? t('This tag will be added to this category.') : t('If no category is selected, it will be filed under Uncategorized.') }}
              </MpFormHelpText>
              <MpFormErrorMessage>{{ categoryError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
          <footer class="tfm-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="submit">{{ mode === 'transfer' ? t('Transfer') : t('Save') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tfm-enter-active, .tfm-leave-active { transition: opacity 200ms ease; }
.tfm-enter-from, .tfm-leave-to { opacity: 0; }
.tfm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45));
  display: flex; align-items: center; justify-content: center;
}
.tfm-panel { width: min(480px, calc(100% - 32px)); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-lg, 12px); }
.tfm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.tfm-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tfm-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; color: var(--mp-colors-icon-default);
}
.tfm-body { padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.tfm-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.tfm-label-row { display: flex; align-items: center; justify-content: space-between; }
.tfm-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.tfm-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }
</style>
