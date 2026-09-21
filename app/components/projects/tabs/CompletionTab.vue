<script setup lang="ts">
/**
 * Completion tab (PRD §10, Story 16).
 *  • Per-work-package BAST: a partial % supports progress billing; 100% sets the
 *    work package technically complete and releases its remaining commitment.
 *  • QC / punch list: closing an item posts its rework cost back to the job.
 *  • Close is gated: every work package complete, recognition final, invoices
 *    collected, no change order or ECO pending. On close, unconsumed
 *    reservations and unused work-order set-aside are released with audit
 *    entries; a long-term project gets an asset.
 */
import PmOverlay from '../PmOverlay.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, punchItems, getWorkPackage, wpStatusLabel } from '~/data/projects'
import { wpCommitted, projectWos, woCommitted } from '~/data/projectTransactions'
import { projectReservations } from '~/data/projectReservations'
import { recordBast, closePunchItem, addPunchItem, closeBlockers, closeProject } from '~/data/projectActions'
import { rp, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const { asActor } = useProjectRole()

const active = computed(() => props.project.status === 'active')
const wps = computed(() => projectWorkPackages(props.project.id))
const punch = computed(() => punchItems.filter(p => p.projectId === props.project.id))
const blockers = computed(() => closeBlockers(props.project.id))
const releaseRes = computed(() => projectReservations(props.project.id).filter(r => r.status === 'reserved' || r.status === 'picked'))
const releaseSetAside = computed(() => projectWos(props.project.id).filter(w => w.status !== 'Completed').reduce((s, w) => s + woCommitted(w), 0))

const bast = reactive({ open: false, wpId: '', pct: '', no: '', touched: false })
const bastWp = computed(() => getWorkPackage(bast.wpId))
function openBast(wpId: string) {
  const wp = getWorkPackage(wpId)!
  Object.assign(bast, { open: true, wpId, pct: String(Math.min(wp.bastPct + 50, 100)), no: '', touched: false })
}
function doBast() {
  bast.touched = true
  if (!bast.no.trim()) return
  if (notifyResult(recordBast(bast.wpId, Number(bast.pct), bast.no, asActor.value), Number(bast.pct) === 100 ? t('Work package technically complete') : t('BAST recorded'))) bast.open = false
}

const newPunch = reactive({ open: false, wpId: '', description: '', cost: '' })
function savePunch() {
  if (!newPunch.description.trim() || !newPunch.wpId) return
  addPunchItem(props.project.id, newPunch.wpId, newPunch.description.trim(), parseAmount(newPunch.cost))
  newPunch.open = false
}
const closeOpen = ref(false)
function doClose() { if (notifyResult(closeProject(props.project.id, asActor.value))) closeOpen.value = false }
const STATUS_TONE: Record<string, string> = { not_started: 'pm-pill--gray', in_progress: 'pm-pill--yellow', technically_complete: 'pm-pill--green' }
</script>

<template>
  <div class="pm-stack" style="gap: 20px">
    <div v-if="project.status === 'closed'" class="pm-banner pm-banner--success">
      <div class="pm-banner-body"><div class="pm-banner-title">{{ t('Closed') }}<template v-if="project.closedAt"> {{ t('on') }} {{ formatDate(project.closedAt) }}</template></div><template v-if="project.assetNo">{{ t('Asset') }} {{ project.assetNo }} {{ t('created, linked to this project and its site.') }}</template></div>
    </div>

    <!-- BAST per work package -->
    <section class="pm-section" style="padding-top: 0">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Work package completion') }}</h2>
          <p class="pm-desc">{{ t('A partial BAST supports progress billing. A 100% BAST sets the work package technically complete and releases what’s still committed on it.') }}</p>
        </div>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work package') }}</th><th>{{ t('Status') }}</th><th style="width: 200px">{{ t('BAST accepted') }}</th><th class="pm-num">{{ t('Still committed') }}</th><th>{{ t('Actual end') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wps" :key="w.id">
              <td>{{ w.auto ? project.name : `${w.code} ${w.name}` }}</td>
              <td><span class="pm-pill" :class="STATUS_TONE[w.status]">{{ t(wpStatusLabel(w.status)) }}</span></td>
              <td>
                <div class="pm-bar-track"><div class="pm-bar-fill" :style="{ width: w.bastPct + '%' }" /></div>
                <span class="pm-cell-sub">{{ w.bastPct }}%</span>
              </td>
              <td class="pm-num">{{ rp(wpCommitted(w.id)) }}</td>
              <td>{{ w.actualEnd ? formatDate(w.actualEnd) : '—' }}</td>
              <td><button v-if="active && w.status !== 'technically_complete'" class="pm-link" type="button" @click="openBast(w.id)">{{ t('Record BAST') }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Punch list -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('QC & punch list') }}</h2>
          <p class="pm-desc">{{ t('Closing an item posts its rework cost back to the job, so handover defects never disappear into overhead.') }}</p>
        </div>
        <button v-if="active" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="Object.assign(newPunch, { open: true, wpId: wps[0]?.id ?? '', description: '', cost: '' })">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          {{ t('Punch item') }}
        </button>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Item') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Rework cost') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="p in punch" :key="p.id">
              <td class="pm-wrap">{{ p.description }}</td>
              <td>{{ getWorkPackage(p.wpId)?.code }} {{ getWorkPackage(p.wpId)?.name }}</td>
              <td class="pm-num">{{ p.reworkCost ? rp(p.reworkCost) : '—' }}</td>
              <td><span class="pm-pill" :class="p.status === 'open' ? 'pm-pill--yellow' : 'pm-pill--green'">{{ p.status === 'open' ? t('Open') : t('Closed') }}</span><span v-if="p.closedAt" class="pm-cell-sub">{{ formatDate(p.closedAt) }}</span></td>
              <td><button v-if="active && p.status === 'open'" class="pm-link" type="button" @click="notifyResult(closePunchItem(p.id, asActor), p.reworkCost ? t('Closed — rework cost posted to the job') : t('Closed'))">{{ t('Close item') }}</button></td>
            </tr>
            <tr v-if="!punch.length"><td colspan="5"><div class="pm-empty">{{ t('No punch items.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Close -->
    <section v-if="project.status !== 'closed'" class="pm-section">
      <h2 class="pm-h2" style="margin-bottom: 12px">{{ t('Close project') }}</h2>
      <div class="pm-card">
        <div v-if="blockers.length" class="pm-stack" style="gap: 6px">
          <div class="pm-strong">{{ t('Not ready to close') }}</div>
          <div v-for="b in blockers" :key="b.label" class="pm-row" style="gap: 8px"><span class="pm-neg">✗</span><span>{{ b.n !== undefined ? `${b.n} ` : '' }}{{ t(b.label) }}<template v-if="b.detail"> ({{ b.detail }})</template></span></div>
        </div>
        <div v-else class="pm-row" style="gap: 8px"><span class="pm-pos">✓</span><span>{{ t('All checks pass — nothing pending, recognition final, invoices collected.') }}</span></div>
        <div class="pm-small pm-muted" style="margin-top: 12px">
          {{ t('On close') }}: {{ releaseRes.length }} {{ t('unconsumed reservation(s) released') }} · {{ rp(releaseSetAside) }} {{ t('unused work-order set-aside released') }}<template v-if="project.longTerm"> · {{ t('an asset is created') }}</template>. {{ t('Each release is written to the audit log.') }}
        </div>
        <div class="pm-form-footer">
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!active || !!blockers.length" @click="closeOpen = true">{{ t('Close project') }}</button>
        </div>
      </div>
    </section>

    <PmOverlay :open="bast.open" variant="modal" :title="t('Record BAST')" :subtitle="bastWp ? `${bastWp.code} ${bastWp.name}` : ''" @close="bast.open = false">
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="bast-n">{{ t('BAST number') }}</label>
        <input id="bast-n" v-model="bast.no" class="pm-input" placeholder="BAST/…" :aria-invalid="bast.touched && !bast.no.trim()" />
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="bast-p">{{ t('Accepted percentage') }}</label>
        <div class="pm-input-group" style="max-width: 160px"><input id="bast-p" v-model="bast.pct" class="pm-input pm-input--num" inputmode="numeric" /><span class="pm-addon">%</span></div>
        <span class="pm-help">{{ t('Last accepted') }}: {{ bastWp?.bastPct ?? 0 }}%</span>
      </div>
      <div v-if="Number(bast.pct) === 100 && bastWp" class="pm-banner pm-banner--info"><div class="pm-banner-body">{{ t('100% sets the work package technically complete and releases') }} {{ rp(wpCommitted(bastWp.id)) }} {{ t('still committed on it.') }}</div></div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="bast.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doBast">{{ t('Record') }}</button>
      </template>
    </PmOverlay>

    <PmOverlay :open="newPunch.open" variant="modal" :title="t('Punch item')" @close="newPunch.open = false">
      <div class="pm-field"><label class="pm-label pm-label-req" for="pn-w">{{ t('Work package') }}</label><select id="pn-w" v-model="newPunch.wpId" class="pm-select"><option v-for="w in wps" :key="w.id" :value="w.id">{{ w.auto ? project.name : `${w.code} ${w.name}` }}</option></select></div>
      <div class="pm-field"><label class="pm-label pm-label-req" for="pn-d">{{ t('Defect') }}</label><input id="pn-d" v-model="newPunch.description" class="pm-input" /></div>
      <div class="pm-field"><label class="pm-label" for="pn-c">{{ t('Rework cost') }}</label><div class="pm-input-group" style="max-width: 220px"><span class="pm-addon">Rp</span><input id="pn-c" v-model="newPunch.cost" class="pm-input pm-input--num" inputmode="numeric" /></div></div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="newPunch.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="savePunch">{{ t('Add') }}</button>
      </template>
    </PmOverlay>

    <PmOverlay :open="closeOpen" variant="modal" :title="t('Close project?')" :subtitle="project.code" @close="closeOpen = false">
      <p class="pm-desc" style="margin: 0">{{ t('The project becomes read-only. Remaining reservations and unused work-order set-aside are released.') }}</p>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closeOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doClose">{{ t('Close project') }}</button>
      </template>
    </PmOverlay>
  </div>
</template>
