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
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { createAsset, earliestEffectivePeriod, canChangeValue, viewAs } from '~/data/assetStore'
import { assetBranches, STATUTORY_GROUPS } from '~/data/fixedAssets'
import { classMaster } from '~/data/fixedAssetScreens'
import { parseRupiah } from '~/data/assetValueChange'
import { periodLabel } from '~/data/assetEngine'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', id: string): void
}>()

const { t } = useLocale()

const classOptions = [...classMaster.map((c) => c.class), 'Intangible assets']
const groupOptions = Object.keys(STATUTORY_GROUPS)
const methodOptions = [
  { value: 'straight-line', label: 'Straight line' },
  { value: 'reducing-balance', label: 'Reducing balance' },
]

const blank = () => ({
  name: '', cls: '', branch: '', cost: '', inService: '', lifeYears: '', residual: '0',
  method: 'straight-line', taxGroup: '', location: '', custodian: '',
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
  const m = classMaster.find((c) => c.class === cls)
  if (!m) return
  f.value.taxGroup = m.defaultTaxGroup
  f.value.lifeYears = String(parseInt(m.commercialLife, 10))
})

const posted = computed(() => periodLabel(earliestEffectivePeriod.value))

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
  if (!canChangeValue.value) e.form = `Viewing as ${viewAs.value}. Creating an asset needs the Owner or Accounting role.`
  if (!v.name.trim()) e.name = 'Name the asset'
  if (!v.cls) e.cls = 'Choose a class'
  if (!v.branch) e.branch = 'Choose a branch'
  const cost = parseRupiah(v.cost)
  if (!cost) e.cost = 'Enter the acquisition cost'
  if (!validDate(v.inService)) e.inService = 'Enter the in-service date as dd/mm/yyyy'
  else if (Number(v.inService.slice(6)) < 2020) e.inService = 'This prototype holds assets in service from 2020'
  const years = Number(v.lifeYears.replace(',', '.'))
  if (!years || years <= 0) e.lifeYears = 'Enter the useful life in years'
  const residual = parseRupiah(v.residual) ?? 0
  if (cost && residual >= cost) e.residual = 'The residual value must be below the cost'
  if (v.cls && v.cls !== 'Intangible assets' && !v.taxGroup) e.taxGroup = 'Choose the statutory group'
  errors.value = e
  if (Object.keys(e).length) return
  const r = createAsset({
    name: v.name.trim(), class: v.cls, branch: v.branch, cost: cost!, inServiceDate: v.inService.trim(),
    lifeMonths: Math.round(years * 12), residual, method: v.method as 'straight-line' | 'reducing-balance',
    taxGroup: v.taxGroup || null, location: v.location.trim(), custodian: v.custodian.trim(),
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
                <p v-else class="nad-hint">{{ t(`Depreciation for periods before ${posted} that are already posted is brought up to date in one journal.`) }}</p>
              </div>
            </div>
            <div class="nad-row nad-row--3">
              <div class="nad-field">
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
              <label class="nad-label" for="nad-group">{{ t('Statutory group') }}</label>
              <ErpFilterSelect id="nad-group" v-model="f.taxGroup" :placeholder="t('Choose a group')" :options="groupOptions" width="100%" />
              <p v-if="errors.taxGroup" class="nad-error">{{ t(errors.taxGroup) }}</p>
              <p v-else class="nad-hint">{{ t('Set from the class. The group fixes the tax life and method.') }}</p>
            </div>
            <div class="nad-row">
              <div class="nad-field">
                <label class="nad-label" for="nad-location">{{ t('Location') }}</label>
                <MpInput id="nad-location" v-model="f.location" />
              </div>
              <div class="nad-field">
                <label class="nad-label" for="nad-custodian">{{ t('Custodian') }}</label>
                <MpInput id="nad-custodian" v-model="f.custodian" />
              </div>
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
.nad-overlay { position: fixed; inset: 0; background: var(--mp-background-overlay); z-index: 1300; }
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
.nad-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); margin: 0; line-height: var(--mp-line-heights-sm); }
.nad-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  border-top: 1px solid var(--mp-border-default);
}
.nad-foot-error { flex: 1; }
.nad-footright { display: flex; gap: var(--mp-spacing-2); flex: none; }
.nad-enter-active, .nad-leave-active { transition: opacity 0.16s ease; }
.nad-enter-from, .nad-leave-to { opacity: 0; }
</style>
