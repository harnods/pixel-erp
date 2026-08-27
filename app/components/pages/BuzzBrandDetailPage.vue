<script setup lang="ts">
/**
 * BuzzBrandDetailPage · Mekari Buzz — brand guideline detail (read view).
 *
 * The polished, Frontify-style read view of a customer's brand kit: the base
 * artifact the product revolves around. Owns its own title bar (breadcrumb +
 * name + Edit) then a scrollable stage with a max-width reading column and
 * full-bleed colour / type specimens.
 *
 * Mirrors CoworkAgentDetailPage's `.cad-bar` + `.cad-stage` structure and reuses
 * BuzzBrandingPage's brand visual language (swatches, guardrail check lists).
 * Enterprise surface rule: cards = 1px border, no drop-shadow.
 */
import { computed, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import { buzzBrand, removeBrand, updateBrand, addUploadedAsset, type BuzzBrand } from '~/data/buzz'
import { getImage, putImage } from '~/utils/buzzImageStore'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const brand = computed<BuzzBrand | undefined>(() => buzzBrand(props.orderId!))

// Every font the brand uses. Prefer the full `fonts` list; else fall back to the
// headline/body pair (or the legacy summary line). Deduped by name.
const fontList = computed<{ name: string; usage?: string }[]>(() => {
  const b = brand.value
  if (!b) return []
  let list: { name: string; usage?: string }[] = []
  if (b.fonts?.length) list = b.fonts.filter((f) => f?.name)
  else {
    if (b.fontHeadline) list.push({ name: b.fontHeadline, usage: 'Headline' })
    if (b.fontBody && b.fontBody !== b.fontHeadline) list.push({ name: b.fontBody, usage: 'Body' })
    if (!list.length && b.typography) list.push({ name: b.typography, usage: 'Typeface' })
  }
  const seen = new Set<string>()
  return list.filter((f) => { const k = f.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
})

// ── Delete ──
const menuClass = css({ minWidth: '180px' })
const showDelete = ref(false)
function confirmDelete() {
  removeBrand(props.orderId!)
  toast.notify({ variant: 'success', title: 'Brand kit deleted.', maxWidth: 'max-content' })
  router.push('/buzz-branding')
}

// ── Lazy logo resolution ──────────────────────────────────────────────────────
// A logo value that starts with '/', 'http' or 'data:' is a usable src; anything
// else is a logo asset id whose bytes live in IndexedDB (buzzImageStore).
function isAssetLogo(logo: string) {
  return !!logo && !logo.startsWith('/') && !logo.startsWith('data:') && !logo.startsWith('http')
}
const images = ref<Map<string, string>>(new Map())
async function loadImages() {
  const b = brand.value
  if (!b) return
  // Logos may be a usable src or an asset id; visualRefs are always asset ids.
  const logoIds = [b.logo, ...(b.logos ?? [])].filter((l) => isAssetLogo(l))
  const ids = [...logoIds, ...(b.visualRefs ?? [])]
  for (const id of ids) {
    if (!id || images.value.has(id)) continue
    const rec = await getImage(id)
    if (rec?.dataUrl) { const next = new Map(images.value); next.set(id, rec.dataUrl); images.value = next }
  }
}
watch(brand, loadImages, { deep: true, immediate: true })
function assetSrc(id: string): string { return isAssetLogo(id) ? (images.value.get(id) ?? '') : id }
function refSrc(id: string): string { return images.value.get(id) ?? '' }

const heroLogo = computed(() => brand.value ? assetSrc(brand.value.logo) : '')
const monogram = computed(() => (brand.value?.name || '?').slice(0, 1).toUpperCase())

// ── Section presence guards ───────────────────────────────────────────────────
const hasPalette = computed(() => (brand.value?.palette?.length ?? 0) > 0)
const hasCombos = computed(() => (brand.value?.colorCombos?.length ?? 0) > 0)
const hasTone = computed(() => !!brand.value?.tone || (brand.value?.toneDo?.length ?? 0) > 0 || (brand.value?.toneDont?.length ?? 0) > 0)

// ── Logo upload ───────────────────────────────────────────────────────────────
const logoInput = ref<HTMLInputElement | null>(null)
function pickLogo() { logoInput.value?.click() }
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
async function onLogoFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const file of files) {
    const dataUrl = await readAsDataUrl(file)
    const title = file.name.replace(/\.[^.]+$/, '') || 'Logo'
    const a = addUploadedAsset({ title, brand: props.orderId!, assetType: 'logo', orientation: 'Square', tags: ['logo'], usage: 'Brand logo' })
    await putImage({ id: a.id, mime: file.type, dataUrl })
    const b = brand.value
    updateBrand(props.orderId!, { logos: [...(b?.logos ?? []), a.id], logo: b?.logo || a.id })
  }
  input.value = ''
  if (files.length) toast.notify({ variant: 'success', title: 'Logo uploaded.', maxWidth: 'max-content' })
}
function removeLogo(id: string) {
  const b = brand.value
  if (!b) return
  updateBrand(props.orderId!, { logos: (b.logos ?? []).filter((x) => x !== id) })
}

// ── Reference design upload ─────────────────────────────────────────────────────
const designInput = ref<HTMLInputElement | null>(null)
function pickDesign() { designInput.value?.click() }
async function onDesignFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const file of files) {
    const dataUrl = await readAsDataUrl(file)
    const id = `vref-${crypto.randomUUID?.() || String(Math.random()).slice(2)}`
    await putImage({ id, mime: file.type, dataUrl })
    const b = brand.value
    updateBrand(props.orderId!, { visualRefs: [...(b?.visualRefs ?? []), id] })
  }
  input.value = ''
  if (files.length) toast.notify({ variant: 'success', title: 'Design added.', maxWidth: 'max-content' })
}
function removeDesign(id: string) {
  const b = brand.value
  if (!b) return
  updateBrand(props.orderId!, { visualRefs: (b.visualRefs ?? []).filter((x) => x !== id) })
}

