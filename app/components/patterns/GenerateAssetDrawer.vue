<script setup lang="ts">
/**
 * GenerateAssetDrawer · Mekari Buzz — Create → Generate asset (PRD §11).
 *
 * A constrained generation mode: a brief + simple brand/orientation/style
 * controls. Calls the server route (real Gemini image model), previews the
 * result, and saves it to the Photo-stocks library — image bytes in IndexedDB,
 * metadata in the persisted buzzAssets snapshot. Errors show inline (never a
 * toast), matching the project rule.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpSelect, MpTextarea, MpText, MpButton, MpSpinner, MpIcon, toast,
} from '@mekari/pixel3'
import { buzzBrands, buzzBrand, addBuzzAsset, type BuzzOrientation } from '~/data/buzz'
import { putImage, getImage } from '~/utils/buzzImageStore'
import AssetPickerDrawer from '~/components/patterns/AssetPickerDrawer.vue'

const props = defineProps<{ isOpen: boolean; presetSubjectIds?: string[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'saved', id: string): void }>()

// Subjects — the user's own assets to re-pose into new scenes.
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

const prompt = ref('')
const brandId = ref(buzzBrands[0]?.id ?? '')
const orientation = ref<BuzzOrientation>('Landscape')
const style = ref('')
const orientations: BuzzOrientation[] = ['Landscape', 'Portrait', 'Square']
const STYLES = ['Photography', 'Illustration', '3D render', 'Flat / minimal', 'Product scene']

const generating = ref(false)
const error = ref('')
const resultUrl = ref('')   // data: URL of the generated image
const resultMime = ref('image/png')

function reset() {
  prompt.value = ''; brandId.value = buzzBrands[0]?.id ?? ''; orientation.value = 'Landscape'; style.value = ''
  generating.value = false; error.value = ''; resultUrl.value = ''
  subjectIds.value = [...(props.presetSubjectIds ?? [])]
}
watch(() => props.isOpen, (open) => { if (open) reset() })

function close() { emit('update:isOpen', false) }

async function generate() {
  error.value = ''
  if (!prompt.value.trim()) { error.value = 'Describe the image you want to generate.'; return }
  generating.value = true
  resultUrl.value = ''
  const b = buzzBrand(brandId.value)
  // The brand's uploaded/captured design samples are the primary style reference.
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
  try {
    const res = await $fetch<{ dataUrl?: string; mime?: string; error?: string }>('/api/buzz/generate-image', {
      method: 'POST',
      body: {
        prompt: prompt.value.trim(),
        brand: b ? { name: b.name, accent: b.accent, photography: b.photography, guardrails: b.guardrails } : undefined,
        orientation: orientation.value,
        style: style.value || undefined,
        references,
        subjects,
      },
    })
    if (res?.error || !res?.dataUrl) { error.value = res?.error || 'Could not generate the image.'; return }
    resultUrl.value = res.dataUrl
    resultMime.value = res.mime || 'image/png'
  } catch (err: any) {
    error.value = String(err?.data?.error ?? err?.message ?? 'Could not generate the image.')
  } finally {
    generating.value = false
  }
}

const saving = ref(false)
async function saveToAssets() {
  if (!resultUrl.value) return
  saving.value = true
  const asset = addBuzzAsset({
    title: prompt.value.trim().slice(0, 60),
    brand: brandId.value,
    orientation: orientation.value,
    tags: style.value ? [style.value.toLowerCase()] : [],
    usage: 'Generated',
    prompt: prompt.value.trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
  })
  await putImage({ id: asset.id, mime: resultMime.value, dataUrl: resultUrl.value })
  saving.value = false
  toast.notify({ variant: 'success', title: 'Saved to Photo stocks.', maxWidth: 'max-content' })
  emit('saved', asset.id)
  close()
}
</script>

<template>
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false" id="buzz-generate-drawer" :is-open="isOpen" placement="right" size="md" variant="floating" :is-keep-alive="false" @close="close">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="gad">
          <div class="gad__header">
            <MpText weight="semiBold">Generate asset</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="close" />
          </div>

          <div class="gad__form">
            <MpFormControl id="gad-prompt" is-required :is-invalid="!!error && !resultUrl">
              <MpFormLabel>Describe the image</MpFormLabel>
              <MpTextarea id="gad-prompt-input" v-model="prompt" :rows="3" is-full-width placeholder="e.g. An Indonesian HR manager smiling at a laptop in a bright office" @input="error = ''" />
              <MpFormErrorMessage v-if="!resultUrl">{{ error }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="gad-brand">
              <MpFormLabel>Brand</MpFormLabel>
              <MpSelect id="gad-brand-select" v-model="brandId">
                <option v-for="b in buzzBrands" :key="b.id" :value="b.id">{{ b.name }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="gad-orient">
              <MpFormLabel>Orientation</MpFormLabel>
              <MpSelect id="gad-orient-select" v-model="orientation">
                <option v-for="o in orientations" :key="o" :value="o">{{ o }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="gad-style">
              <MpFormLabel>Style</MpFormLabel>
              <MpSelect id="gad-style-select" v-model="style">
                <option value="">Auto</option>
                <option v-for="s in STYLES" :key="s" :value="s">{{ s }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="gad-assets">
              <MpFormLabel>Your assets (optional)</MpFormLabel>
              <p class="gad__hintline">Pick one of your assets to generate a new pose or scene of it.</p>
              <div class="gad__subjects">
                <span v-for="id in subjectIds" :key="id" class="gad__subject">
                  <img v-if="subjectThumbs.get(id)" :src="subjectThumbs.get(id)" alt="" class="gad__subject-img" />
                  <MpButton type="button" class="gad__subject-x" variant="ghost" aria-label="Remove" @click="removeSubject(id)"><MpIcon name="close" size="sm" /></MpButton>
                </span>
                <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="showAssetPicker = true">Add from your assets</MpButton>
              </div>
            </MpFormControl>

            <!-- Preview -->
            <div v-if="generating" class="gad__preview gad__preview--loading">
              <MpSpinner size="md" />
              <p class="gad__hint">Generating with Gemini…</p>
            </div>
            <div v-else-if="resultUrl" class="gad__result">
              <img :src="resultUrl" alt="Generated asset" class="gad__img" />
              <p v-if="error" class="gad__error">{{ error }}</p>
            </div>
          </div>

          <div class="gad__footer">
            <template v-if="!resultUrl">
              <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
              <MpButton variant="primary" is-rounded :is-loading="generating" @click="generate">Generate</MpButton>
            </template>
            <template v-else>
              <MpButton variant="ghost" is-rounded :is-loading="generating" @click="generate">Generate again</MpButton>
              <MpButton variant="primary" is-rounded :is-loading="saving" @click="saveToAssets">Save to assets</MpButton>
            </template>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>

  <AssetPickerDrawer v-model:is-open="showAssetPicker" v-model="subjectIds" />
</template>

<style scoped>
.gad { display: flex; flex-direction: column; height: 100%; }
.gad__header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.gad__form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.gad__footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

.gad__preview--loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); min-height: 200px; border: 1px dashed var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-neutral-subtle); }
.gad__hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.gad__result { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.gad__img { width: 100%; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); display: block; }
.gad__error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #d1362f); }
.gad__hintline { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.gad__subjects { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); align-items: center; }
.gad__subject { position: relative; width: 56px; height: 56px; border-radius: var(--mp-radii-md, 8px); overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); flex-shrink: 0; }
.gad__subject-img { width: 100%; height: 100%; object-fit: cover; }
.gad__subject-x { position: absolute; top: 2px; right: 2px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: none; border-radius: 999px; background: rgba(8,13,14,0.66); color: var(--mp-colors-white); cursor: pointer; padding: 0; }
.gad__subject-x :deep(svg) { color: var(--mp-colors-white); width: 12px; height: 12px; }
</style>
