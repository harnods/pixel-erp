<script setup lang="ts">
/**
 * CreatePostDrawer · Mekari Buzz — Create campaign → pick a brand → generate a
 * designed Instagram post with Gemini (Nano Banana), grounded on the brand kit
 * (colours, typography, tone, logo usage, reference designs) + a hard-coded IG
 * design skill on the server. Save creates a campaign and stores the post.
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpSelect, MpTextarea, MpText, MpButton, MpSpinner, MpIcon, toast,
} from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { buzzBrands, buzzBrand, buzzCampaigns, persistCampaigns, addBuzzAsset, BUZZ_TODAY, type BuzzCampaign } from '~/data/buzz'
import { getImage, putImage } from '~/utils/buzzImageStore'
import AssetPickerDrawer from '~/components/patterns/AssetPickerDrawer.vue'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'created', id: string): void }>()
const router = useRouter()

const brandId = ref('')
const brief = ref('')
const headline = ref('')
const briefError = ref('')
const error = ref('')
const generating = ref(false)

// Type: single post (3 designs), carousel series (N slides), or a Story video.
const postType = ref<'single' | 'carousel' | 'story'>('single')
const slides = ref(5)
const results = ref<{ dataUrl: string; mime: string }[]>([])
const selected = ref(0) // chosen alternative (single post)
const resultKind = ref<'single' | 'carousel' | 'story'>('single')
const isVideo = computed(() => resultKind.value === 'story')

// Zoom lightbox over the generated designs.
const zoomIndex = ref<number | null>(null)
function openZoom(i: number) { zoomIndex.value = i }
function zoomNext() { if (zoomIndex.value !== null) zoomIndex.value = (zoomIndex.value + 1) % results.value.length }
function zoomPrev() { if (zoomIndex.value !== null) zoomIndex.value = (zoomIndex.value - 1 + results.value.length) % results.value.length }
function onZoomKey(e: KeyboardEvent) {
  if (zoomIndex.value === null) return
  if (e.key === 'ArrowRight') zoomNext()
  else if (e.key === 'ArrowLeft') zoomPrev()
  else if (e.key === 'Escape') zoomIndex.value = null
}
onMounted(() => window.addEventListener('keydown', onZoomKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onZoomKey))

const hasBrands = computed(() => buzzBrands.length > 0)

// Subjects — the user's own assets to feature in the post.
const subjectIds = ref<string[]>([])
const showAssetPicker = ref(false)
const subjectThumbs = ref<Map<string, string>>(new Map())
async function loadSubjectThumbs() {
  for (const id of subjectIds.value) {
    if (subjectThumbs.value.has(id)) continue
    const r = await getImage(id)
    if (r?.dataUrl) { const n = new Map(subjectThumbs.value); n.set(id, r.dataUrl); subjectThumbs.value = n }
  }
}
watch(subjectIds, loadSubjectThumbs, { deep: true })
function removeSubject(id: string) { subjectIds.value = subjectIds.value.filter((x) => x !== id) }

watch(() => props.isOpen, (open) => {
  if (open) {
    brandId.value = buzzBrands[0]?.id ?? ''
    brief.value = ''; headline.value = ''; briefError.value = ''; error.value = ''
    generating.value = false; results.value = []; selected.value = 0; subjectIds.value = []; zoomIndex.value = null
    postType.value = 'single'; slides.value = 5
  }
})

function close() { emit('update:isOpen', false) }

async function generate() {
  briefError.value = brief.value.trim() ? '' : 'Describe what the post is about'
  if (briefError.value) return
  error.value = ''
  generating.value = true
  results.value = []; selected.value = 0; zoomIndex.value = null
  const b = buzzBrand(brandId.value)
  const references: string[] = []
  for (const id of (b?.visualRefs ?? []).slice(0, 4)) {
    const rec = await getImage(id)
    if (rec?.dataUrl) references.push(rec.dataUrl)
  }
  const subjects: string[] = []
  for (const id of subjectIds.value.slice(0, 4)) {
    const rec = await getImage(id)
    if (rec?.dataUrl) subjects.push(rec.dataUrl)
  }
  // The brand's uploaded logo image(s) — the model must use these, never invent one.
  const logos: string[] = []
  for (const id of (b?.logos ?? []).slice(0, 2)) {
    const rec = await getImage(id)
    if (rec?.dataUrl) logos.push(rec.dataUrl)
  }

  // ── Story video (Veo) ──
  if (postType.value === 'story') {
    try {
      const res = await $fetch<{ dataUrl?: string; mime?: string; error?: string }>('/api/buzz/generate-story-video', {
        method: 'POST', timeout: 300000,
        body: {
          brief: brief.value.trim(),
          brand: b ? { name: b.name, accent: b.accent, tone: b.tone, visualStyle: b.visualStyle, photography: b.photography, guardrails: b.guardrails } : undefined,
          subject: subjects[0],
        },
      })
      if (res?.error || !res?.dataUrl) { error.value = res?.error || 'Could not generate the Story video.'; return }
      results.value = [{ dataUrl: res.dataUrl, mime: res.mime || 'video/mp4' }]
      resultKind.value = 'story'; selected.value = 0
    } catch (err: any) {
      error.value = String(err?.data?.error ?? err?.message ?? 'Could not generate the Story video.')
    } finally { generating.value = false }
    return
  }

  try {
    const res = await $fetch<{ images?: { dataUrl: string; mime: string }[]; kind?: 'single' | 'carousel'; error?: string }>('/api/buzz/generate-ig-post', {
      method: 'POST',
      body: {
        brief: brief.value.trim(),
        headline: headline.value.trim() || undefined,
        count: postType.value === 'single' ? 3 : 1,
        series: postType.value === 'carousel' ? slides.value : 0,
        brand: b ? {
          name: b.name, accent: b.accent, secondary: b.secondary, neutral: b.neutral, palette: b.palette,
          fonts: b.fonts, tone: b.tone, toneDo: b.toneDo, logoUsage: b.logoUsage,
          visualStyle: b.visualStyle, photography: b.photography, guardrails: b.guardrails,
        } : undefined,
        references,
        subjects,
        logos,
      },
    })
    if (res?.error || !res?.images?.length) { error.value = res?.error || 'Could not generate the design.'; return }
    results.value = res.images
    resultKind.value = res.kind || postType.value
    selected.value = 0
  } catch (err: any) {
    error.value = String(err?.data?.error ?? err?.message ?? 'Could not generate the design.')
  } finally {
    generating.value = false
  }
}

const saving = ref(false)
async function save() {
  if (!results.value.length) return
  saving.value = true
  const name = headline.value.trim() || brief.value.trim().slice(0, 48)
  // Carousel → save every slide; single → save the selected alternative.
  const toSave = resultKind.value === 'carousel' ? results.value : [results.value[selected.value]!]
  const assetIds: string[] = []
  for (let i = 0; i < toSave.length; i++) {
    const img = toSave[i]!
    const asset = addBuzzAsset({
      title: toSave.length > 1 ? `${name} · ${i + 1}` : name,
      brand: brandId.value, orientation: 'Portrait',
      tags: ['campaign', resultKind.value], media: isVideo.value ? 'video' : 'image',
      usage: resultKind.value === 'carousel' ? 'Carousel slide' : resultKind.value === 'story' ? 'Instagram Story' : 'Instagram post',
      prompt: brief.value.trim(), updatedAt: BUZZ_TODAY,
    })
    await putImage({ id: asset.id, mime: img.mime, dataUrl: img.dataUrl })
    assetIds.push(asset.id)
  }
  // Create a campaign (creatives = number saved).
  const maxId = buzzCampaigns.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 2041)
  const campaign: BuzzCampaign = {
    id: `CMP-${maxId + 1}`, name, brand: brandId.value, purpose: 'Promotion',
    audience: 'General', status: 'Draft', creatives: toSave.length, owner: 'You', updatedAt: BUZZ_TODAY,
    kind: resultKind.value, brief: brief.value.trim(), assetIds,
  }
  buzzCampaigns.unshift(campaign)
  persistCampaigns()
  saving.value = false
  toast.notify({ variant: 'success', title: 'Campaign created.', maxWidth: 'max-content' })
  emit('created', campaign.id)
  close()
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="Create campaign" width="600px" @close="close">
    <template #body>
            <div v-if="!hasBrands" class="cpd__nobrand">
              <p class="cpd__nobrand-text">You need a brand kit first — Buzz generates on-brand posts from it.</p>
              <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="close(); router.push('/buzz-branding')">Go to Branding</MpButton>
            </div>

            <template v-else>
              <MpFormControl id="cpd-brand" is-required>
                <MpFormLabel>Brand</MpFormLabel>
                <MpSelect id="cpd-brand-select" v-model="brandId">
                  <option v-for="b in buzzBrands" :key="b.id" :value="b.id">{{ b.name }}</option>
                </MpSelect>
              </MpFormControl>

              <div class="cpd__row">
                <MpFormControl id="cpd-type" is-required>
                  <MpFormLabel>Type</MpFormLabel>
                  <MpSelect id="cpd-type-select" v-model="postType">
                    <option value="single">Single post · 3 designs</option>
                    <option value="carousel">Carousel series</option>
                    <option value="story">Story · video</option>
                  </MpSelect>
                </MpFormControl>
                <MpFormControl v-if="postType === 'carousel'" id="cpd-slides">
                  <MpFormLabel>Slides</MpFormLabel>
                  <MpSelect id="cpd-slides-select" v-model.number="slides">
                    <option v-for="n in [3,4,5,6,7]" :key="n" :value="n">{{ n }} slides</option>
                  </MpSelect>
                </MpFormControl>
              </div>

              <MpFormControl id="cpd-brief" is-required :is-invalid="!!briefError">
                <MpFormLabel>{{ postType === 'story' ? 'What is the Story about?' : postType === 'carousel' ? 'What is the series about?' : 'What is the post about?' }}</MpFormLabel>
                <MpTextarea id="cpd-brief-input" v-model="brief" :rows="3" is-full-width placeholder="e.g. Announce our new summer promotion, 20% off for young professionals" @input="briefError = ''" />
                <MpFormErrorMessage>{{ briefError }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="cpd-headline">
                <MpFormLabel>Headline (optional)</MpFormLabel>
                <MpInput id="cpd-headline-input" v-model="headline" is-full-width placeholder="Leave blank and AI writes one in your tone" />
              </MpFormControl>

              <MpFormControl id="cpd-assets">
                <MpFormLabel>Your assets (optional)</MpFormLabel>
                <p class="cpd__hintline">Pick a product or photo from your library — Buzz features it in the post and can re-pose it into the scene.</p>
                <div class="cpd__subjects">
                  <span v-for="id in subjectIds" :key="id" class="cpd__subject">
                    <img v-if="subjectThumbs.get(id)" :src="subjectThumbs.get(id)" alt="" class="cpd__subject-img" />
                    <MpButton type="button" class="cpd__subject-x" variant="ghost" aria-label="Remove" @click="removeSubject(id)"><MpIcon name="close" size="sm" /></MpButton>
                  </span>
                  <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="showAssetPicker = true">Add from your assets</MpButton>
                </div>
              </MpFormControl>

              <div v-if="generating" class="cpd__preview cpd__preview--loading">
                <MpSpinner size="md" />
                <p class="cpd__hint">{{ postType === 'story' ? 'Generating your Story video with Veo… this takes about 1–2 minutes.' : postType === 'carousel' ? `Designing your ${slides}-slide series with Gemini…` : 'Designing 3 on-brand options with Gemini…' }}</p>
              </div>
              <div v-else-if="results.length" class="cpd__result">
                <!-- Story: a single vertical video -->
                <template v-if="resultKind === 'story'">
                  <p class="cpd__resultlabel">Story video · 9:16</p>
                  <video :src="results[0].dataUrl" class="cpd__video" autoplay loop muted playsinline controls />
                </template>
                <!-- Single post: 3 alternatives, pick one -->
                <template v-else-if="resultKind === 'single'">
                  <p class="cpd__resultlabel">Pick a design · click to zoom</p>
                  <div class="cpd__alts">
                    <MpButton v-for="(img, i) in results" :key="i" type="button" class="cpd__alt" :class="{ 'cpd__alt--on': selected === i }" variant="ghost" @click="selected = i; openZoom(i)">
                      <img :src="img.dataUrl" :alt="`Design ${i + 1}`" class="cpd__alt-img" />
                      <span v-if="selected === i" class="cpd__alt-check"><MpIcon name="check" size="sm" /></span>
                    </MpButton>
                  </div>
                </template>
                <!-- Carousel: slide strip -->
                <template v-else>
                  <p class="cpd__resultlabel">{{ results.length }}-slide series · click to zoom</p>
                  <div class="cpd__slides">
                    <MpButton v-for="(img, i) in results" :key="i" type="button" class="cpd__slide" variant="ghost" @click="openZoom(i)">
                      <img :src="img.dataUrl" :alt="`Slide ${i + 1}`" class="cpd__slide-img" />
                      <span class="cpd__slide-n">{{ i + 1 }}</span>
                    </MpButton>
                  </div>
                </template>
                <p v-if="error" class="cpd__error">{{ error }}</p>
              </div>
              <p v-else-if="error" class="cpd__error">{{ error }}</p>
            </template>
    </template>
    <template v-if="hasBrands" #footer>
      <template v-if="!results.length">
        <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
        <MpButton variant="primary" is-rounded :is-loading="generating" @click="generate">{{ postType === 'story' ? 'Generate Story' : postType === 'carousel' ? 'Generate series' : 'Generate designs' }}</MpButton>
      </template>
      <template v-else>
        <MpButton variant="ghost" is-rounded :is-loading="generating" @click="generate">Regenerate</MpButton>
        <MpButton variant="primary" is-rounded :is-loading="saving" @click="save">Save campaign</MpButton>
      </template>
    </template>
  </ErpDrawer>

  <AssetPickerDrawer v-model:is-open="showAssetPicker" v-model="subjectIds" />

  <!-- ── Zoom lightbox over the generated designs ── -->
  <Teleport to="body">
    <Transition name="zm">
      <div v-if="zoomIndex !== null && results[zoomIndex]" class="zm-overlay">
        <MpButton class="zm-close" variant="ghost" type="button" aria-label="Close" @click="zoomIndex = null"><MpIcon name="close" size="md" /></MpButton>
        <MpButton v-if="results.length > 1" class="zm-nav zm-nav--prev" variant="ghost" type="button" aria-label="Previous" @click.stop="zoomPrev"><MpIcon name="caret-left" size="lg" /></MpButton>
        <img :src="results[zoomIndex].dataUrl" alt="Design preview" class="zm-img" />
        <MpButton v-if="results.length > 1" class="zm-nav zm-nav--next" variant="ghost" type="button" aria-label="Next" @click.stop="zoomNext"><MpIcon name="caret-right" size="lg" /></MpButton>
        <span v-if="results.length > 1" class="zm-count">{{ zoomIndex + 1 }} / {{ results.length }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cpd__nobrand { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-3); }
.cpd__nobrand-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cpd__preview--loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); min-height: 280px; border: 1px dashed var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-neutral-subtle); }
.cpd__hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cpd__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3, 12px); align-items: start; }
.cpd__result { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cpd__resultlabel { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cpd__video { width: 100%; max-width: 300px; margin: 0 auto; aspect-ratio: 9 / 16; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); display: block; background: #000; }
/* Single: 3 alternatives */
.cpd__alts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-2, 8px); }
.cpd__alt { position: relative; padding: 0; border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-md, 8px); overflow: hidden; box-shadow: 0 0 0 1px var(--mp-border-default, #e3e7e9); }
.cpd__alt--on { box-shadow: 0 0 0 2px var(--mp-border-selected, #029861); }
.cpd__alt-img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.cpd__alt-check { position: absolute; top: 4px; right: 4px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; background: var(--mp-background-brand-bold, #029861); color: var(--mp-colors-white); }
.cpd__alt-check :deep(svg) { color: var(--mp-colors-white); }
/* Carousel: slide strip */
.cpd__slides { display: flex; gap: var(--mp-spacing-2, 8px); overflow-x: auto; padding-bottom: var(--mp-spacing-1); }
.cpd__slide { position: relative; flex: 0 0 auto; width: 140px; border-radius: var(--mp-radii-md, 8px); overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); padding: 0; background: none; cursor: pointer; }
.cpd__alt { cursor: pointer; }

/* Zoom lightbox */
.zm-enter-active, .zm-leave-active { transition: opacity 180ms ease; }
.zm-enter-from, .zm-leave-to { opacity: 0; }
.zm-overlay { position: fixed; inset: 0; z-index: 1600; background: rgba(8, 13, 14, 0.82); display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-8, 32px); }
.zm-img { max-width: min(680px, 86vw); max-height: 88vh; object-fit: contain; border-radius: var(--mp-radii-md, 8px); display: block; }
.zm-close { position: fixed; top: 16px; right: 16px; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border: none; background: rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; color: var(--mp-colors-white); } /* pixel-police-allow */
.zm-close:hover { background: rgba(255,255,255,0.24); }
.zm-close :deep(svg) { color: var(--mp-colors-white); }
.zm-nav { position: fixed; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border: none; background: rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; color: var(--mp-colors-white); } /* pixel-police-allow */
.zm-nav:hover { background: rgba(255,255,255,0.24); }
.zm-nav :deep(svg) { color: var(--mp-colors-white); }
.zm-nav--prev { left: 16px; }
.zm-nav--next { right: 16px; }
.zm-count { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,0.16); color: var(--mp-colors-white); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); } /* pixel-police-allow */
.cpd__slide-img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.cpd__slide-n { position: absolute; top: 6px; left: 6px; display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: rgba(8,13,14,0.66); color: var(--mp-colors-white); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); } /* pixel-police-allow */
.cpd__error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #d1362f); }
.cpd__hintline { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.cpd__subjects { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); align-items: center; }
.cpd__subject { position: relative; width: 56px; height: 56px; border-radius: var(--mp-radii-md, 8px); overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); flex-shrink: 0; }
.cpd__subject-img { width: 100%; height: 100%; object-fit: cover; }
.cpd__subject-x { position: absolute; top: 2px; right: 2px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: none; border-radius: 999px; background: rgba(8,13,14,0.66); color: var(--mp-colors-white); cursor: pointer; padding: 0; } /* pixel-police-allow */
.cpd__subject-x :deep(svg) { color: var(--mp-colors-white); width: 12px; height: 12px; }
</style>
