<script setup lang="ts">
/**
 * Project BOM detail (PRD v6.2 §5, §7 · Stories 6, 7, 9):
 *
 *   • origin statement (the master never propagates into the project; v6.2 OQ 28
 *     keeps the divergence backstage, so there is no "master has changed" notice);
 *   • version switcher — each version with its status (Active / Superseded) and how
 *     many work orders reference it; the first reference locks a version for good;
 *   • a Superseded version is read-only and names the Active one;
 *   • Edit BOM (Production) — in place while unreferenced, otherwise publishes vN+1
 *     and raises an ECO (BomEditDrawer);
 *   • the work orders on this BOM, each with its pinned version and the neutral
 *     newer-version indicator;
 *   • append-only version history with the ECO each publish raised.
 */
import { MpButton, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpTextlink } from '@mekari/pixel3'
import PmOverlay from './PmOverlay.vue'
import PmActionError from './PmActionError.vue'
import BomEditDrawer from './eco/BomEditDrawer.vue'
import NewerVersionHint from './eco/NewerVersionHint.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { getCustomBom, currentVersion, masterBoms, bomUnitCost, versionStatus, partiallyUncosted } from '~/data/projectBoms'
import { blockingEco, engineeringChanges, getEco, ecoPath, ECO_REASON_LABELS, type EcoReason } from '~/data/projectChanges'
import { bomEditRefusal, versionRefs } from '~/data/projectActions'
import { projectWorkOrders } from '~/data/projectTransactions'
import { rp, num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ open: boolean; bomId?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
const router = useRouter()
const { asActor } = useProjectRole()
const editAction = useProjectAction()

const bom = computed(() => getCustomBom(props.bomId))
const active = computed(() => (bom.value ? currentVersion(bom.value) : undefined))
// '' = follow the Active version (so it tracks a fresh publish); the select shows it as its value.
const pickedVersion = ref('')
watch(() => props.bomId, () => { pickedVersion.value = ''; editAction.clear() })
const viewVersion = computed({
  get: () => pickedVersion.value || (active.value ? String(active.value.version) : ''),
  set: (v: string) => { pickedVersion.value = v && active.value && v === String(active.value.version) ? '' : v },
})
const shown = computed(() => {
  const b = bom.value
  if (!b) return undefined
  return b.versions.find(v => String(v.version) === viewVersion.value) ?? currentVersion(b)
})
const shownStatus = computed(() => (bom.value && shown.value ? versionStatus(bom.value, shown.value.version) : 'active'))
const refCount = (v: number) => (bom.value ? versionRefs(bom.value.id, v).length : 0)
const versionOptions = computed(() => (bom.value ? [...bom.value.versions].reverse().map(v => {
  const n = refCount(v.version)
  const status = versionStatus(bom.value!, v.version) === 'active' ? t('Active') : t('Superseded')
  return { value: String(v.version), label: `v${v.version} · ${status} · ${n} ${n === 1 ? t('work order') : t('work orders')}${n ? ` · ${t('locked')}` : ''}` }
}) : []))

const master = computed(() => masterBoms.find(m => m.id === bom.value?.masterBomId))

const blocker = computed(() => (bom.value ? blockingEco(bom.value.id) : undefined))
const wos = computed(() => (bom.value ? projectWorkOrders.filter(w => w.customBomId === bom.value!.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []))
const ecoFor = (refNo?: string) => (refNo ? engineeringChanges.find(e => e.no === refNo) : undefined)
function sourceText(v: { source: string; reasonCode?: string; editedAt?: string }) {
  if (v.source === 'copy') return t('Copied from master')
  if (v.source === 'publish') return `${t('Published')} — ${t(ECO_REASON_LABELS[v.reasonCode as EcoReason] ?? 'Engineering change')}`
  if (v.source === 'revert') return t('Revert')
  return t('Engineering change')
}

const editOpen = ref(false)
function openEdit() {
  if (!bom.value) return
  const refusal = bomEditRefusal(bom.value.id, asActor.value)
  if (refusal) { editAction.fail(refusal); return }
  editAction.clear()
  editOpen.value = true
}
function onSaved(ecoId?: string) {
  editOpen.value = false
  viewVersion.value = ''
  const e = getEco(ecoId)
  if (e) { emit('close'); router.push(ecoPath(e)) }
}
const goEco = (id: string) => { const e = getEco(id); if (e) { emit('close'); router.push(ecoPath(e)) } }
</script>

<template>
  <PmOverlay id="pm-bom-detail" :open="open && !!bom" :title="bom?.name ?? ''" :subtitle="bom && active ? `${t('Project BOM')} · v${active.version} ${t('Active')}` : ''" wide @close="emit('close')">
    <template v-if="bom && shown && active">
      <MpBanner id="bom-origin" variant="info">
        <MpBannerIcon />
        <MpBannerDescription>
          {{ t('Copied from') }} <strong>{{ bom.masterName }}</strong><template v-if="master?.archived"> ({{ t('archived') }})</template> {{ t('on') }} {{ formatDate(bom.copiedAt) }}.
          {{ t('Later changes to the master do not affect this copy.') }}
        </MpBannerDescription>
      </MpBanner>

      <MpBanner v-if="bom.archived" id="bom-archived" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>{{ t('Archived on') }} {{ formatDate(bom.archived.at) }} — {{ bom.archived.reason }}</MpBannerDescription>
      </MpBanner>

      <!-- Version switcher + edit -->
      <div class="pm-row" data-devchange="eco-bom-version-switcher">
        <ErpFilterSelect id="bom-version-switch" v-model="viewVersion" :placeholder="t('Version')" :options="versionOptions" width="320px" :is-clearable="false" />
        <ErpStatusBadge v-bind="badgeProps('bomv', shownStatus, t)" />
        <span class="pm-spacer" />
        <span class="pm-muted pm-small">{{ t('Unit cost') }} {{ rp(bomUnitCost(shown)) }}<template v-if="partiallyUncosted(shown)"> ({{ t('partially uncosted') }})</template></span>
        <MpButton v-if="!bom.archived" id="bom-edit" variant="secondary" is-rounded data-devchange="eco-publish-version" @click="openEdit">{{ t('Edit BOM') }}</MpButton>
      </div>
      <PmActionError id="bom-edit-error" :error="editAction.error.value" />

      <MpBanner v-if="shownStatus === 'superseded'" id="bom-superseded" variant="info">
        <MpBannerIcon />
        <MpBannerTitle>{{ t('Read-only') }} — v{{ shown.version }} {{ t('is superseded') }}</MpBannerTitle>
        <MpBannerDescription>
          v{{ active.version }} {{ t('is the Active version since') }} {{ formatDate(active.createdAt) }}. {{ t('Work orders pinned to') }} v{{ shown.version }} {{ t('keep building it until the PM adopts a newer version.') }}
          <MpTextlink id="bom-view-active" as="a" @click.prevent="viewVersion = ''">{{ t('View') }} v{{ active.version }}</MpTextlink>
        </MpBannerDescription>
      </MpBanner>
      <MpBanner v-else-if="blocker" id="bom-blocked" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>
          {{ blocker.no }} {{ t('is open on this BOM, so it can’t be edited until the PM decides it.') }}
          <MpTextlink id="bom-open-blocker" as="a" @click.prevent="goEco(blocker.id)">{{ t('View') }} {{ blocker.no }}</MpTextlink>
        </MpBannerDescription>
      </MpBanner>
      <p v-else class="pm-caption pm-m-0">
        <template v-if="refCount(shown.version)">{{ t('Locked — referenced by') }} {{ refCount(shown.version) }} {{ t('work order(s). Editing publishes') }} v{{ shown.version + 1 }} {{ t('and raises an engineering change.') }}</template>
        <template v-else>{{ t('Not referenced by any work order yet — edits save in place.') }}</template>
      </p>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead><tr><th>{{ t('Component') }}</th><th class="pm-num">{{ t('Qty per unit') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th class="pm-num">{{ t('Line cost') }}</th></tr></thead>
          <tbody>
            <tr v-for="c in shown.components" :key="c.name"><td>{{ c.name }}</td><td class="pm-num">{{ num(c.qty) }}</td><td>{{ c.unit }}</td><td class="pm-num">{{ c.unitCost !== undefined ? rp(c.unitCost) : 'Δ n/a' }}</td><td class="pm-num">{{ c.unitCost !== undefined ? rp(c.qty * c.unitCost) : '—' }}</td></tr>
            <tr v-for="p in shown.productionCost" :key="p.name" class="pm-tr-sub"><td>{{ p.name }}</td><td class="pm-num">1</td><td>{{ t(p.kind === 'labor' ? 'Labor' : p.kind === 'overhead' ? 'Overhead' : 'Other') }}</td><td class="pm-num">{{ rp(p.perUnit) }}</td><td class="pm-num">{{ rp(p.perUnit) }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Work orders on this BOM (Story 9: version per row + neutral indicator) -->
      <div>
        <h3 class="pm-h3 pm-mb-2">{{ t('Work orders on this BOM') }}</h3>
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead><tr><th>{{ t('Work order') }}</th><th>{{ t('Status') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('BOM version') }}</th></tr></thead>
            <tbody>
              <tr v-for="w in wos" :key="w.id">
                <td>{{ w.number }}<span class="pm-cell-sub">{{ w.createdBy }} · {{ formatDate(w.createdAt) }}</span></td>
                <td><ErpStatusBadge v-bind="badgeProps('wo', w.status, t)" /></td>
                <td class="pm-num">{{ w.qty }} {{ w.unit }}</td>
                <td>
                  <div class="pm-row pm-gap-2">
                    <span>v{{ w.bomVersion ?? '—' }}</span>
                    <NewerVersionHint :id="`bom-wo-hint-${w.id}`" :bom-id="bom.id" :version="w.bomVersion" :status="w.status" :wo-number="w.number" />
                  </div>
                </td>
              </tr>
              <tr v-if="!wos.length"><td colspan="4"><div class="pm-empty-inline">{{ t('No work order uses this BOM yet.') }}</div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 class="pm-h3 pm-mb-2">{{ t('Version history') }}</h3>
        <div class="pm-timeline">
          <div v-for="v in [...bom.versions].reverse()" :key="v.version" class="pm-tl-item pm-tl-item--compact">
            <div class="pm-tl-date">{{ formatDate(v.createdAt) }}</div>
            <span class="pm-tl-dot" :class="{ 'pm-tl-dot--muted': v.version !== active.version }" />
            <div>
              <div class="pm-tl-summary"><strong>v{{ v.version }}</strong> — {{ v.note }}</div>
              <div class="pm-tl-meta">
                <span>{{ v.createdBy }} · {{ sourceText(v) }}<template v-if="v.editedAt"> · {{ t('edited in place on') }} {{ formatDate(v.editedAt) }}</template></span>
                <MpTextlink v-if="ecoFor(v.refNo)" :id="`bom-eco-v${v.version}`" as="a" @click.prevent="goEco(ecoFor(v.refNo)!.id)">{{ v.refNo }}</MpTextlink>
                <MpTextlink v-if="String(shown.version) !== String(v.version)" :id="`bom-view-v${v.version}`" as="a" @click.prevent="viewVersion = String(v.version)">{{ t('View') }}</MpTextlink>
                <ErpStatusBadge v-bind="badgeProps('bomv', versionStatus(bom, v.version), t)" />
              </div>
            </div>
          </div>
        </div>
        <p class="pm-caption">{{ t('Versions are append-only and numbered once — a superseded version stays readable forever.') }}</p>
      </div>
    </template>
  </PmOverlay>
  <BomEditDrawer :open="editOpen" :bom-id="bomId" @close="editOpen = false" @saved="onSaved" />
</template>
