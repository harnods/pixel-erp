<script setup lang="ts">
/**
 * The approval chain of a budget change: one row per step with who approves,
 * in what role, and where the step stands. Used before submit (preview) and on
 * the change record.
 */
import { MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatDateTimeLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import type { ChainStep } from '~/data/budgetStore'

const props = withDefaults(defineProps<{
  steps: ChainStep[]
  /** Before submit: steps have not started, so a waiting step reads "To approve". */
  preview?: boolean
  /** Shown instead of the steps when the chain cannot be routed yet. */
  emptyText?: string
}>(), { preview: false, emptyText: '' })

const { t } = useLocale()

type BadgeType = 'completed' | 'announcement' | 'information' | 'warning' | 'critical'
function badge(s: ChainStep, i: number): { type: BadgeType; label: string } {
  if (s.status === 'Approved') return { type: 'completed', label: t('Approved') }
  if (s.status === 'Rejected') return { type: 'critical', label: t('Rejected') }
  if (s.status === 'Skipped') return { type: 'announcement', label: t('Skipped') }
  if (props.preview) return { type: 'announcement', label: t('To approve') }
  const firstWaiting = props.steps.findIndex((x) => x.status === 'Waiting')
  return i === firstWaiting ? { type: 'warning', label: t('Waiting') } : { type: 'announcement', label: t('Not started') }
}
</script>

<template>
  <section class="bcc" data-tour="change-chain">
    <div class="bcc__head">
      <h3 class="bcc__title">{{ t('Approval chain') }}</h3>
      <MpButton variant="ghost" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Approval rules by tier') }}</MpButton>
    </div>
    <p v-if="!steps.length" class="bcc__empty">{{ emptyText || t('No approval steps.') }}</p>
    <ol v-else class="bcc__list">
      <li v-for="(s, i) in steps" :key="i" class="bcc__step">
        <span class="bcc__no">{{ i + 1 }}</span>
        <div class="bcc__who">
          <span class="bcc__name">{{ s.approver }}</span>
          <span class="bcc__role">{{ t(s.role) }}</span>
        </div>
        <div class="bcc__state">
          <ErpStatusBadge :status="s.status.toLowerCase()" :type="badge(s, i).type" :label="badge(s, i).label" />
          <span v-if="s.at" class="bcc__meta">{{ formatDateTimeLong(s.at) }}</span>
          <span v-if="s.note" class="bcc__meta">{{ t(s.note) }}</span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.bcc { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bcc__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.bcc__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.bcc__empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bcc__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); }
.bcc__step { display: grid; grid-template-columns: var(--mp-sizes-6, 24px) minmax(0, 1fr) minmax(0, 1fr); gap: var(--mp-spacing-3); align-items: start; padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.bcc__step + .bcc__step { border-top: 1px solid var(--mp-border-default); }
.bcc__no { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.bcc__who, .bcc__state { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-0\.5); min-width: 0; }
.bcc__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.bcc__role, .bcc__meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
</style>
