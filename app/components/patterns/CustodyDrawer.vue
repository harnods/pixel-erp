<script setup lang="ts">
/**
 * CustodyDrawer: assign or change who holds an asset, where it is and its
 * condition (OD-19, OD-22).
 *
 * rule/drawer-custom-shell: the Teleport overlay ValueChangeDrawer uses.
 * Location is chosen from the maintained list (FG4-AC3), never typed; a
 * location that is missing is added in Asset settings. A reason is required
 * because the change log (FG4-AC2) is only useful if it says why.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  assetLocations, CUSTODIANS, CONDITIONS, changeCustody, conditionOf, canEditCustody, leftCustodians,
  type Condition,
} from '~/data/assetCustody'
import { actingUser, viewAs } from '~/data/assetStore'
import type { FixedAsset } from '~/data/fixedAssets'

const props = defineProps<{ isOpen: boolean; asset: FixedAsset }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', message: string): void }>()

const { t } = useLocale()

const custodian = ref('')
const location = ref('')
const condition = ref('')
const reason = ref('')
const error = ref<{ field: string; reason: string } | null>(null)

watch(() => props.isOpen, (open) => {
  if (!open) return
  custodian.value = props.asset.custodian ?? ''
  location.value = props.asset.location ?? ''
  condition.value = conditionOf(props.asset) ?? 'Good'
  reason.value = ''
  error.value = null
})

const custodianOptions = computed(() => CUSTODIANS
  .filter((c) => !leftCustodians.value.includes(c.name))
  .map((c) => ({ value: c.name, label: `${c.name} · ${c.branch}` })))
const locationOptions = computed(() => assetLocations.value.map((l) => ({ value: l.name, label: `${l.name} · ${l.branch}` })))
const conditionOptions = CONDITIONS.map((c) => ({ value: c, label: c }))

function err(field: string): string {
  return error.value?.field === field ? error.value.reason : ''
}

function save() {
  const r = changeCustody(props.asset.id, {
    custodian: custodian.value || null,
    location: location.value || null,
    condition: (condition.value || 'Good') as Condition,
  }, reason.value)
  if (!r.ok) { error.value = r; return }
  emit('saved', `${r.changed.join(', ')} updated on ${props.asset.id} by ${actingUser.value}`)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cud">
      <div v-if="isOpen" class="cud-overlay">
        <div class="cud-panel" role="dialog" :aria-label="t('Change custody')">
          <header class="cud-head">
            <div>
              <div class="cud-title">{{ t('Change custody') }}</div>
              <div class="cud-sub">{{ asset.id }} · {{ asset.name }}<template v-if="asset.tag"> · {{ asset.tag }}</template></div>
            </div>
            <MpButton class="cud-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="cud-body">
            <div v-if="!canEditCustody" class="cud-refusal">
              <MpIcon name="info" size="sm" />
              <span>{{ t(`Viewing as ${viewAs}. Custody is maintained by General Affairs or the Owner.`) }}</span>
            </div>

            <div class="cud-field">
              <label class="cud-label" for="cud-custodian">{{ t('Custodian') }}</label>
              <ErpFilterSelect id="cud-custodian" v-model="custodian" :placeholder="t('Unassigned')" :options="custodianOptions" width="100%" />
              <p v-if="err('custodian')" class="cud-error">{{ t(err('custodian')) }}</p>
              <p v-else class="cud-hint">{{ t('Now') }}: {{ asset.custodian ?? t('Unassigned') }}</p>
            </div>

            <div class="cud-field">
              <label class="cud-label" for="cud-location">{{ t('Location') }}</label>
              <ErpFilterSelect id="cud-location" v-model="location" :placeholder="t('Not recorded')" :options="locationOptions" width="100%" />
              <p v-if="err('location')" class="cud-error">{{ t(err('location')) }}</p>
              <p v-else class="cud-hint">{{ t('From the maintained list. A missing location is added in Asset settings. A location in another branch moves the asset to that branch.') }}</p>
            </div>

            <div class="cud-field">
              <label class="cud-label" for="cud-condition">{{ t('Condition') }}</label>
              <ErpFilterSelect id="cud-condition" v-model="condition" :placeholder="t('Condition')" :options="conditionOptions" width="100%" :is-clearable="false" />
            </div>

            <div class="cud-field">
              <label class="cud-label" for="cud-reason">{{ t('Reason for the change') }}</label>
              <MpInput id="cud-reason" v-model="reason" :is-invalid="!!err('reason')" />
              <p v-if="err('reason')" class="cud-error">{{ t(err('reason')) }}</p>
              <p v-else class="cud-hint">{{ t('Kept in the asset history with the previous holder, the new holder, who changed it and when.') }}</p>
            </div>
          </div>

          <footer class="cud-foot">
            <p v-if="err('role') || err('asset')" class="cud-error cud-foot-error">{{ t(err('role') || err('asset')) }}</p>
            <div class="cud-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton data-tour="dlg-primary" is-rounded @click="save">{{ t('Save custody') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cud-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.cud-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
.cud-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.cud-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cud-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.cud-close { flex: none; }
.cud-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.cud-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); }
.cud-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cud-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; }
.cud-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.cud-refusal {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-sm);
  background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning);
}
.cud-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none; border-top: 1px solid var(--mp-border-default);
}
.cud-foot-error { flex: 1; }
.cud-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.cud-enter-active, .cud-leave-active { transition: opacity 0.16s ease; }
.cud-enter-from, .cud-leave-to { opacity: 0; }
</style>
