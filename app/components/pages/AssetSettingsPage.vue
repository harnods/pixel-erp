<script setup lang="ts">
/**
 * Asset settings — the class master and the behaviour switches.
 *
 * The class master is why an asset arrives classified instead of needing to be
 * fixed later. Choosing a class sets the statutory group, both lives, the
 * method and the accounts, so the register's one unclassified asset is an
 * exception rather than the normal state.
 */
import { computed, ref } from 'vue'
import { MpIcon, MpButton, MpToggle, MpInput } from '@mekari/pixel3'
import { infoToast, successToast } from '~/utils/toasts'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { classMaster, settingToggles } from '~/data/fixedAssetScreens'
import {
  approvalSettings, setApprovalSwitch, setApprovalThreshold, canConfigureApprovals,
} from '~/data/assetApprovals'
import { assetLocations, addLocation, BRANCHES, canEditCustody } from '~/data/assetCustody'
import { formatIDR } from '~/utils/currency'
import { viewAs } from '~/data/assetStore'

const { t } = useLocale()

// The approval group is live (below); the static fixture list keeps the rest.
const otherToggles = computed(() => settingToggles.filter((g) => g.head !== 'Approval rules'))

// ── Approval rules (LR-5, FG-7) ─────────────────────────────────────────────
const approvalSwitches = [
  { key: 'disposal' as const, label: 'Disposal needs approval', detail: 'A sale or scrapping with proceeds, whole or in part' },
  { key: 'writeOff' as const, label: 'Write-off needs approval', detail: 'A disposal with no proceeds, including a write-off from a count. A count raises one request for all its write-offs' },
  { key: 'valueChange' as const, label: 'Value change needs approval', detail: 'Cost correction, improvement, life or method revision, impairment and its reversal' },
]
const settingsError = ref('')
function flip(key: 'disposal' | 'writeOff' | 'valueChange', on: boolean) {
  settingsError.value = ''
  const e = setApprovalSwitch(key, on)
  if (e) { settingsError.value = e; return }
  successToast(t(`${approvalSwitches.find((s) => s.key === key)!.label.replace(' needs approval', '')} approval ${on ? 'on' : 'off'}`))
}
const thresholdText = ref(approvalSettings.value.threshold ? String(approvalSettings.value.threshold) : '')
function saveThreshold() {
  settingsError.value = ''
  const digits = thresholdText.value.replace(/\D/g, '')
  const e = setApprovalThreshold(digits ? Number(digits) : null)
  if (e) { settingsError.value = e; return }
  successToast(t(digits ? `Threshold set to ${formatIDR(Number(digits))}` : 'Threshold removed'))
}

// ── Locations (FG4-AC3) ─────────────────────────────────────────────────────
const newLocation = ref('')
const newBranch = ref('')
const locationError = ref('')
function saveLocation() {
  locationError.value = ''
  if (!canEditCustody.value) { locationError.value = `Viewing as ${viewAs.value}. The location list is kept by General Affairs or the Owner.`; return }
  const e = addLocation(newLocation.value, newBranch.value)
  if (e) { locationError.value = e; return }
  successToast(t(`${newLocation.value.trim()} added to the location list`))
  newLocation.value = ''
}
</script>

