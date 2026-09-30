<script setup lang="ts">
/**
 * Custody and counts (PRD 8.1: FG-4 and FG-5 on one surface).
 *
 * Custody says who holds each asset and where; a count session checks the
 * register against the floor. Everything here reads the store, so a change
 * made on this screen shows on the register and the asset record at once.
 *
 * The rules the screen enforces:
 *  - a session freezes its population when it opens, and an asset cannot be
 *    in two open sessions (FG5-AC2);
 *  - a session cannot close while a variance is unresolved (FG5-AC1);
 *  - closing applies each resolution to the register, and a write-off goes
 *    through approval when Asset settings asks for it (FG5-AC3, FG7-AC2);
 *  - an abandoned session is marked abandoned, not closed, and is not
 *    evidence of anything.
 */
import { computed, ref, watch } from 'vue'
import {
  MpButton, MpInput, MpTextarea, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import CustodyDrawer from '~/components/patterns/CustodyDrawer.vue'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import { findAsset, canSeeFinancials, actingUser } from '~/data/assetStore'
import {
  custodianSummary, unassignedAssets, CUSTODIANS, CONDITIONS, markCustodianLeft, reassignAll, leftCustodians,
  canEditCustody, assetLocations, type Condition,
} from '~/data/assetCustody'
import {
  countSessions, sessionById, createSession, abandonSession, recordScans, removeScan, finishCounting, reopenCounting,
  countLines, variancesOf, unresolvedOf, resolveVariance, clearResolution, closeSession, sessionRequestIds,
  populationFor, locationScopeOptions, custodianScopeOptions, scopeLocations, canCount,
  RESOLUTION_OPTIONS, FINDING_LABEL, isOpenSession,
  type ScopeType, type ScanOutcome, type ResolutionKind, type Variance, type LineResult,
} from '~/data/assetCounts'
import { requestById, requestTotal } from '~/data/assetApprovals'
import { classMaster } from '~/data/fixedAssetScreens'
import type { FixedAsset } from '~/data/fixedAssets'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ── Which session is open on screen ─────────────────────────────────────────
const activeId = ref<string | null>(null)
watch(() => route.query.session, (q) => { if (typeof q === 'string' && sessionById(q)) activeId.value = q }, { immediate: true })
watch(countSessions, (list) => {
  if (!activeId.value || !sessionById(activeId.value)) activeId.value = list[0]?.id ?? null
}, { immediate: true })
const active = computed(() => (activeId.value ? sessionById(activeId.value) ?? null : null))

// ── New session (OD-23) ─────────────────────────────────────────────────────
const setupOpen = ref(false)
const scopeType = ref<ScopeType>('location')
const scope = ref('')
const setupError = ref('')
const scopeTypeOptions = [
  { id: 'scope-location', value: 'location', label: 'By location' },
  { id: 'scope-custodian', value: 'custodian', label: 'By custodian' },
]
watch(scopeType, () => { scope.value = ''; setupError.value = '' })
const scopeOptions = computed(() => (scopeType.value === 'location' ? locationScopeOptions.value : custodianScopeOptions.value))
const setupPopulation = computed(() => (scope.value ? populationFor(scopeType.value, scope.value) : []))
function openSetup() {
  setupOpen.value = true
  setupError.value = ''
}
function startSession() {
  const r = createSession(scopeType.value, scope.value)
  if (!r.ok) { setupError.value = r.reason; return }
  setupOpen.value = false
  scope.value = ''
  activeId.value = r.session.id
  successToast(t(`${r.session.id} started. ${r.session.population.length} ${r.session.population.length === 1 ? 'asset' : 'assets'} to count`))
}

// ── Capture (OD-24) ─────────────────────────────────────────────────────────
const scanText = ref('')
const scanAt = ref('')
const scanCondition = ref<string>('Good')
const scanError = ref('')
const lastOutcomes = ref<ScanOutcome[]>([])
const activeLocations = computed(() => (active.value ? scopeLocations(active.value) : []))
const allLocationOptions = computed(() => {
  const inScope = activeLocations.value
  return [
    ...inScope.map((l) => ({ value: l, label: l })),
    ...assetLocations.value.filter((l) => !inScope.includes(l.name)).map((l) => ({ value: l.name, label: `${l.name} (outside this count)` })),
  ]
})
function capture() {
  if (!active.value) return
  scanError.value = ''
  const r = recordScans(active.value.id, scanText.value, scanAt.value, scanCondition.value as Condition)
  if (!r.ok) { scanError.value = r.reason; return }
  lastOutcomes.value = r.outcomes
  scanText.value = ''
}
const lines = computed(() => (active.value ? countLines(active.value) : []))
const countedCount = computed(() => lines.value.filter((l) => l.scan).length)
const RESULT_LABEL: Record<LineResult, string> = {
  found: 'Found',
  'wrong-location': 'Different location',
  damaged: 'Found damaged',
  'not-counted': 'Not counted yet',
  'not-found': 'Not found',
}
const RESULT_TONE: Record<LineResult, string> = {
  found: 'cc__res--ok', 'wrong-location': 'cc__res--warn', damaged: 'cc__res--warn', 'not-counted': 'cc__res--muted', 'not-found': 'cc__res--bad',
}

function finish() {
  if (!active.value) return
  const r = finishCounting(active.value.id)
  if (!r.ok) { infoToast(t(r.reason)); return }
  const n = variancesOf(r.session).length
  successToast(t(n ? `Count finished. ${n} ${n === 1 ? 'variance' : 'variances'} to resolve` : 'Count finished. No variances'))
}
function backToCounting() {
  if (!active.value) return
  const r = reopenCounting(active.value.id)
  if (!r.ok) infoToast(t(r.reason))
}

// ── Variances (OD-25) ───────────────────────────────────────────────────────
const variances = computed(() => (active.value ? variancesOf(active.value) : []))
const unresolved = computed(() => (active.value ? unresolvedOf(active.value) : []))
const editing = ref<Variance | null>(null)
const resKind = ref<string>('')
const resLocation = ref('')
const resCustodian = ref('')
const resRecoverable = ref('')
const resName = ref('')
const resClass = ref('')
const resCost = ref('')
const resReason = ref('')
const resError = ref<{ field: string; reason: string } | null>(null)

function startResolve(v: Variance) {
  const existing = active.value?.resolutions[v.id]
  editing.value = v
  resKind.value = existing?.kind ?? ''
  const a = v.assetId ? findAsset(v.assetId) : null
  resLocation.value = existing?.location ?? v.foundAt ?? ''
  resCustodian.value = existing?.custodian ?? a?.custodian ?? ''
  resRecoverable.value = existing?.recoverable ? String(existing.recoverable) : ''
  resName.value = existing?.newAsset?.name ?? ''
  resClass.value = existing?.newAsset?.class ?? ''
  resCost.value = existing?.newAsset?.cost ? String(existing.newAsset.cost) : ''
  resReason.value = existing?.reason ?? ''
  resError.value = null
}
const resOptions = computed(() => (editing.value ? RESOLUTION_OPTIONS[editing.value.kind] : []))
const resHint = computed(() => resOptions.value.find((o) => o.value === resKind.value)?.hint ?? '')
const needsLocation = computed(() => !!editing.value && (resKind.value === 'transfer'
  || (resKind.value === 'record-correction' && (editing.value.kind === 'wrong-location' || editing.value.kind === 'unexpected'))))
const custodianOptions = computed(() => CUSTODIANS.filter((c) => !leftCustodians.value.includes(c.name)).map((c) => ({ value: c.name, label: c.name })))
const locationOptions = computed(() => assetLocations.value.map((l) => ({ value: l.name, label: `${l.name} · ${l.branch}` })))
const classOptions = classMaster.map((c) => c.class)
const conditionOptions = CONDITIONS.map((c) => ({ value: c, label: c }))
const num = (v: string) => Number(v.replace(/\D/g, '')) || 0
function resErr(f: string) { return resError.value?.field === f ? resError.value.reason : '' }

function saveResolution() {
  if (!active.value || !editing.value) return
  const kind = resKind.value as ResolutionKind
  const r = resolveVariance(active.value.id, editing.value.id, {
    kind,
    reason: resReason.value,
    ...(needsLocation.value ? { location: resLocation.value, custodian: resCustodian.value || undefined } : {}),
    ...(kind === 'impairment' ? { recoverable: num(resRecoverable.value) } : {}),
    ...(kind === 'capitalise' ? { newAsset: { name: resName.value, class: resClass.value, cost: num(resCost.value) } } : {}),
  })
  if (!r.ok) { resError.value = r; return }
  editing.value = null
}
function resolutionLabel(kind: ResolutionKind): string {
  return Object.values(RESOLUTION_OPTIONS).flat().find((o) => o.value === kind)?.label ?? kind
}
/** The carrying amounts a write-off removes, for a reader allowed to see them. */
function writeOffFigure(v: Variance): string {
  if (!v.assetId || !canSeeFinancials.value) return ''
  const a = findAsset(v.assetId)
  if (!a || a.bookValueCommercial === null) return ''
  return `${formatIDRWhole(a.bookValueCommercial)} accounting · ${a.bookValueFiscal === null ? 'no tax book' : `${formatIDRWhole(a.bookValueFiscal)} tax`}`
}

// ── Close and abandon (FG5-AC1, OD-26) ──────────────────────────────────────
const closeError = ref('')
function close() {
  if (!active.value) return
  closeError.value = ''
  const id = active.value.id
  const r = closeSession(id)
  if (!r.ok) { closeError.value = r.reason; return }
  if (r.requests.length) {
    successToast(t(`${r.applied} ${r.applied === 1 ? 'resolution' : 'resolutions'} applied. ${r.requests.map((x) => x.id).join(', ')} sent for approval`))
  } else {
    successToast(t(`${id} closed. ${r.applied} ${r.applied === 1 ? 'resolution' : 'resolutions'} applied`))
  }
}
const abandoning = ref(false)
const abandonReason = ref('')
const abandonError = ref('')
function abandon() {
  if (!active.value) return
  const r = abandonSession(active.value.id, abandonReason.value)
  if (!r.ok) { abandonError.value = r.reason; return }
  abandoning.value = false
  abandonReason.value = ''
  infoToast(t(`${r.session.id} abandoned`))
}
const requests = computed(() => (active.value
  ? sessionRequestIds(active.value).map((id) => requestById(id)).filter((r): r is NonNullable<typeof r> => !!r)
  : []))

watch(activeId, () => {
  scanAt.value = activeLocations.value[0] ?? ''
  lastOutcomes.value = []
  scanError.value = ''
  closeError.value = ''
  editing.value = null
  abandoning.value = false
}, { immediate: true })

const STATUS_LABEL: Record<string, string> = {
  counting: 'Counting', resolving: 'Resolving variances', 'awaiting-approval': 'Awaiting approval', closed: 'Closed', abandoned: 'Abandoned',
}
const STATUS_TONE: Record<string, string> = {
  counting: 'cc__res--muted', resolving: 'cc__res--warn', 'awaiting-approval': 'cc__res--warn', closed: 'cc__res--ok', abandoned: 'cc__res--muted',
}

// ── Custody (OD-22) ─────────────────────────────────────────────────────────
const openCustodian = ref<string | null>(null)
const reassignTo = ref('')
const reassignReason = ref('')
const reassignError = ref('')
watch(openCustodian, () => { reassignTo.value = ''; reassignReason.value = ''; reassignError.value = '' })
function markLeft(name: string) {
  const e = markCustodianLeft(name)
  if (e) { reassignError.value = e; return }
  infoToast(t(`${name} marked as left`))
}
function reassign(from: string) {
  const r = reassignAll(from, reassignTo.value, reassignReason.value)
  if (!r.ok) { reassignError.value = r.reason; return }
  successToast(t(`Assets reassigned to ${reassignTo.value}`))
  openCustodian.value = null
}
const custodyAsset = ref<FixedAsset | null>(null)
function onCustodySaved(m: string) {
  custodyAsset.value = null
  successToast(t(m))
}
</script>

<template>
  <div class="cc">
    <header class="cc__head">
      <div class="cc__actions" data-tour="count-new">
        <MpButton is-rounded left-icon="add" @click="openSetup">{{ t('New count session') }}</MpButton>
      </div>
    </header>

    <!-- ── Session setup ── -->
    <div v-if="setupOpen" class="cc__card" data-tour="count-setup">
      <div class="cc__cardhead">
        <span class="cc__cardtitle">{{ t('New count session') }}</span>
        <span class="cc__hint">{{ t('The asset list is fixed when the count starts') }}</span>
      </div>
      <div class="cc__pad">
        <div class="cc__setup">
          <div class="cc__field">
            <span class="cc__label">{{ t('Scope') }}</span>
            <MpSegmentedControl id="cc-scope-type" v-model="scopeType" name="cc-scope-type" :data="scopeTypeOptions" />
          </div>
          <div class="cc__field cc__field--grow">
            <label class="cc__label" for="cc-scope">{{ scopeType === 'location' ? t('Location') : t('Custodian') }}</label>
            <ErpFilterSelect id="cc-scope" v-model="scope" :placeholder="scopeType === 'location' ? t('Select location') : t('Select custodian')" :options="scopeOptions" width="100%" />
          </div>
        </div>
        <p v-if="scope" class="cc__hint">
          {{ setupPopulation.length }} {{ t(setupPopulation.length === 1 ? 'tagged asset in scope' : 'tagged assets in scope') }}<template v-if="setupPopulation.length">: {{ setupPopulation.map((p) => p.assetId).join(', ') }}</template>
          · {{ t('counted by') }} {{ actingUser }}
        </p>
        <p v-if="setupError" class="cc__error">{{ t(setupError) }}</p>
        <div class="cc__rowactions">
          <MpButton variant="ghost" is-rounded @click="setupOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton is-rounded @click="startSession">{{ t('Start count') }}</MpButton>
        </div>
      </div>
    </div>

    <!-- ── Sessions ── -->
    <div class="cc__card">
      <div class="cc__cardhead">
        <span class="cc__cardtitle">{{ t('Count sessions') }}</span>
        <span class="cc__hint">{{ countSessions.filter(isOpenSession).length }} {{ t('open') }} · {{ countSessions.length }} {{ t('total') }}</span>
      </div>
      <p v-if="!countSessions.length" class="cc__empty">
        {{ t('Count sessions will appear here. Start one with New count session.') }}
      </p>
      <table v-else class="cc__table">
        <thead>
          <tr>
            <th class="cc__th">{{ t('Session') }}</th>
            <th class="cc__th">{{ t('Scope') }}</th>
            <th class="cc__th">{{ t('Started') }}</th>
            <th class="cc__th">{{ t('Counted by') }}</th>
            <th class="cc__th cc__th--num">{{ t('Assets') }}</th>
            <th class="cc__th">{{ t('Status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in countSessions" :key="s.id" class="cc__tr cc__tr--click" :class="{ 'cc__tr--on': s.id === activeId }" @click="activeId = s.id">
            <td class="cc__td"><span class="cc__link">{{ s.id }}</span></td>
            <td class="cc__td">{{ s.scopeLabel }}</td>
            <td class="cc__td">{{ s.frozenOn }}</td>
            <td class="cc__td">{{ s.counter }}</td>
            <td class="cc__td cc__td--num">{{ s.population.length }}</td>
            <td class="cc__td"><span class="cc__res" :class="STATUS_TONE[s.status]">{{ t(STATUS_LABEL[s.status] ?? s.status) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── The session on screen ── -->
    <template v-if="active">
      <div class="cc__sessionbar" data-tour="count-session">
        <div>
          <div class="cc__cardtitle">{{ active.id }} · {{ active.scopeLabel }}</div>
          <div class="cc__hint">
            {{ t('Started') }} {{ active.frozenOn }} · {{ active.population.length }} {{ t('assets') }} · {{ t('counted by') }} {{ active.counter }}
          </div>
        </div>
        <div class="cc__actions">
          <MpButton v-if="isOpenSession(active)" variant="ghost" is-rounded @click="abandoning = true; abandonError = ''">{{ t('Abandon session') }}</MpButton>
          <MpButton v-if="active.status === 'resolving'" variant="secondary" is-rounded @click="backToCounting">{{ t('Back to counting') }}</MpButton>
          <MpButton v-if="active.status === 'counting'" is-rounded @click="finish">{{ t('Finish count') }}</MpButton>
          <MpButton v-if="active.status === 'resolving'" is-rounded @click="close">{{ t('Close session') }}</MpButton>
        </div>
      </div>

      <p v-if="closeError" class="cc__error cc__closeerror">{{ t(closeError) }}</p>

      <MpBanner v-if="active.status === 'closed'" id="cc-closed-banner" variant="success" class="cc__note">
        <MpBannerIcon id="cc-closed-icon" />
        <MpBannerTitle>{{ t(`Closed ${active.closedOn} by ${active.closedBy}`) }}</MpBannerTitle>
      </MpBanner>
      <MpBanner v-else-if="active.status === 'abandoned'" id="cc-abandoned-banner" variant="warning" class="cc__note">
        <MpBannerIcon id="cc-abandoned-icon" />
        <MpBannerTitle>{{ t(`Abandoned ${active.closedOn} by ${active.closedBy}`) }}</MpBannerTitle>
        <MpBannerDescription>{{ t('Reason') }}: {{ active.abandonReason }}. {{ t('No findings were applied.') }}</MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="active.status === 'awaiting-approval'" id="cc-await-banner" variant="info" class="cc__note">
        <MpBannerIcon id="cc-await-icon" />
        <MpBannerTitle>{{ t('Awaiting approval') }}: {{ requests.filter((r) => r.status === 'awaiting').map((r) => r.id).join(', ') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('Other resolutions are applied. The session closes once the requests are approved.') }}
          <span class="cc__link" @click="router.push('/asset-approvals')">{{ t('Go to Asset approvals') }}</span>
        </MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="active.returnedNote" id="cc-returned-banner" variant="warning" class="cc__note">
        <MpBannerIcon id="cc-returned-icon" />
        <MpBannerTitle>{{ t('Sent back') }}</MpBannerTitle>
        <MpBannerDescription>{{ active.returnedNote }}</MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="active.status === 'resolving' && unresolved.length" id="cc-open-banner" variant="warning" class="cc__note">
        <MpBannerIcon id="cc-open-icon" />
        <MpBannerTitle>{{ unresolved.length }} {{ t(unresolved.length === 1 ? 'unresolved variance' : 'unresolved variances') }}</MpBannerTitle>
        <MpBannerDescription>
          {{ t('Resolve each one to close the session.') }}
        </MpBannerDescription>
      </MpBanner>

      <div class="cc__grid">
        <!-- ── Capture ── -->
        <div v-if="active.status === 'counting'" class="cc__card cc__capture" data-tour="count-mobile">
          <div class="cc__cardhead">
            <span class="cc__cardtitle">{{ t('Scan') }}</span>
          </div>
          <div class="cc__pad">
            <div class="cc__field">
              <label class="cc__label" for="cc-scan">{{ t('Tag code') }}</label>
              <!-- A textarea, so a pasted column keeps its line breaks. A
                   scanner's Enter records at once. -->
              <MpTextarea id="cc-scan" v-model="scanText" :is-invalid="!!scanError" is-full-width @keydown.enter.exact.prevent="capture" />
              <p class="cc__hint">{{ t('Scan, type or paste one or more codes. Press Enter to record.') }}</p>
            </div>
            <div class="cc__field">
              <label class="cc__label" for="cc-scan-at">{{ t('Counting at') }}</label>
              <ErpFilterSelect id="cc-scan-at" v-model="scanAt" :placeholder="t('Select location')" :options="allLocationOptions" width="100%" :is-clearable="false" />
            </div>
            <div class="cc__field">
              <label class="cc__label" for="cc-scan-cond">{{ t('Condition') }}</label>
              <ErpFilterSelect id="cc-scan-cond" v-model="scanCondition" :placeholder="t('Select condition')" :options="conditionOptions" width="100%" :is-clearable="false" />
            </div>
            <p v-if="scanError" class="cc__error">{{ t(scanError) }}</p>
            <div class="cc__rowactions">
              <MpButton is-rounded @click="capture">{{ t('Record scan') }}</MpButton>
            </div>
            <ul v-if="lastOutcomes.length" class="cc__outcomes">
              <li v-for="o in lastOutcomes" :key="o.code" :class="`cc__outcome--${o.result}`">{{ t(o.message) }}</li>
            </ul>
          </div>
        </div>

        <!-- ── Count results ── -->
        <div class="cc__card" :class="{ 'cc__span': active.status !== 'counting' }">
          <div class="cc__cardhead">
            <span class="cc__cardtitle">{{ t('Count results') }}</span>
            <span class="cc__hint">{{ countedCount }} {{ t('of') }} {{ active.population.length }} {{ t('counted') }}</span>
          </div>
          <table class="cc__table">
            <thead>
              <tr>
                <th class="cc__th">{{ t('Tag') }}</th>
                <th class="cc__th">{{ t('Asset') }}</th>
                <th class="cc__th">{{ t('Expected at') }}</th>
                <th class="cc__th">{{ t('Result') }}</th>
                <th class="cc__th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.assetId" class="cc__tr">
                <td class="cc__td cc__td--mono">{{ l.tag }}</td>
                <td class="cc__td">
                  <span class="cc__link" @click="router.push(`/assets/${l.assetId}`)">{{ l.name }}</span>
                  <span class="cc__where">{{ l.assetId }}<template v-if="l.scan"> · {{ t('scanned') }} {{ l.scan.at.slice(11) }} {{ t('by') }} {{ l.scan.by }}</template></span>
                </td>
                <td class="cc__td">{{ l.expectedLocation ?? t('Not recorded') }}</td>
                <td class="cc__td">
                  <span class="cc__res" :class="RESULT_TONE[l.result]">{{ t(RESULT_LABEL[l.result]) }}</span>
                  <span v-if="l.result === 'wrong-location' && l.scan" class="cc__where">{{ t('at') }} {{ l.scan.foundAt }}</span>
                </td>
                <td class="cc__td cc__td--action">
                  <span v-if="active.status === 'counting' && l.scan" class="cc__link" @click="removeScan(active.id, l.tag)">{{ t('Undo scan') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Variances ── -->
      <div v-if="active.status !== 'counting'" class="cc__card" data-tour="var-table">
        <div class="cc__cardhead">
          <span class="cc__cardtitle">{{ t('Variances') }}</span>
          <span class="cc__hint">{{ unresolved.length }} {{ t('open') }} · {{ variances.length - unresolved.length }} {{ t('resolved') }}</span>
        </div>
        <p v-if="!variances.length" class="cc__empty">{{ t('No variances. Every asset was found as recorded.') }}</p>
        <table v-else class="cc__table">
          <thead>
            <tr>
              <th class="cc__th">{{ t('Asset') }}</th>
              <th class="cc__th">{{ t('Finding') }}</th>
              <th class="cc__th">{{ t('Details') }}</th>
              <th class="cc__th">{{ t('Resolution') }}</th>
              <th class="cc__th" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in variances" :key="v.id" class="cc__tr">
              <td class="cc__td">
                {{ v.tag }} {{ v.name }}
                <span v-if="v.assetId" class="cc__where">{{ v.assetId }}</span>
              </td>
              <td class="cc__td">{{ t(FINDING_LABEL[v.kind]) }}</td>
              <td class="cc__td cc__td--wrap">{{ v.explanation }}</td>
              <td class="cc__td cc__td--wrap">
                <template v-if="active.resolutions[v.id]">
                  <span class="cc__res" :class="active.resolutions[v.id]!.approvalId && !active.resolutions[v.id]!.applied ? 'cc__res--warn' : 'cc__res--ok'">
                    <template v-if="active.resolutions[v.id]!.approvalId && !active.resolutions[v.id]!.applied">{{ t('Sent for approval') }}</template>
                    <template v-else>{{ t(resolutionLabel(active.resolutions[v.id]!.kind)) }}</template>
                    <template v-if="active.resolutions[v.id]!.location"> · {{ active.resolutions[v.id]!.location }}</template>
                  </span>
                  <span class="cc__where">{{ active.resolutions[v.id]!.outcome ?? `${t('Applies when the session closes')} · ${active.resolutions[v.id]!.reason}` }}</span>
                  <span v-if="active.resolutions[v.id]!.kind === 'write-off' && writeOffFigure(v)" class="cc__where">{{ t('Removes') }} {{ writeOffFigure(v) }}</span>
                </template>
                <span v-else class="cc__res cc__res--bad">{{ t('Unresolved') }}</span>
              </td>
              <td class="cc__td cc__td--action">
                <template v-if="active.status === 'resolving'">
                  <MpButton variant="secondary" is-rounded @click="startResolve(v)">{{ active.resolutions[v.id] ? t('Edit') : t('Resolve') }}</MpButton>
                  <span v-if="active.resolutions[v.id]" class="cc__link cc__undo" @click="clearResolution(active.id, v.id)">{{ t('Clear resolution') }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- The resolution editor: a choice, not a fixed action per row. -->
        <div v-if="editing && active.status === 'resolving'" class="cc__resolve">
          <div class="cc__cardtitle">{{ t('Resolve') }} {{ editing.tag }} {{ editing.name }} · {{ t(FINDING_LABEL[editing.kind]) }}</div>
          <div class="cc__setup">
            <div class="cc__field cc__field--grow">
              <label class="cc__label" for="cc-res-kind">{{ t('Resolution') }}</label>
              <ErpFilterSelect id="cc-res-kind" v-model="resKind" :placeholder="t('Select resolution')" :options="resOptions" width="100%" :is-clearable="false" />
              <p v-if="resErr('kind')" class="cc__error">{{ t(resErr('kind')) }}</p>
              <p v-else-if="resHint" class="cc__hint">{{ t(resHint) }}</p>
            </div>
            <template v-if="needsLocation">
              <div class="cc__field cc__field--grow">
                <label class="cc__label" for="cc-res-loc">{{ t('Current location') }}</label>
                <ErpFilterSelect id="cc-res-loc" v-model="resLocation" :placeholder="t('Select location')" :options="locationOptions" width="100%" />
                <p v-if="resErr('location')" class="cc__error">{{ t(resErr('location')) }}</p>
              </div>
              <div class="cc__field cc__field--grow">
                <label class="cc__label" for="cc-res-cust">{{ t('Current custodian') }}</label>
                <ErpFilterSelect id="cc-res-cust" v-model="resCustodian" :placeholder="t('Unchanged')" :options="custodianOptions" width="100%" />
              </div>
            </template>
            <div v-if="resKind === 'impairment'" class="cc__field cc__field--grow">
              <label class="cc__label" for="cc-res-rec">{{ t('Recoverable amount (Rp)') }}</label>
              <MpInput id="cc-res-rec" v-model="resRecoverable" :is-invalid="!!resErr('recoverable')" />
              <p v-if="resErr('recoverable')" class="cc__error">{{ t(resErr('recoverable')) }}</p>
            </div>
            <template v-if="resKind === 'capitalise'">
              <div class="cc__field cc__field--grow">
                <label class="cc__label" for="cc-res-name">{{ t('Asset name') }}</label>
                <MpInput id="cc-res-name" v-model="resName" :is-invalid="!!resErr('name')" />
                <p v-if="resErr('name')" class="cc__error">{{ t(resErr('name')) }}</p>
              </div>
              <div class="cc__field cc__field--grow">
                <label class="cc__label" for="cc-res-class">{{ t('Class') }}</label>
                <ErpFilterSelect id="cc-res-class" v-model="resClass" :placeholder="t('Select class')" :options="classOptions" width="100%" />
                <p v-if="resErr('class')" class="cc__error">{{ t(resErr('class')) }}</p>
              </div>
              <div class="cc__field cc__field--grow">
                <label class="cc__label" for="cc-res-cost">{{ t('Cost (Rp)') }}</label>
                <MpInput id="cc-res-cost" v-model="resCost" :is-invalid="!!resErr('cost')" />
                <p v-if="resErr('cost')" class="cc__error">{{ t(resErr('cost')) }}</p>
              </div>
            </template>
          </div>
          <div class="cc__field">
            <label class="cc__label" for="cc-res-reason">{{ t('Reason') }}</label>
            <MpInput id="cc-res-reason" v-model="resReason" :is-invalid="!!resErr('reason')" />
            <p v-if="resErr('reason') || resErr('session') || resErr('role') || resErr('variance')" class="cc__error">{{ t(resErr('reason') || resErr('session') || resErr('role') || resErr('variance')) }}</p>
          </div>
          <div class="cc__rowactions">
            <MpButton variant="ghost" is-rounded @click="editing = null">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded @click="saveResolution">{{ t('Save resolution') }}</MpButton>
          </div>
        </div>
      </div>

      <!-- The approvals a session raised, with their totals, so the count
           report carries the decision. -->
      <div v-for="r in requests" :key="r.id" class="cc__card cc__pad">
        <div class="cc__cardtitle">{{ r.id }} · {{ r.title }}</div>
        <div class="cc__hint">
          {{ t(r.status === 'awaiting' ? 'Awaiting approval' : r.status === 'approved' ? `Approved ${r.decidedOn} by ${r.decidedBy}` : `Sent back ${r.decidedOn} by ${r.decidedBy}`) }}
          · {{ t('requested by') }} {{ r.raisedBy }} {{ r.raisedOn }}
          <template v-if="canSeeFinancials"> · {{ t('total') }} {{ formatIDRWhole(requestTotal(r).accounting) }} {{ t('accounting') }}, {{ formatIDRWhole(requestTotal(r).tax) }} {{ t('tax') }}</template>
        </div>
      </div>
    </template>

    <!-- ── Custody ── -->
    <div class="cc__grid cc__grid--custody">
      <div class="cc__card" data-tour="cust-table">
        <div class="cc__cardhead">
          <span class="cc__cardtitle">{{ t('Custody') }}</span>
        </div>
        <table class="cc__table">
          <thead>
            <tr>
              <th class="cc__th">{{ t('Custodian') }}</th>
              <th class="cc__th">{{ t('Department') }}</th>
              <th class="cc__th cc__th--num">{{ t('Assets') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in custodianSummary" :key="c.name">
              <tr class="cc__tr cc__tr--click" :class="{ 'cc__tr--on': openCustodian === c.name }" @click="openCustodian = openCustodian === c.name ? null : c.name">
                <td class="cc__td">
                  <span class="cc__link">{{ c.name }}</span>
                  <span v-if="c.hasLeft" class="cc__res cc__res--bad cc__left">{{ t('Left') }}</span>
                  <span class="cc__where">{{ c.locations.join(', ') || t('No location recorded') }}</span>
                </td>
                <td class="cc__td">{{ c.department }}<span class="cc__where">{{ c.branch }}</span></td>
                <td class="cc__td cc__td--num">{{ c.held.length }}</td>
              </tr>
              <tr v-if="openCustodian === c.name">
                <td class="cc__td cc__held" colspan="3">
                  <div v-for="a in c.held" :key="a.id" class="cc__heldrow">
                    <span class="cc__link" @click="router.push(`/assets/${a.id}`)">{{ a.id }} {{ a.name }}</span>
                    <span class="cc__where">{{ a.tag }} · {{ a.location ?? t('Not recorded') }}</span>
                  </div>
                  <div v-if="canEditCustody && c.held.length" class="cc__reassign">
                    <div class="cc__setup">
                      <div class="cc__field cc__field--grow">
                        <label class="cc__label" :for="`cc-re-${c.person}`">{{ t('Reassign all assets to') }}</label>
                        <ErpFilterSelect :id="`cc-re-${c.person}`" v-model="reassignTo" :placeholder="t('Select custodian')" :options="custodianOptions.filter((o) => o.value !== c.name)" width="100%" />
                      </div>
                      <div class="cc__field cc__field--grow">
                        <label class="cc__label" :for="`cc-rr-${c.person}`">{{ t('Reason') }}</label>
                        <MpInput :id="`cc-rr-${c.person}`" v-model="reassignReason" />
                      </div>
                    </div>
                    <p v-if="reassignError" class="cc__error">{{ t(reassignError) }}</p>
                    <div class="cc__rowactions">
                      <MpButton v-if="!c.hasLeft" variant="ghost" is-rounded @click="markLeft(c.name)">{{ t('Mark as left') }}</MpButton>
                      <MpButton variant="secondary" is-rounded @click="reassign(c.name)">{{ t('Reassign all') }}</MpButton>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- FG-4.3: no custodian is a normal state, surfaced rather than blocked. -->
      <div class="cc__card" data-tour="cust-unassigned">
        <div class="cc__cardhead">
          <span class="cc__cardtitle">{{ t('Unassigned') }}</span>
          <span class="cc__hint">{{ unassignedAssets.length }} {{ t(unassignedAssets.length === 1 ? 'asset needs a custodian or location' : 'assets need a custodian or location') }}</span>
        </div>
        <p v-if="!unassignedAssets.length" class="cc__empty">{{ t('All assets have a custodian and location.') }}</p>
        <table v-else class="cc__table">
          <tbody>
            <tr v-for="a in unassignedAssets" :key="a.id" class="cc__tr">
              <td class="cc__td">
                <span class="cc__link" @click="router.push(`/assets/${a.id}`)">{{ a.name }}</span>
                <span class="cc__where">{{ a.id }} · {{ a.tag }}</span>
              </td>
              <td class="cc__td">
                <span :class="{ 'cc__gap': !a.custodian || leftCustodians.includes(a.custodian) }">{{ a.custodian ?? t('Unassigned') }}<template v-if="a.custodian && leftCustodians.includes(a.custodian)"> ({{ t('left') }})</template></span>
                <span class="cc__where" :class="{ 'cc__gap': !a.location }">{{ a.location ?? t('No location') }}</span>
              </td>
              <td class="cc__td cc__td--action">
                <MpButton v-if="canEditCustody" variant="secondary" is-rounded @click="custodyAsset = a">{{ t('Assign') }}</MpButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!canEditCustody" class="cc__empty">{{ t('Only General Affairs, Accounting or the Owner can change custody.') }}</p>
      </div>
    </div>

    <MpModal
      id="cc-abandon-modal" :is-open="abandoning && !!active && isOpenSession(active)" size="md" :is-keep-alive="false"
      :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="abandoning = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t(`Abandon ${active?.id ?? ''}?`) }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="cc__hint cc__modaltext">{{ t('None of its findings will be applied. The session stays on the list as abandoned.') }}</p>
          <div class="cc__field">
            <label class="cc__label" for="cc-abandon">{{ t('Reason') }}</label>
            <MpInput id="cc-abandon" v-model="abandonReason" :is-invalid="!!abandonError" />
            <p v-if="abandonError" class="cc__error">{{ t(abandonError) }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButton variant="ghost" is-rounded @click="abandoning = false">{{ t('Keep session') }}</MpButton>
          <MpButton variant="danger" is-rounded @click="abandon">{{ t('Abandon session') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <CustodyDrawer v-if="custodyAsset" :is-open="!!custodyAsset" :asset="custodyAsset" @close="custodyAsset = null" @saved="onCustodySaved" />
    <p v-if="!canCount" class="cc__hint">{{ t('Only General Affairs, Accounting or the Owner can run counts.') }}</p>
  </div>
</template>

<style scoped>
.cc__head { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.cc__actions { display: flex; gap: var(--mp-spacing-2); flex: none; }
.cc__note { margin-bottom: var(--mp-spacing-4); }
.cc__sessionbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }

.cc__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: var(--mp-spacing-4); align-items: start; }
.cc__grid--custody { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
.cc__span { grid-column: 1 / -1; }
@media (max-width: 1100px) { .cc__grid, .cc__grid--custody { grid-template-columns: 1fr; } }

.cc__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.cc__pad { padding: var(--mp-spacing-4); }
.cc__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cc__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; }
.cc__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.cc__closeerror { margin-bottom: var(--mp-spacing-4); }
.cc__modaltext { margin-bottom: var(--mp-spacing-4); }
.cc__empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-4); }

/* Capture is a phone job: the column is phone-width on purpose. */
.cc__capture { max-width: 420px; }

.cc__setup { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-4); align-items: flex-start; }
.cc__field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.cc__field--grow { flex: 1 1 220px; min-width: 0; }
.cc__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc__rowactions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }

.cc__outcomes { list-style: none; margin: var(--mp-spacing-3) 0 0; padding: 0; font-size: var(--mp-font-sizes-sm); }
.cc__outcomes li { padding: var(--mp-spacing-1) 0; }
.cc__outcome--counted { color: var(--mp-colors-text-success); }
.cc__outcome--duplicate { color: var(--mp-text-secondary); }
.cc__outcome--outside, .cc__outcome--unrecorded { color: var(--mp-colors-text-warning); }

.cc__resolve { padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.cc__resolve .cc__setup { margin-top: var(--mp-spacing-3); }

.cc__table { width: 100%; border-collapse: collapse; }
.cc__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cc__th--num { text-align: right; }
.cc__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.cc__td--num { text-align: right; font-variant-numeric: tabular-nums; }
.cc__td--mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
.cc__td--wrap { max-width: 320px; }
.cc__td--action { text-align: right; white-space: nowrap; }
.cc__tr--click { cursor: pointer; }
.cc__tr--click:hover .cc__td { background: var(--mp-background-neutral-subtle); }
.cc__tr--on .cc__td { background: var(--mp-background-neutral-subtle); }
.cc__link { color: var(--mp-text-link); cursor: pointer; }
.cc__link:hover { text-decoration: underline; }
.cc__undo { margin-left: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); }
.cc__where { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.cc__gap { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.cc__left { margin-left: var(--mp-spacing-2); }
.cc__held { background: var(--mp-background-neutral-subtle); }
.cc__heldrow { padding: var(--mp-spacing-1) 0; }
.cc__reassign { margin-top: var(--mp-spacing-3); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }

.cc__res { display: inline-block; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); white-space: nowrap; }
.cc__res--ok { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.cc__res--warn { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.cc__res--bad { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.cc__res--muted { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
</style>
