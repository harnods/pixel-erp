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
import {
  MpButton, MpInput, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage, MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage } from '~/data/projects'
import { projectWos, peggedDocuments } from '~/data/projectTransactions'
import { projectReservations, getStockItem } from '~/data/projectReservations'
import { getCustomBom, currentVersion, masterDiverged } from '~/data/projectBoms'
import { mrpPreview, runMrp, advanceReservation, releaseReservation, advanceWo } from '~/data/projectActions'
import { rp, num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const mrpAction = useProjectAction()
const resAction = useProjectAction()
const woAction = useProjectAction()
const releaseAction = useProjectAction()

const active = computed(() => props.project.status === 'active')
const wps = computed(() => projectWorkPackages(props.project.id).filter(w => w.type === 'production'))
const selWp = ref(wps.value.find(w => w.customBomId && w.status !== 'technically_complete')?.id ?? wps.value[0]?.id ?? '')
const preview = computed(() => (selWp.value ? mrpPreview(selWp.value) : { rows: [] }))
const selected = computed(() => getWorkPackage(selWp.value))
const remaining = computed(() => Math.max((selected.value?.plannedUnits ?? 0) - (selected.value?.confirmedUnits ?? 0), 0))

const reservations = computed(() => projectReservations(props.project.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const wos = computed(() => projectWos(props.project.id))
const drafts = computed(() => peggedDocuments.filter(d => d.status === 'draft' && d.lines.some(l => l.wpId && getWorkPackage(l.wpId)?.projectId === props.project.id)))

const wpOptions = computed(() => wps.value.map(w => ({ value: w.id, label: `${w.code} ${w.name}${w.customBomId ? '' : ` — ${t('no BOM')}`}` })))
function setWp(v: string) { if (v) { selWp.value = v; mrpAction.clear() } }
function doRunMrp() {
  if (!active.value) { mrpAction.fail(t('MRP runs once the project is approved — a draft project can’t reserve stock.')); return }
  if (preview.value.error) { mrpAction.fail(preview.value.error); return }
  if (!preview.value.rows.length) { mrpAction.fail(t('Nothing to plan — this work package has no remaining requirement.')); return }
  mrpAction.run(runMrp(selWp.value, asActor.value))
}
function doAdvance(id: string, status: string) {
  if (!active.value) { resAction.fail(t('Only an active project can pick or issue stock.')); return }
  resAction.run(advanceReservation(id, asActor.value), status === 'reserved' ? t('Picked') : t('Issued to production'))
}
function doAdvanceWo(id: string, status: string) {
  woAction.run(advanceWo(id, asActor.value), status === 'Released' ? t('Work order started') : t('Work order completed'))
}

const release = reactive({ open: false, id: '', reason: '', touched: false })
function openRelease(id: string) { releaseAction.clear(); Object.assign(release, { open: true, id, reason: '', touched: false }) }
function doRelease() {
  release.touched = true
  if (!release.reason.trim()) return
  if (releaseAction.run(releaseReservation(release.id, release.reason, asActor.value), t('Reservation released'))) release.open = false
}
const bomView = ref<string | undefined>()
</script>

<template>
  <div class="pm-stack pm-gap-5">
    <!-- MRP -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Production plan') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Gross requirement from the work package’s custom BOM, netted against available stock (on hand − reserved to other projects). Running it creates reservations for what’s available, a draft purchase request for the shortfall and a draft work order — nothing firm.') }}</p>
        </div>
      </div>
      <div class="pm-row pm-mb-3">
        <span class="pm-small pm-muted">{{ t('Work package') }}</span>
        <ErpFilterSelect id="mrp-wp" :model-value="selWp" :placeholder="t('Select work package')" :options="wpOptions" :is-clearable="false" width="360px" @update:model-value="setWp" />
        <span v-if="selected" class="pm-small pm-muted">{{ remaining }} {{ selected.unit }} {{ t('remaining') }} ({{ selected.confirmedUnits ?? 0 }}/{{ selected.plannedUnits ?? 0 }} {{ t('confirmed') }})</span>
        <span class="pm-spacer" />
        <MpButton id="pm-run-mrp" variant="primary" is-rounded @click="doRunMrp">{{ t('Run MRP') }}</MpButton>
      </div>
      <PmActionError id="pm-mrp-error" :error="mrpAction.error.value" class="pm-mb-3" />
      <MpBanner v-if="preview.error && !mrpAction.error.value" id="pm-mrp-preview-error" variant="warning" class="pm-mb-3">
        <MpBannerIcon /><MpBannerDescription>{{ preview.error }}</MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="!active" id="pm-mrp-draft" variant="info" class="pm-mb-3">
        <MpBannerIcon /><MpBannerDescription>{{ t('MRP runs once the project is approved — a draft project can’t reserve stock.') }}</MpBannerDescription>
      </MpBanner>
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
      <p v-if="preview.rows.length" class="pm-caption pm-mt-2">{{ t('Net need = gross − already reserved here. Reserve now = min(net need, available). Shortfall = net need − reserve now.') }}</p>
      <div v-if="drafts.length" class="pm-mt-3">
        <h3 class="pm-h3 pm-mb-2">{{ t('Draft purchase requests from MRP') }}</h3>
        <div v-for="d in drafts" :key="d.id" class="pm-row pm-gap-2 pm-small pm-mb-2">
          <ErpStatusBadge v-bind="badgeProps('doc', 'draft', t)" />
          <span>{{ d.docNo }} · {{ d.lines.map(l => l.description).join(', ') }} · {{ rp(d.lines.reduce((s, l) => s + l.amount, 0)) }}</span>
          <span class="pm-muted">— {{ t('not firm, consumes no budget') }}</span>
        </div>
      </div>
    </section>

    <!-- Custom BOMs -->
    <section class="pm-section">
      <h2 class="pm-h2 pm-mb-3">{{ t('Custom BOMs') }}</h2>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work package') }}</th><th>{{ t('Custom BOM') }}</th><th>{{ t('Version') }}</th><th>{{ t('Copied from') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wps" :key="w.id">
              <td>{{ w.code }} {{ w.name }}</td>
              <td>
                <MpTextlink v-if="w.customBomId" :id="`pm-prod-bom-${w.id}`" as="a" @click.prevent="bomView = w.customBomId">{{ getCustomBom(w.customBomId)?.name }}</MpTextlink>
                <span v-else class="pm-warn">{{ t('No BOM yet') }}</span>
              </td>
              <td>{{ w.customBomId ? `v${currentVersion(getCustomBom(w.customBomId)!).version}` : '—' }}</td>
              <td>
                <span class="pm-row pm-gap-2">
                  <template v-if="w.customBomId">{{ getCustomBom(w.customBomId)?.masterName }} · {{ formatDate(getCustomBom(w.customBomId)?.copiedAt) }}</template>
                  <ErpStatusBadge v-if="w.customBomId && masterDiverged(getCustomBom(w.customBomId)!)" v-bind="badgeProps('flag', 'master-changed', t)" />
                </span>
              </td>
              <td><MpTextlink v-if="w.customBomId" :id="`pm-prod-eco-${w.id}`" as="a" @click.prevent="router.replace({ query: { tab: 'changes' } })">{{ t('Raise engineering change') }}</MpTextlink></td>
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
          <p class="pm-caption pm-m-0">{{ t('Stock earmarked to a work package so it can’t quietly go to another job. A reservation never posts to the GL and is not committed cost.') }}</p>
        </div>
        <MpButton id="pm-stock-availability" variant="secondary" is-rounded @click="router.push('/stock-availability')">{{ t('Stock availability') }}</MpButton>
      </div>
      <PmActionError id="pm-res-error" :error="resAction.error.value" class="pm-mb-3" />
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Item') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Status') }}</th><th>{{ t('Source') }}</th><th>{{ t('Date') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in reservations" :key="r.id" :class="{ 'pm-tr-muted': r.status === 'released' }">
              <td>{{ getStockItem(r.itemId)?.name }}<span class="pm-cell-sub">{{ getStockItem(r.itemId)?.warehouse }}</span></td>
              <td>{{ getWorkPackage(r.wpId)?.code }} {{ getWorkPackage(r.wpId)?.name }}</td>
              <td class="pm-num">{{ num(r.qty) }} {{ getStockItem(r.itemId)?.unit }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('res', r.status, t)" /><span v-if="r.releaseReason" class="pm-cell-sub">{{ r.releaseReason }}</span></td>
              <td>{{ t(r.source) }}</td>
              <td>{{ formatDate(r.releasedAt ?? r.createdAt) }}</td>
              <td>
                <span v-if="r.status === 'reserved' || r.status === 'picked'" class="pm-row pm-row--nowrap pm-gap-3">
                  <MpTextlink :id="`pm-res-advance-${r.id}`" as="a" @click.prevent="doAdvance(r.id, r.status)">{{ r.status === 'reserved' ? t('Pick') : t('Issue') }}</MpTextlink>
                  <MpTextlink :id="`pm-res-release-${r.id}`" as="a" @click.prevent="openRelease(r.id)">{{ t('Release') }}</MpTextlink>
                </span>
              </td>
            </tr>
            <tr v-if="!reservations.length"><td colspan="7"><div class="pm-empty-inline">{{ t('No reservations yet — run MRP on a work package.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Work orders -->
    <section class="pm-section">
      <div class="pm-section-head">
        <h2 class="pm-h2">{{ t('Work orders') }}</h2>
        <MpButton v-if="project.status !== 'closed'" id="pm-prod-new-wo" variant="secondary" is-rounded left-icon="add" @click="router.push(`/projects/${project.id}/work-orders/new`)">{{ t('New work order') }}</MpButton>
      </div>
      <PmActionError id="pm-wo-error" :error="woAction.error.value" class="pm-mb-3" />
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work order') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('BOM version') }}</th><th>{{ t('Status') }}</th><th class="pm-num">{{ t('Set aside') }}</th><th class="pm-num">{{ t('Actual') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wos" :key="w.id">
              <td>{{ w.number }}<span class="pm-cell-sub">{{ w.createdBy }} · {{ formatDate(w.createdAt) }}</span></td>
              <td>{{ getWorkPackage(w.wpId)?.code }} {{ getWorkPackage(w.wpId)?.name }}</td>
              <td class="pm-num">{{ w.qty }} {{ w.unit }}</td>
              <td>{{ w.bomVersion ? `v${w.bomVersion}` : '—' }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('wo', w.status, t)" /></td>
              <td class="pm-num">{{ w.budgetSetAside ? rp(w.budgetSetAside) : t('Not set') }}</td>
              <td class="pm-num">{{ rp(w.actual) }}<span v-if="w.released" class="pm-cell-sub">{{ rp(w.released) }} {{ t('released') }}</span></td>
              <td>
                <MpTextlink v-if="active && (w.status === 'Released' || w.status === 'In progress')" :id="`pm-wo-advance-${w.id}`" as="a" @click.prevent="doAdvanceWo(w.id, w.status)">{{ w.status === 'Released' ? t('Start') : t('Complete') }}</MpTextlink>
                <MpTextlink v-else-if="w.status === 'Draft' && !w.budgetSetAside" :id="`pm-wo-budget-${w.id}`" as="a" @click.prevent="router.push(`/projects/${project.id}/work-orders/new?wp=${w.wpId}`)">{{ t('Set budget') }}</MpTextlink>
              </td>
            </tr>
            <tr v-if="!wos.length"><td colspan="8"><div class="pm-empty-inline">{{ t('No work orders yet.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <PmOverlay id="pm-release-modal" :open="release.open" variant="modal" :title="t('Release reservation')" @close="release.open = false">
      <p class="pm-body pm-m-0">{{ t('The stock becomes available to other projects. This is written to the audit log.') }}</p>
      <MpFormControl id="rel-r-fc" is-required :is-invalid="release.touched && !release.reason.trim()">
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpInput id="rel-r" v-model="release.reason" />
        <MpFormErrorMessage>{{ t('A reason is required.') }}</MpFormErrorMessage>
      </MpFormControl>
      <PmActionError id="pm-release-error" :error="releaseAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="release.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doRelease">{{ t('Release') }}</MpButton>
      </template>
    </PmOverlay>
    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
