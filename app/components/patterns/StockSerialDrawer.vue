<script setup lang="ts">
import { MpIcon, MpSpinner } from '@mekari/pixel3'
import { getReservationForSerial, type WarehouseStockItem } from '~/data/warehouseDetails'
import { outgoingOrders } from '~/data/outgoing'

const props = defineProps<{
  open: boolean
  product: WarehouseStockItem | null
  warehouseId: string
  initialTab?: 'available' | 'reserved'
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

type SerialUnit = { serial: string; location: string }

const list = computed<SerialUnit[]>(() =>
  props.initialTab === 'reserved'
    ? (props.product?.serials?.reserved ?? [])
    : (props.product?.serials?.available ?? [])
)

function salesNoFor(serial: string): string {
  if (!props.product) return '—'
  const r = getReservationForSerial(props.warehouseId, props.product.sku, serial)
  if (!r) return '—'
  return outgoingOrders.find((o) => o.id === r.taskId)?.salesNo ?? r.taskId
}

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter(u => u.serial.toLowerCase().includes(q))
})

const PAGE = 50
const shown       = ref(PAGE)
const loadingMore = ref(false)
const visibleRows = computed(() => filtered.value.slice(0, shown.value))
const hasMore     = computed(() => shown.value < filtered.value.length)

function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  setTimeout(() => {
    shown.value    = Math.min(shown.value + PAGE, filtered.value.length)
    loadingMore.value = false
  }, 200)
}

// ssd-content is the scroll container; table-wrap hugs content height
const contentEl  = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let scrollObserver: IntersectionObserver | null = null

function setupObserver() {
  scrollObserver?.disconnect()
  if (!contentEl.value || !sentinelEl.value) return
  scrollObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMore() },
    { root: contentEl.value, rootMargin: '0px 0px 80px 0px' },
  )
  scrollObserver.observe(sentinelEl.value)
}

watch(() => props.open, (v) => {
  if (!v) return
  shown.value  = PAGE
  search.value = ''
  nextTick(setupObserver)
})

watch(search, () => {
  shown.value = PAGE
  nextTick(setupObserver)
})

onUnmounted(() => scrollObserver?.disconnect())

const title = computed(() =>
  props.initialTab === 'reserved' ? 'Reserved serials' : 'Available serials'
)

function fmt(n: number) { return n.toLocaleString('id-ID') }
function close() { emit('update:open', false) }
</script>

<template>
  <Transition name="ssd">
  <div v-if="open && product" class="ssd-overlay" @click.self="close">
    <div class="ssd-panel" role="dialog" :aria-label="title">

      <header class="ssd-header">
        <h2 class="ssd-title">{{ title }}</h2>
        <button class="ssd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <!-- Product info bar -->
      <div class="ssd-infobar">
        <div class="ssd-infobar-product">
          <img class="ssd-thumb" :src="product.photo" :alt="product.name" loading="lazy" />
          <div class="ssd-infobar-names">
            <span class="ssd-name">{{ product.name }}</span>
            <span class="ssd-sku">{{ product.sku }}</span>
          </div>
        </div>
      </div>

      <!-- Search toolbar — no border/bg, search on right -->
      <div class="ssd-toolbar">
        <div class="ssd-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="ssd-search-input" type="text" placeholder="Search serial number…" />
        </div>
      </div>

      <!-- ssd-content scrolls; table-wrap hugs content and scrolls x when wide -->
      <div ref="contentEl" class="ssd-content">
        <div class="ssd-table-wrap">
          <table class="ssd-table">
            <colgroup>
              <col style="width: 200px" />
              <col />
              <col v-if="initialTab === 'reserved'" style="width: 200px" />
            </colgroup>
            <thead>
              <tr>
                <th class="ssd-th">Serial number</th>
                <th class="ssd-th">Storage location</th>
                <th v-if="initialTab === 'reserved'" class="ssd-th">Sales order</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.serial" class="ssd-tr">
                <td class="ssd-td">{{ row.serial }}</td>
                <td class="ssd-td ssd-td--muted">{{ row.location }}</td>
                <td v-if="initialTab === 'reserved'" class="ssd-td">{{ salesNoFor(row.serial) }}</td>
              </tr>
              <tr v-if="!filtered.length">
                <td :colspan="initialTab === 'reserved' ? 3 : 2" class="ssd-td ssd-td--empty">
                  {{ search ? 'No matching serial numbers.' : 'No serial numbers.' }}
                </td>
              </tr>
              <!-- sentinel row at end of tbody triggers progressive load -->
              <tr aria-hidden="true" class="ssd-sentinel-row">
                <td :colspan="initialTab === 'reserved' ? 3 : 2"><div ref="sentinelEl" /></td>
              </tr>
            </tbody>
            <!-- sticky count/loading bar at the bottom of the table -->
            <tfoot>
              <tr>
                <td :colspan="initialTab === 'reserved' ? 3 : 2" class="ssd-td--count">
                  <span v-if="loadingMore" class="ssd-td--count-loading">
                    <MpSpinner size="sm" /> Loading…
                  </span>
                  <span v-else-if="filtered.length">
                    Showing {{ fmt(visibleRows.length) }} of {{ fmt(filtered.length) }} serial numbers
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


    </div>
  </div>
  </Transition>
