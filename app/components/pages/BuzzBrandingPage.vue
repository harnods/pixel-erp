<script setup lang="ts">
/**
 * BuzzBrandingPage · Mekari Buzz — brand kits index.
 *
 * Grid mirrors the Cowork agents list exactly (responsive columns, cell borders,
 * kebab menu). Each card shows the logo, brand-kit name and description, with an
 * overlapping trio of the brand's core colours (primary · secondary · neutral).
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import { buzzBrands, removeBrand, type BuzzBrand } from '~/data/buzz'
import { getImage } from '~/utils/buzzImageStore'
import { useBuzzActions } from '~/composables/useBuzzActions'
import BuzzNewBrandModal from '~/components/patterns/BuzzNewBrandModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'

const router = useRouter()
const menuClass = css({ minWidth: '160px' })

// ── Logo resolution (seed logos are paths; custom logos are IndexedDB ids) ──
function isAssetLogo(logo: string) { return !!logo && !logo.startsWith('/') && !logo.startsWith('data:') && !logo.startsWith('http') }
const logoUrls = ref<Map<string, string>>(new Map())
async function loadLogos() {
  for (const b of buzzBrands) {
    if (!isAssetLogo(b.logo) || logoUrls.value.has(b.logo)) continue
    const rec = await getImage(b.logo)
    if (rec?.dataUrl) { const next = new Map(logoUrls.value); next.set(b.logo, rec.dataUrl); logoUrls.value = next }
  }
}
watch(buzzBrands, loadLogos, { deep: true, immediate: true })
function logoSrc(logo: string): string { return isAssetLogo(logo) ? (logoUrls.value.get(logo) ?? '') : logo }

// ── Responsive grid columns (mirrors the Cowork agents list) ──
const MIN_CARD = 300
const MAX_COLS = 6
const gridEl = ref<HTMLElement | null>(null)
const cols = ref(3)
function recomputeCols() {
  const w = gridEl.value?.clientWidth ?? 0
  if (!w) return
  cols.value = Math.max(1, Math.min(MAX_COLS, Math.floor(w / MIN_CARD)))
}
let ro: ResizeObserver | null = null
watch(gridEl, async () => {
  await nextTick()
  recomputeCols()
  if (gridEl.value && 'ResizeObserver' in window && !ro) { ro = new ResizeObserver(recomputeCols); ro.observe(gridEl.value) }
}, { immediate: true })
onBeforeUnmount(() => ro?.disconnect())
const filler = computed(() => { const rem = buzzBrands.length % cols.value; return rem === 0 ? 0 : cols.value - rem })

// ── Actions ──
function openBrand(id: string) { router.push(`/buzz-brand/${id}`) }
function editBrand(id: string) { router.push(`/buzz-brand/${id}/edit`) }

// ── New brand kit modal ──
const showNewBrand = ref(false)
const { pending } = useBuzzActions()
watch(() => pending.value, (p) => { if (p?.action === 'newBrand') showNewBrand.value = true })
function onBrandCreated(id: string) { router.push(`/buzz-brand/${id}`) }

// ── Delete ──
const showDelete = ref(false)
const deleteTarget = ref<BuzzBrand | null>(null)
function askDelete(b: BuzzBrand) { deleteTarget.value = b; showDelete.value = true }
function confirmDelete() {
  if (deleteTarget.value) {
    removeBrand(deleteTarget.value.id)
    toast.notify({ variant: 'success', title: 'Brand kit deleted.', maxWidth: 'max-content' })
  }
  deleteTarget.value = null
}
</script>

<template>
  <div class="buzz-branding">
    <div v-if="buzzBrands.length" class="brand-clip">
      <div ref="gridEl" class="brand-grid" :style="{ '--cols': cols }">
        <div v-for="b in buzzBrands" :key="b.id" class="brand-cell" role="button" tabindex="0" @click="openBrand(b.id)" @keydown.enter="openBrand(b.id)">
          <img v-if="logoSrc(b.logo)" :src="logoSrc(b.logo)" :alt="b.name" class="brand-cell__logo" loading="lazy" />
          <span v-else class="brand-cell__logo brand-cell__logo--mono" :style="{ background: b.accent }">{{ b.name.slice(0, 1).toUpperCase() }}</span>

          <div class="brand-cell__main">
            <p class="brand-cell__name">{{ b.name }}</p>
            <p v-if="b.theme" class="brand-cell__desc">{{ b.theme }}</p>
          </div>

          <div class="brand-cell__dots">
            <span class="brand-dot" :style="{ background: b.accent }" :title="b.accent" />
            <span class="brand-dot" :style="{ background: b.secondary }" :title="b.secondary" />
            <span class="brand-dot" :style="{ background: b.neutral }" :title="b.neutral" />
          </div>

          <MpPopover :id="'brand-menu-' + b.id" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="brand-cell__kebab" type="button" :aria-label="'Manage ' + b.name" @click.stop><MpIcon name="menu-kebab" size="md" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="menuClass">
              <MpPopoverList>
                <MpPopoverListItem @click="openBrand(b.id)">View details</MpPopoverListItem>
                <MpPopoverListItem @click="editBrand(b.id)">Edit brand kit</MpPopoverListItem>
                <MpPopoverListItem @click="askDelete(b)">Delete brand kit</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <div v-for="n in filler" :key="'filler-' + n" class="brand-cell brand-cell--filler" aria-hidden="true" />
      </div>
    </div>

    <div v-else class="empty-full">
      <img src="/illustrations/empty-box.png" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">No brand kits yet</p>
      <p class="empty-full-desc">Create your first brand kit so Buzz can generate on-brand creatives. Upload a brand guideline or paste your website and AI does the rest.</p>
      <button type="button" class="btn-enterprise btn-enterprise--secondary empty-cta" @click="showNewBrand = true">New brand kit</button>
    </div>

    <BuzzNewBrandModal v-model:is-open="showNewBrand" @created="onBrandCreated" />
    <ConfirmModal
      v-model:is-open="showDelete"
      :title="`Delete ${deleteTarget?.name ?? 'brand kit'}?`"
      description="This removes the brand kit and its guideline. This can't be undone."
      confirm-label="Delete brand kit"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
/* Grid mirrors the Cowork agents list: responsive columns, right/bottom cell borders. */
.brand-clip { overflow: hidden; }
.brand-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); align-items: stretch; margin: 0 -1px 0 0; }
.brand-cell {
  position: relative;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px);
  min-height: 168px;
  padding: var(--mp-spacing-5, 20px);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  cursor: pointer;
}
.brand-cell:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.brand-cell--filler { padding: 0; min-height: 168px; cursor: default; }
.brand-cell--filler:hover { background: none; }

