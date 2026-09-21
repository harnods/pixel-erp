<script setup lang="ts">
/**
 * Audit log — its own cross-project page (PRD §9, D4, P3; Story 21).
 * Chronological, readable, filterable per project (a project header's
 * "View history" opens it pre-filtered via ?project=). Role visibility: PM and
 * Finance see everything incl. policy changes; Warehouse sees reservation,
 * work-order, engineering-change and BAST entries.
 */
import PmTitleBar from '../PmTitleBar.vue'
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

const KIND_COLOR: Record<AuditKind, string> = {
  budget_revision: '#4b61dc', override: '#e08a00', policy_change: '#7a4100', method_reopen: '#c8323b', approval: '#029861',
  change_order: '#8a4fd6', eco: '#3a4fc5', reservation: '#0e7c86', recognition: '#029861', billing: '#186f4a',
  structure: '#626b79', work_order: '#626b79', bast: '#0f6d4d', close: '#3f4a51',
}
const selectedProject = computed(() => (projectFilter.value && projectFilter.value !== '__company' ? getProject(projectFilter.value) : undefined))
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Audit log')" :breadcrumb="selectedProject ? { label: `${selectedProject.code} · ${selectedProject.name}`, to: `/projects/${selectedProject.id}` } : undefined" :subtitle="t('Every budget revision, override, policy change, method re-open, change order, engineering change and reservation release — across projects.')" />
    <div class="pm-stage">
      <div class="pm-filters">
        <select v-model="projectFilter" class="pm-select" :aria-label="t('Project')">
          <option value="">{{ t('All projects') }}</option>
          <option value="__company">{{ t('Company-level (policy)') }}</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option>
        </select>
        <select v-model="kindFilter" class="pm-select" :aria-label="t('Type')">
          <option value="">{{ t('All types') }}</option>
          <option v-for="(label, key) in AUDIT_KIND_LABELS" :key="key" :value="key">{{ t(label) }}</option>
        </select>
        <select v-model="actorFilter" class="pm-select" :aria-label="t('Actor')">
          <option value="">{{ t('Anyone') }}</option>
          <option v-for="a in actors" :key="a" :value="a">{{ a }}</option>
        </select>
        <span class="pm-spacer" />
        <label class="pm-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input v-model="search" type="text" :placeholder="t('Search summary, reason, document...')" />
        </label>
      </div>

      <div v-if="role === 'warehouse'" class="pm-banner pm-banner--neutral" style="margin-bottom: 12px">
        <div class="pm-banner-body">{{ t('Viewing as') }} {{ t(current.label) }} — {{ t('showing reservation, work-order, engineering-change and BAST entries.') }}</div>
      </div>

      <div class="pm-card" style="padding: 4px 16px">
        <div class="pm-timeline">
          <div v-for="e in rows" :key="e.id" class="pm-tl-item">
            <div class="pm-tl-date">{{ formatDateTime(e.at) }}</div>
            <span class="pm-tl-dot" :style="{ background: KIND_COLOR[e.kind] }" />
            <div>
              <div class="pm-tl-summary">{{ e.summary }}</div>
              <div class="pm-tl-meta">
                <span class="pm-pill pm-pill--gray">{{ t(AUDIT_KIND_LABELS[e.kind]) }}</span>
                <span>{{ e.actor }} · {{ t(e.role) }}</span>
                <button v-if="e.projectId && !projectFilter" class="pm-link pm-small" type="button" @click="router.push(`/projects/${e.projectId}`)">{{ getProject(e.projectId)?.code }}</button>
                <span v-if="e.refNo">{{ e.refNo }}</span>
              </div>
              <div v-if="e.reason" class="pm-tl-reason"><span class="pm-muted">{{ t('Reason') }}:</span> {{ e.reason }}</div>
            </div>
          </div>
          <div v-if="!rows.length" class="pm-empty"><div class="pm-empty-title">{{ t('No entries') }}</div>{{ t('Nothing matches these filters.') }}</div>
        </div>
      </div>
      <p class="pm-help" style="margin-top: 8px">{{ rows.length }} {{ t('entries') }} · {{ t('Entries are append-only.') }}</p>
    </div>
  </div>
</template>