function coreColors(b: BuzzBrand) {
  return [
    { role: 'Primary', hex: b.accent },
    { role: 'Secondary', hex: b.secondary },
    { role: 'Neutral', hex: b.neutral },
  ].filter((c) => !!c.hex)
}
function hex(v: string) { return (v || '').toUpperCase() }
</script>

<template>
  <template v-if="brand">
    <header class="bd-bar">
      <div class="bd-bar__left">
        <button class="bd-crumb" type="button" @click="router.push('/buzz-branding')">Brand kits</button>
        <h1 class="bd-title">{{ brand.name }}</h1>
      </div>
      <div class="bd-actions">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push(`/buzz-brand/${orderId}/edit`)">
          <MpIcon name="edit" size="sm" /> Edit
        </button>
        <MpPopover id="bd-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="bd-kebab" type="button" aria-label="More actions"><MpIcon name="menu-kebab" size="md" /></button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="menuClass">
            <MpPopoverList>
              <MpPopoverListItem @click="showDelete = true">Delete brand kit</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <ConfirmModal
      v-model:is-open="showDelete"
      :title="`Delete ${brand.name}?`"
      description="This removes the brand kit and its guideline. This can't be undone."
      confirm-label="Delete brand kit"
      @confirm="confirmDelete"
    />

    <div class="bd-stage">
      <div class="bd-inner">
        <!-- Brand hero -->
        <section class="bd-hero">
          <div class="bd-hero__tile">
            <img v-if="heroLogo" :src="heroLogo" :alt="brand.name" class="bd-hero__logo" loading="lazy" />
            <span v-else class="bd-hero__mono" :style="{ background: brand.accent }">{{ monogram }}</span>
          </div>
          <div class="bd-hero__id">
            <h2 class="bd-hero__name">{{ brand.name }}</h2>
            <p v-if="brand.theme" class="bd-hero__tagline">{{ brand.theme }}</p>
          </div>
        </section>

        <!-- 2 · Colour & theme -->
        <section class="bd-sec">
          <h3 class="bd-h3">Colour &amp; theme</h3>
          <p v-if="brand.theme" class="bd-lead">{{ brand.theme }}</p>

          <div class="bd-colorgrid">
            <div v-for="c in coreColors(brand)" :key="c.role" class="bd-color">
              <span class="bd-color__swatch" :style="{ background: c.hex }" />
              <div class="bd-color__meta">
                <span class="bd-color__role">{{ c.role }}</span>
                <span class="bd-color__hex">{{ hex(c.hex) }}</span>
              </div>
            </div>
          </div>

          <template v-if="hasPalette">
            <p class="bd-sublabel">Extended palette</p>
            <div class="bd-palette">
              <div v-for="c in brand.palette" :key="c" class="bd-palette__item">
                <span class="bd-palette__swatch" :style="{ background: c }" />
                <span class="bd-palette__hex">{{ hex(c) }}</span>
              </div>
            </div>
          </template>

          <template v-if="hasCombos">
            <p class="bd-sublabel">Approved combinations</p>
            <ul class="bd-checklist">
              <li v-for="combo in brand.colorCombos" :key="combo"><MpIcon name="check" size="sm" /> {{ combo }}</li>
            </ul>
          </template>
        </section>

        <!-- 3 · Typography — every font family the brand uses -->
        <section v-if="fontList.length || brand.typographyHierarchy" class="bd-sec">
          <h3 class="bd-h3">Typography</h3>
          <div v-for="(f, i) in fontList" :key="f.name + i" class="bd-type">
            <p class="bd-type__caption">{{ f.usage || 'Typeface' }}</p>
            <p class="bd-type__name">{{ f.name }}</p>
            <p :class="i === 0 ? 'bd-type__display' : 'bd-type__body'">{{ i === 0 ? 'The quick brown fox' : 'The quick brown fox jumps over the lazy dog. 0123456789' }}</p>
          </div>
          <p v-if="brand.typographyHierarchy" class="bd-notes">{{ brand.typographyHierarchy }}</p>
        </section>

        <!-- 4 · Tone &amp; voice -->
        <section v-if="hasTone" class="bd-sec">
          <h3 class="bd-h3">Tone &amp; voice</h3>
          <p v-if="brand.tone" class="bd-lead">{{ brand.tone }}</p>
          <div v-if="(brand.toneDo?.length || brand.toneDont?.length)" class="bd-dodont">
            <div v-if="brand.toneDo?.length" class="bd-dodont__col">
              <p class="bd-sublabel">Do</p>
              <ul class="bd-checklist">
                <li v-for="d in brand.toneDo" :key="d"><MpIcon name="check" size="sm" /> {{ d }}</li>
              </ul>
            </div>
            <div v-if="brand.toneDont?.length" class="bd-dodont__col">
              <p class="bd-sublabel">Don't</p>
              <ul class="bd-checklist bd-checklist--dont">
                <li v-for="d in brand.toneDont" :key="d">
                  <svg class="bd-cross" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                  {{ d }}
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 5 · Logo usage -->
        <section class="bd-sec">
          <div class="bd-sec__head">
            <h3 class="bd-h3">Logo usage</h3>
            <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="pickLogo">
              <MpIcon name="add" size="sm" /> Upload logo
            </button>
            <input ref="logoInput" type="file" accept="image/*" multiple class="bd-file" @change="onLogoFiles" />
          </div>
          <div v-if="brand.logos?.length" class="bd-logos">
            <div v-for="id in brand.logos" :key="id" class="bd-logos__tile">
              <img v-if="assetSrc(id)" :src="assetSrc(id)" :alt="brand.name" class="bd-logos__img" loading="lazy" />
              <MpIcon v-else name="file-image" size="md" />
              <button class="bd-remove" type="button" aria-label="Remove logo" @click="removeLogo(id)"><MpIcon name="minus-circular" size="sm" /></button>
            </div>
          </div>
          <ul v-if="brand.logoUsage?.length" class="bd-checklist">
            <li v-for="rule in brand.logoUsage" :key="rule"><MpIcon name="check" size="sm" /> {{ rule }}</li>
          </ul>
        </section>

        <!-- 6 · Visual style -->
        <section class="bd-sec">
          <h3 class="bd-h3">Visual style</h3>
          <p v-if="brand.visualStyle" class="bd-lead">{{ brand.visualStyle }}</p>
          <p v-if="brand.photography" class="bd-para">{{ brand.photography }}</p>

          <div class="bd-sec__head bd-sec__head--sub">
            <div>
              <p class="bd-sublabel">Reference designs</p>
              <p class="bd-notes">Upload sample designs Buzz should match when it generates.</p>
            </div>
            <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="pickDesign">
              <MpIcon name="add" size="sm" /> Upload design
            </button>
            <input ref="designInput" type="file" accept="image/*" multiple class="bd-file" @change="onDesignFiles" />
          </div>
          <div v-if="brand.visualRefs?.length" class="bd-refs">
            <div v-for="id in brand.visualRefs" :key="id" class="bd-refs__tile">
              <img v-if="refSrc(id)" :src="refSrc(id)" :alt="brand.name" class="bd-refs__img" loading="lazy" />
              <MpIcon v-else name="file-image" size="md" />
              <button class="bd-remove" type="button" aria-label="Remove design" @click="removeDesign(id)"><MpIcon name="minus-circular" size="sm" /></button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </template>

  <div v-else class="bd-missing">
    <MpIcon name="file-image" size="lg" />
    <p>Brand kit not found.</p>
    <MpButton is-rounded variant="secondary" @click="router.push('/buzz-branding')">Back to Brand kits</MpButton>
  </div>
