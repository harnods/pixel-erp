<script setup lang="ts">
/**
 * Changes — commercial & engineering (PRD §8; Stories 11, 12, 17).
 *
 * Commercial change order (VO): reason required; distinct / not-distinct under
 * PSAK 72 (default not distinct → one-time cumulative catch-up this period);
 * PM prices and raises, Finance approves — two distinct acts. Executed without
 * sign-off = unbilled exposure. A VO never changes the recognition method.
 *
 * Engineering change (ECO, PRD v6.2 §7): never created here. Production edits a
 * locked project BOM (Structure / Production tab → BOM → Edit BOM), which publishes
 * vN+1 as Active and raises the ECO. This section lists the project's ECOs; each
 * opens its own page where the PM decides whether existing work orders adopt it.
 */
import {
  MpButton, MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpRadio, MpTextlink,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage, nodeLabel, usesMilestone } from '~/data/projects'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import { projectChangeOrders, projectEcos, coExposure, ecoPath, ECO_REASON_LABELS } from '~/data/projectChanges'
import { getCustomBom } from '~/data/projectBoms'
import { percentComplete, recognisedToDate } from '~/data/projectRecognition'
import { createOfficeVo, raiseVo } from '~/data/projectActions'
import { rp, rpSigned, pct, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()
const { asActor, role } = useProjectRole()
const raiseAction = useProjectAction()

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
  if (raise.distinct || p.method === 'tm' || usesMilestone(p)) return undefined
  const pc = percentComplete(p)
  if (!pc) return undefined
  return Math.round((pc / 100) * (p.contractValue + parseAmount(raise.price))) - recognisedToDate(p.id)
})
function doRaise() {
  raise.touched = true
  if (!raise.reason.trim() || !parseAmount(raise.price)) return
  if (raiseAction.run(raiseVo(raise.id, { cost: parseAmount(raise.cost), price: parseAmount(raise.price), distinct: raise.distinct, reason: raise.reason }, asActor.value))) raise.open = false
}

// ── ECO — list only; each row opens the ECO page ──
const bomView = ref<string | undefined>()
const openEco = (id: string) => { const e = ecos.value.find(x => x.id === id); if (e) router.push(ecoPath(e)) }
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
    <section class="pm-section" data-devchange="eco-changes-tab">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Engineering changes') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Raised when Production publishes a new version of a project BOM that work orders already use. The new version is Active at once; the PM decides whether existing work orders adopt it. An ECO never changes contract value — link the change order when the customer pays.') }}</p>
        </div>
      </div>
      <div v-if="!project.isProduction" class="pm-muted">{{ t('Service projects have no BOM, so engineering changes don’t apply.') }}</div>
      <div v-else class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Number') }}</th><th>{{ t('Change') }}</th><th>{{ t('Project BOM') }}</th><th>{{ t('Version') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="e in ecos" :key="e.id">
              <td>
                <span class="pm-link" role="link" tabindex="0" @click="openEco(e.id)" @keydown.enter="openEco(e.id)">{{ e.no }}</span>
                <span class="pm-cell-sub">{{ e.publishedBy }} · {{ formatDate(e.publishedAt) }}</span>
              </td>
              <td class="pm-wrap">{{ e.title }}<span class="pm-cell-sub">{{ t(ECO_REASON_LABELS[e.reason]) }}</span></td>
              <td>
                <span class="pm-link" role="link" tabindex="0" @click="bomView = e.customBomId" @keydown.enter="bomView = e.customBomId">{{ getCustomBom(e.customBomId)?.name }}</span>
                <span class="pm-cell-sub">{{ getWorkPackage(e.wpId)?.code }} {{ getWorkPackage(e.wpId)?.name }}</span>
              </td>
              <td>v{{ e.fromVersion }} → v{{ e.toVersion }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('eco', e.status, t)" /></td>
              <td><MpTextlink :id="`pm-eco-open-${e.id}`" as="a" @click.prevent="openEco(e.id)">{{ e.status === 'open' ? t('Decide') : t('View') }}</MpTextlink></td>
            </tr>
            <tr v-if="!ecos.length"><td colspan="6"><div class="pm-empty-inline">{{ t('No engineering changes. Edit a project BOM that work orders already use to raise one.') }}</div></td></tr>
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
        <ContentList :label="t('Margin')">
          <span :class="raiseMargin < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(raiseMargin) }}<template v-if="parseAmount(raise.price)"> ({{ pct(raiseMargin / parseAmount(raise.price) * 100) }})</template></span>
        </ContentList>
        <ContentList :label="t('New contract value')" :value="rp(project.contractValue + parseAmount(raise.price))" />
        <ContentList :label="t('Recognition method')" :value="t('Unchanged — a change order can’t change it')" />
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
        <template v-if="usesMilestone(project)">{{ t('On approval: verified phases are never reopened, a catch-up is posted for the verified share at the new value, and the unverified weights must be reconfirmed to 100% before more verification.') }}</template>
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

    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
