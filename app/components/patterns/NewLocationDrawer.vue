<script setup lang="ts">
/**
 * New / sub-location drawer — shared by the warehouse detail "Storage locations" tab
 * and the storage-location detail page. Pick a level (master label), a warehouse-specific
 * name, and a type (Organizational / Storage). `parentId` null = root location;
 * otherwise a sub-location (breadcrumb shows the parent path). Persists via the storage
 * location store and emits `saved` with the parent id so callers can expand it.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpFormHelpText, MpInput, MpAutocomplete,
  MpButton, MpText, toast,
} from '@mekari/pixel3'
import {
  addRootLocation, addSubLocation, updateLocation, defaultTypeForLevel, findLocation,
  STORAGE_LEVELS, type LocType,
} from '~/data/storageLocations'
import { levelOptions, levelLabel } from '~/data/storageLevels'

const props = defineProps<{
  isOpen: boolean
  warehouseId: string
  parentId: string | null
  /** When set, the drawer edits this existing location (same form) instead of adding. */
  editId?: string | null
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved', parentId: string | null): void
}>()

const isEdit = computed(() => !!props.editId)
const levelPickerOptions = computed(() => {
  const all = levelOptions()
  if (isEdit.value || !props.parentId) return all
  const parent = findLocation(props.warehouseId, props.parentId)?.node
  if (!parent) return all
  const parentIdx = STORAGE_LEVELS.indexOf(parent.level)
  // only allow levels strictly deeper than the parent
  return all.filter((_, i) => i > parentIdx)
})
const level = ref<string>(STORAGE_LEVELS[0]!)
const name = ref('')
const type = ref<LocType>('Organizational')
const description = ref('')

// Breadcrumb (root → parent). For edit it's the edited node's ancestors; for a
// sub-location it's the parent's path; empty for a root-level add.
const crumbs = computed<string[]>(() => {
  if (isEdit.value) {
    const p = findLocation(props.warehouseId, props.editId!)?.path ?? []
    return p.slice(0, -1).map(n => n.name) // ancestors, excluding the node itself
  }
  if (!props.parentId) return []
  return findLocation(props.warehouseId, props.parentId)?.path.map(n => n.name) ?? []
})
const levelHelp = computed(() =>
  isEdit.value
    ? 'Editing this location'
    : props.parentId
      ? `Sub-location of ${crumbs.value[crumbs.value.length - 1] ?? ''}`
      : 'No parent — this will be the top level location in this warehouse',
)
const typeHelp = computed(() => {
  const lvl = levelLabel(level.value)
  return defaultTypeForLevel(level.value) === 'Organizational'
    ? `${lvl} is typically organizational, stock is stored in its sub-locations.`
    : `${lvl} typically stores stock directly at this location.`
})

function defaultLevelFor(): string {
  if (!props.parentId) return STORAGE_LEVELS[0]!
  const parent = findLocation(props.warehouseId, props.parentId)?.node
  const i = parent ? STORAGE_LEVELS.indexOf(parent.level) : -1
  return STORAGE_LEVELS[Math.min(i + 1, STORAGE_LEVELS.length - 1)]!
}
function reset() {
  if (isEdit.value) {
    const node = findLocation(props.warehouseId, props.editId!)?.node
    level.value = node?.level ?? STORAGE_LEVELS[0]!
    name.value = node?.name ?? ''
    type.value = node?.type ?? 'Organizational'
    description.value = node?.description ?? ''
    return
  }
  level.value = defaultLevelFor()
  name.value = ''
  type.value = defaultTypeForLevel(level.value)
  description.value = ''
}
// Reset each time the drawer opens.
watch(() => props.isOpen, (open) => { if (open) reset() })
// Level drives sensible default type (only while adding).
watch(level, (lvl) => {
  if (!props.isOpen || isEdit.value) return
  type.value = defaultTypeForLevel(lvl)
})

