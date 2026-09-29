<script setup lang="ts">
/**
 * Production tab — the production picture for a project in one place.
 *
 * Merges what were two tabs (Production & materials, Engineering change) into
 * three read-only lists:
 *
 *   1 · Production plan — target vs actual output per work package, expandable
 *       to the component level (reserved / consumed / requested).
 *   2 · Active BOM version per work package, opening the BOM detail (where
 *       Production edits the BOM — publishing a new version of a locked one).
 *   3 · Work orders with the BOM version each is pinned to, and the neutral
 *       "newer version available" indicator (PRD v6.2 Story 9).
 *   4 · Engineering changes, opening the ECO page where the PM decides adoption.
 *
 * Deliberately information-only. Running MRP, reserving, releasing, advancing a
 * work order and raising an ECO all still exist — they live on the surfaces that
 * own those actions (Stock availability, the work-order gate, the approvals
 * inbox). A tab that only reports cannot leave a document half-created.
 *
 * Component quantities map to the reservation state machine (reserved → picked →
 * issued, plus release):
 *   reserved  = still held for this work package (reserved + picked)
 *   consumed  = issued into WIP, physically gone from stock
 *   requested = the MRP shortfall a draft purchase request would cover
 * Released reservations are excluded from all three — they went back to the pool.
 */
import { MpIcon, MpTextlink } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import NewerVersionHint from '../eco/NewerVersionHint.vue'
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage } from '~/data/projects'
import { projectReservations, getStockItem } from '~/data/projectReservations'
import { getCustomBom, currentVersion } from '~/data/projectBoms'
import { projectEcos, ecoPath, ECO_REASON_LABELS } from '~/data/projectChanges'
import { projectWos, projectWorkOrders } from '~/data/projectTransactions'
import { mrpPreview } from '~/data/projectActions'
import { num, rpSigned } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()

const wps = computed(() => projectWorkPackages(props.project.id).filter(w => w.type === 'production'))
const ecos = computed(() => projectEcos(props.project.id).slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)))
const wos = computed(() => projectWos(props.project.id))
const woNumber = (id: string) => projectWorkOrders.find(w => w.id === id)?.number ?? '—'

// Collapsed by default: the header line answers the question most of the time,
// and the component breakdown is the follow-up.
const open = ref<Set<string>>(new Set())
function toggle(id: string) {
  const s = new Set(open.value)
  s.has(id) ? s.delete(id) : s.add(id)
  open.value = s
}

const bomView = ref<string | undefined>()

/** Reserved / consumed / requested per component, for one work package. */
function componentsFor(wpId: string) {
  const res = projectReservations(props.project.id).filter(r => r.wpId === wpId)
  const shortfall = new Map<string, number>()
  for (const row of mrpPreview(wpId).rows) {
    if (row.shortfall) shortfall.set(row.item, row.shortfall)
  }

  const byItem = new Map<string, { name: string; unit: string; reserved: number; consumed: number; requested: number }>()
  for (const r of res) {
    const item = getStockItem(r.itemId)
    if (!item) continue
    const row = byItem.get(item.name) ?? { name: item.name, unit: item.unit, reserved: 0, consumed: 0, requested: 0 }
    if (r.status === 'reserved' || r.status === 'picked') row.reserved += r.qty
    else if (r.status === 'issued') row.consumed += r.qty
    byItem.set(item.name, row)
  }
  // A component can be short without ever having been reserved, so the shortfall
  // map contributes rows of its own rather than only annotating existing ones.
  for (const [name, qty] of shortfall) {
    const row = byItem.get(name) ?? { name, unit: '', reserved: 0, consumed: 0, requested: 0 }
    row.requested += qty
    byItem.set(name, row)
  }
  return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name))
}
</script>

