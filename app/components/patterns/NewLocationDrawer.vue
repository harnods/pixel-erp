<script setup lang="ts">
/**
 * New / sub-location drawer — shared by the warehouse detail "Storage locations" tab
 * and the storage-location detail page. Pick a level (master label), a warehouse-specific
 * name, and a type (Organizational / Storage). `parentId` null = root location;
 * otherwise a sub-location (breadcrumb shows the parent path). Persists via the storage
 * location store and emits `saved` with the parent id so callers can expand it.
 */
import {
  MpFormControl, MpFormLabel, MpFormHelpText, MpInput, MpTextarea, MpAutocomplete,
  MpButton, MpRadio, MpBanner, MpBannerDescription, toast,
} from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import {
  addRootLocation, addSubLocation, updateLocation, defaultTypeForLevel, findLocation, canHaveSubLocation,
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
// Adding under a deepest-level parent (Bin): no level is left to pick. The tree menus
// don't offer "Add sub-location" there; this is the fallback if the drawer opens anyway.
const parentNode = computed(() =>
  !isEdit.value && props.parentId ? findLocation(props.warehouseId, props.parentId)?.node ?? null : null,
)
const noDeeperLevel = computed(() => !!parentNode.value && !canHaveSubLocation(parentNode.value.level))
const name = ref('')
const type = ref<LocType>('Organizational')
const description = ref('')
const TYPE_OPTIONS: { value: LocType; title: string; desc: string }[] = [
  { value: 'Organizational', title: 'Organizational', desc: 'For grouping only. Stock cannot be stored here directly.' },
  { value: 'Storage', title: 'Storage', desc: 'Stock can be stored and tracked at this location.' },
]

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
  if (isSaving.value || noDeeperLevel.value) return
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
  const data = { level: level.value, name: nm, type: type.value, description: description.value.trim() }
  if (isEdit.value) updateLocation(props.warehouseId, props.editId!, data)
  else if (props.parentId) addSubLocation(props.warehouseId, props.parentId, data)
  else addRootLocation(props.warehouseId, data)
  emit('saved', props.parentId)
  isSaving.value = false
  close()
}
</script>

<template>
  <!-- Shared Teleport shell (rule/drawer-custom-shell) — closes only via × / Cancel /
       Save (rule/modal-drawer-close-explicit-only). -->
  <ErpDrawer
    :is-open="isOpen"
    :title="isEdit ? 'Edit location' : 'New location'"
    @close="close"
  >
    <template #body>
      <MpBanner v-if="noDeeperLevel" variant="info" data-devchange="location-deepest-level">
        <MpBannerDescription>{{ levelLabel(parentNode!.level) }} is the deepest level, so it can't have sub-locations.</MpBannerDescription>
      </MpBanner>
      <template v-else>
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
          <MpTextarea
            id="nl-desc-input"
            v-model="description"
            placeholder="Optional notes about this location"
            is-full-width
          />
        </MpFormControl>

        <MpFormControl id="nl-type" is-required>
          <MpFormLabel>Storage preference</MpFormLabel>
          <!-- Radio + caption list — same pattern as EditClassificationModal -->
          <div class="nl-type-group" data-devchange="new-location-storage-preference-radio">
            <div v-for="opt in TYPE_OPTIONS" :key="opt.value" class="nl-type-option">
              <label class="nl-type-radio">
                <MpRadio
                  :id="`nl-type-${opt.value}`"
                  name="nl-type"
                  :value="opt.value"
                  :is-checked="type === opt.value"
                  @change="type = opt.value"
                />
                <span>{{ opt.title }}</span>
              </label>
              <p class="nl-type-caption">{{ opt.desc }}</p>
            </div>
          </div>
          <MpFormHelpText>{{ typeHelp }}</MpFormHelpText>
        </MpFormControl>
      </template>
    </template>

    <template #footer>
      <div v-if="noDeeperLevel" class="nl-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Close</MpButton>
      </div>
      <div v-else class="nl-footer-right" data-devchange="new-location-drawer-shell">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="save">{{ isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
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
.nl-type-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* No gap — MpRadio renders its own 12px control-to-label gap internally */
.nl-type-radio {
  display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
/* Caption sits under the label, aligned past the 16px control + its 12px gap */
.nl-type-caption {
  margin: 0; padding-left: var(--mp-spacing-8, 32px);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}
.nl-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
</style>
