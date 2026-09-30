<script setup lang="ts">
/**
 * DesignErpDashboardPage — internal "page coverage" dashboard (route /design-erp).
 *
 * Lists every page in the app's sitemap and whether it is BUILT (a real component
 * serves it) or NOT BUILT (placeholder), for designers to track coverage. All
 * build-status lives in app/data/erpSitemap.ts (BUILT_KEYS) — this page only
 * renders it.
 *
 * Renders inside the shared .stage (white surface + 24px padding already provided
 * by app/pages/[...slug].vue) — no own title bar, no extra stage padding.
 */
import { MpProgress, MpButton } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  SITEMAP,
  sitemapSummary,
  moduleSummaries,
  actionSummary,
  type SitemapModule,
  type SitemapNode,
} from '~/data/erpSitemap'

const { t } = useLocale()
const router = useRouter()

const summary = sitemapSummary()
const actions = actionSummary()
const moduleCounts = moduleSummaries()
const countFor = (module: string) => moduleCounts.find((m) => m.module === module)

type Filter = 'all' | 'built' | 'notBuilt'
const filter = ref<Filter>('all')
const search = ref('')

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'built', label: 'Built' },
  { value: 'notBuilt', label: 'Not built' },
]

function matches(node: SitemapNode): boolean {
  const q = search.value.trim().toLowerCase()
  const bySearch = !q || node.label.toLowerCase().includes(q)
  const byFilter =
    filter.value === 'all' ? true : filter.value === 'built' ? node.built : !node.built
  return bySearch && byFilter
}

// Keep a parent visible when it matches OR any of its children matches; children
// are filtered independently so a search narrows the tree to what it hits.
const filteredModules = computed<SitemapModule[]>(() => {
  return SITEMAP.map((mod) => {
    const items: SitemapNode[] = []
    for (const item of mod.items) {
      const visibleChildren = (item.children ?? []).filter(matches)
      if (matches(item) || visibleChildren.length) {
        items.push({ ...item, children: item.children ? visibleChildren : undefined })
      }
    }
    return { module: mod.module, items }
  }).filter((m) => m.items.length)
})

function open(node: SitemapNode) {
  if (node.built) router.push(node.route)
}
</script>