.brand-cell__logo { width: 48px; height: 48px; flex-shrink: 0; object-fit: contain; border-radius: var(--mp-radii-md, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: #fff; padding: 4px; box-sizing: border-box; }
.brand-cell__logo--mono { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; color: #fff; font-size: 20px; font-weight: var(--mp-font-weights-bold, 700); }

.brand-cell__main { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); min-width: 0; flex: 1; }
.brand-cell__name { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brand-cell:hover .brand-cell__name { text-decoration: underline; text-underline-offset: 2px; }
.brand-cell__desc { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary, #3a4749); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* Overlapping colour trio (lg 36px, overlap 12px) */
.brand-cell__dots { display: flex; align-items: center; }
.brand-dot { width: 36px; height: 36px; border-radius: var(--mp-radii-full, 999px); border: 2px solid var(--mp-background-default, #fff); box-shadow: 0 0 0 1px rgba(8, 13, 14, 0.06); }
.brand-dot + .brand-dot { margin-left: -12px; }

.brand-cell__kebab { position: absolute; top: var(--mp-spacing-4, 16px); right: var(--mp-spacing-4, 16px); display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md, 6px); color: var(--mp-icon-default, #536062); cursor: pointer; }
.brand-cell__kebab:hover { background: var(--mp-background-neutral-hovered, #e6e8ec); }

/* Empty state — 3D illustration + copy + secondary CTA (ERP pattern) */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-12, 48px) var(--mp-spacing-6); text-align: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); max-width: 420px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.empty-cta { margin-top: var(--mp-spacing-3); }
</style>
