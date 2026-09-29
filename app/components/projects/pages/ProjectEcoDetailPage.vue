<script setup lang="ts">
/**
 * Engineering change detail — the ECO read surface, reached from the Production
 * tab's engineering-change list.
 *
 * Read-only by design. Raising, editing and deciding an ECO are role-scoped acts
 * that live where their authority does: Production publishes a version, and the
 * PM's adoption decision goes through the approvals inbox. This page answers
 * "what changed, against which version, and where did it land" — the question
 * anyone on the project may ask.
 *
 * The effectivity line is stated even when unset, because "not set" is the state
 * that blocks approval and is worth seeing rather than inferring from a blank.
 */
import { MpBanner, MpBannerIcon, MpBannerDescription, MpTextlink } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import EcoDiff from '../EcoDiff.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { getProject, getWorkPackage } from '~/data/projects'
import { engineeringChanges } from '~/data/projectChanges'
import { effectivityText } from '~/data/projectActions'
import { getCustomBom } from '~/data/projectBoms'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ projectId: string; ecoId: string }>()
const { t } = useLocale()

const project = computed(() => getProject(props.projectId))
const eco = computed(() => engineeringChanges.find(e => e.id === props.ecoId))
const bom = computed(() => (eco.value ? getCustomBom(eco.value.customBomId) : undefined))
const wp = computed(() => (eco.value ? getWorkPackage(eco.value.wpId) : undefined))
const units = computed(() => wp.value?.plannedUnits ?? 0)
</script>

<template>
  <div class="pm-page">
    <PmTitleBar
      :title="eco ? `${eco.no} · ${eco.title}` : t('Engineering change')"
      :breadcrumb="{ label: project ? `${project.code} · ${project.name}` : t('Projects'), to: project ? `/projects/${project.id}?tab=production` : '/projects' }"
    />

    <div class="pm-stage">
      <div v-if="!eco" class="pm-card pm-empty-inline">
        <div class="pm-empty-title">{{ t('Engineering change not found') }}</div>
        <p class="pm-empty-desc">{{ t('It may have been removed, or the link is out of date.') }}</p>
      </div>

      <template v-else>
        <section class="pm-section">
          <div class="pm-section-head">
            <div>
              <h2 class="pm-h2">{{ t('Change') }}</h2>
              <p class="pm-caption pm-m-0">{{ eco.reason }}</p>
            </div>
            <ErpStatusBadge v-bind="badgeProps('eco', eco.status, t)" />
          </div>

          <div class="pm-card pm-card--flat">
            <div class="pm-grid-3">
              <ContentList :label="t('Project BOM')" :value="bom?.name ?? '—'" />
              <ContentList :label="t('Work package')" :value="wp ? `${wp.code} ${wp.name}` : '—'" />
              <ContentList :label="t('Versions')" :value="`v${eco.baseVersion} → ${eco.resultVersion ? `v${eco.resultVersion}` : t('(proposed)')}`" />
              <ContentList :label="t('Raised by')" :value="`${eco.raisedBy} · ${formatDate(eco.createdAt)}`" />
              <ContentList :label="t('Effectivity')">
                <template v-if="eco.effectivity">{{ t(effectivityText(eco.effectivity, eco.specificWoIds)) }}</template>
                <span v-else class="pm-warn">{{ t('Not set') }}</span>
              </ContentList>
              <ContentList :label="t('Decided')" :value="eco.decidedBy ? `${eco.decidedBy} · ${formatDate(eco.decidedAt)}` : '—'" />
            </div>
          </div>

          <MpBanner v-if="!eco.effectivity" id="pm-eco-no-effectivity" variant="warning" class="pm-mt-3">
            <MpBannerIcon />
            <MpBannerDescription>{{ t('Effectivity scope has not been set, so this change can’t be approved yet — it is never defaulted.') }}</MpBannerDescription>
          </MpBanner>
          <MpBanner v-if="eco.voId" id="pm-eco-vo" variant="info" class="pm-mt-3">
            <MpBannerIcon />
            <MpBannerDescription>{{ t('The customer funds this change — it references a change order. An engineering change never moves contract value on its own.') }}</MpBannerDescription>
          </MpBanner>
        </section>

        <section class="pm-section">
          <div class="pm-section-head">
            <div>
              <h2 class="pm-h2">{{ t('Composition diff') }}</h2>
              <p class="pm-caption pm-m-0">{{ t('Components added, removed and changed against the base version, with the cost delta per line and in total.') }}</p>
            </div>
          </div>
          <EcoDiff :bom-id="eco.customBomId" :base-version="eco.baseVersion" :proposed="eco.proposed" :units="units" />
        </section>

        <p class="pm-caption">
          <MpTextlink id="pm-eco-back" as="a" @click.prevent="$router.push(`/projects/${projectId}?tab=production`)">{{ t('Back to Production') }}</MpTextlink>
        </p>
      </template>
    </div>
  </div>
</template>
