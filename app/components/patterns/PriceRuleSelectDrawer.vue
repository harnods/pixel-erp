<script setup lang="ts">
/**
 * PriceRuleSelectDrawer — the two-pane "Select contacts / vendors / products"
 * drawer of the price rule form (mirrors production Mekari ERP › Create price
 * rule). Left = segmented tabs (items | groups, optional) + search + source list
 * with "Add all" and a + per row; right = the running selection (illustration
 * empty state until something is picked). Cancel discards, Save commits.
 *
 * A group (contact group / product category) is only a shortcut: adding it adds
 * its member item ids — the selection always stores item ids, never groups.
 * Built on the SelectAccessDrawer working-copy pattern and the custom Teleport
 * drawer shell (docs/patterns/Drawer.md; no overlay/Esc close).
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpButtonGroup, MpTooltip, MpSegmentedControl } from '@mekari/pixel3'

export interface PriceRulePickOption { id: string; name: string; subtitle?: string }
export interface PriceRulePickGroup { id: string; name: string; subtitle?: string; memberIds: string[] }

const props = defineProps<{
  open: boolean
  id: string
  /** Drawer header, e.g. "Select contacts". */
  title: string
  /** Items tab label + left-list heading, e.g. "Customers". */
  listTitle: string
  options: PriceRulePickOption[]
  /** Committed selection (item ids). */
  modelValue: string[]
  /** Right-pane heading while populated, e.g. "Selected customers". */
  selectedTitle: string
  emptyTitle: string
  emptyCaption: string
  /** Optional second tab (e.g. "Contact groups" / "Categories"). Omit = no tabs. */
  groupTabLabel?: string
  groups?: PriceRulePickGroup[]
  groupsEmptyTitle?: string
  groupsEmptyCaption?: string
}>()
const emit = defineEmits<{
  'update:open': [boolean]
  save: [ids: string[]]
}>()

const { t } = useLocale()

const sel = ref<Set<string>>(new Set())
const tab = ref<'items' | 'groups'>('items')
const leftSearch = ref('')
const rightSearch = ref('')
watch(() => props.open, (o) => {
  if (o) { sel.value = new Set(props.modelValue); tab.value = 'items'; leftSearch.value = ''; rightSearch.value = '' }
})

const tabData = computed(() => [
  { id: `${props.id}-tab-items`, label: props.listTitle, value: 'items' },
  { id: `${props.id}-tab-groups`, label: props.groupTabLabel ?? '', value: 'groups' },
])

function match(name: string, subtitle: string | undefined, q: string) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  return name.toLowerCase().includes(s) || (subtitle?.toLowerCase().includes(s) ?? false)
}
const available = computed(() => props.options.filter(o => !sel.value.has(o.id) && match(o.name, o.subtitle, leftSearch.value)))
/** Groups that would still add something (all-selected / memberless groups drop out, like picked items). */
const addableGroups = computed(() => (props.groups ?? []).filter(g => g.memberIds.some(id => !sel.value.has(id))))
const availableGroups = computed(() => addableGroups.value.filter(g => match(g.name, g.subtitle, leftSearch.value)))
const selectedAll = computed(() => props.options.filter(o => sel.value.has(o.id)))
const selected = computed(() => selectedAll.value.filter(o => match(o.name, o.subtitle, rightSearch.value)))

const leftTitle = computed(() => (tab.value === 'groups' ? (props.groupTabLabel ?? '') : props.listTitle))
const leftCount = computed(() => (tab.value === 'groups' ? availableGroups.value.length : available.value.length))

function add(ids: string[]) { const s = new Set(sel.value); for (const id of ids) s.add(id); sel.value = s }
function remove(id: string) { const s = new Set(sel.value); s.delete(id); sel.value = s }
function addAll() {
  if (tab.value === 'groups') add(availableGroups.value.flatMap(g => g.memberIds))
  else add(available.value.map(o => o.id))
}
function removeAll() { sel.value = new Set() }

