<script setup lang="ts">
/**
 * BuzzCampaignDetailPage · Mekari Buzz — campaign detail (/buzz-campaign/:id).
 *
 * A campaign groups the creatives generated for it. Shows the brief + brand +
 * status, and a grid of its creatives (assetIds → images in IndexedDB) with a
 * zoom lightbox. Owns its own title bar (breadcrumb + name + kebab).
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { buzzCampaign, buzzBrand, buzzBadgeType, removeCampaign, buzzAssets, type BuzzCampaign } from '~/data/buzz'
import { getImage } from '~/utils/buzzImageStore'
import { formatDate } from '~/utils/date'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()
const menuClass = css({ minWidth: '180px' })

const campaign = computed<BuzzCampaign | undefined>(() => buzzCampaign(props.orderId!))
const brand = computed(() => campaign.value ? buzzBrand(campaign.value.brand) : undefined)

// Creatives: prefer the campaign's linked assetIds; fall back to assets whose
// title matches the campaign name (recovers campaigns saved before the link).
const creatives = computed<{ id: string; title: string }[]>(() => {
  const c = campaign.value
  if (!c) return []
  if (c.assetIds?.length) return c.assetIds.map((id) => buzzAssets.find((a) => a.id === id)).filter(Boolean) as { id: string; title: string }[]
  return buzzAssets.filter((a) => a.hasImage && (a.assetType ?? 'photo') !== 'logo' && (a.title === c.name || a.title.startsWith(`${c.name} · `)))
})
const creativeIds = computed<string[]>(() => creatives.value.map((c) => c.id))

// Brand logo (may be an IndexedDB asset id for custom brands).
function isAssetId(v: string) { return !!v && !v.startsWith('/') && !v.startsWith('data:') && !v.startsWith('http') }
const imgs = ref<Map<string, string>>(new Map())
async function loadImages() {
  const ids = [...creativeIds.value]
  if (brand.value && isAssetId(brand.value.logo)) ids.push(brand.value.logo)
  for (const id of ids) {
    if (imgs.value.has(id)) continue
    const rec = await getImage(id)
    if (rec?.dataUrl) { const n = new Map(imgs.value); n.set(id, rec.dataUrl); imgs.value = n }
  }
}
watch([campaign, creativeIds], loadImages, { deep: true, immediate: true })
const brandLogo = computed(() => {
  const l = brand.value?.logo
  if (!l) return ''
  return isAssetId(l) ? (imgs.value.get(l) ?? '') : l
})

// Zoom lightbox.
const zoom = ref<number | null>(null)
function openZoom(i: number) { zoom.value = i }
function zoomNext() { if (zoom.value !== null) zoom.value = (zoom.value + 1) % creatives.value.length }
function zoomPrev() { if (zoom.value !== null) zoom.value = (zoom.value - 1 + creatives.value.length) % creatives.value.length }
function onKey(e: KeyboardEvent) {
  if (zoom.value === null) return
  if (e.key === 'ArrowRight') zoomNext()
  else if (e.key === 'ArrowLeft') zoomPrev()
  else if (e.key === 'Escape') zoom.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Delete.
const showDelete = ref(false)
function confirmDelete() {
  removeCampaign(props.orderId!)
  toast.notify({ variant: 'success', title: 'Campaign deleted.', maxWidth: 'max-content' })
  router.push('/buzz-campaigns')
}
</script>

<template>
  <template v-if="campaign">
    <header class="cd-bar">
      <div class="cd-bar__left">
        <button class="cd-crumb" type="button" @click="router.push('/buzz-campaigns')">Campaigns</button>
        <h1 class="cd-title">{{ campaign.name }}</h1>
      </div>
      <div class="cd-actions">
        <MpPopover id="cd-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="cd-kebab" type="button" aria-label="More actions"><MpIcon name="menu-kebab" size="md" /></button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="menuClass">
            <MpPopoverList>
              <MpPopoverListItem @click="showDelete = true">Delete campaign</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <ConfirmModal
      v-model:is-open="showDelete"
      :title="`Delete ${campaign.name}?`"
      description="This removes the campaign and its creatives. This can't be undone."
      confirm-label="Delete campaign"
      @confirm="confirmDelete"
    />

    <div class="cd-stage">
      <div class="cd-inner">
        <!-- Summary -->
        <section class="cd-summary">
          <span v-if="brandLogo" class="cd-brandlogo"><img :src="brandLogo" :alt="brand?.name" /></span>
          <span v-else class="cd-brandlogo cd-brandlogo--mono" :style="{ background: brand?.accent || '#0A6E4E' }">{{ (brand?.name || '?').slice(0,1) }}</span>
          <div class="cd-meta">
            <div class="cd-meta__row">
              <span class="cd-brandname">{{ brand?.name || 'No brand' }}</span>
              <ErpStatusBadge :status="campaign.status" :label="campaign.status" :type="buzzBadgeType(campaign.status)" />
            </div>
            <p class="cd-sub">{{ campaign.purpose }} · {{ campaign.audience }} · {{ campaign.creatives }} creative{{ campaign.creatives === 1 ? '' : 's' }} · Updated {{ formatDate(campaign.updatedAt) }}</p>
            <p v-if="campaign.brief" class="cd-brief">{{ campaign.brief }}</p>
          </div>
        </section>

        <!-- Creatives -->
        <section class="cd-sec">
          <h3 class="cd-h3">Creatives</h3>
          <div v-if="creatives.length" class="cd-grid">
            <button v-for="(c, i) in creatives" :key="c.id" type="button" class="cd-tile" @click="openZoom(i)">
              <img v-if="imgs.get(c.id)" :src="imgs.get(c.id)" :alt="c.title" class="cd-tile__img" />
              <span v-if="campaign.kind === 'carousel'" class="cd-tile__n">{{ i + 1 }}</span>
            </button>
          </div>
          <p v-else class="cd-empty">No creatives saved for this campaign yet.</p>
        </section>
      </div>
    </div>

    <!-- Zoom lightbox -->
    <Teleport to="body">
      <Transition name="zm">
        <div v-if="zoom !== null && creatives[zoom]" class="zm-overlay" @click.self="zoom = null">
          <button class="zm-close" type="button" aria-label="Close" @click="zoom = null"><MpIcon name="close" size="md" /></button>
          <button v-if="creatives.length > 1" class="zm-nav zm-nav--prev" type="button" aria-label="Previous" @click.stop="zoomPrev"><MpIcon name="caret-left" size="lg" /></button>
          <img :src="imgs.get(creatives[zoom].id)" alt="Creative" class="zm-img" />
          <button v-if="creatives.length > 1" class="zm-nav zm-nav--next" type="button" aria-label="Next" @click.stop="zoomNext"><MpIcon name="caret-right" size="lg" /></button>
          <span v-if="creatives.length > 1" class="zm-count">{{ zoom + 1 }} / {{ creatives.length }}</span>
        </div>
      </Transition>
    </Teleport>
  </template>

  <div v-else class="cd-missing">
    <MpIcon name="file-image" size="lg" />
    <p>Campaign not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/buzz-campaigns')">Back to Campaigns</MpButton>
  </div>
</template>

<style scoped>
.cd-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cd-bar__left { display: flex; flex-direction: column; min-width: 0; }
.cd-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.cd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.cd-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cd-kebab { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; color: var(--mp-icon-default); }
.cd-kebab:hover { background: var(--mp-background-neutral-hovered, #e6e8ec); }

.cd-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }
.cd-inner { max-width: 940px; }

.cd-summary { display: flex; gap: var(--mp-spacing-4, 16px); align-items: flex-start; padding-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
.cd-brandlogo { width: 48px; height: 48px; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); background: #fff; display: inline-flex; align-items: center; justify-content: center; }
.cd-brandlogo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
.cd-brandlogo--mono { border: none; color: #fff; font-size: 20px; font-weight: var(--mp-font-weights-bold, 700); }
.cd-meta { min-width: 0; }
.cd-meta__row { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.cd-brandname { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cd-sub { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cd-brief { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

.cd-sec { padding: var(--mp-spacing-5) 0 0; }
.cd-h3 { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.cd-tile { position: relative; padding: 0; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); overflow: hidden; background: var(--mp-background-neutral-subtle); cursor: pointer; }
.cd-tile:hover { border-color: var(--mp-border-bold, #8c9596); }
.cd-tile__img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.cd-tile__n { position: absolute; top: 6px; left: 6px; display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: rgba(8,13,14,0.66); color: #fff; font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); }
.cd-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }

/* Zoom lightbox */
.zm-enter-active, .zm-leave-active { transition: opacity 180ms ease; }
.zm-enter-from, .zm-leave-to { opacity: 0; }
.zm-overlay { position: fixed; inset: 0; z-index: 1600; background: rgba(8, 13, 14, 0.82); display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-8, 32px); }
.zm-img { max-width: min(680px, 86vw); max-height: 88vh; object-fit: contain; border-radius: var(--mp-radii-md, 8px); display: block; }
.zm-close { position: fixed; top: 16px; right: 16px; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border: none; background: rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; color: #fff; }
.zm-close:hover { background: rgba(255,255,255,0.24); }
.zm-close :deep(svg) { color: #fff; }
.zm-nav { position: fixed; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border: none; background: rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; color: #fff; }
.zm-nav:hover { background: rgba(255,255,255,0.24); }
.zm-nav :deep(svg) { color: #fff; }
.zm-nav--prev { left: 16px; }
.zm-nav--next { right: 16px; }
.zm-count { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,0.16); color: #fff; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); }
</style>
