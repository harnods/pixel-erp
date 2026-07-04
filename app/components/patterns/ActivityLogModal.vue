<script setup lang="ts">
/**
 * ActivityLogModal — opened from the "Last updated by …" link on a detail page.
 * Matches the Figma "Modal / View / Activity log" (node 752:222): header bar, the
 * record title, then a DATE · USER · ACTIVITY · DETAILS table.
 *
 * - DETAILS lists the changed/created fields (label + value; edits use "old → new").
 *   Only the first 2 fields show; "Show more" reveals the rest per entry.
 * - Many log rows use the standard progressive loading (10 at a time on scroll)
 *   with a "Showing X of Y" count.
 *
 * No real audit trail in the demo — pass `entries` (newest first) built from the
 * record's own data so the log is realistic and consistent with the record.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalOverlay, MpModalCloseButton, MpSpinner } from '@mekari/pixel3'
import { formatDateTime } from '~/utils/date'

export interface ActivityDetail { label: string; value: string }
export interface ActivityEntry { date: string; user: string; activity: string; details: ActivityDetail[] }

const props = withDefaults(defineProps<{
  isOpen: boolean
  subject?: string
  updatedBy?: string
  updatedAt?: string
  entries?: ActivityEntry[]
}>(), { subject: 'this record', updatedBy: 'System', updatedAt: '' })

const emit = defineEmits<{ close: [] }>()

const DETAIL_LIMIT = 2

const rows = computed<ActivityEntry[]>(() =>
  props.entries?.length
    ? props.entries
    : [{ date: props.updatedAt || new Date().toISOString(), user: props.updatedBy, activity: 'Created', details: [{ label: 'Reference', value: props.subject }] }],
)

// ── Per-entry DETAILS show more/less ──────────────────────────────────────────
const expandedDetails = ref<Set<number>>(new Set())
function toggleDetails(i: number) {
  const s = new Set(expandedDetails.value)
  s.has(i) ? s.delete(i) : s.add(i)
  expandedDetails.value = s
}
function isDetailsExpanded(i: number) { return expandedDetails.value.has(i) }
function visibleDetails(e: ActivityEntry, i: number) {
  return isDetailsExpanded(i) ? e.details : e.details.slice(0, DETAIL_LIMIT)
}

// ── Progressive loading for the log rows (10 at a time) ───────────────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleRows = computed(() => rows.value.slice(0, shownCount.value))
const hasMoreRows = computed(() => shownCount.value < rows.value.length)
const isProgressive = computed(() => rows.value.length > PAGE_SIZE)

function loadMoreRows() {
  if (loadingMore.value || !hasMoreRows.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, rows.value.length)
    loadingMore.value = false
  }, 400)
}

const scrollEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
function setupObserver() {
  observer?.disconnect()
  if (!scrollEl.value || !sentinelEl.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMoreRows() },
    { root: scrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  observer.observe(sentinelEl.value)
}
onUnmounted(() => observer?.disconnect())

// Reset when the modal opens/closes; (re)wire the observer once the body is mounted.
watch(() => props.isOpen, (open) => {
  if (!open) return
  expandedDetails.value = new Set()
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = 0; setupObserver() })
})

function formatWhen(iso: string) {
  return formatDateTime(iso)
}
</script>

<template>
  <MpModal
    id="activity-log-modal"
    :is-open="isOpen"
    size="xl"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        Activity log
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <h2 class="al-subject">{{ subject }}</h2>
        <section class="al-table-section">
          <div ref="scrollEl" class="al-scroll" :class="{ 'al-scroll--tall': isProgressive }">
            <table class="al-table">
              <colgroup>
                <col style="width: 160px" />
                <col style="width: 160px" />
                <col style="width: 160px" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="al-th">Date</th>
                  <th class="al-th">User</th>
                  <th class="al-th">Activity</th>
                  <th class="al-th">Details</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(e, i) in visibleRows" :key="i" class="al-row">
                  <td class="al-td">{{ formatWhen(e.date) }}</td>
                  <td class="al-td">{{ e.user }}</td>
                  <td class="al-td">{{ e.activity }}</td>
                  <td class="al-td al-td--details">
                    <div class="al-details">
                      <div v-for="(d, j) in visibleDetails(e, i)" :key="j" class="al-detail">
                        <span class="al-detail-label">{{ d.label }}</span>
                        <span class="al-detail-value">{{ d.value }}</span>
                      </div>
                    </div>
                    <a v-if="e.details.length > DETAIL_LIMIT" class="al-toggle" @click.prevent="toggleDetails(i)">
                      {{ isDetailsExpanded(i) ? 'Show less' : `Show more (${e.details.length - DETAIL_LIMIT})` }}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="sentinelEl" class="al-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="al-loading"><MpSpinner size="sm" /> Loading activities…</div>
          </div>
          <div v-if="isProgressive" class="al-count">Showing {{ visibleRows.length }} of {{ rows.length }} activities</div>
        </section>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.al-subject {
  margin: 0 0 var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
/* outside border of a table is the BOLD border colour */
.al-table-section {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.al-scroll { overflow-x: auto; }
.al-scroll--tall { max-height: 420px; overflow-y: auto; }
.al-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.al-th {
  position: sticky; top: 0; z-index: 1;
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-surface, #f1f5f9);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-transform: uppercase;
  white-space: nowrap;
}
.al-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default);
  border-top: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.al-td--details { padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }
.al-details { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.al-detail { display: flex; flex-direction: column; }
.al-detail-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.al-detail-value { color: var(--mp-text-default); }
.al-toggle {
  display: inline-block;
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.al-toggle:hover { text-decoration: underline; text-underline-offset: 2px; }
.al-sentinel { height: 1px; }
.al-loading { display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); color: var(--mp-text-secondary); }
.al-count {
  display: flex; align-items: center;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-top: 1px solid var(--mp-border-default);
}
</style>