const isSaving = ref(false)
function close() { isSaving.value = false; emit('update:open', false) }
async function save() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  // Keep the source-list order so the form table reads predictably.
  emit('save', props.options.filter(o => sel.value.has(o.id)).map(o => o.id))
  isSaving.value = false
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="prsd">
      <div v-if="open" class="prsd-overlay">
        <div :id="id" class="prsd-panel" role="dialog" :aria-label="title">
          <header class="prsd-header">
            <h2 class="prsd-title">{{ title }}</h2>
            <MpButton class="prsd-close" variant="ghost" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="prsd-body">
            <!-- Source -->
            <section class="prsd-col">
              <MpSegmentedControl
                v-if="groupTabLabel"
                :id="`${id}-tabs`"
                :name="`${id}-tabs`"
                class="prsd-tabs"
                :model-value="tab"
                :data="tabData"
                @update:model-value="(v: string) => { tab = v === 'groups' ? 'groups' : 'items'; leftSearch = '' }"
              />
              <div class="prsd-search">
                <MpIcon name="search" size="sm" class="prsd-search-icon" />
                <input :id="`${id}-search`" v-model="leftSearch" class="prsd-search-input" type="text" :placeholder="t('Search...')" />
                <MpButton v-if="leftSearch" class="prsd-search-clear" variant="ghost" type="button" :aria-label="t('Clear search')" @click="leftSearch = ''">
                  <MpIcon name="close" size="sm" />
                </MpButton>
              </div>

              <!-- Groups tab with nothing to offer at all → illustration empty state -->
              <div v-if="tab === 'groups' && !addableGroups.length && !leftSearch" class="prsd-empty">
                <img src="/illustrations/empty-folder.png" alt="" class="prsd-empty-img" width="140" height="120" />
                <p class="prsd-empty-title">{{ groupsEmptyTitle }}</p>
                <p class="prsd-empty-caption">{{ groupsEmptyCaption }}</p>
              </div>
              <template v-else>
                <div class="prsd-col-head">
                  <h3 class="prsd-col-title">{{ leftTitle }}</h3>
                  <MpButton v-if="leftCount" class="prsd-link" variant="ghost" type="button" @click="addAll">{{ t('Add all') }}</MpButton>
                </div>
                <div class="prsd-list">
                  <template v-if="tab === 'groups'">
                    <MpButton v-for="g in availableGroups" :key="g.id" class="prsd-item" variant="ghost" type="button" @click="add(g.memberIds)"><!-- pixel-police-allow -->
                      <span class="prsd-info">
                        <span class="prsd-name">{{ g.name }}</span>
                        <span v-if="g.subtitle" class="prsd-sub">{{ g.subtitle }}</span>
                      </span>
                      <span class="prsd-act prsd-act--add" :aria-label="t('Add')"><MpIcon name="add" size="sm" /></span>
                    </MpButton>
                  </template>
                  <template v-else>
                    <MpButton v-for="o in available" :key="o.id" class="prsd-item" variant="ghost" type="button" @click="add([o.id])"><!-- pixel-police-allow -->
                      <span class="prsd-info">
                        <span class="prsd-name">{{ o.name }}</span>
                        <span v-if="o.subtitle" class="prsd-sub">{{ o.subtitle }}</span>
                      </span>
                      <span class="prsd-act prsd-act--add" :aria-label="t('Add')"><MpIcon name="add" size="sm" /></span>
                    </MpButton>
                  </template>
                  <p v-if="!leftCount" class="prsd-empty-text">{{ leftSearch ? t('No results found') : t('Everything here is already selected.') }}</p>
                </div>
              </template>
            </section>

            <div class="prsd-divider" aria-hidden="true" />

            <!-- Selection -->
            <section class="prsd-col">
              <template v-if="selectedAll.length">
                <div class="prsd-search">
                  <MpIcon name="search" size="sm" class="prsd-search-icon" />
                  <input :id="`${id}-selected-search`" v-model="rightSearch" class="prsd-search-input" type="text" :placeholder="t('Search...')" />
                  <MpButton v-if="rightSearch" class="prsd-search-clear" variant="ghost" type="button" :aria-label="t('Clear search')" @click="rightSearch = ''">
                    <MpIcon name="close" size="sm" />
                  </MpButton>
                </div>
                <div class="prsd-col-head">
                  <h3 class="prsd-col-title">{{ selectedTitle }} ({{ selectedAll.length }})</h3>
                  <MpButton class="prsd-link" variant="ghost" type="button" @click="removeAll">{{ t('Remove all') }}</MpButton>
                </div>
                <div class="prsd-list">
                  <div v-for="o in selected" :key="o.id" class="prsd-item prsd-item--static">
                    <span class="prsd-info">
                      <span class="prsd-name">{{ o.name }}</span>
                      <span v-if="o.subtitle" class="prsd-sub">{{ o.subtitle }}</span>
                    </span>
                    <MpTooltip :id="`${id}-rm-${o.id}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton class="prsd-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="remove(o.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </MpTooltip>
                  </div>
                  <p v-if="!selected.length" class="prsd-empty-text">{{ t('No results found') }}</p>
                </div>
              </template>
              <div v-else class="prsd-empty">
                <img src="/illustrations/empty-folder.png" alt="" class="prsd-empty-img" width="140" height="120" />
                <p class="prsd-empty-title">{{ emptyTitle }}</p>
                <p class="prsd-empty-caption">{{ emptyCaption }}</p>
              </div>
            </section>
          </div>

          <footer class="prsd-footer">
            <MpButtonGroup class="erp-action-footer">
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : t('Save') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prsd-enter-active,
.prsd-leave-active { transition: background-color 250ms ease; }
.prsd-enter-from, .prsd-leave-to { background-color: transparent; }
.prsd-enter-active .prsd-panel { transition: transform 350ms ease-out; }
.prsd-leave-active .prsd-panel { transition: transform 250ms ease-in; }
.prsd-enter-from .prsd-panel,
.prsd-leave-to .prsd-panel { transform: translateX(calc(100% + 12px)); }

