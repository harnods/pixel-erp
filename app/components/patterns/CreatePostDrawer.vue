<script setup lang="ts">
/**
 * CreatePostDrawer · Mekari Buzz — Create campaign → pick a brand → generate a
 * designed Instagram post with Gemini (Nano Banana), grounded on the brand kit
 * (colours, typography, tone, logo usage, reference designs) + a hard-coded IG
 * design skill on the server. Save creates a campaign and stores the post.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpSelect, MpTextarea, MpText, MpButton, MpSpinner, MpIcon, toast,
} from '@mekari/pixel3'
import { buzzBrands, buzzBrand, buzzCampaigns, persistCampaigns, addBuzzAsset, BUZZ_TODAY, type BuzzCampaign } from '~/data/buzz'
import { getImage, putImage } from '~/utils/buzzImageStore'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'created', id: string): void }>()
const router = useRouter()

const brandId = ref('')
const brief = ref('')
const headline = ref('')
const briefError = ref('')
const error = ref('')
const generating = ref(false)
const resultUrl = ref('')
const resultMime = ref('image/png')

const hasBrands = computed(() => buzzBrands.length > 0)

watch(() => props.isOpen, (open) => {
  if (open) {
    brandId.value = buzzBrands[0]?.id ?? ''
    brief.value = ''; headline.value = ''; briefError.value = ''; error.value = ''
    generating.value = false; resultUrl.value = ''
  }
})

function close() { emit('update:isOpen', false) }

async function generate() {
  briefError.value = brief.value.trim() ? '' : 'Describe what the post is about'
  if (briefError.value) return
  error.value = ''
  generating.value = true
  resultUrl.value = ''
  const b = buzzBrand(brandId.value)
  const references: string[] = []
  for (const id of (b?.visualRefs ?? []).slice(0, 4)) {
    const rec = await getImage(id)
    if (rec?.dataUrl) references.push(rec.dataUrl)
  }
  try {
    const res = await $fetch<{ dataUrl?: string; mime?: string; error?: string }>('/api/buzz/generate-ig-post', {
      method: 'POST',
      body: {
        brief: brief.value.trim(),
        headline: headline.value.trim() || undefined,
        brand: b ? {
          name: b.name, accent: b.accent, secondary: b.secondary, neutral: b.neutral, palette: b.palette,
          fonts: b.fonts, tone: b.tone, toneDo: b.toneDo, logoUsage: b.logoUsage,
          visualStyle: b.visualStyle, photography: b.photography, guardrails: b.guardrails,
        } : undefined,
        references,
      },
    })
    if (res?.error || !res?.dataUrl) { error.value = res?.error || 'Could not generate the post.'; return }
    resultUrl.value = res.dataUrl
    resultMime.value = res.mime || 'image/png'
  } catch (err: any) {
    error.value = String(err?.data?.error ?? err?.message ?? 'Could not generate the post.')
  } finally {
    generating.value = false
  }
}

const saving = ref(false)
async function save() {
  if (!resultUrl.value) return
  saving.value = true
  const b = buzzBrand(brandId.value)
  const name = headline.value.trim() || brief.value.trim().slice(0, 48)
  // Save the post image as an asset.
  const asset = addBuzzAsset({
    title: name, brand: brandId.value, orientation: 'Portrait',
    tags: ['ig-post', 'campaign'], usage: 'Instagram post', prompt: brief.value.trim(), updatedAt: BUZZ_TODAY,
  })
  await putImage({ id: asset.id, mime: resultMime.value, dataUrl: resultUrl.value })
  // Create a campaign.
  const maxId = buzzCampaigns.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 2041)
  const campaign: BuzzCampaign = {
    id: `CMP-${maxId + 1}`, name, brand: brandId.value, purpose: 'Promotion',
    audience: 'General', status: 'Draft', creatives: 1, owner: 'You', updatedAt: BUZZ_TODAY,
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
  <MpDrawer id="buzz-create-post-drawer" :is-open="isOpen" placement="right" size="md" variant="floating" :is-keep-alive="false" @close="close">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="cpd">
          <div class="cpd__header">
            <MpText weight="semiBold">Create campaign</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="close" />
          </div>

          <div class="cpd__form">
            <div v-if="!hasBrands" class="cpd__nobrand">
              <p class="cpd__nobrand-text">You need a brand kit first — Buzz generates on-brand posts from it.</p>
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="close(); router.push('/buzz-branding')">Go to Branding</button>
            </div>

            <template v-else>
              <MpFormControl id="cpd-brand" is-required>
                <MpFormLabel>Brand</MpFormLabel>
                <MpSelect id="cpd-brand-select" v-model="brandId">
                  <option v-for="b in buzzBrands" :key="b.id" :value="b.id">{{ b.name }}</option>
                </MpSelect>
              </MpFormControl>

              <MpFormControl id="cpd-format" is-required>
                <MpFormLabel>Format</MpFormLabel>
                <MpSelect id="cpd-format-select" model-value="ig-post" disabled>
                  <option value="ig-post">Instagram post · 4:5</option>
                </MpSelect>
              </MpFormControl>

              <MpFormControl id="cpd-brief" is-required :is-invalid="!!briefError">
                <MpFormLabel>What is the post about?</MpFormLabel>
                <MpTextarea id="cpd-brief-input" v-model="brief" :rows="3" is-full-width placeholder="e.g. Announce our new summer promotion, 20% off for young professionals" @input="briefError = ''" />
                <MpFormErrorMessage>{{ briefError }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="cpd-headline">
                <MpFormLabel>Headline (optional)</MpFormLabel>
                <MpInput id="cpd-headline-input" v-model="headline" is-full-width placeholder="Leave blank and AI writes one in your tone" />
              </MpFormControl>

              <div v-if="generating" class="cpd__preview cpd__preview--loading">
                <MpSpinner size="md" />
                <p class="cpd__hint">Designing your post with Gemini…</p>
              </div>
              <div v-else-if="resultUrl" class="cpd__result">
                <img :src="resultUrl" alt="Generated Instagram post" class="cpd__img" />
                <p v-if="error" class="cpd__error">{{ error }}</p>
              </div>
              <p v-else-if="error" class="cpd__error">{{ error }}</p>
            </template>
          </div>

          <div v-if="hasBrands" class="cpd__footer">
            <template v-if="!resultUrl">
              <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
              <MpButton variant="primary" is-rounded :is-loading="generating" @click="generate">
                <MpIcon v-if="!generating" name="magic" size="sm" /> Generate post
              </MpButton>
            </template>
            <template v-else>
              <MpButton variant="ghost" is-rounded :is-loading="generating" @click="generate">Regenerate</MpButton>
              <MpButton variant="primary" is-rounded :is-loading="saving" @click="save">Save campaign</MpButton>
            </template>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.cpd { display: flex; flex-direction: column; height: 100%; }
.cpd__header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.cpd__form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.cpd__footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cpd__nobrand { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-3); }
.cpd__nobrand-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cpd__preview--loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); min-height: 280px; border: 1px dashed var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-neutral-subtle); }
.cpd__hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cpd__result { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cpd__img { width: 100%; max-width: 360px; margin: 0 auto; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); display: block; }
.cpd__error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #d1362f); }
</style>
