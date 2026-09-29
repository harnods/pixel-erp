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
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
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
  const lines = b.lines.filter(l => l.account === COGM_ACCOUNT)
  return lines.length ? lines.reduce((s, l) => s + l.amount, 0) : undefined
})
const available = computed(() => projectAvailable(props.project.id))
</script>

<template>
  <div data-devchange="pm-v62-phase1">
    <MpBanner v-if="!project.dimensionValueId" id="pm-ov-no-dimension" variant="warning" class="pm-mb-3">
      <MpBannerIcon />
      <MpBannerTitle>{{ t('No dimension value') }}</MpBannerTitle>
      <MpBannerDescription>{{ t('This project has no dimension value, so documents cannot be pegged to it.') }}</MpBannerDescription>
    </MpBanner>

    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Project') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('The dimension value is what every document in this project carries — it is how cost finds its way back here.') }}</p>
        </div>
      </div>

      <div class="pm-card pm-card--flat">
        <div class="pm-grid-3">
          <ContentList :label="t('Project code')" :value="project.code" />
          <ContentList :label="t('Name')" :value="project.name" />
          <ContentList :label="t('Customer')" :value="project.customer" />
          <ContentList :label="t('Status')">
            <ErpStatusBadge v-bind="badgeProps('project', project.status, t)" />
          </ContentList>
          <ContentList :label="t('Project manager')" :value="project.pm" />
          <ContentList :label="t('Priority')" :value="t(project.priority)" />
          <ContentList :label="t('Shape')" :value="`${project.isProduction ? t('Production') : t('Service')} · ${t('Depth')} ${project.depth}`" />
          <ContentList :label="t('Dimension value')" :value="project.dimensionValueId ?? '—'" />
          <ContentList :label="t('Escalation threshold')" :value="`${project.escalationThresholdPct ?? 20}%`" />
        </div>
      </div>
    </section>

    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Contract') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Contract value is the sum of the sales orders carrying this project, addenda included — it is never typed.') }}</p>
        </div>
      </div>

      <div class="pm-card pm-card--flat pm-mb-3">
        <div class="pm-grid-3">
          <ContentList :label="t('Contract value')" :value="rp(contractValue)" />
          <ContentList :label="t('Sales orders')" :value="sos.length ? String(sos.length) : '—'" />
          <ContentList :label="t('Planned dates')" :value="`${formatDate(project.startDate)} – ${formatDate(project.endDate)}`" />
        </div>
      </div>

      <div v-if="sos.length" class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Sales order') }}</th>
              <th>{{ t('Date') }}</th>
              <th class="pm-num">{{ t('Value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="so in sos" :key="so.id">
              <td class="pm-wrap">
                {{ so.number }}
                <span v-if="so.isAddendum" class="pm-cell-sub">{{ t('Addendum — raises contract value on an existing project.') }}</span>
              </td>
              <td>{{ formatDate(so.date) }}</td>
              <td class="pm-num">{{ rp(so.value) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>{{ t('Contract value') }}</td>
              <td />
              <td class="pm-num">{{ rp(contractValue) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-else class="pm-card pm-empty-inline">
        <div class="pm-empty-title">{{ t('No sales order linked') }}</div>
        <p class="pm-empty-desc">{{ t('Contract value falls back to the figure stored on the project until a sales order carries this project.') }}</p>
      </div>
    </section>

    <section class="pm-section">
      <div class="pm-section-head">
        <div>
          <h2 class="pm-h2">{{ t('Budget') }}</h2>
          <p class="pm-caption pm-m-0">{{ t('Total budget production is the Cost of production line. Available is what the work-order gate reads.') }}</p>
        </div>
      </div>

      <div class="pm-card pm-card--flat">
        <div class="pm-grid-3">
          <ContentList :label="t('Total budget production')">
            <template v-if="productionBudget !== undefined">{{ rp(productionBudget) }}</template>
            <span v-else class="pm-warn">{{ t('Not set') }}</span>
          </ContentList>
          <ContentList :label="t('Available')">
            <template v-if="available !== undefined">{{ rp(available) }}</template>
            <span v-else class="pm-warn">{{ t('Not set') }}</span>
          </ContentList>
          <ContentList :label="t('Structure')" :value="`${phaseCount} ${t('phases')} · ${wpCount} ${t('work packages')}`" />
        </div>
      </div>
    </section>
  </div>
</template>