<template>
  <div class="dsn">
    <p class="dsn-intro">
      {{ t('Every page in the ERP sitemap and whether it is built or still a placeholder. Built entities also break down into their actions (New · Details · Edit · Archive · Delete + lifecycle) so you can see, per link, what exists vs. what is missing. Coverage is derived from the app source — see app/data/erpSitemap.ts.') }}
    </p>

    <!-- Action-coverage legend + tally -->
    <div class="dsn-legend">
      <span class="dsn-legend-item dsn-task--built"><span class="dsn-task-mark" aria-hidden="true"></span>{{ t('Built') }} · {{ actions.built }}</span>
      <span class="dsn-legend-item dsn-task--partial"><span class="dsn-task-mark" aria-hidden="true"></span>{{ t('Partial (no-op)') }} · {{ actions.partial }}</span>
      <span class="dsn-legend-item dsn-task--missing"><span class="dsn-task-mark" aria-hidden="true"></span>{{ t('Missing') }} · {{ actions.missing }}</span>
      <span class="dsn-legend-note">{{ t('across') }} {{ actions.total }} {{ t('entity actions') }}</span>
    </div>

    <!-- Summary row: counts + % built progress -->
    <div class="dsn-summary">
      <div class="dsn-summary-counts">
        <ContentList :label="t('Total pages')" :value="summary.total" />
        <ContentList :label="t('Built')" :value="summary.built" />
        <ContentList :label="t('Not built')" :value="summary.notBuilt" />
      </div>
      <div class="dsn-summary-progress">
        <div class="dsn-summary-progress-head">
          <span class="dsn-summary-progress-label">{{ t('Built') }}</span>
          <span class="dsn-summary-progress-pct">{{ summary.pct }}%</span>
        </div>
        <MpProgress color="positive" :value="String(summary.pct)" />
      </div>
    </div>

    <!-- Controls: filter + search -->
    <div class="dsn-controls">
      <div class="dsn-filter" role="tablist">
        <MpButton
          v-for="f in filters"
          :key="f.value"
          class="dsn-filter-btn"
          :class="{ 'dsn-filter-btn--active': filter === f.value }"
          role="tab"
          :aria-selected="filter === f.value"
          @click="filter = f.value"
        >
          {{ t(f.label) }}
        </MpButton>
      </div>
      <div class="dsn-search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          v-model="search"
          class="dsn-search-input"
          type="text"
          :placeholder="t('Search pages...')"
        />
        <MpButton v-if="search" class="dsn-search-clear" type="button" :aria-label="t('Clear search')" @click="search = ''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </MpButton>
      </div>
    </div>

    <!-- Empty state when a filter/search excludes everything -->
    <p v-if="!filteredModules.length" class="dsn-empty">{{ t('No pages match your filter.') }}</p>

    <!-- Sitemap grouped by module -->
    <section v-for="mod in filteredModules" :key="mod.module" class="dsn-card">
      <header class="dsn-card-head">
        <h2 class="dsn-card-title">{{ t(mod.module) }}</h2>
        <span class="dsn-card-count">{{ countFor(mod.module)?.built }}/{{ countFor(mod.module)?.total }}</span>
      </header>
      <ul class="dsn-rows">
        <template v-for="node in mod.items" :key="node.key + node.route">
          <li class="dsn-row dsn-row--stacked" :class="{ 'dsn-row--built': node.built }" @click="open(node)">
            <div class="dsn-row-top">
              <div class="dsn-row-main">
                <span class="dsn-row-label">{{ t(node.label) }}</span>
                <span class="dsn-row-route" :class="{ 'dsn-row-route--link': node.built }">{{ node.route }}</span>
                <span v-if="node.note" class="dsn-row-note">{{ node.note }}</span>
              </div>
              <ErpStatusBadge
                :status="node.built ? 'completed' : 'not-built'"
                :type="node.built ? 'completed' : 'announcement'"
                :label="node.built ? t('Built') : t('Not built')"
              />
            </div>
            <ul v-if="node.actions" class="dsn-tasks" @click.stop>
              <li
                v-for="act in node.actions"
                :key="act.label"
                class="dsn-task"
                :class="`dsn-task--${act.status}`"
              >
                <span class="dsn-task-mark" aria-hidden="true"></span>
                <span class="dsn-task-label">{{ act.label }}</span>
                <span v-if="act.note" class="dsn-task-note">{{ act.note }}</span>
              </li>
            </ul>
          </li>
          <li
            v-for="child in node.children"
            :key="child.key + child.route"
            class="dsn-row dsn-row--child dsn-row--stacked"
            :class="{ 'dsn-row--built': child.built }"
            @click="open(child)"
          >
            <div class="dsn-row-top">
              <div class="dsn-row-main">
                <span class="dsn-row-label">{{ t(child.label) }}</span>
                <span class="dsn-row-route" :class="{ 'dsn-row-route--link': child.built }">{{ child.route }}</span>
                <span v-if="child.note" class="dsn-row-note">{{ child.note }}</span>
              </div>
              <ErpStatusBadge
                :status="child.built ? 'completed' : 'not-built'"
                :type="child.built ? 'completed' : 'announcement'"
                :label="child.built ? t('Built') : t('Not built')"
              />
            </div>
            <ul v-if="child.actions" class="dsn-tasks" @click.stop>
              <li
                v-for="act in child.actions"
                :key="act.label"
                class="dsn-task"
                :class="`dsn-task--${act.status}`"
              >
                <span class="dsn-task-mark" aria-hidden="true"></span>
                <span class="dsn-task-label">{{ act.label }}</span>
                <span v-if="act.note" class="dsn-task-note">{{ act.note }}</span>
              </li>
            </ul>
          </li>
        </template>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.dsn {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.dsn-intro {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-secondary);
}

