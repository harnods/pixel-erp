<script setup lang="ts">
/**
 * Audit log — its own cross-project page (PRD §9, D4, P3; Story 21).
 * Chronological, readable, filterable per project (a project header's
 * "View history" opens it pre-filtered via ?project=). Role visibility: PM and
 * Finance see everything incl. policy changes; Warehouse sees reservation,
 * work-order, engineering-change and BAST entries.
 */
import { MpIcon, MpTag, MpTextlink, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { auditLog, AUDIT_KIND_LABELS, type AuditKind } from '~/data/projectAudit'
import { projects, getProject } from '~/data/projects'
import { formatDateTime } from '~/utils/date'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { role, current } = useProjectRole()

const projectFilter = ref(typeof route.query.project === 'string' ? route.query.project : '')
const kindFilter = ref<'' | AuditKind>('')
const actorFilter = ref('')
const search = ref('')
watch(projectFilter, v => router.replace({ query: { ...route.query, project: v || undefined } }))

const WAREHOUSE_KINDS: AuditKind[] = ['reservation', 'work_order', 'eco', 'bast']
const visible = computed(() => auditLog.filter(e => role.value !== 'warehouse' || WAREHOUSE_KINDS.includes(e.kind)))
const actors = computed(() => [...new Set(visible.value.map(e => e.actor))].sort())
const rows = computed(() => visible.value
  .filter(e => !projectFilter.value || (projectFilter.value === '__company' ? !e.projectId : e.projectId === projectFilter.value))
  .filter(e => !kindFilter.value || e.kind === kindFilter.value)
  .filter(e => !actorFilter.value || e.actor === actorFilter.value)
  .filter(e => {
    const s = search.value.trim().toLowerCase()
    return !s || e.summary.toLowerCase().includes(s) || (e.reason ?? '').toLowerCase().includes(s) || (e.refNo ?? '').toLowerCase().includes(s)
  })
  .slice().sort((a, b) => b.at.localeCompare(a.at)))

const projectOptions = computed(() => [
  { value: '__company', label: t('Company-level (policy)') },
  ...projects.map(p => ({ value: p.id, label: `${p.code} · ${p.name}` })),
])
const kindOptions = computed(() => (Object.keys(AUDIT_KIND_LABELS) as AuditKind[]).map(k => ({ value: k, label: t(AUDIT_KIND_LABELS[k]) })))
// Attention kinds (overrides, policy, re-open) get the solid dot; routine entries the muted one.
const ATTENTION: AuditKind[] = ['override', 'policy_change', 'method_reopen', 'budget_revision']
const selectedProject = computed(() => (projectFilter.value && projectFilter.value !== '__company' ? getProject(projectFilter.value) : undefined))
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Audit log')" :breadcrumb="selectedProject ? { label: `${selectedProject.code} · ${selectedProject.name}`, to: `/projects/${selectedProject.id}` } : undefined" />
    <div class="pm-stage-wrap" :class="{ 'pm-stage-wrap--info': role === 'warehouse' }">
    <MpBanner v-if="role === 'warehouse'" id="audit-warehouse" variant="info" is-inline class="pm-page-banner">
      <MpBannerIcon />
      <MpBannerDescription>{{ t('Viewing as') }} {{ t(current.label) }} — {{ t('showing reservation, work-order, engineering-change and BAST entries.') }}</MpBannerDescription>
    </MpBanner>
    <div class="pm-stage">
      <div class="pm-filters">
        <ErpFilterSelect id="audit-project" v-model="projectFilter" :placeholder="t('All projects')" :options="projectOptions" width="240px" />
        <ErpFilterSelect id="audit-kind" :model-value="kindFilter" :placeholder="t('All types')" :options="kindOptions" @update:model-value="(v: string) => (kindFilter = v as '' | AuditKind)" />
        <ErpFilterSelect id="audit-actor" v-model="actorFilter" :placeholder="t('Anyone')" :options="actors" />
        <span class="pm-spacer" />
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search summary, reason, document...')" />
        </div>
      </div>

      <div class="pm-card">
        <div class="pm-timeline">
          <div v-for="e in rows" :key="e.id" class="pm-tl-item">
            <div class="pm-tl-date">{{ formatDateTime(e.at) }}</div>
            <span class="pm-tl-dot" :class="{ 'pm-tl-dot--muted': !ATTENTION.includes(e.kind) }" />
            <div>
              <div class="pm-tl-summary">{{ e.summary }}</div>
              <div class="pm-tl-meta">
                <MpTag :id="`audit-kind-${e.id}`">{{ t(AUDIT_KIND_LABELS[e.kind]) }}</MpTag>
                <span>{{ e.actor }} · {{ t(e.role) }}</span>
                <MpTextlink v-if="e.projectId && !projectFilter" :id="`audit-project-${e.id}`" as="a" @click.prevent="router.push(`/projects/${e.projectId}`)">{{ getProject(e.projectId)?.code }}</MpTextlink>
                <span v-if="e.refNo">{{ e.refNo }}</span>
              </div>
              <div v-if="e.reason" class="pm-tl-reason"><span class="pm-muted">{{ t('Reason') }}:</span> {{ e.reason }}</div>
            </div>
          </div>
          <div v-if="!rows.length" class="pm-empty-inline">
            <div class="pm-empty-title">{{ t('No entries') }}</div>
            <div class="pm-empty-desc">{{ t('Nothing matches these filters.') }}</div>
          </div>
        </div>
      </div>
      <p class="pm-caption pm-mt-2">{{ rows.length }} {{ t('entries') }} · {{ t('Entries are append-only.') }}</p>
    </div>
    </div>
  </div>
</template>
