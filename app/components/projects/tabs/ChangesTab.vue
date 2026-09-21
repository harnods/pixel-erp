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
import PmOverlay from '../PmOverlay.vue'
import EcoDiff from '../EcoDiff.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage, nodeLabel } from '~/data/projects'
import { projectChangeOrders, projectEcos, coExposure, engineeringChanges, persistChanges, type ChangeOrder, type EngineeringChange, type EcoEffectivity } from '~/data/projectChanges'
import { projectWorkOrders } from '~/data/projectTransactions'
import { getCustomBom, currentVersion, type BomComponent } from '~/data/projectBoms'
import { percentComplete, recognisedToDate } from '~/data/projectRecognition'
import { createOfficeVo, raiseVo, createEco, submitEco, effectivityText } from '~/data/projectActions'
import { rp, rpSigned, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor, isPm, role } = useProjectRole()

const open = computed(() => props.project.status !== 'closed')
const vos = computed(() => projectChangeOrders(props.project.id))
const ecos = computed(() => projectEcos(props.project.id))
const exposure = computed(() => coExposure(props.project.id))
const wps = computed(() => projectWorkPackages(props.project.id))

const VO_TONE: Record<ChangeOrder['status'], string> = { requested: 'pm-pill--gray', priced: 'pm-pill--gray', raised: 'pm-pill--yellow', approved: 'pm-pill--green', rejected: 'pm-pill--red' }
const VO_LABEL: Record<ChangeOrder['status'], string> = { requested: 'Requested', priced: 'Priced', raised: 'Awaiting Finance', approved: 'Approved', rejected: 'Rejected' }
const ECO_TONE: Record<EngineeringChange['status'], string> = { draft: 'pm-pill--gray', pending: 'pm-pill--yellow', approved: 'pm-pill--green', rejected: 'pm-pill--red' }
const ECO_LABEL: Record<EngineeringChange['status'], string> = { draft: 'Draft', pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' }

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
  if (notifyResult(raiseVo(raise.id, { cost: parseAmount(raise.cost), price: parseAmount(raise.price), distinct: raise.distinct, reason: raise.reason }, asActor.value))) raise.open = false
}

// ── ECO ──
const bomWps = computed(() => wps.value.filter(w => w.type === 'production' && w.customBomId))
const newEco = reactive({ open: false, wpId: '', title: '', reason: '', voId: '', touched: false })
function openNewEco(wpId?: string) { Object.assign(newEco, { open: true, wpId: wpId ?? bomWps.value[0]?.id ?? '', title: '', reason: '', voId: '', touched: false }) }
function saveNewEco() {
  newEco.touched = true
  if (!newEco.title.trim() || !newEco.reason.trim() || !newEco.wpId) return
  const res = createEco({ projectId: props.project.id, wpId: newEco.wpId, title: newEco.title.trim(), reason: newEco.reason.trim(), voId: newEco.voId || undefined }, asActor.value)
  if (!notifyResult(res, t('Draft engineering change created'))) return
  newEco.open = false
  if (res.ok && res.id) openEditor(res.id)
}

const editor = reactive({ open: false, id: '', effectivity: '' as '' | EcoEffectivity, woIds: [] as string[], touched: false })
const eco = computed(() => engineeringChanges.find(e => e.id === editor.id))
const editable = computed(() => eco.value?.status === 'draft')
function openEditor(id: string) {
  const e = engineeringChanges.find(x => x.id === id)
  Object.assign(editor, { open: true, id, effectivity: e?.effectivity ?? '', woIds: [...(e?.specificWoIds ?? [])], touched: false })
}
const openWos = computed(() => (eco.value ? projectWorkOrders.filter(w => w.wpId === eco.value!.wpId && w.status !== 'Completed') : []))
function addComponent() { eco.value?.proposed.components.push({ name: '', qty: 1, unit: 'Pcs', unitCost: 0 }) }
function removeComponent(i: number) { eco.value?.proposed.components.splice(i, 1); persistChanges() }
function setNum(c: BomComponent, key: 'qty' | 'unitCost', v: string) { const n = Number(v.replace(/\./g, '').replace(',', '.')); c[key] = Number.isNaN(n) ? 0 : n; persistChanges() }
const remainingUnits = computed(() => {
  const w = eco.value ? getWorkPackage(eco.value.wpId) : undefined
  return Math.max((w?.plannedUnits ?? 0) - (w?.confirmedUnits ?? 0), 0)
})
const pendingOnBom = computed(() => eco.value ? engineeringChanges.find(x => x.id !== eco.value!.id && x.customBomId === eco.value!.customBomId && x.status === 'pending') : undefined)
function doSubmit() {
  editor.touched = true
  if (!eco.value) return
  persistChanges()
  if (notifyResult(submitEco(eco.value.id, editor.effectivity || undefined, editor.woIds, asActor.value))) editor.open = false
}
</script>