<template>
  <div data-devchange="pm-production-tab">
    <!-- 1 · Production plan — information only -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Production plan') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('One table, two levels. A work package reports target against produced; its components report what is reserved, consumed into WIP and found short by MRP. A dash means the measure does not apply at that level.') }}</p>
        </div>
      </div>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Work package / component') }}</th>
              <th class="pm-num">{{ t('Target') }}</th>
              <th class="pm-num">{{ t('Produced') }}</th>
              <th class="pm-num">{{ t('Reserved') }}</th>
              <th class="pm-num">{{ t('Consumed') }}</th>
              <th class="pm-num">{{ t('Requested') }}</th>
              <th>{{ t('Status') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="w in wps" :key="w.id">
              <!-- Finished good: target and produced apply, the material columns do not. -->
              <tr class="pm-tr-sub pm-tr-click" @click="toggle(w.id)">
                <td>
                  <span class="pm-row pm-row--nowrap pm-gap-1">
                    <MpIcon :name="open.has(w.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                    <span>{{ w.code }} {{ w.name }}</span>
                  </span>
                </td>
                <td class="pm-num">{{ w.plannedUnits ? `${num(w.plannedUnits)} ${w.unit ?? ''}` : '—' }}</td>
                <td class="pm-num">{{ w.confirmedUnits ? `${num(w.confirmedUnits)} ${w.unit ?? ''}` : '—' }}</td>
                <td class="pm-num pm-muted">—</td>
                <td class="pm-num pm-muted">—</td>
                <td class="pm-num pm-muted">—</td>
                <td><ErpStatusBadge v-bind="badgeProps('wp', w.status, t)" /></td>
              </tr>

              <!-- Component: the material columns apply, target and produced do not. -->
              <template v-if="open.has(w.id)">
                <tr v-for="c in componentsFor(w.id)" :key="`${w.id}-${c.name}`">
                  <td class="pm-wrap">{{ c.name }}<span v-if="c.unit" class="pm-cell-sub">{{ c.unit }}</span></td>
                  <td class="pm-num pm-muted">—</td>
                  <td class="pm-num pm-muted">—</td>
                  <td class="pm-num">{{ c.reserved ? num(c.reserved) : '—' }}</td>
                  <td class="pm-num">{{ c.consumed ? num(c.consumed) : '—' }}</td>
                  <td class="pm-num" :class="c.requested ? 'pm-neg' : ''">{{ c.requested ? num(c.requested) : '—' }}</td>
                  <td />
                </tr>
                <tr v-if="!componentsFor(w.id).length">
                  <td colspan="7"><div class="pm-empty-inline">{{ t('Nothing reserved, consumed or requested yet on this work package.') }}</div></td>
                </tr>
              </template>
            </template>
            <tr v-if="!wps.length">
              <td colspan="7"><div class="pm-empty-inline">{{ t('No production work packages on this project.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 2 · Active BOM version -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Active BOM version') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('The frozen copy each work package builds from. Every work order created from now on uses the active version — work orders already pinned to an older one keep it until an engineering change moves them.') }}</p>
        </div>
      </div>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Project BOM') }}</th>
              <th>{{ t('Work package') }}</th>
              <th>{{ t('Active version') }}</th>
              <th>{{ t('Copied') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in wps" :key="w.id">
              <td>
                <MpTextlink v-if="w.customBomId" :id="`pm-prod-bom-${w.id}`" as="a" @click.prevent="bomView = w.customBomId">{{ getCustomBom(w.customBomId)?.name }}</MpTextlink>
                <span v-else class="pm-warn">{{ t('No BOM yet') }}</span>
              </td>
              <td>{{ w.code }} {{ w.name }}</td>
              <td>{{ w.customBomId ? `v${currentVersion(getCustomBom(w.customBomId)!).version}` : '—' }}</td>
              <td>{{ w.customBomId ? formatDate(getCustomBom(w.customBomId)?.copiedAt) : '—' }}</td>
            </tr>
            <tr v-if="!wps.length">
              <td colspan="4"><div class="pm-empty-inline">{{ t('No project BOMs yet.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 3 · Work orders and their pinned BOM version — information only -->
    <section class="pm-section" data-devchange="eco-wo-version-pin">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Work orders') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Each work order builds the BOM version it was created from. When a newer version exists, a neutral indicator says so and opens the diff — it never moves the pin; only the PM’s decision on an engineering change does.') }}</p>
        </div>
      </div>
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Work order') }}</th>
              <th>{{ t('Work package') }}</th>
              <th class="pm-num">{{ t('Qty') }}</th>
              <th>{{ t('BOM version') }}</th>
              <th>{{ t('Status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in wos" :key="w.id">
              <td>
                {{ w.number }}<span class="pm-cell-sub">{{ w.createdBy }} · {{ formatDate(w.createdAt) }}</span>
                <span v-if="w.replacesWoId" class="pm-cell-sub">{{ t('Replaces') }} {{ woNumber(w.replacesWoId) }}</span>
                <span v-if="w.replacedByWoId" class="pm-cell-sub">{{ t('Continued in') }} {{ woNumber(w.replacedByWoId) }}</span>
              </td>
              <td>{{ getWorkPackage(w.wpId)?.code }} {{ getWorkPackage(w.wpId)?.name }}</td>
              <td class="pm-num">{{ num(w.qty) }} {{ w.unit }}<span v-if="w.completedQty && w.status === 'In progress'" class="pm-cell-sub">{{ num(w.completedQty) }} {{ t('completed') }}</span></td>
              <td>
                <div class="pm-row pm-gap-2 pm-row--nowrap">
                  <span>{{ w.bomVersion ? `v${w.bomVersion}` : '—' }}</span>
                  <NewerVersionHint :id="`pm-wo-hint-${w.id}`" :bom-id="w.customBomId" :version="w.bomVersion" :status="w.status" :wo-number="w.number" />
                </div>
                <span v-for="a in w.ecoAdjustments ?? []" :key="a.ecoNo" class="pm-cell-sub">{{ t('Adjusted by') }} {{ a.ecoNo }} · {{ rpSigned(a.delta) }}</span>
              </td>
              <td><ErpStatusBadge v-bind="badgeProps('wo', w.status, t)" /></td>
            </tr>
            <tr v-if="!wos.length">
              <td colspan="5"><div class="pm-empty-inline">{{ t('No work orders yet.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 4 · Engineering changes -->
    <section class="pm-section" data-devchange="eco-production-tab-list">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Engineering changes') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Raised when Production publishes a new version of a project BOM that work orders already use. The new version is Active at once; the PM decides on the ECO page whether existing work orders adopt it.') }}</p>
        </div>
      </div>

      <div v-if="!project.isProduction" class="pm-muted">{{ t('Service projects have no BOM, so engineering changes don’t apply.') }}</div>
      <div v-else class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Number') }}</th>
              <th>{{ t('Change') }}</th>
              <th>{{ t('Project BOM') }}</th>
              <th>{{ t('Versions') }}</th>
              <th>{{ t('Status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in ecos" :key="e.id">
              <td>
                <MpTextlink :id="`pm-eco-open-${e.id}`" as="a" @click.prevent="router.push(ecoPath(e))">{{ e.no }}</MpTextlink>
                <span class="pm-cell-sub">{{ e.publishedBy }} · {{ formatDate(e.publishedAt) }}</span>
              </td>
              <td class="pm-wrap">{{ e.title }}<span class="pm-cell-sub">{{ t(ECO_REASON_LABELS[e.reason]) }}</span></td>
              <td>{{ getCustomBom(e.customBomId)?.name }}<span class="pm-cell-sub">{{ getWorkPackage(e.wpId)?.code }} {{ getWorkPackage(e.wpId)?.name }}</span></td>
              <td>v{{ e.fromVersion }} → v{{ e.toVersion }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('eco', e.status, t)" /></td>
            </tr>
            <tr v-if="!ecos.length">
              <td colspan="5"><div class="pm-empty-inline">{{ t('No engineering changes. Editing a project BOM that work orders already use raises one.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
