<script setup lang="ts">
/**
 * CrmSeatsScenarioFab — the Users & roles demo control for the CRM add-on
 * (mock Billing). Built on the shared ScenarioFab (rule/index-scenario-fab):
 * the list picks a Billing preset (No CRM / Trial / Essential / Expired /
 * Billing down / …); below it, add-on quantity steppers ("Simulate seat
 * reduction" = step an add-on down below usage → over quota), the ERP user
 * limit, a "signed in without the CRM role" switch for the product switcher,
 * and the defaults this prototype assumes for the PRD's open questions.
 *
 * Shared by UsersListPage, CustomRolesPage and InviteUserPage so the state is
 * flippable from every Users & roles surface.
 */
import { computed } from 'vue'
import { MpButton, MpCheckbox } from '@mekari/pixel3'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'
import { crmPackageLabel } from '~/data/crmSubscription'
import { useLocale } from '~/composables/useLocale'

const { t } = useLocale()
const {
  state, presets, applyPreset, setBasicAddons, setAdminAddons, setErpUserLimit, setViewAsNoCrmRole,
} = useCrmSubscriptionScenario()

const scenarios = computed(() => [
  ...presets.map((p) => ({ value: p.value, label: t(p.label) })),
  ...(state.preset === 'custom' ? [{ value: 'custom', label: t('Custom (adjusted below)') }] : []),
])

function onPick(value: string) { if (value !== 'custom') applyPreset(value) }

/** Add-ons only exist on CRM Essential (no add-ons during the trial — PRD point 9). */
const addonsEditable = computed(() => state.snapshot.package === 'essential' || state.snapshot.package === 'expired')

const STEPPERS = computed(() => [
  { id: 'basic', label: t('Basic seat add-ons'), value: state.snapshot.basicAddons, set: setBasicAddons, enabled: addonsEditable.value },
  { id: 'admin', label: t('Manager seat add-ons'), value: state.snapshot.adminAddons, set: setAdminAddons, enabled: addonsEditable.value },
  { id: 'erp', label: t('ERP user limit'), value: state.erpUserLimit, set: setErpUserLimit, enabled: true },
])

const DEFAULTS = [
  'Included seats can be used by either CRM role (#2).',
  'A pending invite with CRM holds a CRM seat (#4).',
  'A deactivated user keeps their CRM seat (#5).',
  'CRM-only invites are allowed while the ERP limit is full (#3b).',
  'Over quota keeps everyone and blocks only new access (#9).',
  'Ultimate does not get CRM automatically (#6).',
]
</script>

<template>
  <ScenarioFab
    :model-value="state.preset"
    :scenarios="scenarios"
    :heading="`${t('CRM add-on (Billing)')} · ${t(crmPackageLabel(state.snapshot.package))}`"
    :aria-label="t('Change CRM scenario')"
    @update:model-value="onPick"
  >
    <div class="csf" data-devchange="crm-user-seats-scenario-fab">
      <div v-for="s in STEPPERS" :key="s.id" class="csf-row">
        <span class="csf-label">{{ s.label }}</span>
        <div class="csf-stepper">
          <MpButton
            variant="secondary" is-rounded class="csf-step"
            :aria-label="`${t('Decrease')} ${s.label}`"
            :data-test-id="`csf-${s.id}-dec`"
            @click="s.enabled && s.set(s.value - 1)"
          >−</MpButton>
          <span class="csf-value" :class="{ 'csf-value--off': !s.enabled }">{{ s.enabled ? s.value : '—' }}</span>
          <MpButton
            variant="secondary" is-rounded class="csf-step"
            :aria-label="`${t('Increase')} ${s.label}`"
            :data-test-id="`csf-${s.id}-inc`"
            @click="s.enabled && s.set(s.value + 1)"
          >+</MpButton>
        </div>
      </div>
      <p v-if="!addonsEditable" class="csf-hint">{{ t('Seat add-ons need an active CRM Essential.') }}</p>

      <MpCheckbox
        id="csf-view-as"
        :is-checked="state.viewAsNoCrmRole"
        @change="(on: boolean) => setViewAsNoCrmRole(on)"
      >
        {{ t('Signed-in user has no CRM role') }}
        <template #description>{{ t('Previews the product switcher for a user without CRM access.') }}</template>
      </MpCheckbox>

      <div class="csf-defaults">
        <p class="csf-defaults-title">{{ t('Defaults for open questions') }}</p>
        <ul class="csf-defaults-list">
          <li v-for="d in DEFAULTS" :key="d">{{ t(d) }}</li>
        </ul>
      </div>
    </div>
  </ScenarioFab>
</template>

<style scoped>
.csf { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: 320px; }
.csf-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.csf-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.csf-stepper { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.csf-step { min-width: 32px !important; width: 32px; height: 32px !important; padding: 0 !important; }
.csf-value { min-width: 24px; text-align: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.csf-value--off { color: var(--mp-text-secondary); }
.csf-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.csf :deep(.mp-checkbox__root) { align-items: flex-start; } /* rule/checkbox-multiline-top */
.csf-defaults { border-top: 1px solid var(--mp-border-default, #e3e7e9); padding-top: var(--mp-spacing-3); }
.csf-defaults-title { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.csf-defaults-list { list-style: disc outside; margin: var(--mp-spacing-1) 0 0; padding-left: var(--mp-spacing-4); }
.csf-defaults-list li { display: list-item; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