</template>

<style scoped>
.ssd-enter-active,
.ssd-leave-active { transition: background-color 250ms ease; }
.ssd-enter-from, .ssd-leave-to { background-color: transparent; }
.ssd-enter-active :deep(.ssd-panel) { transition: transform 350ms ease-out; }
.ssd-leave-active :deep(.ssd-panel)  { transition: transform 250ms ease-in; }
.ssd-enter-from :deep(.ssd-panel),
.ssd-leave-to :deep(.ssd-panel) { transform: translateX(calc(100% + 12px)); }

.ssd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.ssd-panel {
  margin: var(--mp-spacing-3);
  width: min(680px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

/* Header */
.ssd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ssd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ssd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9); height: var(--mp-sizes-9);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.ssd-close:hover { background: var(--mp-background-neutral-hovered); }

/* Info bar */
.ssd-infobar {
  flex-shrink: 0; display: flex; align-items: center;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.ssd-infobar-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ssd-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral);
}
.ssd-infobar-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ssd-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssd-sku  { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Search toolbar — no border/bg, search on right */
.ssd-toolbar {
  flex-shrink: 0; display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
}
.ssd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  width: 260px;
}
.ssd-search:focus-within { box-shadow: 0 0 0 1px var(--mp-border-bold); }
.ssd-search-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md); outline: none;
}
.ssd-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ssd-content is the scroll container; shrinks when rows are few */
.ssd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4);
}

/* Table-wrap hugs content height; overflow: clip lets sticky thead/tfoot work through it */
.ssd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: clip;
  overflow-x: auto;
}
.ssd-table { width: 100%; min-width: max-content; border-collapse: collapse; }

/* Sticky header */
.ssd-th {
  height: var(--mp-sizes-7); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
  position: sticky; top: 0; z-index: 2;
}

/* Data rows */
.ssd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: 14px; font-weight: 400; font-family: Inter, sans-serif;
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral); white-space: nowrap;
}
.ssd-td--muted { color: var(--mp-text-secondary); }
.ssd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }

/* Sentinel row — zero height, invisible */
.ssd-sentinel-row td { padding: 0; height: 0; border: none; background: transparent; }
.ssd-sentinel-row td > div { height: 1px; }

/* Sticky count/loading footer — sticky on the td is more reliable cross-browser */
.ssd-td--count {
  position: sticky; bottom: 0; z-index: 2;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  background: var(--mp-background-neutral);
}
.ssd-td--count-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

</style>
