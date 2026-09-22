<script setup lang="ts">
/**
 * Changes — commercial & engineering (PRD §8; Stories 11, 12, 17).
 *
 * Commercial change order (VO): reason required; distinct / not-distinct under
 * PSAK 72 (default not distinct → one-time cumulative catch-up this period);
 * PM prices and raises, Finance approves — two distinct acts. Executed without
 * sign-off = unbilled exposure. A VO never changes the recognition method.
 *
 * Engineering change (ECO): edit a proposed version of the custom BOM, see the
 * diff with per-line and total cost delta, choose the effectivity scope
 * explicitly (never defaulted), optionally reference the customer-funded VO,
 * submit to the Approvals inbox. ECOs on one BOM are serialised.
 */
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpRadio, MpCheckbox, MpTextlink,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import EcoDiff from '../EcoDiff.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage, nodeLabel } from '~/data/projects'
import { projectChangeOrders, projectEcos, coExposure, engineeringChanges, persistChanges, type EcoEffectivity } from '~/data/projectChanges'
import { projectWorkOrders } from '~/data/projectTransactions'
import { getCustomBom, currentVersion, type BomComponent } from '~/data/projectBoms'
import { percentComplete, recognisedToDate } from '~/data/projectRecognition'
import { createOfficeVo, raiseVo, createEco, submitEco, effectivityText, ecoDeltaUnits } from '~/data/projectActions'
import { rp, rpSigned, pct, parseAmount, parseQty } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor, role } = useProjectRole()
const ecoSectionAction = useProjectAction()
const raiseAction = useProjectAction()
const newEcoAction = useProjectAction()
const editorAction = useProjectAction()

const open = computed(() => props.project.status !== 'closed')
const vos = computed(() => projectChangeOrders(props.project.id))
const ecos = computed(() => projectEcos(props.project.id))
const exposure = computed(() => coExposure(props.project.id))
const wps = computed(() => projectWorkPackages(props.project.id))

const wpOptions = computed(() => wps.value.map(w => ({ value: w.id, label: w.auto ? props.project.name : `${w.code} ${w.name}` })))
const voOptions = computed(() => vos.value.map(v => ({ value: v.id, label: `${v.no} · ${v.title}` })))

// ── New office VO ──
const newVo = reactive({ open: false, title: '', description: '', wpId: '', requestedBy: '', touched: false })
function openNewVo() { Object.assign(newVo, { open: true, title: '', description: '', wpId: wps.value[0]?.id ?? '', requestedBy: props.project.customer, touched: false }) }
function saveNewVo() {
  newVo.touched = true
  if (!newVo.title.trim() || !newVo.wpId || !newVo.requestedBy.trim()) return
  const res = createOfficeVo({ projectId: props.project.id, wpId: newVo.wpId, title: newVo.title.trim(), description: newVo.description.trim(), requestedBy: newVo.requestedBy.trim() }, asActor.value)
  newVo.open = false
  if (res.ok && res.id) openRaise(res.id)
}

// ── Price & raise ──
const raise = reactive({ open: false, id: '', cost: '', price: '', distinct: false, reason: '', touched: false })
const raiseVoObj = computed(() => vos.value.find(v => v.id === raise.id))
function openRaise(id: string) {
  const v = changeOrders().find(x => x.id === id)
  raiseAction.clear()
  Object.assign(raise, { open: true, id, cost: v?.cost ? v.cost.toLocaleString('id-ID') : '', price: v?.price ? v.price.toLocaleString('id-ID') : '', distinct: v?.distinct ?? false, reason: v?.reason ?? '', touched: false })
}
function changeOrders() { return projectChangeOrders(props.project.id) }
const raiseMargin = computed(() => parseAmount(raise.price) - parseAmount(raise.cost))
const catchUp = computed(() => {
  const p = props.project
  // Milestone projects get their catch-up on the verified share (explained in the drawer); T&M has none.
  if (raise.distinct || p.method === 'tm' || (p.method === 'output' && p.measure === 'milestone')) return undefined
  const pc = percentComplete(p)
  if (!pc) return undefined
  return Math.round((pc / 100) * (p.contractValue + parseAmount(raise.price))) - recognisedToDate(p.id)
})
function doRaise() {
  raise.touched = true
  if (!raise.reason.trim() || !parseAmount(raise.price)) return
  if (raiseAction.run(raiseVo(raise.id, { cost: parseAmount(raise.cost), price: parseAmount(raise.price), distinct: raise.distinct, reason: raise.reason }, asActor.value))) raise.open = false
}

