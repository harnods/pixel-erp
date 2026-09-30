<script setup lang="ts">
/**
 * BuzzNewBrandModal · Mekari Buzz — "New brand kit" (lg modal).
 *
 * Name the kit, then choose ONE source: upload a brand guideline (PPT/PDF/image)
 * or import from a website URL. On Create we extract the brand system with Gemini
 * (server route), create the brand kit, and hand the new id back so the caller
 * can open its guideline page. Custom Teleport overlay — MpModal has no
 * structural CSS in this Pixel3 build (see ConfirmModal.vue).
 */
import { MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpSpinner } from '@mekari/pixel3'
import { addBrand, updateBrand } from '~/data/buzz'
import { putImage } from '~/utils/buzzImageStore'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'created', id: string): void }>()

const name = ref('')
const sourceKind = ref<'file' | 'url'>('file')
const url = ref('')
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const nameError = ref('')
const sourceError = ref('')
const extractError = ref('')
const extracting = ref(false)

watch(() => props.isOpen, (open) => {
  if (open) {
    name.value = ''; sourceKind.value = 'file'; url.value = ''; file.value = null
    nameError.value = ''; sourceError.value = ''; extractError.value = ''; extracting.value = false
  }
})

function pickFile() { fileInput.value?.click() }
function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  sourceError.value = ''
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsDataURL(f)
  })
}

function close() { if (!extracting.value) emit('update:isOpen', false) }