</template>

<style scoped>
/* ── Title bar (mirrors CoworkAgentDetailPage .cad-bar) ── */
.bd-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.bd-bar__left { display: flex; flex-direction: column; min-width: 0; }
.bd-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.bd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bd-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.bd-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bd-kebab { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; color: var(--mp-icon-default); }
.bd-kebab:hover { background: var(--mp-background-neutral-hovered, #e6e8ec); }
.bd-actions :deep(svg) { flex: 0 0 auto; }

/* ── Stage ── */
.bd-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-8, 32px) var(--mp-spacing-6); }
.bd-inner { width: 100%; max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--mp-spacing-10, 40px); }

/* ── Hero ── */
.bd-hero { display: flex; align-items: center; gap: var(--mp-spacing-5, 20px); }
.bd-hero__tile { width: 96px; height: 96px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-default, #fff); padding: var(--mp-spacing-3, 12px); box-sizing: border-box; }
.bd-hero__logo { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.bd-hero__mono { width: 64px; height: 64px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--mp-radii-md, 6px); color: #fff; font-size: 32px; font-weight: var(--mp-font-weights-bold, 700); }
.bd-hero__id { min-width: 0; }
.bd-hero__name { margin: 0; font-size: var(--mp-font-sizes-3xl, 30px); font-weight: var(--mp-font-weights-semi-bold); line-height: 1.2; letter-spacing: -0.4px; color: var(--mp-text-default); }
.bd-hero__tagline { margin: var(--mp-spacing-2, 8px) 0 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-secondary); }

/* ── Section shell ── */
.bd-sec { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); padding-top: var(--mp-spacing-8, 32px); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.bd-inner > .bd-sec:first-of-type { padding-top: 0; border-top: none; }
.bd-h3 { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.bd-lead { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.bd-para { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.bd-notes { margin: var(--mp-spacing-1, 4px) 0 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.bd-sublabel { margin: var(--mp-spacing-3, 12px) 0 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }

/* ── Core colour cards ── */
.bd-colorgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--mp-spacing-4, 16px); margin-top: var(--mp-spacing-2, 8px); }
.bd-color { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); overflow: hidden; background: var(--mp-background-default, #fff); }
.bd-color__swatch { display: block; height: 96px; }
.bd-color__meta { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-3, 12px); }
.bd-color__role { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bd-color__hex { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; letter-spacing: 0.4px; }

/* ── Extended palette ── */
.bd-palette { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-4, 16px); margin-top: var(--mp-spacing-2, 8px); }
.bd-palette__item { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); align-items: flex-start; }
.bd-palette__swatch { width: 56px; height: 56px; border-radius: var(--mp-radii-md, 6px); border: 1px solid rgba(0,0,0,0.08); }
.bd-palette__hex { font-size: 11px; color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; letter-spacing: 0.4px; }

/* ── Check / cross lists ── */
.bd-checklist { margin: var(--mp-spacing-1, 4px) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.bd-checklist li { display: flex; align-items: flex-start; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.bd-checklist :deep(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--mp-icon-success, #0a6e4e); }
.bd-checklist--dont .bd-cross { flex: 0 0 auto; margin-top: 2px; color: var(--mp-icon-danger, #cb3a31); }

/* ── Typography specimen ── */
.bd-type { margin-top: var(--mp-spacing-2, 8px); }
.bd-type__caption { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.4px; color: var(--mp-text-secondary); }
.bd-type__name { margin: 2px 0 var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bd-type__display { margin: 0; font-size: 44px; line-height: 1.1; font-weight: var(--mp-font-weights-bold, 700); letter-spacing: -0.6px; color: var(--mp-text-default); }
.bd-type__body { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }

/* ── Do/Don't columns ── */
.bd-dodont { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--mp-spacing-6, 24px); margin-top: var(--mp-spacing-2, 8px); }
.bd-dodont__col { display: flex; flex-direction: column; }

/* ── Section head with an inline upload action ── */
.bd-sec__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4, 16px); }
.bd-sec__head--sub { margin-top: var(--mp-spacing-4, 16px); padding-top: var(--mp-spacing-4, 16px); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.bd-file { display: none; }

/* ── Logo usage thumbnails ── */
.bd-logos { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-3, 12px); margin-top: var(--mp-spacing-2, 8px); }
.bd-logos__tile { position: relative; width: 120px; height: 88px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-neutral-subtle, #f0f1f3); padding: var(--mp-spacing-3, 12px); box-sizing: border-box; }
.bd-logos__img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.bd-logos__tile :deep(svg) { color: var(--mp-text-tertiary, #8a9296); }

/* ── Reference design thumbnails ── */
.bd-refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--mp-spacing-3, 12px); margin-top: var(--mp-spacing-2, 8px); }
.bd-refs__tile { position: relative; height: 150px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-neutral-subtle, #f0f1f3); box-sizing: border-box; }
.bd-refs__img { width: 100%; height: 100%; object-fit: cover; }
.bd-refs__tile :deep(svg) { color: var(--mp-text-tertiary, #8a9296); }

/* ── Remove control on a thumbnail ── */
.bd-remove { position: absolute; top: 4px; right: 4px; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: var(--mp-radii-full, 999px); background: rgba(255,255,255,0.92); color: var(--mp-icon-danger, #cb3a31); cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.15); }
.bd-remove:hover { background: #fff; }
.bd-remove :deep(svg) { color: var(--mp-icon-danger, #cb3a31); }

/* ── Missing state ── */
.bd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }
</style>
