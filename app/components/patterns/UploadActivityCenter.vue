<script setup lang="ts">
/**
 * UploadActivityCenter — the header "activity" popover (Figma: Activity Center).
 * Opened by the monitor icon in the top bar; its Import tab shows the progress
 * of the current upload batch(es) from `uploadCenter`. Auto-opens when an upload
 * starts (bound to `uploadCenterOpen`).
 */
import { computed } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, css } from '@mekari/pixel3'
import IconButton from '~/components/IconButton.vue'
import {
  uploadBatches, uploadCenterOpen, hasActiveUpload,
  batchTotal, batchDone, batchPercent, batchUploading,
} from '~/data/uploadCenter'

const router = useRouter()

const RING_C = 2 * Math.PI * 9 // r = 9

function ringOffset(pct: number): number { return RING_C * (1 - pct / 100) }

const footLabel = computed(() => hasActiveUpload.value ? 'Uploading…' : (uploadBatches.length ? 'Up to date' : 'No recent activity'))

function viewAll() {
  const surface = uploadBatches[0]?.surface ?? 'purchase-invoices'
  const base = surface === 'purchase-invoices' ? '/purchase-invoices' : '/expenses'
  uploadCenterOpen.value = false
  router.push({ path: base, query: { tab: 'Dropbox' } })
}
</script>

<template>
  <MpPopover
    id="upload-activity-center" is-manual :is-open="uploadCenterOpen"
    placement="bottom-end" use-portal :is-keep-alive="false"
    @close="uploadCenterOpen = false"
  >
    <MpPopoverTrigger>
      <span class="ac-trigger" @click.stop="uploadCenterOpen = !uploadCenterOpen">
        <IconButton icon="desktop" :is-active="uploadCenterOpen" />
      </span>
    </MpPopoverTrigger>
    <MpPopoverContent
      :class="css({ width: '376px', padding: '0' })"
      @blur="uploadCenterOpen = false" @escape="uploadCenterOpen = false"
    >
      <div class="ac">
        <!-- Tabs (visual — Import is the live one) -->
        <div class="ac-tabs">
          <span class="ac-tab">Sync data</span>
          <span class="ac-tab">Export</span>
          <span class="ac-tab ac-tab--active">Import</span>
        </div>

        <!-- Import activity: one row per upload batch -->
        <div class="ac-list">
          <p v-if="!uploadBatches.length" class="ac-empty">Nothing importing right now.</p>
          <div v-for="b in uploadBatches" :key="b.id" class="ac-row">
            <span class="ac-ring">
              <!-- Uploading → progress ring; done → the `done` icon -->
              <svg v-if="batchUploading(b)" width="25" height="25" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="var(--mp-border-default, #e3e7e9)" stroke-width="3" />
                <circle
                  cx="12" cy="12" r="9" fill="none" stroke="var(--mp-icon-brand, #029861)" stroke-width="3"
                  stroke-linecap="round" :stroke-dasharray="RING_C" :stroke-dashoffset="ringOffset(batchPercent(b))"
                  transform="rotate(-90 12 12)"
                />
              </svg>
              <MpIcon v-else name="done" size="lg" class="ac-ring__done" />
            </span>
            <div class="ac-row__col">
              <p class="ac-row__title">{{ b.label }} ({{ batchTotal(b) }})</p>
              <p class="ac-row__sub">
                {{ batchUploading(b) ? `Uploading… ${batchDone(b)} of ${batchTotal(b)}` : `Uploaded by ${b.by}` }}
              </p>
            </div>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="ac-foot">
          <span class="ac-foot__label">{{ footLabel }}</span>
          <button v-if="uploadBatches.length" type="button" class="ac-foot__btn" @click="viewAll">View all</button>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.ac-trigger { display: inline-flex; }
.ac { display: flex; flex-direction: column; }
.ac-tabs { display: flex; gap: var(--mp-spacing-6, 24px); padding: 0 var(--mp-spacing-4, 16px); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ac-tab { padding: var(--mp-spacing-3, 12px) var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); border-bottom: 2px solid transparent; }
.ac-tab--active { color: var(--mp-text-selected, #0f6d4d); border-bottom-color: var(--mp-border-selected, #029861); font-weight: var(--mp-font-weights-medium, 500); }

.ac-list { display: flex; flex-direction: column; max-height: 280px; overflow-y: auto; }
.ac-empty { margin: 0; padding: var(--mp-spacing-4, 16px); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }
.ac-row { display: flex; align-items: center; gap: var(--mp-spacing-4, 16px); padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ac-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; flex-shrink: 0; }
.ac-ring__done { color: var(--mp-icon-success, #12b76a); }
.ac-row__col { display: flex; flex-direction: column; min-width: 0; }
.ac-row__title { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.ac-row__sub { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.ac-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.ac-foot__label { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.ac-foot__btn { padding: var(--mp-spacing-1, 4px) var(--mp-spacing-3, 12px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-secondary); }
.ac-foot__btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
</style>