.prsd-overlay { position: fixed; inset: 0; z-index: 1400; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.prsd-panel {
  margin: var(--mp-spacing-3); width: min(760px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column; background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px); overflow: hidden;
}
.prsd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.prsd-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prsd-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); color: var(--mp-icon-default); }

.prsd-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1px 1fr; }
.prsd-col { display: flex; flex-direction: column; min-height: 0; padding: var(--mp-spacing-4); }
.prsd-divider { background: var(--mp-colors-border-default, #e3e7e9); }
.prsd-tabs { margin-bottom: var(--mp-spacing-3); flex-shrink: 0; }
.prsd-tabs :deep(.mp-segmented-control__root), .prsd-tabs { width: 100%; }

/* Same pill search as SelectAccessDrawer / the filter-bar search (rule/select-active-neutral). */
.prsd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); flex-shrink: 0; }
.prsd-search:focus-within { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596); }
.prsd-search-icon { flex-shrink: 0; color: var(--mp-icon-default, #536062); }
.prsd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.prsd-search-input::placeholder { color: var(--mp-text-placeholder); }
.prsd-search-clear { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }

.prsd-col-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-top: 20px; }
.prsd-col-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.prsd-link { background: none; border: none; padding: 0; height: auto; min-height: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-link); }
.prsd-link:hover { text-decoration: underline; text-underline-offset: 2px; background: none; }

.prsd-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; margin-top: var(--mp-spacing-3); }
.prsd-item {
  display: flex; align-items: center; justify-content: flex-start; gap: var(--mp-spacing-3); width: 100%; height: auto; min-height: 44px; flex-shrink: 0; text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-1); background: none; border: none; border-radius: 0; cursor: pointer;
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.prsd-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.prsd-item--static { cursor: default; }
.prsd-item--static:hover { background: none; }
.prsd-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.prsd-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prsd-sub { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Production shows the + on every row (not only on hover). */
.prsd-act { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 20px; height: 20px; color: var(--mp-icon-default, #536062); }
.prsd-item:hover .prsd-act--add { color: var(--mp-text-link); }
.prsd-remove { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; background: none; border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-secondary); }
.prsd-empty-text { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* rule/empty-state-structure (no CTA inside a picker pane — the list beside it is the action). */
.prsd-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-1); text-align: center; padding: var(--mp-spacing-6); }
.prsd-empty-img { width: 140px; height: 120px; object-fit: contain; margin-bottom: var(--mp-spacing-2); }
.prsd-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prsd-empty-caption { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.prsd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }
</style>
