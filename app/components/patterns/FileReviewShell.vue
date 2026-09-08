<script setup lang="ts">
/**
 * FileReviewShell — the chrome every OCR file-review page shares.
 *
 * Owns the title bar (breadcrumb, "File review N of M", jump-to-file switcher),
 * the two-panel stage with the document preview + drag-to-resize divider, and
 * the scrolling right panel. Each classification's form goes in the default
 * slot; the shell knows nothing about what's being reviewed.
 *
 * The same review run is reachable from two surfaces (Expenses and Purchase
 * invoices), so the breadcrumb label and the route the queue navigates within
 * are both passed in rather than hardcoded — see `queueBase` / `backLabel`.
 *
 * Extracted from BillReviewPage.vue, which still carries its own copy; the two
 * should be reconciled when that page is next touched.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  MpIcon, MpTextlink, MpSpinner, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import type { ReviewFile } from '~/data'
import { getReviewBlob } from '~/utils/reviewBlobStore'

const props = defineProps<{
  /** The whole review run this file belongs to — drives "N of M" and the switcher. */
  queue: ReviewFile[]
  /** id of the file currently under review */
  fileId: string
  /** Breadcrumb text, e.g. "Expenses" or "Purchase invoices" */
  backLabel: string
  /** Route prefix the switcher navigates within, e.g. "/purchase-invoices/review" */
  queueBase: string
  /** OCR couldn't read this file at all — left panel shows the warning banner,
   *  right panel is left to the page (it renders nothing in this state). */
  isUnreadable?: boolean
  /** Number of pages the source document has — drives the "N page(s)" label
   *  and how many preview panels stack in the left column. Defaults to 1. */
  pageCount?: number
  /** Preview image for each page, in order. Short by pageCount → the last
   *  entry repeats for the remaining pages. Defaults to the generic dropzone
   *  illustration when omitted (e.g. a page that hasn't been given a mock yet). */
  previewImages?: string[]
}>()

const emit = defineEmits<{ back: []; reupload: [] }>()

const router = useRouter()
const { t } = useLocale()

const reviewFile = computed(() => props.queue.find((rf) => rf.id === props.fileId) ?? props.queue[0])
const queueIndex = computed(() => {
  const i = props.queue.findIndex((rf) => rf.id === props.fileId)
  return i === -1 ? 0 : i
})
const queueTotal = computed(() => props.queue.length)

function goToFile(id: string) {
  if (id !== props.fileId) router.push(`${props.queueBase}/${id}`)
}

function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  return 'attachment'
}

// ── Jump-to-file switcher — same pattern as the detail pages' jump-to-transaction
// popover (see PurchaseOrderDetailPage). Matches on filename or beneficiary.
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  return props.queue
    .map((rf, i) => ({ ...rf, position: i + 1 }))
    .filter((rf) => !q || rf.file.toLowerCase().includes(q) || rf.beneficiary.name.toLowerCase().includes(q))
})

