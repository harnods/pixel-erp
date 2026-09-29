<script setup lang="ts">
/**
 * Overview tab (PRD v6.2 §3.1) — the project's key facts in one read before the
 * reviewer goes anywhere else.
 *
 * Two things here are v6.2 mechanics rather than decoration:
 *
 * 1 · Contract value is Σ the SOs carrying this project's dimension (§11), not a
 *     typed number. Addenda are included, which is what makes "scope grew but the
 *     invoice did not" visible: a change that never reached an SO leaves the
 *     contract flat while cost moves.
 *
 * 2 · The project dimension value (A-2) is shown because it is the thing every
 *     downstream document carries. If it is missing, nothing pegs.
 */
import { MpBanner } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import type { Project } from '~/data/projects'
import { contractValueOf, projectSos, projectWorkPackages, projectPhases } from '~/data/projects'
import { getBudget, COGM_ACCOUNT } from '~/data/projectBudgets'
import { projectAvailable } from '~/data/projectTransactions'
import { rp } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()

const sos = computed(() => projectSos(props.project.id))
const contractValue = computed(() => contractValueOf(props.project))
const budget = computed(() => getBudget(props.project.id))
const phaseCount = computed(() => projectPhases(props.project.id).filter(p => !p.auto).length)
const wpCount = computed(() => projectWorkPackages(props.project.id).length)

// "not set" is never Rp 0 — a zero reads as a deliberate constraint and would
// block every document (§3).
const productionBudget = computed(() => {
  const b = budget.value
  if (!b) return undefined
  return b.lines.filter(l => l.account === COGM_ACCOUNT).reduce((s, l) => s + l.amount, 0)
})
const available = computed(() => projectAvailable(props.project.id))
</script>

<template>
  <div class="ov" data-devchange="pm-v62-phase1">
    <MpBanner
      v-if="!project.dimensionValueId"
      id="ov-no-dimension"
      variant="warning"
      :description="t('This project has no dimension value, so documents cannot be pegged to it.')"
    />

    <section class="pm-card">
      <h3 class="pm-h3">{{ t('Project') }}</h3>
      <div class="pm-grid-3">
        <ContentList :label="t('Project code')" :value="project.code" />
        <ContentList :label="t('Name')" :value="project.name" />
        <ContentList :label="t('Customer')" :value="project.customer" />
        <ContentList :label="t('Status')">
          <ErpStatusBadge v-bind="badgeProps('project', project.status, t)" />
        </ContentList>
        <ContentList :label="t('PM owner')" :value="project.pm" />
        <ContentList :label="t('Priority')" :value="t(project.priority)" />
        <ContentList :label="t('Shape')" :value="`${project.isProduction ? t('Production') : t('Service')} · ${t('Depth')} ${project.depth}`" />
        <ContentList :label="t('Dimension value')" :value="project.dimensionValueId ?? '—'" />
        <ContentList :label="t('Escalation threshold')" :value="`${project.escalationThresholdPct ?? 20}%`" />
      </div>
    </section>

    <section class="pm-card">
      <h3 class="pm-h3">{{ t('Contract') }}</h3>
      <p class="pm-caption pm-m-0">{{ t('Contract value is the sum of the sales orders carrying this project, addenda included.') }}</p>
      <div class="pm-grid-3 pm-mt-3">
        <ContentList :label="t('Contract value')" :value="rp(contractValue)" />
        <ContentList :label="t('Sales orders')" :value="sos.length ? String(sos.length) : '—'" />
        <ContentList :label="t('Start')" :value="formatDate(project.startDate)" />
      </div>
      <div v-if="sos.length" class="pm-table-wrap pm-mt-3">
        <table class="pm-table">
          <thead>
            <tr>
              <th class="pm-th">{{ t('Sales order') }}</th>
              <th class="pm-th">{{ t('Date') }}</th>
              <th class="pm-th pm-th--num">{{ t('Value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="so in sos" :key="so.id" class="pm-tr">
              <td class="pm-td">
                {{ so.number }}
                <span v-if="so.isAddendum" class="pm-caption"> · {{ t('Addendum') }}</span>
              </td>
              <td class="pm-td">{{ formatDate(so.date) }}</td>
              <td class="pm-td pm-td--num">{{ rp(so.value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="pm-card">
      <h3 class="pm-h3">{{ t('Budget') }}</h3>
      <div class="pm-grid-3">
        <ContentList :label="t('Total budget production')" :value="productionBudget === undefined ? t('Budget not set') : rp(productionBudget)" />
        <ContentList :label="t('Available')" :value="productionBudget === undefined ? t('Budget not set') : rp(available)" />
        <ContentList :label="t('Structure')" :value="`${phaseCount} ${t('phases')} · ${wpCount} ${t('work packages')}`" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.ov { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
</style>
