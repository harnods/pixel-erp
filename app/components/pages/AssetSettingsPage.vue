<script setup lang="ts">
/**
 * Asset settings: the class master (TS-01) and the behaviour switches.
 *
 * The class master is why an asset arrives classified instead of needing to
 * be fixed later. A new asset takes its class's statutory group, accounting
 * life and method, and so does an asset moved into the class. Editing a
 * class here changes what the next asset inherits; assets already in the
 * class keep what they have, because a default is not a retrospective change.
 *
 * The tax life is the group's, never the class's: it is shown, not edited.
 */
import { computed, ref } from 'vue'
import { MpIcon, MpButton, MpToggle, MpInput } from '@mekari/pixel3'
import { infoToast, successToast } from '~/utils/toasts'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { settingToggles } from '~/data/fixedAssetScreens'
import {
  approvalSettings, setApprovalSwitch, setApprovalThreshold, canConfigureApprovals,
} from '~/data/assetApprovals'
import { assetLocations, addLocation, BRANCHES, canEditCustody } from '~/data/assetCustody'
import { formatIDRWhole } from '~/utils/currency'
import {
  assetClassMaster, allowedGroupsFor, groupLifeMonths, updateClassDef, classCounts, canChangeClass,
} from '~/data/assetTaxbook'
import { METHOD_LABEL } from '~/data/assetEngine'
import { formatMonths } from '~/data/assetUiDuration'
import AssetPostingPolicy from '~/components/patterns/AssetPostingPolicy.vue'
import GuidedToursSetting from '~/tours/GuidedToursSetting.vue'

// OD-09, OD-10: the posting settings are live controls; the rest of the
// depreciation policy group stays as stated.
const LIVE_POLICY = ['Journal date is the last day of the period', 'Post automatically after review']

const { t } = useLocale()

// The approval group is live (below); the static fixture list keeps the rest.
const otherToggles = computed(() => settingToggles.filter((g) => g.head !== 'Approval rules'))

// ── Approval rules (LR-5, FG-7) ─────────────────────────────────────────────
const approvalSwitches = [
  { key: 'disposal' as const, label: 'Disposal needs approval', detail: 'Full or partial disposal with proceeds' },
  { key: 'writeOff' as const, label: 'Write-off needs approval', detail: 'Disposal with no proceeds, including write-offs from a count' },
  { key: 'valueChange' as const, label: 'Value change needs approval', detail: 'Cost correction, improvement, life or method change, impairment and reversal' },
]
const settingsError = ref('')
// A refused flip leaves the store as it was, but the native checkbox has
// already moved. Re-keying the toggles redraws them from the store, so a
// switch the role may not change snaps back at once.
const toggleRedraw = ref(0)
function flip(key: 'disposal' | 'writeOff' | 'valueChange', on: boolean) {
  settingsError.value = ''
  const e = setApprovalSwitch(key, on)
  if (e) { settingsError.value = e; toggleRedraw.value += 1; return }
  successToast(t(`${approvalSwitches.find((s) => s.key === key)!.label.replace(' needs approval', '')} approval turned ${on ? 'on' : 'off'}`))
}
const thresholdText = ref(approvalSettings.value.threshold ? String(approvalSettings.value.threshold) : '')
function saveThreshold() {
  settingsError.value = ''
  const digits = thresholdText.value.replace(/\D/g, '')
  const e = setApprovalThreshold(digits ? Number(digits) : null)
  if (e) { settingsError.value = e; return }
  successToast(t(digits ? 'Threshold saved' : 'Threshold removed'))
}

// ── Locations (FG4-AC3) ─────────────────────────────────────────────────────
const newLocation = ref('')
const newBranch = ref('')
const locationError = ref('')
function saveLocation() {
  locationError.value = ''
  if (!canEditCustody.value) { locationError.value = 'Only General Affairs, Accounting or the Owner can add locations'; return }
  const e = addLocation(newLocation.value, newBranch.value)
  if (e) { locationError.value = e; return }
  successToast(t('Location added'))
  newLocation.value = ''
}

const router = useRouter()

const counts = computed(() => classCounts())

// ── Editing one class ───────────────────────────────────────────────────────
const editing = ref<string | null>(null)
const draft = ref({ group: '', lifeYears: '', method: 'straight-line' })
const editError = ref('')
const methodOptions = [
  { value: 'straight-line', label: 'Straight line' },
  { value: 'reducing-balance', label: 'Reducing balance' },
]
const editDef = computed(() => assetClassMaster.value.find((c) => c.class === editing.value) ?? null)
const editGroups = computed(() => (editDef.value ? allowedGroupsFor(editDef.value.type, editDef.value.class) : []))