function close() { emit('update:isOpen', false) }
const isSaving = ref(false)
async function save() {
  const nm = name.value.trim()
  if (!nm) { toast.notify({ variant: 'error', title: 'You must fill in location name' , maxWidth: 'max-content'}); return }
  if (!isEdit.value && props.parentId) {
    const parent = findLocation(props.warehouseId, props.parentId)?.node
    if (parent) {
      const parentIdx = STORAGE_LEVELS.indexOf(parent.level)
      const chosenIdx = STORAGE_LEVELS.indexOf(level.value)
      if (chosenIdx <= parentIdx) {
        toast.notify({ variant: 'error', title: 'Level must be deeper than its parent' , maxWidth: 'max-content'})
        return
      }
    }
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  if (isEdit.value) {
    updateLocation(props.warehouseId, props.editId!, { level: level.value, name: nm, type: type.value, description: description.value.trim() })
    emit('saved', props.parentId)
    close()
    return
  }
  const data = { level: level.value, name: nm, type: type.value }
  if (props.parentId) addSubLocation(props.warehouseId, props.parentId, data)
  else addRootLocation(props.warehouseId, data)
  emit('saved', props.parentId)
  isSaving.value = false
  close()
}
</script>

<template>
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="new-loc-drawer"
    :is-open="isOpen"
    placement="right"
    size="md"
    variant="floating"
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <!-- Floating variant: the drawer body IS the white card; header/content/footer
           all live inside it (MpDrawerHeader/Footer would render outside the card). -->
      <MpDrawerBody>
        <div class="nl-card">
          <div class="nl-header">
            <MpText weight="semiBold">{{ isEdit ? 'Edit location' : 'New location' }}</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="close" />
          </div>
          <div class="nl-form">
          <div v-if="crumbs.length" class="nl-crumbs">
            <template v-for="(c, i) in crumbs" :key="i">
              <span class="nl-crumb">{{ c }}</span>
              <span class="nl-crumb-sep">/</span>
            </template>
            <span class="nl-crumb nl-crumb--current">{{ isEdit ? name || 'Location' : 'New location' }}</span>
          </div>

          <MpFormControl id="nl-level" is-required>
            <MpFormLabel>Level</MpFormLabel>
            <MpAutocomplete
              :id="`nl-level-ac-${parentId}`"
              :key="`nl-level-ac-${parentId}`"
              v-model="level"
              :data="levelPickerOptions"
              label-prop="label"
              value-prop="value"
              placeholder="Select level"
              use-portal
              is-full-width
            />
            <MpFormHelpText>{{ levelHelp }}</MpFormHelpText>
          </MpFormControl>

          <MpFormControl id="nl-name" is-required>
            <MpFormLabel>Location name</MpFormLabel>
            <MpInput id="nl-name-input" v-model="name" is-full-width placeholder="e.g. Cold Zone" />
          </MpFormControl>

          <MpFormControl id="nl-desc">
            <MpFormLabel>Description</MpFormLabel>
            <textarea
              id="nl-desc-input"
              v-model="description"
              class="nl-textarea"
              placeholder="Optional notes about this location"
              rows="3"
            />
          </MpFormControl>

          <MpFormControl id="nl-type" is-required>
            <MpFormLabel>Storage preference</MpFormLabel>
            <div class="nl-type-cards">
              <button
                v-for="opt in [
                  { value: 'Organizational', title: 'Organizational', desc: 'For grouping only. Stock cannot be stored here directly.' },
                  { value: 'Storage', title: 'Storage', desc: 'Stock can be stored and tracked at this location.' },
                ]"
                :key="opt.value"
                type="button"
                class="nl-type-card"
                :class="{ 'nl-type-card--active': type === opt.value }"
                @click="type = opt.value as LocType"
              >
                <span class="nl-type-title">{{ opt.title }}</span>
                <span class="nl-type-desc">{{ opt.desc }}</span>
              </button>
            </div>
            <MpFormHelpText>{{ typeHelp }}</MpFormHelpText>
          </MpFormControl>
          </div>
          <div class="nl-footer">
            <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
            <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">{{ isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save') }}</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Floating drawer: MpDrawerBody is the rounded white card (no built-in padding),
   so the card owns header / scrollable form / pinned footer. */
.nl-card { display: flex; flex-direction: column; height: 100%; }
.nl-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.nl-form {
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.nl-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) 0;
  border-top: 1px solid var(--mp-border-default);
}
.nl-crumbs {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtlest, #f5f6f7);
  border-radius: var(--mp-border-radius-md, 8px);
  font-size: 14px; line-height: 20px;
}
.nl-crumb { color: var(--mp-text-default, #16171a); }
.nl-crumb-sep { color: var(--mp-text-subtle, #9a9ea6); }
.nl-crumb--current { color: var(--mp-text-subtle, #9a9ea6); }
.nl-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.nl-type-cards { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.nl-type-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  text-align: left; cursor: pointer;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.nl-type-card--active { border-color: var(--mp-border-selected, #0f6d4d); background: var(--mp-background-nav-stack-hovered, #d6f4e9); }
.nl-type-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nl-type-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.nl-textarea {
  width: 100%; resize: vertical;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral); font-family: inherit; line-height: 1.5;
  outline: none;
}
.nl-textarea:focus { border-color: var(--mp-border-focused, #0f6d4d); box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15,109,77,0.2)); }
.nl-textarea::placeholder { color: var(--mp-text-placeholder); }
</style>
