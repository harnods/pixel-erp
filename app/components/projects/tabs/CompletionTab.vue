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
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpProgress, MpTextlink,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, punchItems, getWorkPackage } from '~/data/projects'
import { wpCommitted, projectWos, woCommitted } from '~/data/projectTransactions'
import { projectReservations } from '~/data/projectReservations'
import { recordBast, closePunchItem, addPunchItem, closeBlockers, closeProject, finaliseRecognition } from '~/data/projectActions'
import { recognisedToDate, percentComplete } from '~/data/projectRecognition'
import { rp, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const { asActor } = useProjectRole()
const punchAction = useProjectAction()
const closeAction = useProjectAction()
const bastAction = useProjectAction()
const confirmAction = useProjectAction()

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
  bastAction.clear()
  Object.assign(bast, { open: true, wpId, pct: String(Math.min(wp.bastPct + 50, 100)), no: '', touched: false })
}
function doBast() {
  bast.touched = true
  if (!bast.no.trim()) return
  if (bastAction.run(recordBast(bast.wpId, Number(bast.pct), bast.no, asActor.value), Number(bast.pct) === 100 ? t('Work package technically complete') : t('BAST recorded'))) bast.open = false
}

const newPunch = reactive({ open: false, wpId: '', description: '', cost: '', touched: false })
const wpOptions = computed(() => wps.value.map(w => ({ value: w.id, label: w.auto ? props.project.name : `${w.code} ${w.name}` })))
function openPunch() { Object.assign(newPunch, { open: true, wpId: wps.value[0]?.id ?? '', description: '', cost: '', touched: false }) }
function savePunch() {
  newPunch.touched = true
  if (!newPunch.description.trim() || !newPunch.wpId) return
  addPunchItem(props.project.id, newPunch.wpId, newPunch.description.trim(), parseAmount(newPunch.cost))
  newPunch.open = false
  successToast(t('Punch item added'))
}
function doClosePunch(id: string, reworkCost?: number) {
  punchAction.run(closePunchItem(id, asActor.value), reworkCost ? t('Closed — rework cost posted to the job') : t('Closed'))
}
// Completion true-up (Input / Output·unit): all work packages done but measured progress < 100%.
const canTrueUp = computed(() => {
  const p = props.project
  if (p.status !== 'active' || p.method === 'tm' || (p.method === 'output' && p.measure === 'milestone')) return false
  return wps.value.every(w => w.status === 'technically_complete') && recognisedToDate(p.id) < p.contractValue
})
const trueUpAmount = computed(() => props.project.contractValue - recognisedToDate(props.project.id))
const closeOpen = ref(false)
function openClose() {
  if (!active.value) { closeAction.fail(t('Only an active project can be closed.')); return }
  if (blockers.value.length) { closeAction.fail(t('Resolve the items above before closing the project.')); return }
  closeAction.clear(); confirmAction.clear()
  closeOpen.value = true
}
function doClose() { if (confirmAction.run(closeProject(props.project.id, asActor.value))) closeOpen.value = false }
function doTrueUp() { closeAction.run(finaliseRecognition(props.project.id, asActor.value)) }
</script>

