<script setup lang="ts">
/**
 * Production tab — the production picture for a project in one place.
 *
 * Merges what were two tabs (Production & materials, Engineering change) into
 * three read-only lists:
 *
 *   1 · Production plan — target vs actual output per work package, expandable
 *       to the component level (reserved / consumed / requested).
 *   2 · Active BOM version per work package, opening the BOM detail.
 *   3 · Engineering changes, opening the ECO detail.
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
import type { Project } from '~/data/projects'
import { projectWorkPackages, getWorkPackage } from '~/data/projects'
import { projectReservations, getStockItem } from '~/data/projectReservations'
import { getCustomBom, currentVersion } from '~/data/projectBoms'
import { projectEcos } from '~/data/projectChanges'
import { mrpPreview } from '~/data/projectActions'
import { num } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()

const wps = computed(() => projectWorkPackages(props.project.id).filter(w => w.type === 'production'))
const ecos = computed(() => projectEcos(props.project.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))

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

    <!-- 3 · Engineering changes -->
    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Engineering changes') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Versioned BOM changes with a diff and an explicit effectivity scope, so a mid-execution change can’t silently hit released work orders. An ECO never changes contract value — reference a change order when the customer pays.') }}</p>
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
                <MpTextlink :id="`pm-eco-open-${e.id}`" as="a" @click.prevent="router.push(`/projects/${project.id}/engineering-changes/${e.id}`)">{{ e.no }}</MpTextlink>
                <span class="pm-cell-sub">{{ e.raisedBy }} · {{ formatDate(e.createdAt) }}</span>
              </td>
              <td class="pm-wrap">{{ e.title }}<span class="pm-cell-sub">{{ e.reason }}</span></td>
              <td>{{ getCustomBom(e.customBomId)?.name }}<span class="pm-cell-sub">{{ getWorkPackage(e.wpId)?.code }} {{ getWorkPackage(e.wpId)?.name }}</span></td>
              <td>v{{ e.baseVersion }} → {{ e.resultVersion ? `v${e.resultVersion}` : t('(proposed)') }}</td>
              <td><ErpStatusBadge v-bind="badgeProps('eco', e.status, t)" /></td>
            </tr>
            <tr v-if="!ecos.length">
              <td colspan="5"><div class="pm-empty-inline">{{ t('No engineering changes.') }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BomDetailOverlay :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