// ── ECO ──
const bomWps = computed(() => wps.value.filter(w => w.type === 'production' && w.customBomId))
const newEco = reactive({ open: false, wpId: '', title: '', reason: '', voId: '', touched: false })
const bomWpOptions = computed(() => bomWps.value.map(w => ({ value: w.id, label: `${w.code} ${w.name} — ${getCustomBom(w.customBomId)?.name} v${currentVersion(getCustomBom(w.customBomId)!).version}` })))
function openNewEco(wpId?: string) {
  if (!bomWps.value.length) { ecoSectionAction.fail(t('No work package has a custom BOM yet. Attach a BOM on the Structure tab first.')); return }
  ecoSectionAction.clear(); newEcoAction.clear()
  Object.assign(newEco, { open: true, wpId: wpId ?? bomWps.value[0]?.id ?? '', title: '', reason: '', voId: '', touched: false })
}
function saveNewEco() {
  newEco.touched = true
  if (!newEco.title.trim() || !newEco.reason.trim() || !newEco.wpId) return
  const res = createEco({ projectId: props.project.id, wpId: newEco.wpId, title: newEco.title.trim(), reason: newEco.reason.trim(), voId: newEco.voId || undefined }, asActor.value)
  if (!newEcoAction.run(res, t('Draft engineering change created'))) return
  newEco.open = false
  if (res.ok && res.id) openEditor(res.id)
}

const editor = reactive({ open: false, id: '', effectivity: '' as '' | EcoEffectivity, woIds: [] as string[], touched: false })
const eco = computed(() => engineeringChanges.find(e => e.id === editor.id))
const editable = computed(() => eco.value?.status === 'draft')
function openEditor(id: string) {
  const e = engineeringChanges.find(x => x.id === id)
  editorAction.clear()
  Object.assign(editor, { open: true, id, effectivity: e?.effectivity ?? '', woIds: [...(e?.specificWoIds ?? [])], touched: false })
}
const openWos = computed(() => (eco.value ? projectWorkOrders.filter(w => w.wpId === eco.value!.wpId && w.status !== 'Completed') : []))
function addComponent() { eco.value?.proposed.components.push({ name: '', qty: 1, unit: 'Pcs', unitCost: 0 }) }
function removeComponent(i: number) { eco.value?.proposed.components.splice(i, 1); persistChanges() }
// Quantity is a decimal (accepts "1.5" or "1,5"); standard cost is whole rupiah where dots are
// thousand separators ("285.000"). Parsing them the same way turned 1.5 into 15.
function setNum(c: BomComponent, key: 'qty' | 'unitCost', v: string) {
  const n = key === 'qty' ? parseQty(v) : parseAmount(v)
  c[key] = Number.isFinite(n) && n >= 0 ? n : 0
  persistChanges()
}
// Numeric cells edit a draft string and commit on blur, so "1," mid-typing isn't reformatted away.
const numDraft = reactive<Record<string, string>>({})
function numValue(i: number, key: 'qty' | 'unitCost', c: BomComponent) {
  return numDraft[`${i}-${key}`] ?? (key === 'qty' ? String(c.qty).replace('.', ',') : c.unitCost !== undefined ? c.unitCost.toLocaleString('id-ID') : '')
}
function commitNum(i: number, key: 'qty' | 'unitCost', c: BomComponent) {
  const k = `${i}-${key}`
  const d = numDraft[k]
  if (d === undefined) return
  delete numDraft[k]
  setNum(c, key, d)
}
// Same unit count the approval uses for the budget revision (future WOs + WOs in scope).
const remainingUnits = computed(() => (eco.value ? ecoDeltaUnits({ wpId: eco.value.wpId, effectivity: editor.effectivity || undefined, specificWoIds: editor.woIds }) : 0))
const pendingOnBom = computed(() => eco.value ? engineeringChanges.find(x => x.id !== eco.value!.id && x.customBomId === eco.value!.customBomId && x.status === 'pending') : undefined)
function setEffectivity(v: EcoEffectivity) { if (editable.value) editor.effectivity = v }
function toggleWo(id: string) {
  if (!editable.value) return
  editor.woIds = editor.woIds.includes(id) ? editor.woIds.filter(x => x !== id) : [...editor.woIds, id]
}
function doSubmit() {
  editor.touched = true
  if (!eco.value) return
  persistChanges()
  if (editorAction.run(submitEco(eco.value.id, editor.effectivity || undefined, editor.woIds, asActor.value))) editor.open = false
}
</script>

