<script setup lang="ts">
/**
 * Projects module router — one entry from [...slug].vue's detailMatch, fans out
 * to the module's pages by URL:
 *
 *   /projects                         portfolio
 *   /projects/new                     adaptive create flow
 *   /projects/:id[?tab=…]             project page (tabs)
 *   /projects/:id/work-orders/new     work-order budget gate
 *   /project-approvals                approvals inbox (5 kinds)
 *   /project-new-document             pegged document + budget check
 *   /stock-availability               on hand / reserved / available
 *   /site-change-capture              field change → change order
 *   /project-audit-log[?project=]     audit page (cross-project, filterable)
 *   /budget-setup[/:projectId]        separate budget module
 *   /project-settings                 company policy
 */
const route = useRoute()
const segs = computed(() => route.path.split('/').filter(Boolean))

const PortfolioPage = defineAsyncComponent(() => import('./pages/ProjectsPortfolioPage.vue'))
const CreatePage = defineAsyncComponent(() => import('./pages/ProjectCreatePage.vue'))
const DetailPage = defineAsyncComponent(() => import('./pages/ProjectDetailPage.vue'))
const WoGatePage = defineAsyncComponent(() => import('./pages/ProjectWoGatePage.vue'))
const ApprovalsPage = defineAsyncComponent(() => import('./pages/ProjectApprovalsPage.vue'))
const NewDocumentPage = defineAsyncComponent(() => import('./pages/ProjectNewDocumentPage.vue'))
const StockPage = defineAsyncComponent(() => import('./pages/StockAvailabilityPage.vue'))
const SiteCapturePage = defineAsyncComponent(() => import('./pages/SiteChangeCapturePage.vue'))
const AuditPage = defineAsyncComponent(() => import('./pages/ProjectAuditLogPage.vue'))
const BudgetSetupPage = defineAsyncComponent(() => import('./pages/BudgetSetupPage.vue'))
const SettingsPage = defineAsyncComponent(() => import('./pages/ProjectSettingsPage.vue'))

const view = computed<{ component: Component; props: Record<string, unknown> }>(() => {
  const [a, b, c, d] = segs.value
  switch (a) {
    case 'projects':
      if (!b) return { component: PortfolioPage, props: {} }
      if (b === 'new') return { component: CreatePage, props: {} }
      if (c === 'work-orders' && d === 'new') return { component: WoGatePage, props: { projectId: b } }
      return { component: DetailPage, props: { projectId: b } }
    case 'project-approvals': return { component: ApprovalsPage, props: {} }
    case 'project-new-document': return { component: NewDocumentPage, props: {} }
    case 'stock-availability': return { component: StockPage, props: {} }
    case 'site-change-capture': return { component: SiteCapturePage, props: {} }
    case 'project-audit-log': return { component: AuditPage, props: {} }
    case 'budget-setup': return { component: BudgetSetupPage, props: { projectId: b } }
    case 'project-settings': return { component: SettingsPage, props: {} }
  }
  return { component: PortfolioPage, props: {} }
})
</script>

<template>
  <component :is="view.component" v-bind="view.props" :key="route.path" />
</template>
