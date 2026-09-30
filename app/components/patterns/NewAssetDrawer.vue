<script setup lang="ts">
/**
 * NewAssetDrawer: create an asset (TS-01), so a journey can start from one.
 *
 * rule/drawer-custom-shell: a hand-rolled Teleport overlay copied from
 * AssetFiltersDrawer, not MpDrawer. Choosing a class fills its statutory
 * group and commercial life from the class master, which is how an asset
 * arrives classified rather than needing to be fixed later. Both stay
 * editable. Validated on submit, with the error at the field.
 */
import { ref, watch, computed } from 'vue'
import { MpButton, MpCheckbox, MpIcon, MpInput } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { createAsset, earliestEffectivePeriod, canChangeValue, viewAs } from '~/data/assetStore'
import { assetBranches } from '~/data/fixedAssets'
import { assetClassMaster, classDef, allowedGroupsFor, groupRefusal } from '~/data/assetTaxbook'
import { parseRupiah } from '~/data/assetValueChange'
import { periodLabel } from '~/data/assetEngine'
import { previewNewAsset } from '~/data/assetPreview'
import { INTANGIBLE_TAX_GROUPS } from '~/data/assetIntangibles'
import AssetLifeSchedule from '~/components/patterns/AssetLifeSchedule.vue'
import { assetLocations, CUSTODIANS, locationBranch } from '~/data/assetCustody'
import IntangibleCodePicker from '~/components/patterns/IntangibleCodePicker.vue'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', id: string): void
}>()

const { t } = useLocale()

// TS-01: the class master is session state, so an edit in Asset settings reaches here.
const classOptions = computed(() => assetClassMaster.value.map((c) => c.class))
// OD-02: only the groups the class accepts are offered.
const groupOptions = computed(() => {
  const d = classDef(f.value.cls)
  return d ? allowedGroupsFor(d.type, d.class) : []
})
const methodOptions = [
  { value: 'straight-line', label: 'Straight line' },
  { value: 'reducing-balance', label: 'Reducing balance' },
]

const blank = () => ({
  name: '', cls: '', branch: '', cost: '', inService: '', lifeYears: '', residual: '0',
  method: 'straight-line', taxGroup: '', location: '', custodian: '',
  indefinite: false, statutoryCode: '',
})
const f = ref(blank())
const errors = ref<Record<string, string>>({})

watch(() => props.isOpen, (open) => {
  if (!open) return
  f.value = blank()
  errors.value = {}
})

// The class sets the defaults it owns, the way the class master says.
watch(() => f.value.cls, (cls) => {
  const m = classDef(cls)
  if (!m) return
  f.value.taxGroup = m.defaultTaxGroup
  f.value.lifeYears = String(m.commercialLifeMonths / 12)
  f.value.method = m.method
})

const posted = computed(() => periodLabel(earliestEffectivePeriod.value))

// FG4-AC3: location and custodian come from the same maintained lists as the
// custody drawer. Both are optional; filled in, the new asset is complete for
// custody from the start. The location list follows the branch chosen above.
const locationOptions = computed(() => assetLocations.value
  .filter((l) => !f.value.branch || l.branch === f.value.branch)
  .map((l) => ({ value: l.name, label: `${l.name} · ${l.branch}` })))
const custodianOptions = CUSTODIANS.map((c) => ({ value: c.name, label: `${c.name} · ${c.branch}` }))
watch(() => f.value.location, (loc) => {
  const b = loc ? locationBranch(loc) : null
  if (b && !f.value.branch) f.value.branch = b
})
watch(() => f.value.branch, (b) => {
  if (f.value.location && locationBranch(f.value.location) !== b) f.value.location = ''
})

// FG-9: an intangible is chosen by its class. It has no tag, location or
// custodian, takes a statutory code, and may have an indefinite life.
const isIntangible = computed(() => f.value.cls === 'Intangible assets')
watch(isIntangible, (on) => {
  if (on) { f.value.location = ''; f.value.custodian = '' }
  else { f.value.indefinite = false; f.value.statutoryCode = '' }
})

/**
 * TS-04. The whole-life schedule on both books, from the same engine and the
 * same acquisition createAsset would record, before anything is committed.
 * Shown once the figures it needs are valid.
 */
const preview = computed(() => {
  const v = f.value
  const cost = parseRupiah(v.cost)
  const years = Number(v.lifeYears.replace(',', '.'))
  const residual = parseRupiah(v.residual) ?? 0
  const indefinite = isIntangible.value && v.indefinite
  if (!cost || !validDate(v.inService) || Number(v.inService.slice(6)) < 2020) return null
  if (!indefinite && !(years > 0)) return null
  if (residual >= cost) return null
  try {
    return previewNewAsset({
      cost, inServiceDate: v.inService.trim(), lifeMonths: indefinite ? null : Math.round(years * 12),
      residual: indefinite ? 0 : residual, method: v.method as 'straight-line' | 'reducing-balance', taxGroup: v.taxGroup || null,
    })
  } catch { return null }
})

