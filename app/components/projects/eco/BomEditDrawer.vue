<script setup lang="ts">
/**
 * Edit project BOM (PRD v6.2 §5, §7 · Story 8). Production's door into a change:
 *
 *   • Active version not referenced by any work order → the edit saves in place;
 *     no version, no ECO.
 *   • Active version locked (a work order references it) → saving PUBLISHES vN+1,
 *     which is Active at once: every work order created afterwards uses it. A reason
 *     code is mandatory, and the publish raises one ECO so the PM decides whether
 *     EXISTING work orders adopt it. Nobody gates the issuance.
 *   • While an ECO is open on this BOM the edit is refused, naming the ECO (OQ22).
 *
 * The primary action is always clickable; refusals and missing fields show inline
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
import {
  MpButton, MpInput, MpTextarea, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import EcoDiff from '../EcoDiff.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { getCustomBom, currentVersion, type BomComponent, type BomProdCost } from '~/data/projectBoms'
import { blockingEco, ecoPath, ECO_REASON_LABELS, type EcoReason } from '~/data/projectChanges'
import { projectSos } from '~/data/projects'
import { saveBomEdit, bomEditRefusal, versionRefs } from '~/data/projectActions'
import { parseQty, parseAmount, rp } from '~/utils/projectFormat'

const props = defineProps<{ open: boolean; bomId?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', ecoId?: string): void }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const action = useProjectAction()

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const bom = computed(() => getCustomBom(props.bomId))
const cur = computed(() => (bom.value ? currentVersion(bom.value) : undefined))
const refs = computed(() => (bom.value && cur.value ? versionRefs(bom.value.id, cur.value.version) : []))
const locked = computed(() => refs.value.length > 0)
const blocker = computed(() => (bom.value ? blockingEco(bom.value.id) : undefined))
const refusal = computed(() => (bom.value ? bomEditRefusal(bom.value.id, asActor.value) : ''))

const form = reactive({
  components: [] as BomComponent[],
  productionCost: [] as BomProdCost[],
  reason: '' as '' | EcoReason,
  title: '',
  note: '',
  addendumSoId: '',
  touched: false,
})
watch(() => [props.open, props.bomId], () => {
  if (!props.open || !cur.value) return
  action.clear()
  Object.assign(form, {
    components: clone(cur.value.components), productionCost: clone(cur.value.productionCost),
    reason: '', title: '', note: '', addendumSoId: '', touched: false,
  })
  Object.keys(numDraft).forEach(k => delete numDraft[k])
}, { immediate: true })

const reasonOptions = computed(() => (Object.keys(ECO_REASON_LABELS) as EcoReason[]).map(k => ({ value: k, label: t(ECO_REASON_LABELS[k]) })))
// v6.2 key decision 3: a customer change is an SO addendum + ECO — there is no VO object.
const addendumOptions = computed(() => (bom.value ? projectSos(bom.value.projectId).filter(so => so.isAddendum) : [])
  .map(so => ({ value: so.id, label: `${so.number} · ${rp(so.value)}` })))

// Numeric cells edit a draft string and commit on blur, so "1," mid-typing isn't reformatted away.
// Quantity is decimal ("1,5"); standard cost is whole rupiah with thousand dots ("285.000").
const numDraft = reactive<Record<string, string>>({})
function numValue(i: number, key: 'qty' | 'unitCost', c: BomComponent) {
  return numDraft[`${i}-${key}`] ?? (key === 'qty' ? String(c.qty).replace('.', ',') : c.unitCost !== undefined ? c.unitCost.toLocaleString('id-ID') : '')
}
function commitNum(i: number, key: 'qty' | 'unitCost', c: BomComponent) {
  const k = `${i}-${key}`
  const d = numDraft[k]
  if (d === undefined) return
  delete numDraft[k]
  if (key === 'unitCost' && !d.trim()) { c.unitCost = undefined; return }
  const n = key === 'qty' ? parseQty(d) : parseAmount(d)
  c[key] = Number.isFinite(n) && n >= 0 ? n : 0
}
function addComponent() { form.components.push({ name: '', qty: 1, unit: 'Pcs', unitCost: undefined }) }
function removeComponent(i: number) { form.components.splice(i, 1); Object.keys(numDraft).forEach(k => delete numDraft[k]) }

const errors = computed(() => ({
  title: !form.title.trim() ? t('Describe what changed.') : '',
  reason: locked.value && !form.reason ? t('Choose a reason code.') : '',
}))
const nextVersion = computed(() => (cur.value ? cur.value.version + 1 : 1))
const primaryLabel = computed(() => (locked.value ? `${t('Publish')} v${nextVersion.value}` : t('Save changes')))

function save() {
  form.touched = true
  if (!bom.value) return
  if (refusal.value) { action.fail(refusal.value); return }
  if (errors.value.title || errors.value.reason) return
  const res = saveBomEdit(bom.value.id, {
    components: form.components, productionCost: form.productionCost, reason: form.reason || undefined,
    title: form.title, note: form.note, addendumSoId: form.reason === 'customer_request' ? form.addendumSoId || undefined : undefined,
  }, asActor.value)
  if (action.run(res)) emit('saved', res.ok ? res.ecoId : undefined)
}
</script>

<template>
  <PmOverlay
    id="pm-bom-edit" :open="open && !!bom && !!cur" wide
    :title="locked ? t('Publish new version') : t('Edit BOM')"
    :subtitle="bom && cur ? `${bom.name} · v${cur.version}${locked ? ` → v${nextVersion}` : ''}` : ''"
    @close="emit('close')"
  >
    <template v-if="bom && cur">
      <MpBanner v-if="blocker" id="pm-bom-edit-blocked" variant="warning">
        <MpBannerIcon />
        <MpBannerTitle>{{ blocker.no }} {{ t('is still open on this BOM') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('One engineering change at a time — you can edit again once the PM has decided it.') }}
          <span class="pm-link" role="link" tabindex="0" @click="router.push(ecoPath(blocker))" @keydown.enter="router.push(ecoPath(blocker))">{{ t('View') }} {{ blocker.no }}</span>
        </MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="locked" id="pm-bom-edit-publish" variant="warning" data-devchange="eco-publish-version">
        <MpBannerIcon />
        <MpBannerTitle>v{{ cur.version }} {{ t('is locked by') }} {{ refs.length }} {{ t('work order(s)') }}</MpBannerTitle>
        <MpBannerDescription>{{ t('Saving publishes') }} v{{ nextVersion }} {{ t('and makes it Active now — every work order created afterwards uses it. An engineering change goes to the PM to decide whether existing work orders adopt it.') }}</MpBannerDescription>
      </MpBanner>
      <MpBanner v-else id="pm-bom-edit-inplace" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>{{ t('No work order uses') }} v{{ cur.version }} {{ t('yet, so this edit saves in place — no new version and no engineering change.') }}</MpBannerDescription>
      </MpBanner>

      <div class="pm-grid-2">
        <MpFormControl v-if="locked" id="pm-bom-edit-reason-fc" is-required :is-invalid="form.touched && !!errors.reason">
          <MpFormLabel>{{ t('Reason code') }}</MpFormLabel>
          <ErpFilterSelect id="pm-bom-edit-reason" v-model="form.reason" :placeholder="t('Select reason')" :options="reasonOptions" width="100%" :is-clearable="false" />
          <MpFormErrorMessage>{{ errors.reason }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl v-if="locked && form.reason === 'customer_request'" id="pm-bom-edit-addendum-fc">
          <MpFormLabel>{{ t('SO addendum') }}</MpFormLabel>
          <ErpFilterSelect id="pm-bom-edit-addendum" v-model="form.addendumSoId" :placeholder="t('Select SO addendum')" :options="addendumOptions" width="100%" />
          <MpFormHelpText>{{ t('Existing work orders can’t adopt a customer request without it, unless the PM overrides with a reason.') }}</MpFormHelpText>
        </MpFormControl>
      </div>
      <MpFormControl id="pm-bom-edit-title-fc" is-required :is-invalid="form.touched && !!errors.title">
        <MpFormLabel>{{ t('What changed') }}</MpFormLabel>
        <MpInput id="pm-bom-edit-title" v-model="form.title" />
        <MpFormErrorMessage>{{ errors.title }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl v-if="locked" id="pm-bom-edit-note-fc">
        <MpFormLabel>{{ t('Details') }}</MpFormLabel>
        <MpTextarea id="pm-bom-edit-note" v-model="form.note" />
      </MpFormControl>

      <h3 class="pm-h3">{{ t('Components (per unit)') }}</h3>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Component') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="(c, i) in form.components" :key="i">
              <td><MpInput :id="`pm-bom-edit-name-${i}`" v-model="c.name" :aria-label="t('Component')" /></td>
              <td class="pm-num"><MpInput :id="`pm-bom-edit-qty-${i}`" class="pm-w-narrow" :model-value="numValue(i, 'qty', c)" inputmode="decimal" :aria-label="t('Qty')" @update:model-value="(v: string) => (numDraft[`${i}-qty`] = v)" @blur="commitNum(i, 'qty', c)" /></td>
              <td><MpInput :id="`pm-bom-edit-unit-${i}`" v-model="c.unit" class="pm-w-narrow" :aria-label="t('Unit')" /></td>
              <td class="pm-num"><MpInput :id="`pm-bom-edit-cost-${i}`" class="pm-w-cell" :model-value="numValue(i, 'unitCost', c)" inputmode="numeric" :aria-label="t('Standard cost')" @update:model-value="(v: string) => (numDraft[`${i}-unitCost`] = v)" @blur="commitNum(i, 'unitCost', c)" /></td>
              <td><MpButton :id="`pm-bom-edit-remove-${i}`" variant="ghost" is-rounded :aria-label="t('Remove component')" left-icon="minus-circular" @click="removeComponent(i)" /></td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="5"><MpButton id="pm-bom-edit-add" variant="ghost" is-rounded left-icon="add" @click="addComponent">{{ t('Component') }}</MpButton></td></tr></tfoot>
        </table>
      </div>
      <p class="pm-caption pm-m-0">{{ t('Leave the standard cost empty when a component has none — it shows as Δ n/a, never as zero.') }}</p>

      <h3 class="pm-h3">{{ t('Diff against') }} v{{ cur.version }}</h3>
      <EcoDiff :bom-id="bom.id" :base-version="cur.version" :proposed="{ components: form.components.filter(c => c.name.trim()), productionCost: form.productionCost }" />
      <PmActionError id="pm-bom-edit-error" :error="action.error.value" />
    </template>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
      <MpButton id="pm-bom-edit-save" variant="primary" is-rounded @click="save">{{ primaryLabel }}</MpButton>
    </template>
  </PmOverlay>
</template>