// ── Left panel resize ────────────────────────────────────────────────────────
const LEFT_PANEL_MIN = 320
const LEFT_PANEL_MAX = 640
const leftWidth = ref(LEFT_PANEL_MIN)
function startPanelResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = leftWidth.value
  function onMove(ev: MouseEvent) {
    leftWidth.value = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, startW + (ev.clientX - startX)))
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
onBeforeUnmount(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
const zoomMode = ref<'fit' | '100'>('fit')
const pageCount = computed(() => props.pageCount ?? 1)

function previewSrc(page: number) {
  const images = props.previewImages
  if (!images || images.length === 0) return '/illustrations/receipt-dropzone.png'
  return images[page - 1] ?? images[images.length - 1]
}

// The actual uploaded document, loaded from IndexedDB by file id (present for
// user-uploaded files; absent for seed rows → fall back to scenario previews).
// Rendered as plain <img>s (single image, or the PDF's pages rasterised by
// /api/expenses/pdf-pages) so the preview has our own light background instead
// of Chrome's dark built-in PDF-viewer chrome.
const realImages = ref<string[] | null>(null)
const realLoading = ref(false)

async function loadRealFile(id: string) {
  realImages.value = null
  const rec = await getReviewBlob(id)
  if (!rec?.dataUrl) return
  const isPdf = rec.mime === 'application/pdf' || (rec.fileName || '').toLowerCase().endsWith('.pdf')
  if (!isPdf) { realImages.value = [rec.dataUrl]; return }
  realLoading.value = true
  try {
    const res = await $fetch<{ pages: string[] }>('/api/expenses/pdf-pages', {
      method: 'POST',
      body: { dataBase64: rec.dataUrl },
    })
    realImages.value = res.pages?.length ? res.pages : null
  } catch {
    realImages.value = null
  } finally {
    realLoading.value = false
  }
}
watch(() => props.fileId, (id) => { void loadRealFile(id) }, { immediate: true })

defineExpose({ reviewFile, queueIndex, queueTotal })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="frs-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="emit('back')">{{ backLabel }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">
            {{ t('File review') }}
            <span class="detail-title-count">{{ queueIndex + 1 }} {{ t('of') }} {{ queueTotal }}</span>
          </h1>
          <!-- Chevron → jump-to-file switcher (search + queue) -->
          <MpPopover id="frs-file-nav" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch file')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" :placeholder="t('Search file…')" />
                </div>
                <div class="detail-jump-list">
                  <button
                    v-for="rf in jumpResults" :key="rf.id"
                    class="detail-jump-item"
                    :class="{ 'detail-jump-item--active': rf.id === fileId }"
                    @click="goToFile(rf.id)"
                  >
                    <span class="detail-jump-item-number">{{ rf.position }}. {{ rf.file }}</span>
                    <span class="detail-jump-item-customer">{{ rf.beneficiary.name || t('Unclassified') }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No files found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Two-panel stage ── -->
    <div class="ex-stage">
      <!-- ── Left panel: document preview ── -->
      <div class="ex-left" :style="{ width: leftWidth + 'px' }">
        <div class="ex-left-header">
          <div class="ex-file-meta">
            <MpIcon :name="fileIconName(reviewFile?.file ?? '')" size="sm" class="ex-file-meta-icon" />
            <div class="ex-file-meta-text">
              <span class="ex-file-name">{{ reviewFile?.file }}</span>
              <span class="ex-file-size">{{ pageCount }} {{ pageCount > 1 ? t('pages') : t('page') }}</span>
            </div>
          </div>
          <div class="detail-loc-toggle" role="group" :aria-label="t('Zoom')">
            <button
              type="button" class="detail-loc-toggle-btn"
              :class="{ 'detail-loc-toggle-btn--active': zoomMode === 'fit' }"
              @click="zoomMode = 'fit'"
            >{{ t('Fit') }}</button>
            <button
              type="button" class="detail-loc-toggle-btn"
              :class="{ 'detail-loc-toggle-btn--active': zoomMode === '100' }"
              @click="zoomMode = '100'"
            >100%</button>
          </div>
        </div>
        <MpBanner
          v-if="isUnreadable"
          id="frs-unreadable-banner" variant="warning" class="frs-unreadable-banner"
        >
          <MpBannerIcon id="frs-unreadable-banner-icon" />
          <MpBannerTitle>{{ t("File couldn't be scanned properly") }}</MpBannerTitle>
          <MpBannerDescription>
            {{ t('This file is too blurry or dark to read. Upload a clearer file, or fill in the details manually.') }}
            <MpTextlink id="frs-reupload-link" as="a" href="#" @click.prevent="emit('reupload')">{{ t('Reupload file') }}</MpTextlink>
          </MpBannerDescription>
        </MpBanner>
        <!-- Real uploaded document (from IndexedDB): a single image, or the PDF's
             pages rasterised to PNGs — shown as <img>s on our own background.
             Falls back to the scenario preview images for seed rows. -->
        <template v-if="realImages">
          <div
            v-for="(src, i) in realImages" :key="i"
            class="br-preview" :class="{ 'br-preview--zoom': zoomMode === '100' }"
          >
            <img :src="src" alt="" class="br-preview-img" />
          </div>
        </template>
        <div v-else-if="realLoading" class="br-preview-loading">
          <MpSpinner />
        </div>
        <template v-else>
          <div
            v-for="page in pageCount" :key="page"
            class="br-preview" :class="{ 'br-preview--zoom': zoomMode === '100' }"
          >
            <img :src="previewSrc(page)" alt="" class="br-preview-img" />
          </div>
        </template>
      </div>

      <!-- Resize divider -->
      <div class="ex-divider" :aria-label="t('Resize panel')" @mousedown="startPanelResize" />

      <!-- ── Right panel: the classification's own form ── -->
      <div class="ex-right">
        <slot :file="reviewFile" />
      </div>
    </div>

    <!-- Anything that must escape the stage (modals, demo FAB) -->
    <slot name="overlays" />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-2xl resolves to a unitless multiplier here, not px — hardcode
     the intended 32px rather than trusting the var (same fix as NewExpensePage). */
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-title-count { font-weight: var(--mp-font-weights-regular); }

/* chevron next to the title → jump-to-file switcher */
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* jump-to popover (304px): search on top (280px input, 12px padding), queue below */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
/* The detail pages cap this list at 5 recent records; a review queue is a fixed
   run the user works through in order, so every file stays listed and scrolls. */
.detail-jump-list { display: flex; flex-direction: column; max-height: 280px; overflow-y: auto; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item--active { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty {
  margin: 0; padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Stage ────────────────────────────────────────────────────────────────── */
.ex-stage {
  flex: 1; min-height: 0; display: flex; position: relative;
  background: var(--mp-colors-gray-50, #EFF1F1);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden;
}
.ex-left {
  flex-shrink: 0; overflow-y: auto; overflow-x: hidden;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-8) var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); min-height: 0;
}
.ex-left-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-2); min-height: var(--mp-sizes-8, 32px);
}
.ex-file-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.ex-file-meta-icon { flex-shrink: 0; color: var(--mp-text-subtle); }
.ex-file-meta-text { display: flex; flex-direction: column; min-width: 0; }
.ex-file-name {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ex-file-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Fit / 100% zoom toggle — same segmented-pill pattern as WMS picking's
   Combined / By orders toggle (PickingTaskDetailsPage.vue, CreatePickingPage.vue). */
.detail-loc-toggle { display: flex; align-items: center; gap: 2px; flex-shrink: 0; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full); padding: 2px; }
.detail-loc-toggle-btn { height: 28px; padding: 0 var(--mp-spacing-3); border: none; border-radius: var(--mp-radii-full); background: none; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.detail-loc-toggle-btn:hover { color: var(--mp-text-default); }
.detail-loc-toggle-btn--active { background: var(--mp-background-stage, #fff); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); box-shadow: inset 0 0 0 1px var(--mp-border-default); }
.frs-unreadable-banner { flex-shrink: 0; }
.br-preview {
  flex-shrink: 0; background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  overflow: auto;
}
.br-preview-img { display: block; width: 100%; height: auto; }
/* Spinner while the PDF's pages rasterise server-side. */
.br-preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: var(--mp-spacing-8);
}
.br-preview--zoom .br-preview-img { width: auto; max-width: none; }

.ex-divider {
  flex-shrink: 0; width: var(--mp-spacing-3); cursor: col-resize; z-index: 10;
  display: flex; align-items: center; justify-content: center;
}
.ex-divider::after {
  content: ''; display: block; width: 2px; height: var(--mp-spacing-10, 40px);
  background: var(--mp-border-default); border-radius: var(--mp-radii-full);
}
.ex-divider:hover::after { background: var(--mp-border-bold); }

/* ── Right panel — the slot's container. Its contents are styled by the page
   that fills the slot (scoped styles apply to the owner of the markup). ───── */
.ex-right {
  --ex-field-width: 318px;
  flex: 1; min-width: 0; overflow-y: auto;
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-xl, 12px) 0 0 var(--mp-radii-xl, 12px);
  padding: var(--mp-spacing-6);
  container-type: inline-size;
}
</style>