<template>
  <div class="pm-stack" style="gap: 20px">
    <!-- ── Commercial ── -->
    <section class="pm-section" style="padding-top: 0">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Change orders') }}</h2>
          <p class="pm-desc">{{ t('Scope changes the customer asked for. Priced and raised by the PM, approved by Finance — only an approved change order changes contract value.') }}</p>
        </div>
        <div class="pm-row">
          <button v-if="open" class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push(`/site-change-capture?project=${project.id}`)">{{ t('Capture site change') }}</button>
          <button v-if="open" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="openNewVo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            {{ t('Change order') }}
          </button>
        </div>
      </div>
      <div v-if="exposure" class="pm-banner pm-banner--warn" style="margin-bottom: 12px">
        <div class="pm-banner-body">
          <div class="pm-banner-title">{{ t('Executed but unbilled') }}: {{ rp(exposure) }}</div>
          {{ t('Work was done in the field without sign-off. Price and raise it so it reaches an invoice — the project can’t close while a change order is pending.') }}
        </div>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Change') }}</th><th>{{ t('Work package') }}</th><th>{{ t('Status') }}</th><th class="pm-num">{{ t('Price') }}</th><th class="pm-num">{{ t('Cost') }}</th><th class="pm-num">{{ t('Margin') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="v in vos" :key="v.id">
              <td>{{ v.no }}<span class="pm-cell-sub">{{ formatDate(v.createdAt) }}</span></td>
              <td class="pm-wrap">
                {{ v.title }}
                <span class="pm-cell-sub">{{ v.source === 'site' ? t('Site capture') : t('Office') }} · {{ t('requested by') }} {{ v.requestedBy }}<template v-if="v.photoCount"> · {{ v.photoCount }} {{ t('photos') }}</template></span>
                <span v-if="v.executed && v.status !== 'approved'" class="pm-pill pm-pill--red" style="margin-top: 4px">{{ t('Executed — not signed off') }}</span>
              </td>
              <td>{{ nodeLabel(v.wpId).split(' · ').slice(1).join(' · ') }}</td>
              <td>
                <span class="pm-pill" :class="VO_TONE[v.status]">{{ t(VO_LABEL[v.status]) }}</span>
                <span class="pm-cell-sub">{{ v.distinct ? t('Distinct') : t('Not distinct') }}<template v-if="v.catchUp"> · {{ t('catch-up') }} {{ rpSigned(v.catchUp) }}</template></span>
              </td>
              <td class="pm-num">{{ v.price ? rp(v.price) : '—' }}</td>
              <td class="pm-num">{{ v.cost ? rp(v.cost) : '—' }}</td>
              <td class="pm-num">{{ v.price && v.cost !== undefined ? rp(v.price - v.cost) : '—' }}</td>
              <td>
                <button v-if="open && (v.status === 'requested' || v.status === 'priced')" class="pm-link" type="button" :title="!isPm ? t('The PM prices and raises change orders') : ''" @click="openRaise(v.id)">{{ t('Price & raise') }}</button>
                <button v-else-if="v.status === 'raised'" class="pm-link" type="button" @click="router.push('/project-approvals')">{{ t('In Approvals') }}</button>
              </td>
            </tr>
            <tr v-if="!vos.length"><td colspan="8"><div class="pm-empty">{{ t('No change orders.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Engineering ── -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Engineering changes') }}</h2>
          <p class="pm-desc">{{ t('Versioned BOM changes with a diff and an explicit effectivity scope, so a mid-execution change can’t silently hit released work orders. An ECO never changes contract value — reference a change order when the customer pays.') }}</p>
        </div>
        <button v-if="open && project.isProduction" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" :disabled="!bomWps.length" :title="!bomWps.length ? t('No work package has a custom BOM yet') : ''" @click="openNewEco()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          {{ t('Engineering change') }}
        </button>
      </div>
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
              <td><span class="pm-pill" :class="ECO_TONE[e.status]">{{ t(ECO_LABEL[e.status]) }}</span><span v-if="e.voId" class="pm-cell-sub">{{ vos.find(v => v.id === e.voId)?.no }}</span></td>
              <td><button class="pm-link" type="button" @click="openEditor(e.id)">{{ e.status === 'draft' ? t('Edit') : t('View diff') }}</button></td>
            </tr>
            <tr v-if="!ecos.length"><td colspan="7"><div class="pm-empty">{{ t('No engineering changes.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- New office VO -->
    <PmOverlay :open="newVo.open" :title="t('Change order')" :subtitle="project.code" @close="newVo.open = false">
      <div class="pm-field"><label class="pm-label pm-label-req" for="vo-t">{{ t('What changed') }}</label><input id="vo-t" v-model="newVo.title" class="pm-input" :aria-invalid="newVo.touched && !newVo.title.trim()" /></div>
      <div class="pm-field"><label class="pm-label" for="vo-d">{{ t('Details') }}</label><textarea id="vo-d" v-model="newVo.description" class="pm-textarea" /></div>
      <div class="pm-field"><label class="pm-label pm-label-req" for="vo-w">{{ t('Work package') }}</label><select id="vo-w" v-model="newVo.wpId" class="pm-select"><option v-for="w in wps" :key="w.id" :value="w.id">{{ w.auto ? project.name : `${w.code} ${w.name}` }}</option></select></div>
      <div class="pm-field"><label class="pm-label pm-label-req" for="vo-r">{{ t('Requested by') }}</label><input id="vo-r" v-model="newVo.requestedBy" class="pm-input" /></div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="newVo.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="saveNewVo">{{ t('Continue to pricing') }}</button>
      </template>
    </PmOverlay>

    <!-- Price & raise -->
    <PmOverlay :open="raise.open" :title="t('Price & raise change order')" :subtitle="raiseVoObj ? `${raiseVoObj.no} · ${raiseVoObj.title}` : ''" @close="raise.open = false">
      <div v-if="role !== 'pm'" class="pm-banner pm-banner--neutral"><div class="pm-banner-body">{{ t('The PM normally raises change orders; Finance approves them in the inbox.') }}</div></div>
      <div class="pm-grid-2">
        <div class="pm-field"><label class="pm-label" for="r-c">{{ t('Cost') }}</label><div class="pm-input-group"><span class="pm-addon">Rp</span><input id="r-c" v-model="raise.cost" class="pm-input pm-input--num" inputmode="numeric" @blur="raise.cost = parseAmount(raise.cost) ? parseAmount(raise.cost).toLocaleString('id-ID') : ''" /></div></div>
        <div class="pm-field"><label class="pm-label pm-label-req" for="r-p">{{ t('Customer price') }}</label><div class="pm-input-group"><span class="pm-addon">Rp</span><input id="r-p" v-model="raise.price" class="pm-input pm-input--num" inputmode="numeric" :aria-invalid="raise.touched && !parseAmount(raise.price)" @blur="raise.price = parseAmount(raise.price) ? parseAmount(raise.price).toLocaleString('id-ID') : ''" /></div></div>
      </div>
      <div class="pm-card pm-card--flat">
        <div class="pm-kv" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
          <div><div class="pm-kv-label">{{ t('Margin') }}</div><div class="pm-kv-value" :class="raiseMargin < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(raiseMargin) }}<template v-if="parseAmount(raise.price)"> ({{ pct(raiseMargin / parseAmount(raise.price) * 100) }})</template></div></div>
          <div><div class="pm-kv-label">{{ t('New contract value') }}</div><div class="pm-kv-value">{{ rp(project.contractValue + parseAmount(raise.price)) }}</div></div>
          <div><div class="pm-kv-label">{{ t('Recognition method') }}</div><div class="pm-kv-value">{{ t('Unchanged — a change order can’t change it') }}</div></div>
        </div>
      </div>
      <div class="pm-field">
        <span class="pm-label">{{ t('PSAK 72 treatment') }}</span>
        <label class="pm-choice" :class="{ 'pm-choice--active': !raise.distinct }"><input v-model="raise.distinct" type="radio" :value="false" /><div><div class="pm-choice-title">{{ t('Not distinct (default)') }}</div><div class="pm-choice-desc">{{ t('Part of the same performance obligation — a one-time cumulative catch-up in the current period, never a retrospective restatement.') }}</div></div></label>
        <label class="pm-choice" :class="{ 'pm-choice--active': raise.distinct }"><input v-model="raise.distinct" type="radio" :value="true" /><div><div class="pm-choice-title">{{ t('Distinct') }}</div><div class="pm-choice-desc">{{ t('A separate obligation — treated prospectively.') }}</div></div></label>
      </div>
      <div v-if="!raise.distinct" class="pm-small pm-muted">
        <template v-if="project.method === 'output' && project.measure === 'milestone'">{{ t('On approval: verified phases are never reopened, a catch-up is posted for the verified share at the new value, and the unverified weights must be reconfirmed to 100% before more verification.') }}</template>
        <template v-else-if="catchUp !== undefined">{{ t('Catch-up this period if approved') }}: <strong>{{ rpSigned(catchUp) }}</strong> ({{ pct(percentComplete(project)) }} × {{ t('new contract value') }} − {{ t('recognised to date') }})</template>
        <template v-else>{{ t('No catch-up — nothing recognised on a % basis yet.') }}</template>
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="r-r">{{ t('Reason') }}</label>
        <textarea id="r-r" v-model="raise.reason" class="pm-textarea" :aria-invalid="raise.touched && !raise.reason.trim()" />
        <span v-if="raise.touched && !raise.reason.trim()" class="pm-error">{{ t('A reason is required.') }}</span>
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="raise.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doRaise">{{ t('Raise for Finance approval') }}</button>
      </template>
    </PmOverlay>

    <!-- New ECO -->
    <PmOverlay :open="newEco.open" :title="t('Engineering change')" :subtitle="project.code" @close="newEco.open = false">
      <div class="pm-field"><label class="pm-label pm-label-req" for="ne-w">{{ t('Work package') }}</label><select id="ne-w" v-model="newEco.wpId" class="pm-select"><option v-for="w in bomWps" :key="w.id" :value="w.id">{{ w.code }} {{ w.name }} — {{ getCustomBom(w.customBomId)?.name }} v{{ currentVersion(getCustomBom(w.customBomId)!).version }}</option></select></div>
      <div class="pm-field"><label class="pm-label pm-label-req" for="ne-t">{{ t('Title') }}</label><input id="ne-t" v-model="newEco.title" class="pm-input" :aria-invalid="newEco.touched && !newEco.title.trim()" /></div>
      <div class="pm-field"><label class="pm-label pm-label-req" for="ne-r">{{ t('Reason') }}</label><textarea id="ne-r" v-model="newEco.reason" class="pm-textarea" :aria-invalid="newEco.touched && !newEco.reason.trim()" /></div>
      <div class="pm-field">
        <label class="pm-label" for="ne-v">{{ t('Customer-funded — change order') }}</label>
        <select id="ne-v" v-model="newEco.voId" class="pm-select"><option value="">{{ t('Not customer-funded') }}</option><option v-for="v in vos" :key="v.id" :value="v.id">{{ v.no }} · {{ v.title }}</option></select>
        <span class="pm-help">{{ t('Only a change order can change contract value.') }}</span>
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="newEco.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="saveNewEco">{{ t('Create draft and edit BOM') }}</button>
      </template>
    </PmOverlay>

    <!-- ECO editor -->
    <PmOverlay :open="editor.open && !!eco" :title="eco ? `${eco.no} · ${eco.title}` : ''" :subtitle="eco ? `${getCustomBom(eco.customBomId)?.name} · ${t('based on')} v${eco.baseVersion}` : ''" wide @close="editor.open = false">
      <template v-if="eco">
        <div v-if="pendingOnBom && editable" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ pendingOnBom.no }} {{ t('is already pending on this BOM. ECOs on one BOM are serialised — you can edit, but submitting waits until it’s decided.') }}</div></div>
        <template v-if="editable">
          <h3 class="pm-h3">{{ t('Proposed components (per unit)') }}</h3>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Component') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th /></tr></thead>
              <tbody>
                <tr v-for="(c, i) in eco.proposed.components" :key="i">
                  <td><input v-model="c.name" class="pm-input pm-input--sm" @blur="persistChanges()" /></td>
                  <td class="pm-num"><input :value="c.qty" class="pm-input pm-input--sm pm-input--num" style="width: 90px" inputmode="decimal" @change="setNum(c, 'qty', ($event.target as HTMLInputElement).value)" /></td>
                  <td><input v-model="c.unit" class="pm-input pm-input--sm" style="width: 90px" @blur="persistChanges()" /></td>
                  <td class="pm-num"><input :value="c.unitCost ?? ''" class="pm-input pm-input--sm pm-input--num" style="width: 130px" inputmode="numeric" @change="setNum(c, 'unitCost', ($event.target as HTMLInputElement).value)" /></td>
                  <td><button class="pm-icon-btn" type="button" :aria-label="t('Remove component')" @click="removeComponent(i)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button></td>
                </tr>
              </tbody>
              <tfoot><tr><td colspan="5"><button class="pm-link" type="button" style="font-weight: 600" @click="addComponent">+ {{ t('Component') }}</button></td></tr></tfoot>
            </table>
          </div>
        </template>

        <h3 class="pm-h3">{{ t('Diff against') }} v{{ eco.baseVersion }}</h3>
        <EcoDiff :bom-id="eco.customBomId" :base-version="eco.baseVersion" :proposed="eco.proposed" :units="remainingUnits" />

        <div class="pm-field">
          <span class="pm-label pm-label-req">{{ t('Effectivity — which work orders get this change?') }}</span>
          <span class="pm-help">{{ t('Required. There is no default — choose explicitly.') }}</span>
          <div class="pm-stack" style="gap: 8px">
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'new_only', 'pm-choice--disabled': !editable }"><input v-model="editor.effectivity" type="radio" value="new_only" :disabled="!editable" /><div><div class="pm-choice-title">{{ t('New work orders only') }}</div><div class="pm-choice-desc">{{ t('Work orders created after approval use the new version; existing ones stay on') }} v{{ eco.baseVersion }}.</div></div></label>
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'all_open', 'pm-choice--disabled': !editable }"><input v-model="editor.effectivity" type="radio" value="all_open" :disabled="!editable" /><div><div class="pm-choice-title">{{ t('All open work orders') }}</div><div class="pm-choice-desc">{{ t('Draft and Released work orders switch to the new version (In progress stays — open question 20).') }}</div></div></label>
            <label class="pm-choice" :class="{ 'pm-choice--active': editor.effectivity === 'specific', 'pm-choice--disabled': !editable }"><input v-model="editor.effectivity" type="radio" value="specific" :disabled="!editable" /><div><div class="pm-choice-title">{{ t('Specific work orders') }}</div><div class="pm-choice-desc">{{ t('Pick the work orders below.') }}</div></div></label>
            <div v-if="editor.effectivity === 'specific'" class="pm-stack" style="gap: 4px; padding-left: 24px">
              <label v-for="w in openWos" :key="w.id" class="pm-check"><input v-model="editor.woIds" type="checkbox" :value="w.id" :disabled="!editable" /> {{ w.number }} · {{ t(w.status) }} · {{ w.qty }} {{ w.unit }}</label>
              <span v-if="!openWos.length" class="pm-muted pm-small">{{ t('No open work orders on this work package.') }}</span>
            </div>
          </div>
          <span v-if="editor.touched && !editor.effectivity" class="pm-error">{{ t('Choose which work orders this change applies to before submitting.') }}</span>
        </div>
        <p class="pm-help">{{ t('On approval the cost delta raises a budget revision in Budget setup, and reservations adjust.') }}</p>
      </template>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="editor.open = false">{{ editable ? t('Save draft') : t('Close') }}</button>
        <button v-if="editable" class="btn-enterprise btn-enterprise--primary" type="button" @click="doSubmit">{{ t('Submit for approval') }}</button>
      </template>
    </PmOverlay>
  </div>
</template>
