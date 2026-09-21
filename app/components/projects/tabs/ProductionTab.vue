<script setup lang="ts">
/**
 * Production & materials tab — production projects only (PRD §7; Stories 10, 19, 23).
 *
 *  • Production plan / MRP at Level 3: gross requirement from the custom BOM ×
 *    remaining units, netted against available (on hand − reserved to other
 *    projects). Reservations are created for the available portion; draft PR
 *    for the shortfall and a draft WO for in-house work — never firm documents.
 *  • Reservations: reserved → picked → issued, plus release (with audit entry).
 *    Reserved stock is not committed cost and never posts to the GL.
 *  • Work orders: advancing to Completed releases unused set-aside.
 */
import PmOverlay from '../PmOverlay.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage } from '~/data/projects'
import { projectWos, peggedDocuments } from '~/data/projectTransactions'
import { projectReservations, getStockItem } from '~/data/projectReservations'
import { getCustomBom, currentVersion, masterDiverged } from '~/data/projectBoms'
import { mrpPreview, runMrp, advanceReservation, releaseReservation, advanceWo } from '~/data/projectActions'
import { rp, num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()

const active = computed(() => props.project.status === 'active')
const wps = computed(() => projectWorkPackages(props.project.id).filter(w => w.type === 'production'))
const selWp = ref(wps.value.find(w => w.customBomId && w.status !== 'technically_complete')?.id ?? wps.value[0]?.id ?? '')
const preview = computed(() => (selWp.value ? mrpPreview(selWp.value) : { rows: [] }))
const selected = computed(() => getWorkPackage(selWp.value))
const remaining = computed(() => Math.max((selected.value?.plannedUnits ?? 0) - (selected.value?.confirmedUnits ?? 0), 0))

const reservations = computed(() => projectReservations(props.project.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const wos = computed(() => projectWos(props.project.id))
const drafts = computed(() => peggedDocuments.filter(d => d.status === 'draft' && d.lines.some(l => l.wpId && getWorkPackage(l.wpId)?.projectId === props.project.id)))

const release = reactive({ open: false, id: '', reason: '' })
function doRelease() {
  if (!release.reason.trim()) return
  if (notifyResult(releaseReservation(release.id, release.reason, asActor.value), t('Reservation released'))) release.open = false
}
const bomView = ref<string | undefined>()
const RES_TONE: Record<string, string> = { reserved: 'pm-pill--blue', picked: 'pm-pill--yellow', issued: 'pm-pill--green', released: 'pm-pill--gray' }
const RES_LABEL: Record<string, string> = { reserved: 'Reserved', picked: 'Picked', issued: 'Issued', released: 'Released' }
const WO_TONE: Record<string, string> = { Draft: 'pm-pill--gray', Released: 'pm-pill--blue', 'In progress': 'pm-pill--yellow', Completed: 'pm-pill--green' }
</script>

<template>
  <div class="pm-stack" style="gap: 20px">
    <!-- MRP -->
    <section class="pm-section" style="padding-top: 0">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Production plan') }}</h2>
          <p class="pm-desc">{{ t('Gross requirement from the work package’s custom BOM, netted against available stock (on hand − reserved to other projects). Running it creates reservations for what’s available, a draft purchase request for the shortfall and a draft work order — nothing firm.') }}</p>
        </div>
      </div>
      <div class="pm-row" style="margin-bottom: 12px">
        <label class="pm-small pm-muted" for="mrp-wp">{{ t('Work package') }}</label>
        <select id="mrp-wp" v-model="selWp" class="pm-select" style="width: 360px">
          <option v-for="w in wps" :key="w.id" :value="w.id">{{ w.code }} {{ w.name }}{{ w.customBomId ? '' : ` — ${t('no BOM')}` }}</option>
        </select>
        <span v-if="selected" class="pm-small pm-muted">{{ remaining }} {{ selected.unit }} {{ t('remaining') }} ({{ selected.confirmedUnits ?? 0 }}/{{ selected.plannedUnits ?? 0 }} {{ t('confirmed') }})</span>
        <span class="pm-spacer" />
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!active || !!preview.error || !preview.rows.length" @click="notifyResult(runMrp(selWp, asActor))">{{ t('Run MRP') }}</button>
      </div>
      <div v-if="preview.error" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ preview.error }}</div></div>
      <div v-else-if="!active" class="pm-banner pm-banner--info" style="margin-bottom: 10px"><div class="pm-banner-body">{{ t('MRP runs once the project is approved — a draft project can’t reserve stock.') }}</div></div>
      <div v-if="preview.rows.length" class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Component') }}</th><th class="pm-num">{{ t('Gross') }}</th><th class="pm-num">{{ t('Already reserved here') }}</th><th class="pm-num">{{ t('Net need') }}</th>
              <th class="pm-num">{{ t('On hand') }}</th><th class="pm-num">{{ t('Reserved elsewhere') }}</th><th class="pm-num">{{ t('Available') }}</th>
              <th class="pm-num">{{ t('Reserve now') }}</th><th class="pm-num">{{ t('Shortfall → draft PR') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in preview.rows" :key="r.item">
              <td>{{ r.item }}<span class="pm-cell-sub">{{ r.unit }}</span></td>
              <td class="pm-num">{{ num(r.gross) }}</td>
              <td class="pm-num">{{ num(r.alreadyReserved) }}</td>
              <td class="pm-num pm-strong">{{ num(r.net) }}</td>
              <td class="pm-num">{{ num(r.onHand) }}</td>
              <td class="pm-num">{{ num(r.reservedElsewhere) }}</td>
              <td class="pm-num">{{ num(r.available) }}</td>
              <td class="pm-num pm-pos">{{ r.reserve ? num(r.reserve) : '—' }}</td>
              <td class="pm-num" :class="r.shortfall ? 'pm-neg' : 'pm-muted'">{{ r.shortfall ? num(r.shortfall) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="preview.rows.length" class="pm-help" style="margin-top: 6px">{{ t('Net need = gross − already reserved here. Reserve now = min(net need, available). Shortfall = net need − reserve now.') }}</p>
      <div v-if="drafts.length" style="margin-top: 12px">
        <h3 class="pm-h3" style="margin-bottom: 6px">{{ t('Draft purchase requests from MRP') }}</h3>
        <div v-for="d in drafts" :key="d.id" class="pm-small" style="padding: 4px 0">
          <span class="pm-pill pm-pill--blue">{{ t('Draft') }}</span> {{ d.docNo }} · {{ d.lines.map(l => l.description).join(', ') }} · {{ rp(d.lines.reduce((s, l) => s + l.amount, 0)) }}
          <span class="pm-muted"> — {{ t('not firm, consumes no budget') }}</span>
        </div>
      </div>
    </section>

    <!-- Custom BOMs -->
    <section class="pm-section">
      <h2 class="pm-h2" style="margin-bottom: 12px">{{ t('Custom BOMs') }}</h2>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work package') }}</th><th>{{ t('Custom BOM') }}</th><th>{{ t('Version') }}</th><th>{{ t('Copied from') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wps" :key="w.id">
              <td>{{ w.code }} {{ w.name }}</td>
              <td>
                <button v-if="w.customBomId" class="pm-link" type="button" @click="bomView = w.customBomId">{{ getCustomBom(w.customBomId)?.name }}</button>
                <span v-else class="pm-warn">{{ t('No BOM yet') }}</span>
              </td>
              <td>{{ w.customBomId ? `v${currentVersion(getCustomBom(w.customBomId)!).version}` : '—' }}</td>
              <td>
                <template v-if="w.customBomId">{{ getCustomBom(w.customBomId)?.masterName }} · {{ formatDate(getCustomBom(w.customBomId)?.copiedAt) }}</template>
                <span v-if="w.customBomId && masterDiverged(getCustomBom(w.customBomId)!)" class="pm-pill pm-pill--blue" style="margin-left: 6px">{{ t('Master changed') }}</span>
              </td>
              <td><button v-if="w.customBomId" class="pm-link" type="button" @click="router.replace({ query: { tab: 'changes' } })">{{ t('Raise engineering change') }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Reservations -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Stock reservations') }}</h2>
          <p class="pm-desc">{{ t('Stock earmarked to a work package so it can’t quietly go to another job. A reservation never posts to the GL and is not committed cost.') }}</p>
        </div>
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/stock-availability')">{{ t('Stock availability') }}</button>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Item') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Status') }}</th><th>{{ t('Source') }}</th><th>{{ t('Date') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in reservations" :key="r.id" :style="{ opacity: r.status === 'released' ? 0.6 : 1 }">
              <td>{{ getStockItem(r.itemId)?.name }}<span class="pm-cell-sub">{{ getStockItem(r.itemId)?.warehouse }}</span></td>
              <td>{{ getWorkPackage(r.wpId)?.code }} {{ getWorkPackage(r.wpId)?.name }}</td>
              <td class="pm-num">{{ num(r.qty) }} {{ getStockItem(r.itemId)?.unit }}</td>
              <td><span class="pm-pill" :class="RES_TONE[r.status]">{{ t(RES_LABEL[r.status]!) }}</span><span v-if="r.releaseReason" class="pm-cell-sub">{{ r.releaseReason }}</span></td>
              <td>{{ t(r.source) }}</td>
              <td>{{ formatDate(r.releasedAt ?? r.createdAt) }}</td>
              <td>
                <div v-if="r.status === 'reserved' || r.status === 'picked'" class="pm-row" style="gap: 8px; flex-wrap: nowrap">
                  <button class="pm-link" type="button" :disabled="!active" @click="notifyResult(advanceReservation(r.id, asActor), r.status === 'reserved' ? t('Picked') : t('Issued to production'))">{{ r.status === 'reserved' ? t('Pick') : t('Issue') }}</button>
                  <button class="pm-link" type="button" @click="Object.assign(release, { open: true, id: r.id, reason: '' })">{{ t('Release') }}</button>
                </div>
              </td>
            </tr>
            <tr v-if="!reservations.length"><td colspan="7"><div class="pm-empty">{{ t('No reservations yet — run MRP on a work package.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Work orders -->
    <section class="pm-section">
      <div class="pm-section-head">
        <h2 class="pm-h2">{{ t('Work orders') }}</h2>
        <button v-if="project.status !== 'closed'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="router.push(`/projects/${project.id}/work-orders/new`)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          {{ t('Work order') }}
        </button>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work order') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('BOM version') }}</th><th>{{ t('Status') }}</th><th class="pm-num">{{ t('Set aside') }}</th><th class="pm-num">{{ t('Actual') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wos" :key="w.id">
              <td>{{ w.number }}<span class="pm-cell-sub">{{ w.createdBy }} · {{ formatDate(w.createdAt) }}</span></td>
              <td>{{ getWorkPackage(w.wpId)?.code }} {{ getWorkPackage(w.wpId)?.name }}</td>
              <td class="pm-num">{{ w.qty }} {{ w.unit }}</td>
              <td>{{ w.bomVersion ? `v${w.bomVersion}` : '—' }}</td>
              <td><span class="pm-pill" :class="WO_TONE[w.status]">{{ t(w.status) }}</span></td>
              <td class="pm-num">{{ w.budgetSetAside ? rp(w.budgetSetAside) : t('Not set') }}</td>
              <td class="pm-num">{{ rp(w.actual) }}<span v-if="w.released" class="pm-cell-sub">{{ rp(w.released) }} {{ t('released') }}</span></td>
              <td>
                <button v-if="active && (w.status === 'Released' || w.status === 'In progress')" class="pm-link" type="button" @click="notifyResult(advanceWo(w.id, asActor), t('Work order started'))">{{ w.status === 'Released' ? t('Start') : t('Complete') }}</button>
                <button v-else-if="w.status === 'Draft' && !w.budgetSetAside" class="pm-link" type="button" @click="router.push(`/projects/${project.id}/work-orders/new?wp=${w.wpId}`)">{{ t('Set budget') }}</button>
              </td>
            </tr>
            <tr v-if="!wos.length"><td colspan="8"><div class="pm-empty">{{ t('No work orders yet.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <PmOverlay :open="release.open" variant="modal" :title="t('Release reservation')" @close="release.open = false">
      <p class="pm-desc" style="margin: 0">{{ t('The stock becomes available to other projects. This is written to the audit log.') }}</p>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="rel-r">{{ t('Reason') }}</label>
        <input id="rel-r" v-model="release.reason" class="pm-input" />
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="release.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!release.reason.trim()" @click="doRelease">{{ t('Release') }}</button>
      </template>
    </PmOverlay>
    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