<template>
  <div class="pm-stack pm-gap-5">
    <MpBanner v-if="project.status === 'closed'" id="pm-closed" variant="info">
      <MpBannerIcon />
      <MpBannerTitle>{{ t('Closed') }}<template v-if="project.closedAt"> {{ t('on') }} {{ formatDate(project.closedAt) }}</template></MpBannerTitle>
      <MpBannerDescription v-if="project.assetNo">{{ t('Asset') }} {{ project.assetNo }} {{ t('created, linked to this project and its site.') }}</MpBannerDescription>
    </MpBanner>

    <!-- BAST per work package -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Work package completion') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('A partial BAST supports progress billing. A 100% BAST sets the work package technically complete and releases what’s still committed on it.') }}</p>
        </div>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Work package') }}</th><th>{{ t('Status') }}</th><th class="pm-th-mid">{{ t('BAST accepted') }}</th><th class="pm-num">{{ t('Still committed') }}</th><th>{{ t('Actual end') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in wps" :key="w.id">
              <td>{{ w.auto ? project.name : `${w.code} ${w.name}` }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('wp', w.status, t)" /></td>
              <td>
                <MpProgress :value="String(w.bastPct)" size="sm" color="positive" />
                <span class="pm-cell-sub">{{ w.bastPct }}%</span>
              </td>
              <td class="pm-num">{{ rp(wpCommitted(w.id)) }}</td>
              <td>{{ w.actualEnd ? formatDate(w.actualEnd) : '—' }}</td>
              <td><MpTextlink v-if="active && w.status !== 'technically_complete'" :id="`pm-bast-${w.id}`" as="a" @click.prevent="openBast(w.id)">{{ t('Record BAST') }}</MpTextlink></td>
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
          <p class="pm-caption pm-m-0">{{ t('Closing an item posts its rework cost back to the job, so handover defects never disappear into overhead.') }}</p>
        </div>
        <MpButton v-if="active" id="pm-new-punch" variant="secondary" is-rounded left-icon="add" @click="openPunch">{{ t('New punch item') }}</MpButton>
      </div>
      <PmActionError id="pm-punch-error" :error="punchAction.error.value" class="pm-mb-3" />
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Item') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Rework cost') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="p in punch" :key="p.id">
              <td class="pm-wrap">{{ p.description }}</td>
              <td>{{ getWorkPackage(p.wpId)?.code }} {{ getWorkPackage(p.wpId)?.name }}</td>
              <td class="pm-num">{{ p.reworkCost ? rp(p.reworkCost) : '—' }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('punch', p.status, t)" /><span v-if="p.closedAt" class="pm-cell-sub">{{ formatDate(p.closedAt) }}</span></td>
              <td><MpTextlink v-if="active && p.status === 'open'" :id="`pm-punch-close-${p.id}`" as="a" @click.prevent="doClosePunch(p.id, p.reworkCost)">{{ t('Close item') }}</MpTextlink></td>
            </tr>
            <tr v-if="!punch.length"><td colspan="5"><div class="pm-empty-inline">{{ t('No punch items.') }}</div></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Close -->
    <section v-if="project.status !== 'closed'" class="pm-section">
      <h2 class="pm-h2 pm-mb-3">{{ t('Close project') }}</h2>
      <div class="pm-card pm-stack pm-gap-3">
        <div v-if="blockers.length" class="pm-stack pm-gap-2">
          <div class="pm-strong">{{ t('Not ready to close') }}</div>
          <div v-for="b in blockers" :key="b.label" class="pm-row pm-gap-2">
            <span class="pm-neg pm-row"><MpIcon name="close" size="sm" /></span>
            <span>{{ b.n !== undefined ? `${b.n} ` : '' }}{{ t(b.label) }}<template v-if="b.detail"> ({{ b.detail }})</template></span>
          </div>
        </div>
        <div v-else class="pm-row pm-gap-2 pm-pos">{{ t('All checks pass — nothing pending, recognition final, invoices collected.') }}</div>
        <MpBanner v-if="canTrueUp" id="pm-true-up" variant="info" data-devchange="pm-completion-true-up">
          <MpBannerIcon />
          <MpBannerTitle>{{ t('Every work package is complete, but measured progress is') }} {{ pct(percentComplete(project)) }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('The work is done, so the remaining contract value is recognised as a completion true-up.') }} {{ rp(trueUpAmount) }}
            <MpTextlink id="pm-true-up-run" as="a" @click.prevent="doTrueUp">{{ t('Recognise remaining revenue') }}</MpTextlink>
          </MpBannerDescription>
        </MpBanner>
        <p class="pm-caption pm-m-0">
          {{ t('On close') }}: {{ releaseRes.length }} {{ t('unconsumed reservation(s) released') }} · {{ rp(releaseSetAside) }} {{ t('unused work-order set-aside released') }}<template v-if="project.longTerm"> · {{ t('an asset is created') }}</template>. {{ t('Each release is written to the audit log.') }}
        </p>
        <PmActionError id="pm-close-error" :error="closeAction.error.value" />
        <div class="pm-row"><span class="pm-spacer" />
          <MpButton id="pm-close-project" variant="primary" is-rounded @click="openClose">{{ t('Close project') }}</MpButton>
        </div>
      </div>
    </section>

    <PmOverlay id="pm-bast-modal" :open="bast.open" variant="modal" :title="t('Record BAST')" :subtitle="bastWp ? `${bastWp.code} ${bastWp.name}` : ''" @close="bast.open = false">
      <MpFormControl id="bast-n-fc" is-required :is-invalid="bast.touched && !bast.no.trim()">
        <MpFormLabel>{{ t('BAST number') }}</MpFormLabel>
        <MpInput id="bast-n" v-model="bast.no" />
        <MpFormErrorMessage>{{ t('Enter the BAST number.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="bast-p-fc" is-required>
        <MpFormLabel>{{ t('Accepted percentage') }}</MpFormLabel>
        <MpInputGroup id="bast-p-group" class="pm-maxw-short">
          <MpInput id="bast-p" v-model="bast.pct" inputmode="numeric" />
          <MpInputRightAddon has-background>%</MpInputRightAddon>
        </MpInputGroup>
        <MpFormHelpText>{{ t('Last accepted') }}: {{ bastWp?.bastPct ?? 0 }}%</MpFormHelpText>
      </MpFormControl>
      <MpBanner v-if="Number(bast.pct) === 100 && bastWp" id="pm-bast-complete" variant="info">
        <MpBannerIcon /><MpBannerDescription>{{ t('100% sets the work package technically complete and releases') }} {{ rp(wpCommitted(bastWp.id)) }} {{ t('still committed on it.') }}</MpBannerDescription>
      </MpBanner>
      <PmActionError id="pm-bast-error" :error="bastAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="bast.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doBast">{{ t('Record') }}</MpButton>
      </template>
    </PmOverlay>

    <PmOverlay id="pm-punch-modal" :open="newPunch.open" variant="modal" :title="t('New punch item')" @close="newPunch.open = false">
      <MpFormControl id="pn-w-fc" is-required :is-invalid="newPunch.touched && !newPunch.wpId">
        <MpFormLabel>{{ t('Work package') }}</MpFormLabel>
        <ErpFilterSelect id="pn-w" v-model="newPunch.wpId" :placeholder="t('Select work package')" :options="wpOptions" width="100%" :is-clearable="false" />
        <MpFormErrorMessage>{{ t('Select a work package.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="pn-d-fc" is-required :is-invalid="newPunch.touched && !newPunch.description.trim()">
        <MpFormLabel>{{ t('Defect') }}</MpFormLabel>
        <MpInput id="pn-d" v-model="newPunch.description" />
        <MpFormErrorMessage>{{ t('Describe the defect.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="pn-c-fc">
        <MpFormLabel>{{ t('Rework cost') }}</MpFormLabel>
        <MpInputGroup id="pn-c-group" class="pm-maxw-field">
          <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
          <MpInput id="pn-c" v-model="newPunch.cost" inputmode="numeric" />
        </MpInputGroup>
      </MpFormControl>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="newPunch.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="savePunch">{{ t('Save') }}</MpButton>
      </template>
    </PmOverlay>

    <PmOverlay id="pm-close-modal" :open="closeOpen" variant="modal" :title="t('Close project?')" :subtitle="project.code" @close="closeOpen = false">
      <p class="pm-body pm-m-0">{{ t('The project becomes read-only. Remaining reservations and unused work-order set-aside are released.') }}</p>
      <PmActionError id="pm-close-confirm-error" :error="confirmAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="closeOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doClose">{{ t('Close project') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
</template>