function startEdit(cls: string) {
  if (!canChangeClass.value) { infoToast(t('Only Accounting or the Owner can edit asset classes')); return }
  const d = assetClassMaster.value.find((c) => c.class === cls)!
  editing.value = cls
  draft.value = { group: d.defaultTaxGroup, lifeYears: String(d.commercialLifeMonths / 12), method: d.method }
  editError.value = ''
}
function saveEdit() {
  if (!editing.value) return
  const years = Number(draft.value.lifeYears.replace(',', '.'))
  const r = updateClassDef(editing.value, {
    defaultTaxGroup: draft.value.group,
    commercialLifeMonths: Math.round(years * 12),
    method: draft.value.method as 'straight-line' | 'reducing-balance',
  })
  if (r) { editError.value = r; return }
  successToast(t('Asset class saved'))
  editing.value = null
}

// ── Switches ──────────────────────────────────────────────────────────────
/** Toggles that are shown as the design states them. */
function toggleOther() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="st">
    <header class="st__head">
      <MpButton variant="secondary" is-rounded @click="router.push('/asset-migration')">
        {{ t('Migrate existing assets') }}
      </MpButton>
    </header>

    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Asset classes') }}</span>
        <span class="st__hint">{{ t('New assets take the tax group, life and method of their class') }}</span>
      </div>
      <table class="st__table">
        <thead>
          <tr>
            <th class="st__th">{{ t('Class') }}</th>
            <th class="st__th">{{ t('Tax group') }}</th>
            <th class="st__th">{{ t('Tax life') }}</th>
            <th class="st__th">{{ t('Accounting life') }}</th>
            <th class="st__th">{{ t('Method') }}</th>
            <th class="st__th">{{ t('Accounts') }}</th>
            <th class="st__th st__th--num">{{ t('Assets') }}</th>
            <th class="st__th" />
          </tr>
        </thead>
        <tbody>
          <template v-for="c in assetClassMaster" :key="c.class">
            <tr class="st__tr">
              <td class="st__td st__td--strong">{{ c.class }}</td>
              <td class="st__td">{{ c.defaultTaxGroup }}</td>
              <!-- The two lives sit beside each other because their disagreement
                   is the reason the module holds two books at all. -->
              <td class="st__td st__td--num">{{ formatMonths(groupLifeMonths(c.defaultTaxGroup)) }}</td>
              <td class="st__td st__td--num">{{ formatMonths(c.commercialLifeMonths) }}</td>
              <td class="st__td">{{ t(METHOD_LABEL[c.method]) }}</td>
              <td class="st__td st__td--mono">{{ c.accounts }}</td>
              <td class="st__td st__td--num">{{ counts[c.class] ?? 0 }}</td>
              <td class="st__td st__td--act">
                <MpButton size="sm" variant="ghost" is-rounded @click="startEdit(c.class)">{{ t('Edit') }}</MpButton>
              </td>
            </tr>
            <tr v-if="editing === c.class" class="st__tr st__tr--edit">
              <td class="st__td" colspan="8">
                <div class="st__edit">
                  <div class="st__editfield">
                    <label class="st__editlabel" for="st-group">{{ t('Tax group') }}</label>
                    <ErpFilterSelect id="st-group" v-model="draft.group" :placeholder="t('Select group')" :options="editGroups" width="100%" :is-clearable="false" />
                  </div>
                  <div class="st__editfield">
                    <label class="st__editlabel" for="st-life">{{ t('Accounting life (years)') }}</label>
                    <MpInput id="st-life" v-model="draft.lifeYears" />
                  </div>
                  <div class="st__editfield">
                    <label class="st__editlabel" for="st-method">{{ t('Method') }}</label>
                    <ErpFilterSelect id="st-method" v-model="draft.method" :placeholder="t('Select method')" :options="methodOptions" width="100%" :is-clearable="false" />
                  </div>
                  <div class="st__editbtns">
                    <MpButton variant="ghost" is-rounded @click="editing = null">{{ t('Cancel') }}</MpButton>
                    <MpButton is-rounded @click="saveEdit">{{ t('Save') }}</MpButton>
                  </div>
                </div>
                <p v-if="editError" class="st__error">{{ t(editError) }}</p>
                <p v-else class="st__edithint">
                  {{ t('Tax life follows the tax group. Changes apply to new assets only.') }}
                </p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- LR-5: off by default, set per event. Each switch is read by the
         value-change drawer, Custody and counts, and Asset approvals. -->
    <div class="st__card" data-tour="appr-rules">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Approval rules') }}</span>
        <span class="st__hint">{{ t('When a rule is off, the event is recorded immediately') }}</span>
      </div>
      <div class="st__toggles">
        <div v-for="sw in approvalSwitches" :key="sw.key" class="st__toggle">
          <MpToggle
            :key="`${sw.key}-${toggleRedraw}`"
            :id="`st-appr-${sw.key}`"
            :is-checked="approvalSettings[sw.key]"
            :aria-label="t(sw.label)"
            @update:is-checked="(v: boolean) => flip(sw.key, v)"
          />
          <div>
            <div class="st__togglek">{{ t(sw.label) }}</div>
            <div class="st__togglev">{{ t(sw.detail) }}</div>
          </div>
        </div>
        <div class="st__toggle st__toggle--form">
          <div class="st__formfield">
            <label class="st__togglek" for="st-threshold">{{ t('Value threshold (Rp)') }}</label>
            <MpInput id="st-threshold" v-model="thresholdText" />
            <div class="st__togglev">
              {{ approvalSettings.threshold === null
                ? t('Leave empty for no threshold')
                : t(`Events above ${formatIDRWhole(approvalSettings.threshold)} always need approval`) }}
            </div>
          </div>
          <MpButton variant="secondary" is-rounded @click="saveThreshold">{{ t('Save threshold') }}</MpButton>
        </div>
      </div>
      <p v-if="settingsError" class="st__error">{{ t(settingsError) }}</p>
      <p v-else-if="!canConfigureApprovals" class="st__note">{{ t('Only the Owner can change approval rules.') }}</p>
    </div>

    <!-- FG4-AC3: a location is chosen from this list, never typed on the asset. -->
    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Locations') }}</span>
        <span class="st__hint">{{ assetLocations.length }} {{ t('locations') }}</span>
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
          <label class="st__togglek" for="st-loc-name">{{ t('Location name') }}</label>
          <MpInput id="st-loc-name" v-model="newLocation" />
        </div>
        <div class="st__formfield">
          <label class="st__togglek" for="st-loc-branch">{{ t('Branch') }}</label>
          <ErpFilterSelect id="st-loc-branch" v-model="newBranch" :placeholder="t('Select branch')" :options="BRANCHES" width="100%" />
        </div>
        <MpButton variant="secondary" is-rounded @click="saveLocation">{{ t('Add location') }}</MpButton>
      </div>
      <p v-if="locationError" class="st__error">{{ t(locationError) }}</p>
    </div>

    <div v-for="(g, gi) in otherToggles" :key="gi" class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ g.head }}</span>
      </div>
      <AssetPostingPolicy v-if="g.head === 'Depreciation policy'" />
      <div class="st__toggles">
        <div
          v-for="(item, ii) in g.items.filter((x) => !LIVE_POLICY.includes(x.label))" :key="ii" class="st__toggle st__toggle--click"
          @click="toggleOther()"
        >
          <span class="st__box" :class="{ 'st__box--on': item.isOn }">
            <MpIcon v-if="item.isOn" name="check" size="sm" />
          </span>
          <div>
            <div class="st__togglek">{{ item.label }}</div>
            <div class="st__togglev">{{ item.detail }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Demo layer (app/tours), not a product requirement. -->
    <GuidedToursSetting />
  </div>
</template>

<style scoped>

.st__head { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }

.st__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.st__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.st__table { width: 100%; border-collapse: collapse; }
.st__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__th--num { text-align: right; }
.st__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__td--strong { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__td--num { font-variant-numeric: tabular-nums; }
.st__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }
.st__td--act { text-align: right; width: 1%; white-space: nowrap; }
.st__tr--edit .st__td { background: var(--mp-background-neutral-subtle); }
.st__edit { display: grid; grid-template-columns: 1.4fr 1fr 1.2fr auto; gap: var(--mp-spacing-4); align-items: end; }
.st__editfield { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.st__editlabel { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__editbtns { display: flex; gap: var(--mp-spacing-2); }
.st__edithint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-2) 0 0; }
.st__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: var(--mp-spacing-2) 0 0; }

.st__toggles { display: flex; flex-direction: column; }
.st__toggle { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__toggle--click { cursor: pointer; }
.st__toggle:last-child { border-bottom: 0; }
.st__box { width: var(--mp-sizes-4); height: var(--mp-sizes-4); border-radius: var(--mp-radii-sm); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); flex: none; margin-top: var(--mp-spacing-1); display: inline-flex; align-items: center; justify-content: center; color: var(--mp-background-neutral); }
.st__box--on { background: var(--mp-colors-background-success-bold); border-color: var(--mp-colors-background-success-bold); }
.st__togglek { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.st__togglev { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.st__toggle--form { align-items: flex-end; border-top: 1px solid var(--mp-border-default); }
.st__formfield { display: flex; flex-direction: column; gap: var(--mp-spacing-2); flex: 1 1 240px; min-width: 0; }
.st__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); }
.st__note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); }
</style>