async function create() {
  nameError.value = name.value.trim() ? '' : 'You must fill in a brand kit name'
  sourceError.value = ''
  if (sourceKind.value === 'file' && !file.value) sourceError.value = 'Upload a brand guideline file'
  if (sourceKind.value === 'url' && !url.value.trim()) sourceError.value = 'Enter your website URL'
  if (nameError.value || sourceError.value) return

  extractError.value = ''
  extracting.value = true
  try {
    let body: any
    if (sourceKind.value === 'file' && file.value) {
      const f = file.value
      const dataBase64 = await readAsDataUrl(f)
      body = { source: 'file', file: { name: f.name, mime: f.type, ext: f.name.split('.').pop()?.toLowerCase(), dataBase64 } }
    } else {
      body = { source: 'url', url: url.value.trim() }
    }
    const res = await $fetch<{ brand?: any; visualCaptures?: string[]; error?: string }>('/api/buzz/extract-brand', { method: 'POST', body })
    if (res?.error || !res?.brand) { extractError.value = res?.error || 'Could not read the brand. Please try again.'; extracting.value = false; return }
    const b = res.brand
    const brand = addBrand({
      name: name.value.trim(),
      accent: b.colors?.primary || '#111111',
      secondary: b.colors?.secondary || '#666666',
      neutral: b.colors?.neutral || '#080D0E',
      palette: Array.isArray(b.colors?.palette) ? b.colors.palette : [],
      colorCombos: Array.isArray(b.colors?.combinations) ? b.colors.combinations : [],
      theme: b.theme || '',
      typography: [b.typography?.headline, b.typography?.body].filter(Boolean).join(' · '),
      fonts: Array.isArray(b.typography?.fonts) ? b.typography.fonts.filter((f: any) => f?.name).map((f: any) => ({ name: String(f.name), usage: f.usage ? String(f.usage) : undefined })) : [],
      fontHeadline: b.typography?.headline || '',
      fontBody: b.typography?.body || '',
      typographyHierarchy: b.typography?.hierarchy || '',
      tone: b.tone?.summary || '',
      toneDo: Array.isArray(b.tone?.do) ? b.tone.do : [],
      toneDont: Array.isArray(b.tone?.dont) ? b.tone.dont : [],
      logoUsage: Array.isArray(b.logoUsage) ? b.logoUsage : [],
      visualStyle: b.visualStyle || '',
      photography: b.photography || '',
      guardrails: Array.isArray(b.guardrails) ? b.guardrails : [],
    })
    // Save any captured site images as the brand's visual-style references.
    const caps: string[] = Array.isArray(res.visualCaptures) ? res.visualCaptures : []
    if (caps.length) {
      const ids: string[] = []
      for (const dataUrl of caps.slice(0, 3)) {
        const m = dataUrl.match(/^data:([^;]+);base64,/)
        if (!m) continue
        const id = `vref-${Math.random().toString(36).slice(2)}`
        await putImage({ id, mime: m[1], dataUrl })
        ids.push(id)
      }
      if (ids.length) updateBrand(brand.id, { visualRefs: ids })
    }
    emit('created', brand.id)
    emit('update:isOpen', false)
  } catch (err: any) {
    extractError.value = String(err?.data?.error ?? err?.message ?? 'Could not read the brand. Please try again.')
    extracting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nbm">
      <div v-if="isOpen" class="nbm-overlay">
        <div class="nbm-panel" role="dialog" aria-modal="true" aria-label="New brand kit">
          <header class="nbm-head">
            <p class="nbm-title">New brand kit</p>
            <button class="nbm-close" type="button" aria-label="Close" :disabled="extracting" @click="close"><MpIcon name="close" size="md" /></button>
          </header>

          <!-- Extracting state -->
          <div v-if="extracting" class="nbm-extracting">
            <MpSpinner size="lg" />
            <p class="nbm-extracting__title">Reading your brand…</p>
            <p class="nbm-extracting__sub">Pulling colours, typography, tone of voice and logo usage from your {{ sourceKind === 'url' ? 'website' : 'guideline' }}.</p>
          </div>

          <template v-else>
            <div class="nbm-body">
              <MpFormControl id="nbm-name" is-required :is-invalid="!!nameError">
                <MpFormLabel>Brand kit name</MpFormLabel>
                <MpInput id="nbm-name-input" v-model="name" is-full-width placeholder="e.g. Acme, or Acme Product" @input="nameError = ''" />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <div class="nbm-source">
                <!-- Upload guideline -->
                <label class="nbm-opt" :class="{ 'nbm-opt--active': sourceKind === 'file' }">
                  <input type="radio" class="nbm-radio" value="file" :checked="sourceKind === 'file'" @change="sourceKind = 'file'; sourceError = ''" />
                  <span class="nbm-opt__body">
                    <span class="nbm-opt__title">Upload brand guideline</span>
                    <span class="nbm-opt__hint">PPT, PDF, or images</span>
                    <span v-if="sourceKind === 'file'" class="nbm-opt__control">
                      <button type="button" class="btn-enterprise btn-enterprise--secondary" @click.prevent="pickFile">{{ file ? 'Change file' : 'Choose file' }}</button>
                      <span v-if="file" class="nbm-file">{{ file.name }}</span>
                      <input ref="fileInput" type="file" class="nbm-fileinput" accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp" @change="onFile" />
                    </span>
                  </span>
                </label>

                <!-- Website URL -->
                <label class="nbm-opt" :class="{ 'nbm-opt--active': sourceKind === 'url' }">
                  <input type="radio" class="nbm-radio" value="url" :checked="sourceKind === 'url'" @change="sourceKind = 'url'; sourceError = ''" />
                  <span class="nbm-opt__body">
                    <span class="nbm-opt__title">Import from a website</span>
                    <span class="nbm-opt__hint">We read the public brand cues from your site</span>
                    <span v-if="sourceKind === 'url'" class="nbm-opt__control">
                      <MpInput id="nbm-url" v-model="url" is-full-width placeholder="https://yourcompany.com" @input="sourceError = ''" />
                    </span>
                  </span>
                </label>
                <p v-if="sourceError" class="nbm-error">{{ sourceError }}</p>
                <p v-if="extractError" class="nbm-error">{{ extractError }}</p>
              </div>
            </div>

            <footer class="nbm-foot">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="create">Create</button>
            </footer>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nbm-enter-active, .nbm-leave-active { transition: opacity 200ms ease; }
.nbm-enter-from, .nbm-leave-to { opacity: 0; }
.nbm-enter-active .nbm-panel, .nbm-leave-active .nbm-panel { transition: transform 200ms ease, opacity 200ms ease; }
.nbm-enter-from .nbm-panel, .nbm-leave-to .nbm-panel { transform: scale(0.97); opacity: 0; }

.nbm-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; align-items: flex-start; justify-content: center; }
.nbm-panel { width: min(640px, calc(100% - 32px)); margin-top: 80px; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-lg, 12px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1); overflow: hidden; }

.nbm-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4) var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
.nbm-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nbm-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.nbm-close:hover { background: var(--mp-background-neutral-subtle); }
.nbm-close:disabled { opacity: 0.5; cursor: default; }

.nbm-body { padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.nbm-source { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.nbm-opt { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); cursor: pointer; }
.nbm-opt--active { border-color: var(--mp-border-selected, #029861); box-shadow: inset 0 0 0 1px var(--mp-border-selected, #029861); }
.nbm-radio { margin-top: 3px; accent-color: var(--mp-background-brand-bold, #029861); width: 16px; height: 16px; flex-shrink: 0; }
.nbm-opt__body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.nbm-opt__title { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nbm-opt__hint { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.nbm-opt__control { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); flex-wrap: wrap; }
.nbm-file { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.nbm-fileinput { display: none; }
.nbm-error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #d1362f); }

.nbm-foot { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }

.nbm-extracting { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-16, 64px) var(--mp-spacing-5); text-align: center; }
.nbm-extracting__title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nbm-extracting__sub { margin: 0; max-width: 420px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
</style>
