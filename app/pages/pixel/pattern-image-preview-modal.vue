<script setup lang="ts">
import { ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Image preview modal · Pixel 3 Enterprise' })

// A real public asset stands in for an uploaded image attachment.
const imgUrl = '/illustrations/paywall-hero.png'
const open = ref(false)
</script>

<template>
  <div>
    <DemoHeader title="Image preview modal" tag="pattern · file preview"
      lead="Read-only preview of an uploaded image (a receipt photo, a product image, a proof-of-delivery snap) with a Download action in the footer. The SAME shared component as the PDF preview — FilePreviewModal.vue (MpModal size xl) — just renders an <img> (contained, centred on a subtle surface) instead of an iframe; kind is auto-detected from the filename extension. One preview surface for every file type keeps them consistent."
      :rules="['rule/file-preview-modal', 'rule/file-preview-download', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Open it"
      desc="Header = the filename. Body = the image, object-fit contained and centred on a subtle-neutral surface (so a small or oddly-shaped image isn't stretched). Footer = ghost Close + primary Download. A .png/.jpg/.webp filename auto-selects the image renderer."
      :rules="['rule/file-preview-modal']"
      code="<FilePreviewModal
  :open=&quot;open&quot; :src=&quot;imgUrl&quot; filename=&quot;receipt-2026-09.png&quot;
  @close=&quot;open = false&quot; />">
      <div class="pv-row">
        <MpButton variant="secondary" is-rounded @click="open = true">Preview image</MpButton>
        <span class="pv-hint">Opens receipt-2026-09.png</span>
      </div>
    </DemoSection>

    <DemoSection title="Footer — Close · Download"
      desc="Identical footer to the PDF preview: ghost Close + primary Download, pinned right. Download saves the image under its filename; Close / × dismisses."
      :rules="['rule/file-preview-download', 'rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<MpModalFooter>
  <MpButton variant=&quot;ghost&quot; is-rounded>Close</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Download</MpButton>
</MpModalFooter>" >
      <p class="pv-note">The footer sits at the bottom of the open modal.</p>
    </DemoSection>

    <FilePreviewModal :open="open" :src="imgUrl" filename="receipt-2026-09.png" @close="open = false" />
  </div>
</template>

<style scoped>
.pv-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.pv-hint, .pv-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pv-note { margin: 0; }
</style>
