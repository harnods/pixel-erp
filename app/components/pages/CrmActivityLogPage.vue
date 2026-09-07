<script setup lang="ts">
/**
 * CRM (Qontak) — Activity logs. Full-bleed landing-style page (own title bar +
 * scrollable stage), mirroring CrmDealsPage's shell. Renders a single, deterministic
 * activity feed DERIVED from the real CRM records (deals, crmTasks, crmOrders) — no
 * invented events. Every entry is a projection of a field that already exists on a
 * record, so the feed never disagrees with the Deals / Tasks / Orders pages.
 *
 * Feed = a timeline grouped by day (newest day first — rule/table-default-newest-first),
 * each row an icon bubble + "{actor} {action} {subject}" + a related caption. Deal and
 * order subjects link back to their detail routes (the CRM ↔ ERP bridge). An owner
 * ErpFilterSelect + a search pill scope the feed (filter bar convention).
 */
import { ref, computed, onMounted } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { useLocale } from '~/composables/useLocale'
import { formatDate, formatDateLong } from '~/utils/date'
import { deals, crmTasks, crmOrders, CRM_OWNERS } from '~/data/crm'

const { t } = useLocale()
const router = useRouter()

// First-load skeleton (ERP guideline: solid, ~1.2s) — matches CrmDealsPage.
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Activity entry (a projection of one real record field) ──
type ActivityIcon = 'pipeline' | 'transfer' | 'productivity' | 'done' | 'cart'
interface ActivityEntry {
  date: string          // ISO date (day granularity in the mock)
  actor: string         // owner / sales staff who did it
  action: string        // verb phrase
  subject: string       // the thing acted on
  related?: string      // account / customer / deal it relates to
  icon: ActivityIcon
  to?: string           // detail route for the subject, when it has one
}

// ── Build the feed from the REAL records (deterministic, no invented events) ──
const feed = computed<ActivityEntry[]>(() => {
  const out: ActivityEntry[] = []

  // Deal events
  for (const d of deals) {
    out.push({
      date: d.createdAt,
      actor: d.owner,
      action: t('created deal'),
      subject: `${d.name} (${d.id})`,
      related: d.company,
      icon: 'pipeline',
      to: `/crm/deals/${d.id}`,
    })
    if (d.conversion === 'converted' && d.salesOrderId) {
      out.push({
        date: d.lastActivity,
        actor: d.owner,
        action: t('converted to Sales Order'),
        subject: d.salesOrderId,
        related: d.company,
        icon: 'transfer',
        to: `/crm/orders/${d.salesOrderId}`,
      })
    } else if (d.lastActivity !== d.createdAt) {
      // Optional "last activity" — only when it's a distinct, real later touch.
      out.push({
        date: d.lastActivity,
        actor: d.owner,
        action: t('updated deal'),
        subject: `${d.name} (${d.id})`,
        related: d.company,
        icon: 'pipeline',
        to: `/crm/deals/${d.id}`,
      })
    }
  }

  // Task events
  for (const task of crmTasks) {
    out.push({
      date: task.dueDate,
      actor: task.owner,
      action: task.status === 'done' ? t('completed task') : t('has a task due'),
      subject: task.title,
      related: task.relatedTo,
      icon: task.status === 'done' ? 'done' : 'productivity',
    })
  }

  // Order events
  for (const o of crmOrders) {
    out.push({
      date: o.date,
      actor: o.owner,
      action: t('created Sales Order'),
      subject: o.id,
      related: o.customer,
      icon: 'cart',
      to: `/crm/orders/${o.id}`,
    })
  }

  // Newest-first (rule/table-default-newest-first). Dates are ISO → string compare.
  return out.sort((a, b) => b.date.localeCompare(a.date))
})

// ── Filters (owner + search) ──
const ownerFilter = ref('')
const search = ref('')

const filtered = computed<ActivityEntry[]>(() => {
  const s = search.value.trim().toLowerCase()
  return feed.value.filter((e) => {
    const matchesOwner = !ownerFilter.value || e.actor === ownerFilter.value
    const matchesSearch = !s || [e.actor, e.action, e.subject, e.related]
      .filter(Boolean).join(' ').toLowerCase().includes(s)
    return matchesOwner && matchesSearch
  })
})

const hasActiveFilter = computed(() => !!ownerFilter.value || !!search.value.trim())
function clearFilters() { ownerFilter.value = ''; search.value = '' }

// ── Group the (already newest-first) feed by day ──
interface DayGroup { date: string; entries: ActivityEntry[] }
const dayGroups = computed<DayGroup[]>(() => {
  const map = new Map<string, ActivityEntry[]>()
  for (const e of filtered.value) {
    const arr = map.get(e.date) ?? []
    arr.push(e)
    map.set(e.date, arr)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }))
})