<template>
  <div class="pm-stack pm-gap-5">
    <!-- ── Commercial ── -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Change orders') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Scope changes the customer asked for. Priced and raised by the PM, approved by Finance — only an approved change order changes contract value.') }}</p>
        </div>
        <div v-if="open" class="pm-row">
          <MpButton id="pm-capture-site" variant="secondary" is-rounded @click="router.push(`/site-change-capture?project=${project.id}`)">{{ t('Capture site change') }}</MpButton>
          <MpButton id="pm-new-vo" variant="secondary" is-rounded left-icon="add" @click="openNewVo">{{ t('New change order') }}</MpButton>
        </div>
      </div>
      <MpBanner v-if="exposure" id="pm-vo-exposure" variant="warning" class="pm-mb-3">
        <MpBannerIcon />
        <MpBannerTitle>{{ t('Executed but unbilled') }}: {{ rp(exposure) }}</MpBannerTitle>
        <MpBannerDescription>{{ t('Work was done in the field without sign-off. Price and raise it so it reaches an invoice — the project can’t close while a change order is pending.') }}</MpBannerDescription>
      </MpBanner>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Change') }}</th><th>{{ t('Work package') }}</th><th>{{ t('Status') }}</th><th class="pm-num">{{ t('Price') }}</th><th class="pm-num">{{ t('Cost') }}</th><th class="pm-num">{{ t('Margin') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="v in vos" :key="v.id">
              <td>{{ v.no }}<span class="pm-cell-sub">{{ formatDate(v.createdAt) }}</span></td>
              <td class="pm-wrap">
                {{ v.title }}
                <span class="pm-cell-sub">{{ v.source === 'site' ? t('Site capture') : t('Office') }} · {{ t('requested by') }} {{ v.requestedBy }}<template v-if="v.photoCount"> · {{ v.photoCount }} {{ t('photos') }}</template></span>
                <ErpStatusBadge v-if="v.executed && v.status !== 'approved'" v-bind="badgeProps('flag', 'executed', t)" />
              </td>
              <td>{{ nodeLabel(v.wpId).split(' · ').slice(1).join(' · ') }}</td>
              <td>
                <ErpStatusBadge v-bind="badgeProps('vo', v.status, t)" />
                <span class="pm-cell-sub">{{ v.distinct ? t('Distinct') : t('Not distinct') }}<template v-if="v.catchUp"> · {{ t('catch-up') }} {{ rpSigned(v.catchUp) }}</template></span>
              </td>
              <td class="pm-num">{{ v.price ? rp(v.price) : '—' }}</td>
              <td class="pm-num">{{ v.cost ? rp(v.cost) : '—' }}</td>
              <td class="pm-num">{{ v.price && v.cost !== undefined ? rp(v.price - v.cost) : '—' }}</td>
              <td>
                <MpTextlink v-if="open && (v.status === 'requested' || v.status === 'priced')" :id="`pm-raise-${v.id}`" as="a" @click.prevent="openRaise(v.id)">{{ t('Price & raise') }}</MpTextlink>
                <MpTextlink v-else-if="v.status === 'raised'" :id="`pm-vo-inbox-${v.id}`" as="a" @click.prevent="router.push('/project-approvals')">{{ t('In Approvals') }}</MpTextlink>
              </td>
            </tr>
            <tr v-if="!vos.length"><td colspan="8"><div class="pm-empty-inline">{{ t('No change orders.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Engineering ── -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Engineering changes') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Versioned BOM changes with a diff and an explicit effectivity scope, so a mid-execution change can’t silently hit released work orders. An ECO never changes contract value — reference a change order when the customer pays.') }}</p>
        </div>
        <MpButton v-if="open && project.isProduction" id="pm-new-eco" variant="secondary" is-rounded left-icon="add" @click="openNewEco()">{{ t('New engineering change') }}</MpButton>
      </div>
      <PmActionError id="pm-eco-section-error" :error="ecoSectionAction.error.value" class="pm-mb-3" />
      <div v-if="!project.isProduction" class="pm-muted">{{ t('Service projects have no BOM, so engineering changes don’t apply.') }}</div>
      <div v-else class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Change') }}</th><th>{{ t('Custom BOM') }}</th><th>{{ t('Versions') }}</th><th>{{ t('Effectivity') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="e in ecos" :key="e.id">
              <td>{{ e.no }}<span class="pm-cell-sub">{{ e.raisedBy }} · {{ formatDate(e.createdAt) }}</span></td>
              <td class="pm-wrap">{{ e.title }}<span class="pm-cell-sub">{{ e.reason }}</span></td>
              <td>{{ getCustomBom(e.customBomId)?.name }}<span class="pm-cell-sub">{{ getWorkPackage(e.wpId)?.code }} {{ getWorkPackage(e.wpId)?.name }}</span></td>
              <td>v{{ e.baseVersion }} → {{ e.resultVersion ? `v${e.resultVersion}` : t('(proposed)') }}</td>
              <td>{{ t(effectivityText(e.effectivity, e.specificWoIds)) }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('eco', e.status, t)" /><span v-if="e.voId" class="pm-cell-sub">{{ vos.find(v => v.id === e.voId)?.no }}</span></td>
              <td><MpTextlink :id="`pm-eco-open-${e.id}`" as="a" @click.prevent="openEditor(e.id)">{{ e.status === 'draft' ? t('Edit') : t('View diff') }}</MpTextlink></td>
            </tr>
            <tr v-if="!ecos.length"><td colspan="7"><div class="pm-empty-inline">{{ t('No engineering changes.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- New office VO -->
    <PmOverlay id="pm-new-vo-drawer" :open="newVo.open" :title="t('New change order')" :subtitle="project.code" @close="newVo.open = false">
      <MpFormControl id="vo-t-fc" is-required :is-invalid="newVo.touched && !newVo.title.trim()">
        <MpFormLabel>{{ t('What changed') }}</MpFormLabel>
        <MpInput id="vo-t" v-model="newVo.title" />
        <MpFormErrorMessage>{{ t('Describe what changed.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="vo-d-fc">
        <MpFormLabel>{{ t('Details') }}</MpFormLabel>
        <MpTextarea id="vo-d" v-model="newVo.description" />
      </MpFormControl>
      <MpFormControl id="vo-w-fc" is-required :is-invalid="newVo.touched && !newVo.wpId">
        <MpFormLabel>{{ t('Work package') }}</MpFormLabel>
        <ErpFilterSelect id="vo-w" v-model="newVo.wpId" :placeholder="t('Select work package')" :options="wpOptions" width="100%" :is-clearable="false" />
        <MpFormErrorMessage>{{ t('Select a work package.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="vo-r-fc" is-required :is-invalid="newVo.touched && !newVo.requestedBy.trim()">
        <MpFormLabel>{{ t('Requested by') }}</MpFormLabel>
        <MpInput id="vo-r" v-model="newVo.requestedBy" />
        <MpFormErrorMessage>{{ t('Enter who requested the change.') }}</MpFormErrorMessage>
      </MpFormControl>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="newVo.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="saveNewVo">{{ t('Continue to pricing') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Price & raise -->
    <PmOverlay id="pm-raise-drawer" :open="raise.open" :title="t('Price & raise change order')" :subtitle="raiseVoObj ? `${raiseVoObj.no} · ${raiseVoObj.title}` : ''" @close="raise.open = false">
      <MpBanner v-if="role !== 'pm'" id="pm-raise-role" variant="info">
        <MpBannerIcon /><MpBannerDescription>{{ t('The PM normally raises change orders; Finance approves them in the inbox.') }}</MpBannerDescription>
      </MpBanner>
      <div class="pm-grid-2">
        <MpFormControl id="r-c-fc">
          <MpFormLabel>{{ t('Cost') }}</MpFormLabel>
          <MpInputGroup id="r-c-group">
            <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
            <MpInput id="r-c" v-model="raise.cost" inputmode="numeric" @blur="raise.cost = parseAmount(raise.cost) ? parseAmount(raise.cost).toLocaleString('id-ID') : ''" />
          </MpInputGroup>
        </MpFormControl>
        <MpFormControl id="r-p-fc" is-required :is-invalid="raise.touched && !parseAmount(raise.price)">
          <MpFormLabel>{{ t('Customer price') }}</MpFormLabel>
          <MpInputGroup id="r-p-group">
            <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
            <MpInput id="r-p" v-model="raise.price" inputmode="numeric" @blur="raise.price = parseAmount(raise.price) ? parseAmount(raise.price).toLocaleString('id-ID') : ''" />
          </MpInputGroup>
          <MpFormErrorMessage>{{ t('Enter the customer price.') }}</MpFormErrorMessage>
        </MpFormControl>
      </div>
      <div class="pm-card pm-card--flat pm-grid-3">
        <div><div class="pm-stat-label">{{ t('Margin') }}</div><div class="pm-body" :class="raiseMargin < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(raiseMargin) }}<template v-if="parseAmount(raise.price)"> ({{ pct(raiseMargin / parseAmount(raise.price) * 100) }})</template></div></div>
        <div><div class="pm-stat-label">{{ t('New contract value') }}</div><div class="pm-body">{{ rp(project.contractValue + parseAmount(raise.price)) }}</div></div>
        <div><div class="pm-stat-label">{{ t('Recognition method') }}</div><div class="pm-body">{{ t('Unchanged — a change order can’t change it') }}</div></div>
      </div>
      <MpFormControl id="r-distinct-fc">
        <MpFormLabel>{{ t('PSAK 72 treatment') }}</MpFormLabel>
        <div class="pm-stack pm-gap-2">
          <label class="pm-choice" :class="{ 'pm-choice--active': !raise.distinct }">
            <MpRadio id="r-distinct-no" name="r-distinct" :is-checked="!raise.distinct" @change="raise.distinct = false">
              <span class="pm-choice-title">{{ t('Not distinct (default)') }}</span>
              <template #description>{{ t('Part of the same performance obligation — a one-time cumulative catch-up in the current period, never a retrospective restatement.') }}</template>
            </MpRadio>
          </label>
          <label class="pm-choice" :class="{ 'pm-choice--active': raise.distinct }">
            <MpRadio id="r-distinct-yes" name="r-distinct" :is-checked="raise.distinct" @change="raise.distinct = true">
              <span class="pm-choice-title">{{ t('Distinct') }}</span>
              <template #description>{{ t('A separate obligation — treated prospectively.') }}</template>
            </MpRadio>
          </label>
        </div>
      </MpFormControl>
      <p v-if="!raise.distinct" class="pm-caption pm-m-0">
        <template v-if="project.method === 'output' && project.measure === 'milestone'">{{ t('On approval: verified phases are never reopened, a catch-up is posted for the verified share at the new value, and the unverified weights must be reconfirmed to 100% before more verification.') }}</template>
        <template v-else-if="catchUp !== undefined">{{ t('Catch-up this period if approved') }}: <strong>{{ rpSigned(catchUp) }}</strong> ({{ pct(percentComplete(project)) }} × {{ t('new contract value') }} − {{ t('recognised to date') }})</template>
        <template v-else>{{ t('No catch-up — nothing recognised on a % basis yet.') }}</template>
      </p>
      <MpFormControl id="r-r-fc" is-required :is-invalid="raise.touched && !raise.reason.trim()">
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpTextarea id="r-r" v-model="raise.reason" />
        <MpFormErrorMessage>{{ t('A reason is required.') }}</MpFormErrorMessage>
      </MpFormControl>
      <PmActionError id="pm-raise-error" :error="raiseAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="raise.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doRaise">{{ t('Raise for Finance approval') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- New ECO -->
    <PmOverlay id="pm-new-eco-drawer" :open="newEco.open" :title="t('New engineering change')" :subtitle="project.code" @close="newEco.open = false">
      <MpFormControl id="ne-w-fc" is-required :is-invalid="newEco.touched && !newEco.wpId">
        <MpFormLabel>{{ t('Work package') }}</MpFormLabel>
        <ErpFilterSelect id="ne-w" v-model="newEco.wpId" :placeholder="t('Select work package')" :options="bomWpOptions" width="100%" :is-clearable="false" />
        <MpFormErrorMessage>{{ t('Select a work package.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="ne-t-fc" is-required :is-invalid="newEco.touched && !newEco.title.trim()">
        <MpFormLabel>{{ t('Title') }}</MpFormLabel>
        <MpInput id="ne-t" v-model="newEco.title" />
        <MpFormErrorMessage>{{ t('Enter a title.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="ne-r-fc" is-required :is-invalid="newEco.touched && !newEco.reason.trim()">
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpTextarea id="ne-r" v-model="newEco.reason" />
        <MpFormErrorMessage>{{ t('A reason is required.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="ne-v-fc">
        <MpFormLabel>{{ t('Customer-funded — change order') }}</MpFormLabel>
        <ErpFilterSelect id="ne-v" v-model="newEco.voId" :placeholder="t('Not customer-funded')" :options="voOptions" width="100%" />
        <MpFormHelpText>{{ t('Only a change order can change contract value.') }}</MpFormHelpText>
      </MpFormControl>
      <PmActionError id="pm-new-eco-error" :error="newEcoAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="newEco.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="saveNewEco">{{ t('Create draft and edit BOM') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- ECO editor -->
    <PmOverlay id="pm-eco-editor" :open="editor.open && !!eco" :title="eco ? `${eco.no} · ${eco.title}` : ''" :subtitle="eco ? `${getCustomBom(eco.customBomId)?.name} · ${t('based on')} v${eco.baseVersion}` : ''" wide @close="editor.open = false">
      <template v-if="eco">
        <MpBanner v-if="pendingOnBom && editable" id="pm-eco-serialised" variant="warning">
          <MpBannerIcon /><MpBannerDescription>{{ pendingOnBom.no }} {{ t('is already pending on this BOM. ECOs on one BOM are serialised — you can edit, but submitting waits until it’s decided.') }}</MpBannerDescription>
        </MpBanner>
        <template v-if="editable">
          <h3 class="pm-h3">{{ t('Proposed components (per unit)') }}</h3>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Component') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th /></tr></thead>
              <tbody>
                <tr v-for="(c, i) in eco.proposed.components" :key="i">
                  <td><MpInput :id="`eco-c-name-${i}`" v-model="c.name" :aria-label="t('Component')" @blur="persistChanges()" /></td>
                  <td class="pm-num"><MpInput :id="`eco-c-qty-${i}`" class="pm-w-narrow" :model-value="numValue(i, 'qty', c)" inputmode="decimal" :aria-label="t('Qty')" @update:model-value="(v: string) => (numDraft[`${i}-qty`] = v)" @blur="commitNum(i, 'qty', c)" /></td>
                  <td><MpInput :id="`eco-c-unit-${i}`" class="pm-w-narrow" v-model="c.unit" :aria-label="t('Unit')" @blur="persistChanges()" /></td>
                  <td class="pm-num"><MpInput :id="`eco-c-cost-${i}`" class="pm-w-cell" :model-value="numValue(i, 'unitCost', c)" inputmode="numeric" :aria-label="t('Standard cost')" @update:model-value="(v: string) => (numDraft[`${i}-unitCost`] = v)" @blur="commitNum(i, 'unitCost', c)" /></td>
                  <td><MpButton :id="`eco-c-remove-${i}`" variant="ghost" is-rounded :aria-label="t('Remove component')" @click="removeComponent(i)" left-icon="minus-circular" /></td>
                </tr>
              </tbody>
              <tfoot><tr><td colspan="5"><MpButton id="eco-add-component" variant="ghost" is-rounded left-icon="add" @click="addComponent">{{ t('Component') }}</MpButton></td></tr></tfoot>
            </table>
          </div>
        </template>

        <h3 class="pm-h3">{{ t('Diff against') }} v{{ eco.baseVersion }}</h3>
        <EcoDiff :bom-id="eco.customBomId" :base-version="eco.baseVersion" :proposed="eco.proposed" :units="remainingUnits" />

        <MpFormControl id="eco-eff-fc" is-required :is-invalid="editor.touched && !editor.effectivity">
          <MpFormLabel>{{ t('Effectivity — which work orders get this change?') }}</MpFormLabel>
          <MpFormHelpText>{{ t('Required. There is no default — choose explicitly.') }}</MpFormHelpText>
          <div class="pm-stack pm-gap-2 pm-mt-2">
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'new_only', 'pm-choice--disabled': !editable }">
              <MpRadio id="eco-eff-new" name="eco-eff" :is-checked="editor.effectivity === 'new_only'" :is-disabled="!editable" @change="setEffectivity('new_only')">
                <span class="pm-choice-title">{{ t('New work orders only') }}</span>
                <template #description>{{ t('Work orders created after approval use the new version; existing ones stay on') }} v{{ eco.baseVersion }}.</template>
              </MpRadio>
            </label>
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'all_open', 'pm-choice--disabled': !editable }">
              <MpRadio id="eco-eff-all" name="eco-eff" :is-checked="editor.effectivity === 'all_open'" :is-disabled="!editable" @change="setEffectivity('all_open')">
                <span class="pm-choice-title">{{ t('All open work orders') }}</span>
                <template #description>{{ t('Draft and Released work orders switch to the new version (In progress stays — open question 20).') }}</template>
              </MpRadio>
            </label>
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'specific', 'pm-choice--disabled': !editable }">
              <MpRadio id="eco-eff-specific" name="eco-eff" :is-checked="editor.effectivity === 'specific'" :is-disabled="!editable" @change="setEffectivity('specific')">
                <span class="pm-choice-title">{{ t('Specific work orders') }}</span>
                <template #description>{{ t('Pick the work orders below.') }}</template>
              </MpRadio>
            </label>
            <div v-if="editor.effectivity === 'specific'" class="pm-stack pm-gap-1 pm-pl-6">
              <label v-for="w in openWos" :key="w.id" class="pm-check">
                <MpCheckbox :id="`eco-wo-${w.id}`" :is-checked="editor.woIds.includes(w.id)" :is-disabled="!editable" @change="toggleWo(w.id)" />
                <span>{{ w.number }} · {{ t(w.status) }} · {{ w.qty }} {{ w.unit }}</span>
              </label>
              <span v-if="!openWos.length" class="pm-caption">{{ t('No open work orders on this work package.') }}</span>
            </div>
          </div>
          <MpFormErrorMessage>{{ t('Choose which work orders this change applies to before submitting.') }}</MpFormErrorMessage>
        </MpFormControl>
        <p class="pm-caption pm-m-0">{{ t('On approval the cost delta raises a budget revision in Budget setup, and reservations adjust.') }}</p>
        <PmActionError id="pm-eco-editor-error" :error="editorAction.error.value" />
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="editor.open = false">{{ editable ? t('Save draft') : t('Close') }}</MpButton>
        <MpButton v-if="editable" variant="primary" is-rounded @click="doSubmit">{{ t('Submit for approval') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
</template>
