<script setup lang="ts">
/**
 * AssetFiltersDrawer — the "All filters" surface for the asset register.
 *
 * rule/drawer-custom-shell: a hand-rolled Teleport overlay copied from
 * BillsFiltersDrawer, not MpDrawer. The backdrop is a backdrop — close is the
 * ×, Cancel or Apply only (rule/modal-drawer-close-explicit-only), so a
 * half-entered filter is never lost to a stray click.
 *
 * rule/filter-drawer-shell: edits a local draft and commits to the parent only
 * on Apply, re-syncing the draft from the applied value on every open.
 */
import { ref, watch } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { assetBranches, assetTaxGroups } from '~/data/fixedAssets'

const props = defineProps<{
  isOpen: boolean
  branch: string
  taxGroup: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', value: { branch: string; taxGroup: string }): void
}>()

const { t } = useLocale()

// The draft. Never the parent's state — a filter is either applied or it is not.
const draftBranch = ref(props.branch)
const draftTaxGroup = ref(props.taxGroup)

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    draftBranch.value = props.branch
    draftTaxGroup.value = props.taxGroup
  },
)

/** Clears the draft to empty. Does not apply — Apply still has to be pressed. */
function resetDraft() {
  draftBranch.value = ''
  draftTaxGroup.value = ''
}
function apply() {
  emit('apply', { branch: draftBranch.value, taxGroup: draftTaxGroup.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="afd">
      <div v-if="isOpen" class="afd-overlay">
        <div class="afd-panel" role="dialog" :aria-label="t('All filters')">
          <header class="afd-head">
            <span class="afd-title">{{ t('All filters') }}</span>
            <MpButton class="afd-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="afd-body">
            <div class="afd-field">
              <label class="afd-label">{{ t('Branch') }}</label>
              <ErpFilterSelect
                id="afd-branch" v-model="draftBranch"
                :placeholder="t('Any branch')" :options="assetBranches" width="100%"
              />
            </div>

            <div class="afd-field">
              <label class="afd-label">{{ t('Tax group') }}</label>
              <ErpFilterSelect
                id="afd-taxgroup" v-model="draftTaxGroup"
                :placeholder="t('Any group')" :options="assetTaxGroups" width="100%"
              />
            </div>
          </div>

          <!-- rule/filter-drawer-footer — Reset pinned left, Cancel + Apply right,
               always three, never disabled. -->
          <footer class="afd-foot">
            <MpButton variant="ghost" is-rounded @click="resetDraft">{{ t('Reset filter') }}</MpButton>
            <div class="afd-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded @click="apply">{{ t('Apply') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100, and a drawer
   below it renders with its own header hidden behind the chrome. */
.afd-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.afd-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 400px; max-width: 92vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default);
  /* The panel is a column with a scrolling body; head and foot must not
     scroll away with it. */
  overflow: hidden;
}
/* rule/drawer-header-fill — the header has a fill; the panel has no shadow. */
.afd-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.afd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.afd-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.afd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-6); }
.afd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.afd-foot {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  border-top: 1px solid var(--mp-border-default);
}
.afd-footright { display: flex; gap: var(--mp-spacing-2); }

.afd-enter-active, .afd-leave-active { transition: opacity 0.16s ease; }
.afd-enter-from, .afd-leave-to { opacity: 0; }
</style>
