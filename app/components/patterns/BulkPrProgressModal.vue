<script setup lang="ts">
/**
 * Background creation of a large batch of Purchase Requests (PRD US-018 AC-03 / EH-01,
 * US-015 AC-02). Past BULK_ASYNC_MIN_LINES the worklist does not block on one big step:
 * it creates the requests group by group while this modal shows progress, then reports
 * "X created, Y failed" and lets the failed groups be retried. Closing it does not stop
 * the job — a toast reports the outcome once it finishes.
 *
 * Built on MpModal (rule/modal-use-mpmodal); closes via × only.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import type { BatchedPrResult } from '~/data/replenishmentPurchaseRequest'

const props = defineProps<{
  isOpen: boolean
  running: boolean
  done: number
  total: number
  result: BatchedPrResult | null
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'retry'): void
  (e: 'view'): void
}>()

const { t, tf } = useLocale()

const pct = computed(() => (props.total ? Math.min(100, Math.round((props.done / props.total) * 100)) : 0))
const failedLines = computed(() => (props.result?.failed ?? []).reduce((n, f) => n + f.lineCount, 0))

function close() { emit('update:isOpen', false) }
</script>

<template>
  <MpModal
    id="rp-bulk-pr-progress"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ running ? t('Creating purchase requests') : t('Purchase requests created') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <!-- Running: how far along, and that leaving does not cancel it. -->
        <template v-if="running">
          <div class="bpp-bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" :aria-label="t('Creating purchase requests')">
            <span class="bpp-fill" :style="{ width: `${pct}%` }" />
          </div>
          <p class="bpp-line">{{ tf('{done} of {total} lines', { done, total }) }}</p>
          <p class="bpp-note">{{ t('You can close this window. The requests keep being created') }}</p>
        </template>

        <!-- Done: created vs failed, with the failed groups listed so they can be retried. -->
        <template v-else-if="result">
          <p class="bpp-line">
            {{ result.created.length === 1 ? t('1 purchase request created') : tf('{n} purchase requests created', { n: result.created.length }) }}
          </p>
          <p v-if="result.skipped.length" class="bpp-note">{{ tf('Skipped products: {n}', { n: result.skipped.length }) }}</p>
          <template v-if="result.failed.length">
            <p class="bpp-bad" role="alert">
              {{ tf('{n} requests ({lines} lines) could not be created', { n: result.failed.length, lines: failedLines }) }}
            </p>
            <ul class="bpp-failed">
              <li v-for="(f, i) in result.failed" :key="i">
                {{ tf('{vendor} · {warehouse}: {lines} lines', { vendor: f.vendorName || t('No vendor'), warehouse: f.warehouseName, lines: f.lineCount }) }}
              </li>
            </ul>
          </template>
        </template>
      </MpModalBody>
      <MpModalFooter v-if="!running">
        <MpButtonGroup class="erp-action-footer">
          <MpButton v-if="result?.failed.length" id="rp-bulk-pr-retry" variant="secondary" is-rounded @click="emit('retry')">{{ t('Retry failed') }}</MpButton>
          <MpButton id="rp-bulk-pr-view" variant="primary" is-rounded @click="emit('view')">{{ t('View purchase requests') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.bpp-bar {
  height: var(--mp-sizes-2); overflow: hidden;
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
}
.bpp-fill { display: block; height: 100%; background: var(--mp-colors-background-success-bold); transition: width 200ms ease; }
.bpp-line { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpp-note { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpp-bad { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
/* A real list, so it keeps its markers (CLAUDE.md › List bullets). */
.bpp-failed { list-style: disc outside; margin: var(--mp-spacing-2) 0 0; padding-left: var(--mp-spacing-5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpp-failed li { display: list-item; margin-top: var(--mp-spacing-0\.5); }
</style>