/* ── Summary ── */
.dsn-summary {
  display: flex;
  align-items: flex-end;
  gap: var(--mp-spacing-8);
  flex-wrap: wrap;
}
.dsn-summary-counts {
  display: flex;
  gap: var(--mp-spacing-8);
}
.dsn-summary-progress {
  flex: 1;
  min-width: var(--mp-sizes-64, 256px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  padding-bottom: var(--mp-spacing-2);
}
.dsn-summary-progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.dsn-summary-progress-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.dsn-summary-progress-pct {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Controls ── */
.dsn-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  flex-wrap: wrap;
}
.dsn-filter {
  display: inline-flex;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.dsn-filter-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
  transition: background-color 100ms, color 100ms;
}
.dsn-filter-btn:hover { background: var(--mp-background-neutral-subtle-hovered); }
.dsn-filter-btn--active {
  background: var(--mp-background-neutral-pressed);
  color: var(--mp-text-default);
  font-weight: var(--mp-font-weights-semi-bold);
}
.dsn-search {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  color: var(--mp-text-placeholder);
  min-width: var(--mp-sizes-64, 256px);
}
.dsn-search:focus-within { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
.dsn-search-input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.dsn-search-input::placeholder { color: var(--mp-text-placeholder); }
.dsn-search-clear {
  display: inline-flex;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--mp-text-secondary);
  padding: 0;
}

.dsn-empty {
  margin: 0;
  padding: var(--mp-spacing-6) 0;
  text-align: center;
  color: var(--mp-text-subtle);
  font-size: var(--mp-font-sizes-md);
}

/* ── Module card (1px border, no shadow — Enterprise surface) ── */
.dsn-card {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
  overflow: hidden;
}
.dsn-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.dsn-card-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.dsn-card-count {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}

.dsn-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dsn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
/* Rows carrying an action breakdown stack the header over the chip row. */
.dsn-row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--mp-spacing-2);
}
.dsn-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.dsn-row:last-child { border-bottom: none; }
.dsn-row--built { cursor: pointer; }
.dsn-row--built:hover { background: var(--mp-background-neutral-subtle-hovered); }
.dsn-row--child .dsn-row-main { padding-left: var(--mp-spacing-4); }
.dsn-row--child.dsn-row--stacked .dsn-tasks { padding-left: var(--mp-spacing-4); }

/* ── Action task-list ── */
.dsn-legend {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-5);
  flex-wrap: wrap;
}
.dsn-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.dsn-legend-note {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

/* Per-entity actions rendered as a checklist so each link reads as a to-do. */
.dsn-tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}
.dsn-task {
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-2);
  min-width: 0;
}
.dsn-task-mark {
  position: relative;
  flex-shrink: 0;
  width: var(--mp-sizes-4, 16px);
  height: var(--mp-sizes-4, 16px);
  border-radius: var(--mp-radii-sm, 4px);
  border: 1.5px solid currentColor;
  align-self: center;
}
/* Built: filled check */
.dsn-task--built .dsn-task-mark {
  color: var(--mp-text-success, #067a57);
  background: var(--mp-text-success, #067a57);
  border-color: var(--mp-text-success, #067a57);
}
.dsn-task--built .dsn-task-mark::after {
  content: '';
  position: absolute;
  left: 4.5px;
  top: 1.5px;
  width: 4px;
  height: 8px;
  border: solid var(--mp-background-page, #fff);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
/* Partial: amber dash (present but no-op) */
.dsn-task--partial .dsn-task-mark {
  color: var(--mp-text-warning, #9a6700);
  border-color: var(--mp-text-warning, #9a6700);
}
.dsn-task--partial .dsn-task-mark::after {
  content: '';
  position: absolute;
  left: 2.5px;
  top: 5.5px;
  width: 7px;
  height: 0;
  border-top: 1.5px solid var(--mp-text-warning, #9a6700);
}
/* Missing: empty grey box */
.dsn-task--missing .dsn-task-mark {
  color: var(--mp-border-bold, #94a3b8);
  border-color: var(--mp-border-bold, #94a3b8);
}
.dsn-task-label {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-sm, 16px);
}
.dsn-task--missing .dsn-task-label { color: var(--mp-text-subtle); }
.dsn-task-note {
  font-size: var(--mp-font-sizes-xs, 11px);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}

.dsn-row-main {
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-3);
  min-width: 0;
  flex-wrap: wrap;
}
.dsn-row-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.dsn-row-route {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  line-height: var(--mp-line-heights-sm, 16px);
}
.dsn-row-route--link { color: var(--mp-text-link, #165082); }
.dsn-row--built:hover .dsn-row-route--link { text-decoration: underline; }
.dsn-row-note {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}
</style>