function goTo(to?: string) { if (to) router.push(to) }
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ t('Activity logs') }}</h1>
        <span class="crm-subtitle">{{ feed.length }} {{ t('activities') }}</span>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── Filter bar ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="activity-owner-filter"
            :model-value="ownerFilter"
            :placeholder="t('Owner')"
            :options="[...CRM_OWNERS]"
            @update:model-value="(v: string) => (ownerFilter = v)"
          />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search activity…')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- ── Loading skeleton ── -->
      <div v-if="loading" class="al-skeleton">
        <div v-for="n in 6" :key="n" class="al-skel-row">
          <div class="al-skel-dot" />
          <div class="al-skel-lines">
            <div class="al-skel-line al-skel-line--wide" />
            <div class="al-skel-line al-skel-line--narrow" />
          </div>
        </div>
      </div>

      <!-- ── Filtered-empty ── -->
      <div v-else-if="!dayGroups.length" class="cc-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="cc-empty-illustration" width="288" height="240" />
        <p class="cc-empty-title">{{ t('No activity found') }}</p>
        <p class="cc-empty-desc">{{ t('Try adjusting your filters or search.') }}</p>
        <MpButton v-if="hasActiveFilter" variant="secondary" is-rounded class="cc-empty-btn" @click="clearFilters">{{ t('Clear filters') }}</MpButton>
      </div>

      <!-- ── Timeline (grouped by day, newest first) ── -->
      <div v-else class="timeline">
        <section v-for="group in dayGroups" :key="group.date" class="tl-group">
          <h2 class="tl-day">{{ formatDateLong(group.date) }}</h2>
          <ol class="tl-list">
            <li v-for="(e, i) in group.entries" :key="`${group.date}-${i}`" class="tl-item">
              <span class="tl-icon" :class="`tl-icon--${e.icon}`"><MpIcon :name="e.icon" size="sm" /></span>
              <div class="tl-body">
                <p class="tl-line">
                  <span class="tl-actor">{{ e.actor }}</span>
                  <span class="tl-action">{{ e.action }}</span>
                  <span
                    class="tl-subject"
                    :class="{ 'tl-subject--link': e.to }"
                    role="button"
                    :tabindex="e.to ? 0 : -1"
                    @click="goTo(e.to)"
                    @keydown.enter="goTo(e.to)"
                  >{{ e.subject }}</span>
                </p>
                <p v-if="e.related" class="tl-related">{{ e.related }}</p>
              </div>
              <span class="tl-date">{{ formatDate(e.date) }}</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (mirrors CrmDealsPage) ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }

/* ── Stage (scroll area) ── */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── Filter bar ── */
.cc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Pill search (canonical ERP index search) */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-icon-default, #536062); }

/* ── Timeline ── */
.timeline { display: flex; flex-direction: column; gap: var(--mp-spacing-8); max-width: 880px; }
.tl-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.tl-day { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.02em; text-transform: uppercase; color: var(--mp-text-secondary); }
.tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

.tl-item {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) 0;
  border-top: 1px solid var(--mp-border-default);
}
.tl-group .tl-list .tl-item:first-child { border-top: none; }

.tl-icon {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  color: var(--mp-icon-default, #536062);
}
.tl-icon--pipeline { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-icon-brand, #0a6e4e); }
.tl-icon--transfer { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-icon-brand, #0a6e4e); }
.tl-icon--cart { background: var(--mp-background-information-subtle, #e7f0fd); color: var(--mp-icon-information, #1d68d4); }
.tl-icon--done { background: var(--mp-background-success-subtle, #e6f4ec); color: var(--mp-icon-success, #12805c); }
.tl-icon--productivity { background: var(--mp-background-neutral-subtle, #f4f5f7); color: var(--mp-icon-subtle, #97a0af); }

.tl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tl-line { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.tl-actor { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tl-action { color: var(--mp-text-secondary); margin: 0 4px; }
.tl-subject { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.tl-subject--link { color: var(--mp-text-link); cursor: pointer; }
.tl-subject--link:hover { text-decoration: underline; text-underline-offset: 2px; }
.tl-related { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-date { flex-shrink: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-subtle, #97a0af); white-space: nowrap; padding-top: var(--mp-spacing-1); font-variant-numeric: tabular-nums; }

/* ── Loading skeleton ── */
.al-skeleton { display: flex; flex-direction: column; gap: var(--mp-spacing-4); max-width: 880px; }
.al-skel-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.al-skel-dot { flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; background: var(--mp-background-neutral-subtle, #f1f5f9); animation: al-pulse 1.2s ease-in-out infinite; }
.al-skel-lines { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-1); }
.al-skel-line { height: 12px; border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-neutral-subtle, #f1f5f9); animation: al-pulse 1.2s ease-in-out infinite; }
.al-skel-line--wide { width: 60%; }
.al-skel-line--narrow { width: 32%; }
@keyframes al-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* ── Empty state ── */
.cc-empty { display: flex; flex-direction: column; align-items: center; }
.cc-empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.cc-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cc-empty-btn { margin-top: var(--mp-spacing-4); }
</style>