/** dd/mm/yyyy, a real date. */
function validDate(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return false
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1
}

function submit() {
  const e: Record<string, string> = {}
  const v = f.value
  if (!canChangeValue.value) e.form = `Viewing as ${viewAs.value}. Only Owner or Accounting can create an asset.`
  if (!v.name.trim()) e.name = 'You must fill in asset name'
  if (!v.cls) e.cls = 'You must select class'
  if (!v.branch) e.branch = 'You must select branch'
  const cost = parseRupiah(v.cost)
  if (!cost) e.cost = 'You must fill in acquisition cost'
  if (!validDate(v.inService)) e.inService = 'Enter the date as dd/mm/yyyy'
  else if (Number(v.inService.slice(6)) < 2020) e.inService = 'Enter a date from 01/01/2020'
  const years = Number(v.lifeYears.replace(',', '.'))
  const indefinite = isIntangible.value && v.indefinite
  if (!indefinite && (!years || years <= 0)) e.lifeYears = 'You must fill in useful life'
  if (isIntangible.value && !v.statutoryCode) e.statutoryCode = 'You must select intangible code'
  if (isIntangible.value && v.taxGroup && !INTANGIBLE_TAX_GROUPS.includes(v.taxGroup)) e.taxGroup = 'Building groups do not apply to intangibles. Select Tax group 1 to 4'
  const residual = parseRupiah(v.residual) ?? 0
  if (cost && residual >= cost) e.residual = 'Residual value must be less than the acquisition cost'
  if (!isIntangible.value && v.location && !locationBranch(v.location)) e.location = 'Choose a location from the list'
  if (!isIntangible.value && v.custodian && !CUSTODIANS.some((c) => c.name === v.custodian)) e.custodian = 'Choose a custodian from the list'
  if (v.cls && v.cls !== 'Intangible assets' && !v.taxGroup) e.taxGroup = 'You must select tax group'
  const def = classDef(v.cls)
  if (def && v.taxGroup) {
    const g = groupRefusal(def.type, def.class, v.taxGroup)
    if (g) e.taxGroup = g
  }
  errors.value = e
  if (Object.keys(e).length) return
  const r = createAsset({
    name: v.name.trim(), class: v.cls, branch: v.branch, cost: cost!, inServiceDate: v.inService.trim(),
    lifeMonths: indefinite ? null : Math.round(years * 12), residual: indefinite ? 0 : residual, method: v.method as 'straight-line' | 'reducing-balance',
    taxGroup: v.taxGroup || null,
    ...(isIntangible.value ? {} : { location: v.location, custodian: v.custodian }),
    ...(isIntangible.value ? { statutoryCode: v.statutoryCode } : {}),
  })
  if (!r.ok) { errors.value = { form: r.reason }; return }
  emit('created', r.id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nad">
      <div v-if="isOpen" class="nad-overlay">
        <div class="nad-panel" role="dialog" :aria-label="t('New asset')">
          <header class="nad-head">
            <span class="nad-title">{{ t('New asset') }}</span>
            <MpButton class="nad-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="nad-body">
            <div class="nad-field">
              <label class="nad-label" for="nad-name">{{ t('Asset name') }}</label>
              <MpInput id="nad-name" v-model="f.name" :is-invalid="!!errors.name" />
              <p v-if="errors.name" class="nad-error">{{ t(errors.name) }}</p>
            </div>
            <div class="nad-row">
              <div class="nad-field">
                <label class="nad-label" for="nad-class">{{ t('Class') }}</label>
                <ErpFilterSelect id="nad-class" v-model="f.cls" :placeholder="t('Choose a class')" :options="classOptions" width="100%" :is-clearable="false" />
                <p v-if="errors.cls" class="nad-error">{{ t(errors.cls) }}</p>
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-branch">{{ t('Branch') }}</label>
                <ErpFilterSelect id="nad-branch" v-model="f.branch" :placeholder="t('Choose a branch')" :options="assetBranches" width="100%" :is-clearable="false" />
                <p v-if="errors.branch" class="nad-error">{{ t(errors.branch) }}</p>
              </div>
            </div>
            <div class="nad-row">
              <div class="nad-field">
                <label class="nad-label" for="nad-cost">{{ t('Acquisition cost (Rp)') }}</label>
                <MpInput id="nad-cost" v-model="f.cost" :is-invalid="!!errors.cost" />
                <p v-if="errors.cost" class="nad-error">{{ t(errors.cost) }}</p>
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-date">{{ t('In service from (dd/mm/yyyy)') }}</label>
                <MpInput id="nad-date" v-model="f.inService" :is-invalid="!!errors.inService" />
                <p v-if="errors.inService" class="nad-error">{{ t(errors.inService) }}</p>
                <p v-else class="nad-hint">{{ t(`Depreciation for posted periods before ${posted} is caught up in one journal`) }}</p>
              </div>
            </div>
            <template v-if="isIntangible">
              <div class="nad-field">
                <label class="nad-label" for="nad-code">{{ t('Intangible code') }}</label>
                <IntangibleCodePicker id="nad-code" v-model="f.statutoryCode" />
                <p v-if="errors.statutoryCode" class="nad-error">{{ t(errors.statutoryCode) }}</p>
              </div>
              <div class="nad-field">
                <MpCheckbox id="nad-indefinite" :is-checked="f.indefinite" @change="f.indefinite = !f.indefinite">
                  {{ t('Indefinite useful life') }}
                </MpCheckbox>
                <p class="nad-hint">{{ t('Not amortised in the accounting book and tested for impairment yearly. The tax book still amortises it') }}</p>
              </div>
            </template>
            <div class="nad-row nad-row--3">
              <div v-if="!(isIntangible && f.indefinite)" class="nad-field">
                <label class="nad-label" for="nad-life">{{ t('Useful life (years)') }}</label>
                <MpInput id="nad-life" v-model="f.lifeYears" :is-invalid="!!errors.lifeYears" />
                <p v-if="errors.lifeYears" class="nad-error">{{ t(errors.lifeYears) }}</p>
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-residual">{{ t('Residual value (Rp)') }}</label>
                <MpInput id="nad-residual" v-model="f.residual" :is-invalid="!!errors.residual" />
                <p v-if="errors.residual" class="nad-error">{{ t(errors.residual) }}</p>
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-method">{{ t('Method') }}</label>
                <ErpFilterSelect id="nad-method" v-model="f.method" :placeholder="t('Method')" :options="methodOptions" width="100%" :is-clearable="false" />
              </div>
            </div>
            <div class="nad-field">
              <label class="nad-label" for="nad-group">{{ t('Tax group') }}</label>
              <ErpFilterSelect id="nad-group" v-model="f.taxGroup" :placeholder="t('Choose a group')" :options="groupOptions" width="100%" />
              <p v-if="errors.taxGroup" class="nad-error">{{ t(errors.taxGroup) }}</p>
              <p v-else class="nad-hint">{{ t('Filled from the class. Sets the tax life') }}</p>
            </div>
            <div v-if="!isIntangible" class="nad-row">
              <div class="nad-field">
                <label class="nad-label" for="nad-location">{{ t('Location') }} <span class="nad-optional">{{ t('Optional') }}</span></label>
                <ErpFilterSelect id="nad-location" v-model="f.location" :placeholder="t('Choose a location')" :options="locationOptions" width="100%" />
                <p v-if="errors.location" class="nad-error">{{ t(errors.location) }}</p>
                <p v-else class="nad-hint">{{ t('Add new locations in Asset settings') }}</p>
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-custodian">{{ t('Custodian') }} <span class="nad-optional">{{ t('Optional') }}</span></label>
                <ErpFilterSelect id="nad-custodian" v-model="f.custodian" :placeholder="t('Choose a custodian')" :options="custodianOptions" width="100%" />
                <p v-if="errors.custodian" class="nad-error">{{ t(errors.custodian) }}</p>
              </div>
            </div>

            <!-- TS-04: what the asset will charge, before it exists. -->
            <div class="nad-preview">
              <div class="nad-preview-title">{{ t('Schedule preview') }}</div>
              <AssetLifeSchedule
                v-if="preview"
                :schedule="preview"
                :caption="`${preview.monthly.accounting === null ? 'Accounting: not amortised' : 'Accounting ' + formatIDRWhole(preview.monthly.accounting) + ' a month'} · ${preview.monthly.tax === null ? 'Tax: no tax group' : 'Tax ' + formatIDRWhole(preview.monthly.tax) + ' a month'}`"
              />
              <p v-else class="nad-hint">{{ t('Enter acquisition cost, in-service date and useful life to see the schedule') }}</p>
            </div>
          </div>

          <footer class="nad-foot">
            <p v-if="errors.form" class="nad-error nad-foot-error">{{ t(errors.form) }}</p>
            <div class="nad-footright">
              <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded @click="submit">{{ t('Create asset') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100. */
.nad-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.nad-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 560px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default);
  overflow: hidden;
}
/* rule/drawer-header-fill: the header has a fill; the panel has no shadow. */
.nad-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.nad-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nad-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.nad-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.nad-row--3 { grid-template-columns: 1fr 1fr 1fr; }
.nad-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); min-width: 0; }
.nad-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nad-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; line-height: var(--mp-line-heights-sm); }
/* rule/form-errors-inline: the error sits with the field, not in a toast. */
.nad-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; line-height: var(--mp-line-heights-sm); }
.nad-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  border-top: 1px solid var(--mp-border-default);
}
.nad-foot-error { flex: 1; }
.nad-preview { border-top: 1px solid var(--mp-border-default); padding-top: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.nad-preview-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nad-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.nad-enter-active, .nad-leave-active { transition: opacity 0.16s ease; }
.nad-enter-from, .nad-leave-to { opacity: 0; }
.nad-optional { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
</style>