<template>
  <div class="st">
    <header class="st__head">
      <p class="st__sub">
        {{ t('The class master sets an asset up correctly at creation. Every field here has a statutory consequence.') }}
      </p>
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Editing settings is not part of this prototype.'))">
        {{ t('Edit') }}
      </MpButton>
    </header>

    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Asset classes') }}</span>
        <span class="st__hint">{{ t('Selecting a class fills the rest') }}</span>
      </div>
      <table class="st__table">
        <thead>
          <tr>
            <th class="st__th">{{ t('Class') }}</th>
            <th class="st__th">{{ t('Statutory group') }}</th>
            <th class="st__th">{{ t('Tax life') }}</th>
            <th class="st__th">{{ t('Accounting life') }}</th>
            <th class="st__th">{{ t('Method') }}</th>
            <th class="st__th">{{ t('Accounts') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in classMaster" :key="i" class="st__tr">
            <td class="st__td st__td--strong">{{ c.class }}</td>
            <td class="st__td">{{ c.defaultTaxGroup }}</td>
            <!-- The two lives sit beside each other because their disagreement
                 is the reason the module holds two books at all. -->
            <td class="st__td st__td--num">{{ c.fiscalLife }}</td>
            <td class="st__td st__td--num">{{ c.commercialLife }}</td>
            <td class="st__td">{{ c.method }}</td>
            <td class="st__td st__td--mono">{{ c.accounts }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- LR-5: off by default, set per event. Each switch is read by the
         value-change drawer, Custody and counts, and Asset approvals. -->
    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Approval rules') }}</span>
        <span class="st__hint">{{ t('Off by default. With a rule off the event completes at once and records who acted.') }}</span>
      </div>
      <div class="st__toggles">
        <div v-for="sw in approvalSwitches" :key="sw.key" class="st__toggle">
          <MpToggle
            :id="`st-appr-${sw.key}`"
            :is-checked="approvalSettings[sw.key]"
            :aria-label="t(sw.label)"
            @update:is-checked="(v: boolean) => flip(sw.key, v)"
          />
          <div>
            <div class="st__togglek">{{ t(sw.label) }}</div>
            <div class="st__togglev">{{ t(sw.detail) }} · {{ t('Approver: Finance Director, never the person who raised it') }}</div>
          </div>
        </div>
        <div class="st__toggle st__toggle--form">
          <div class="st__formfield">
            <label class="st__togglek" for="st-threshold">{{ t('Value threshold (Rp)') }}</label>
            <MpInput id="st-threshold" v-model="thresholdText" />
            <div class="st__togglev">
              {{ approvalSettings.threshold === null
                ? t('No threshold. Leave empty to rely on the switches alone.')
                : t(`An event moving more than ${formatIDR(approvalSettings.threshold)} needs its own approval, whatever the switches say.`) }}
            </div>
          </div>
          <MpButton variant="secondary" is-rounded @click="saveThreshold">{{ t('Save threshold') }}</MpButton>
        </div>
      </div>
      <p v-if="settingsError" class="st__error">{{ t(settingsError) }}</p>
      <p v-else-if="!canConfigureApprovals" class="st__note">{{ t(`Viewing as ${viewAs}. Only the Owner changes approval rules.`) }}</p>
    </div>

    <!-- FG4-AC3: a location is chosen from this list, never typed on the asset. -->
    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Locations') }}</span>
        <span class="st__hint">{{ assetLocations.length }} {{ t('locations · custody and counts choose from this list') }}</span>
      </div>
      <table class="st__table">
        <thead>
          <tr>
            <th class="st__th">{{ t('Location') }}</th>
            <th class="st__th">{{ t('Branch') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in assetLocations" :key="l.name" class="st__tr">
            <td class="st__td">{{ l.name }}</td>
            <td class="st__td">{{ l.branch }}</td>
          </tr>
        </tbody>
      </table>
      <div class="st__toggle st__toggle--form">
        <div class="st__formfield">
          <label class="st__togglek" for="st-loc-name">{{ t('New location') }}</label>
          <MpInput id="st-loc-name" v-model="newLocation" />
        </div>
        <div class="st__formfield">
          <label class="st__togglek" for="st-loc-branch">{{ t('Branch') }}</label>
          <ErpFilterSelect id="st-loc-branch" v-model="newBranch" :placeholder="t('Choose a branch')" :options="BRANCHES" width="100%" />
        </div>
        <MpButton variant="secondary" is-rounded @click="saveLocation">{{ t('Add location') }}</MpButton>
      </div>
      <p v-if="locationError" class="st__error">{{ t(locationError) }}</p>
    </div>

    <div v-for="(g, gi) in otherToggles" :key="gi" class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ g.head }}</span>
      </div>
      <div class="st__toggles">
        <div v-for="(item, ii) in g.items" :key="ii" class="st__toggle">
          <span class="st__box" :class="{ 'st__box--on': item.isOn }">
            <MpIcon v-if="item.isOn" name="check" size="xs" />
          </span>
          <div>
            <div class="st__togglek">{{ item.label }}</div>
            <div class="st__togglev">{{ item.detail }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.st__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.st__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.st__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.st__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.st__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.st__table { width: 100%; border-collapse: collapse; }
.st__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__td--strong { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__td--num { font-variant-numeric: tabular-nums; }
.st__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }

.st__toggles { display: flex; flex-direction: column; }
.st__toggle { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__toggle:last-child { border-bottom: 0; }
.st__box { width: var(--mp-sizes-4); height: var(--mp-sizes-4); border-radius: var(--mp-radii-sm); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); flex: none; margin-top: var(--mp-spacing-1); display: inline-flex; align-items: center; justify-content: center; color: var(--mp-background-neutral); }
.st__box--on { background: var(--mp-background-success-bold); border-color: var(--mp-background-success-bold); }
.st__togglek { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.st__togglev { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.st__toggle--form { align-items: flex-end; border-top: 1px solid var(--mp-border-default); }
.st__formfield { display: flex; flex-direction: column; gap: var(--mp-spacing-2); flex: 1 1 240px; min-width: 0; }
.st__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); }
.st__note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); }
</style>
