<script setup lang="ts">
/**
 * Storage location detail (Figma 5177-112738) — opened from the "View details" chip
 * on a location row. `orderId` is `${warehouseId}::${locationId}`.
 *
 * Layout: breadcrumb + title + Actions; a "Location info" summary; then either the
 * sub-locations tree (Organizational locations) OR — for a Storage location — the
 * Products / Batches / Serial numbers / Storage location tabs (shared <StockTables>).
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  css,
} from '@mekari/pixel3'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import StockTables from '~/components/patterns/StockTables.vue'
import StorageLocationTree from '~/components/patterns/StorageLocationTree.vue'
import NewLocationDrawer from '~/components/patterns/NewLocationDrawer.vue'
import { getWarehouseDetail, getLocationStock } from '~/data/warehouseDetails'
import { findLocation, deleteLocation, type LocNode } from '~/data/storageLocations'
import { levelLabel, STORAGE_LEVEL_KEYS } from '~/data/storageLevels'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const warehouseId = computed(() => props.orderId.split('::')[0]!)
const locId = computed(() => props.orderId.split('::')[1]!)
const warehouse = computed(() => getWarehouseDetail(warehouseId.value))
const found = computed(() => findLocation(warehouseId.value, locId.value))
const node = computed(() => found.value?.node)
const path = computed(() => found.value?.path ?? [])

const hasChildren = computed(() => (node.value?.children.length ?? 0) > 0)
// total sub-locations anywhere below this node (all levels), matching the tree table
function countDescendants(n: LocNode): number {
  return n.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}
const subLocationCount = computed(() => (node.value ? countDescendants(node.value) : 0))
const isStorage = computed(() => node.value?.type === 'Storage')
// Show the product tabs when the location holds stock directly: any Storage-typed
// location, or any leaf (a leaf is where stock physically lives, whatever its level).
const showStockTabs = computed(() => !!node.value && (isStorage.value || !hasChildren.value))
// Stock at this location — its own slice of the warehouse stock [skuStart, +skuQty).
const locStock = computed(() => {
  const n = node.value
  if (!n) return []
  return getLocationStock(warehouseId.value, n.skuStart, n.skuQty)
})
// "Total products": a leaf Storage location shows what it holds; a branch shows the
// aggregate across its sub-locations.
const totalProductsText = computed(() => {
  const n = node.value
  if (!n) return '—'
  return n.children.length
    ? `${fmt(n.skuQty)} SKU across all sub-locations`
    : `${fmt(locStock.value.length)} SKU`
})

const levelNo = computed(() => (node.value ? STORAGE_LEVEL_KEYS.indexOf(node.value.level) + 1 : 0))
const levelText = computed(() => (node.value ? `Level ${levelNo.value} - ${levelLabel(node.value.level)}` : '—'))
const typeDesc = computed(() =>
  node.value?.type === 'Storage'
    ? 'Stock can be stored and tracked at this location.'
    : 'For grouping only. Stock cannot be stored here directly.',
)
const lu = computed(() => lastUpdatedFor(`loc-${locId.value}`))

// Activity log (opened from the "Last updated by" link). No real audit trail for
// locations in the demo → a single Created entry snapshotting the location.
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const n = node.value
  if (!n) return []
  return [{
    date: lu.value.at,
    user: lu.value.by,
    activity: 'Created',
    details: [
      { label: 'Location name', value: n.name },
      { label: 'Level', value: levelText.value },
      { label: 'Location type', value: n.type },
    ],
  }]
})

function fmt(n: number) { return n.toLocaleString('id-ID') }

function goAllWarehouses() { router.push('/warehouses') }
function goWarehouse() { router.push(`/warehouses/${warehouseId.value}`) }
function goToLoc(id: string) { router.push(`/warehouses/${warehouseId.value}/locations/${id}`) }

// Edit this location — reuses the add-location drawer form.
const editOpen = ref(false)

// Delete needs a confirmation modal.
const deleteConfirmOpen = ref(false)
function confirmDeleteLocation() {
  if (node.value) deleteLocation(warehouseId.value, node.value.id)
  deleteConfirmOpen.value = false
  goWarehouse()
}
</script>

<template>
  <div v-if="node" class="detail-page">
    <!-- Title bar: breadcrumb + title + Actions -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="sld-crumbs">
          <button class="detail-breadcrumb" @click="goAllWarehouses">All warehouses</button>
          <span class="sld-crumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goWarehouse">{{ warehouse?.name ?? 'Warehouse' }}</button>
        </div>
        <h1 class="detail-title">{{ node.name }}</h1>
      </div>

      <MpPopover id="sld-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="editOpen = true">Edit location</MpPopoverListItem>
            <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })" @click="deleteConfirmOpen = true">
              Delete location
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <div class="detail-stage">
      <!-- Location info — horizontal label/value rows (label left, value right) -->
      <section class="sld-block">
        <h2 class="sld-section-title">Location info</h2>
        <dl class="sld-info">
          <div class="sld-info-row">
            <dt class="sld-info-label">Location name</dt>
            <dd class="sld-info-value">{{ node.name }}</dd>
          </div>
          <div class="sld-info-row">
            <dt class="sld-info-label">Level</dt>
            <dd class="sld-info-value">{{ levelText }}</dd>
          </div>
          <div class="sld-info-row">
            <dt class="sld-info-label">Path</dt>
            <dd class="sld-info-value">
              <span class="sld-path">
                <template v-for="(p, i) in path" :key="p.id">
                  <button class="sld-path-link" @click="goToLoc(p.id)">{{ p.name }}</button>
                  <span v-if="i < path.length - 1" class="sld-path-sep">/</span>
                </template>
              </span>
            </dd>
          </div>
          <div class="sld-info-row">
            <dt class="sld-info-label">Location type</dt>
            <dd class="sld-info-value">
              <span>{{ node.type }}</span>
              <span class="sld-type-desc">{{ typeDesc }}</span>
            </dd>
          </div>
          <div class="sld-info-row">
            <dt class="sld-info-label">Sub-locations</dt>
            <dd class="sld-info-value">{{ fmt(subLocationCount) }}</dd>
          </div>
          <div class="sld-info-row">
            <dt class="sld-info-label">Total products</dt>
            <dd class="sld-info-value">{{ totalProductsText }}</dd>
          </div>
        </dl>
        <a class="sld-lastupdated" @click.prevent="activityOpen = true">
          Last updated by {{ lu.by }} on {{ formatDateTimeLong(lu.at) }}
        </a>
      </section>

      <!-- Holds stock (Storage or a leaf) → product tabs, plus a "Storage location"
           tab when it also has sub-locations. Organizational branch → just the tree. -->
      <StockTables
        v-if="showStockTabs"
        :stock="locStock"
        :subject="node.name"
        extra-label="Storage location"
      >
        <template v-if="hasChildren" #extra>
          <StorageLocationTree :warehouse-id="warehouseId" :parent-id="node.id" />
        </template>
      </StockTables>

      <section v-else class="sld-block">
        <h2 class="sld-section-title">Sub-locations</h2>
        <StorageLocationTree :warehouse-id="warehouseId" :parent-id="node.id" />
      </section>
    </div>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="node.name"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- Edit this location (shared add-location form) -->
    <NewLocationDrawer
      :is-open="editOpen"
      :warehouse-id="warehouseId"
      :parent-id="null"
      :edit-id="node.id"
      @update:is-open="editOpen = $event"
      @saved="editOpen = false"
    />

    <!-- Delete confirmation -->
    <MpModal
      id="sld-delete-modal"
      :is-open="deleteConfirmOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="deleteConfirmOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Delete location?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <template v-if="hasChildren">
            Deleting <strong>{{ node.name }}</strong> also removes all of its sub-locations. This can't be undone.
          </template>
          <template v-else>
            Delete <strong>{{ node.name }}</strong>? This can't be undone.
          </template>
        </MpModalBody>
        <MpModalFooter>
          <div class="sld-modal-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteConfirmOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDeleteLocation">Delete</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <div v-else class="sld-not-found">
    <p>Storage location not found.</p>
    <button class="detail-breadcrumb" @click="goWarehouse">Back</button>
  </div>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Title bar ── */
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.sld-crumbs { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.sld-crumb-sep { color: var(--mp-text-subtle); font-size: 12px; }
.detail-breadcrumb { background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }

.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; font-family: inherit; }
.detail-btn--primary { background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861); color: var(--mp-text-inverse); }
.detail-btn--primary:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }

/* ── Stage ── */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.sld-block { display: flex; flex-direction: column; }
.sld-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* label left / value right, one field per row */
.sld-info { margin: 0; display: flex; flex-direction: column; max-width: 640px; }
.sld-info-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.sld-info-label { flex: 0 0 200px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-secondary); }
.sld-info-value { margin: 0; flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); }
.sld-type-desc { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sld-path { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); flex-wrap: wrap; }
.sld-path-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.sld-path-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.sld-path-sep { color: var(--mp-text-subtle); }
.sld-lastupdated { display: inline-block; margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.sld-lastupdated:hover { text-decoration: underline; text-underline-offset: 2px; }

.sld-modal-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
.sld-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; color: var(--mp-text-secondary); }
</style>
