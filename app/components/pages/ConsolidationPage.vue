<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/components/consolidation-sidebar.vue (+ router.js) -->
<script setup lang="ts">
/**
 * Accounting › Consolidation — one page with prod's in-page left
 * sub-navigation (consolidation-sidebar.vue) switching between the six
 * consolidation sub-areas. The active section is deep-linked as
 * `?section=<id>` so a reload keeps the user where they were. When no
 * consolidation exists the list section shows prod's Onboarding page.
 */
import ConsolidationListSection from './consolidation/ConsolidationListSection.vue'
import ConsolBusinessUnitsSection from './consolidation/ConsolBusinessUnitsSection.vue'
import ConsolChartOfAccountsSection from './consolidation/ConsolChartOfAccountsSection.vue'
import ConsolReportsSection from './consolidation/ConsolReportsSection.vue'
import ConsolEliminationRulesSection from './consolidation/ConsolEliminationRulesSection.vue'
import ConsolRolesSection from './consolidation/ConsolRolesSection.vue'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

type Section = 'list' | 'business_units' | 'chart_of_accounts' | 'reports' | 'elimination_rules' | 'roles'
const NAV: { id: Section; label: string }[] = [
  { id: 'list', label: 'Consolidation list' },
  { id: 'business_units', label: 'Business unit list' },
  { id: 'chart_of_accounts', label: 'Consolidation chart of accounts' },
  { id: 'reports', label: 'Consolidation report' },
  { id: 'elimination_rules', label: 'Elimination rules' },
  { id: 'roles', label: 'Consolidation roles' },
]
const section = computed<Section>(() => {
  const q = String(route.query.section ?? 'list') as Section
  return NAV.some((n) => n.id === q) ? q : 'list'
})
function go(id: Section, extra: Record<string, string> = {}) {
  router.replace({ query: { section: id, ...extra } })
}
provide('consolGo', go)
</script>

<template>
  <div class="consol-page">
    <nav class="consol-nav" :aria-label="t('Consolidation')">
      <span class="consol-nav__header">{{ t('Consolidation') }}</span>
      <a
        v-for="it in NAV"
        :key="it.id"
        :href="`?section=${it.id}`"
        class="consol-nav__item"
        :class="{ 'consol-nav__item--active': section === it.id }"
        :data-test-id="`consolidation-sidebar-${it.id}`"
        @click.prevent="go(it.id)"
      >{{ t(it.label) }}</a>
    </nav>

    <div class="consol-main">
      <ConsolidationListSection v-if="section === 'list'" />
      <ConsolBusinessUnitsSection v-else-if="section === 'business_units'" />
      <ConsolChartOfAccountsSection v-else-if="section === 'chart_of_accounts'" />
      <ConsolReportsSection v-else-if="section === 'reports'" />
      <ConsolEliminationRulesSection v-else-if="section === 'elimination_rules'" />
      <ConsolRolesSection v-else />
    </div>
  </div>
</template>

<style scoped>
.consol-page {
  display: flex;
  gap: var(--mp-spacing-6);
  height: 100%;
  min-height: 0;
}

/* ── Left sub-navigation (same treatment as Settings › Templates) ── */
.consol-nav {
  flex-shrink: 0;
  width: var(--mp-sizes-56);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-4);
  border-right: 1px solid var(--mp-border-default);
  overflow-y: auto;
}
.consol-nav__header {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 2.88px;
  text-transform: uppercase;
  color: var(--mp-text-secondary);
}
.consol-nav__item {
  padding: var(--mp-spacing-2);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  text-decoration: none;
}
.consol-nav__item:hover { background: var(--mp-background-neutral-hovered); }
.consol-nav__item--active {
  background: var(--mp-background-neutral-pressed);
  color: var(--mp-text-link);
  font-weight: var(--mp-font-weights-semi-bold);
}

.consol-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
</style>
