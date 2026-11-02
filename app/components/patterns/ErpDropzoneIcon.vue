<script setup lang="ts">
/**
 * ErpDropzoneIcon — the standard glyph for EVERY import dropzone in the ERP
 * (Pixel DT 2.4 Enterprise). A 48px icon centred in an 80px oval with a #F8F9F9
 * fill and 16px padding.
 *   • idle (default): the upload icon (/_Dropzone/_Upload (E).svg)
 *   • loading:        a 48px spinner that rotates, same oval — used while a
 *     dropped file is processing.
 * Use this in every dropzone's #idle / #loading slot — never hand-roll an icon.
 */
import { MpSpinner } from '@mekari/pixel3'

defineProps<{ loading?: boolean }>()
</script>

<template>
  <span class="erp-dropzone-icon" aria-hidden="true">
    <MpSpinner v-if="loading" class="erp-dropzone-icon__spinner" />
    <!-- /_Dropzone/_Upload (E).svg — 48px -->
    <svg v-else width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#erp-dz-clip)">
        <path d="M44.9122 24C44.9122 17.0985 42.9766 11.9245 39.5268 8.47443C36.0767 5.0243 30.9019 3.08778 24 3.08778C17.0982 3.0878 11.9245 5.02432 8.47443 8.47443C5.02432 11.9245 3.0878 17.0982 3.08778 24C3.08778 30.9019 5.0243 36.0767 8.47443 39.5268C11.9245 42.9766 17.0985 44.9122 24 44.9122C30.9019 44.9122 36.0767 42.977 39.5268 39.5268C42.977 36.0767 44.9122 30.9019 44.9122 24ZM22.4561 34.3575V16.42C20.3209 18.0186 18.3782 20.2406 17.283 22.431C16.9017 23.193 15.975 23.5015 15.2128 23.1206C14.4502 22.7394 14.1406 21.8117 14.5219 21.0491C16.2908 17.5116 19.7727 14.0307 23.3103 12.2619L23.4762 12.1903C23.8711 12.0478 24.3107 12.0718 24.6909 12.2619C28.2283 14.0309 31.7094 17.5128 33.4781 21.0504C33.859 21.8128 33.5496 22.7395 32.7872 23.1206C32.0249 23.5016 31.0984 23.193 30.717 22.431C29.6218 20.2406 27.679 18.0186 25.5439 16.42V34.3575C25.5439 35.21 24.8525 35.9014 24 35.9014C23.1475 35.9013 22.4561 35.21 22.4561 34.3575ZM48 24C48 31.4701 45.8939 37.5239 41.7089 41.7089C37.5239 45.8939 31.4701 48 24 48C16.5299 48 10.4761 45.8938 6.29113 41.7089C2.10623 37.5239 0 31.4701 0 24C2.67435e-05 16.5299 2.10616 10.4761 6.29113 6.29113C10.4761 2.10616 16.5299 2.67427e-05 24 0C31.4701 0 37.5239 2.10623 41.7089 6.29113C45.8938 10.4761 48 16.5299 48 24Z" fill="#536062"/>
      </g>
      <defs>
        <clipPath id="erp-dz-clip"><rect width="48" height="48" fill="white"/></clipPath>
      </defs>
    </svg>
  </span>
</template>

<style scoped>
/* 48px icon + 16px padding all round = 80px oval, #F8F9F9 fill. */
.erp-dropzone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  padding: 16px;
  border-radius: 50%;
  background: var(--mp-colors-background-neutral-subtle);
  box-sizing: border-box;
}
.erp-dropzone-icon svg { display: block; width: 48px; height: 48px; }
/* Spinner sized to match the 48px icon; MpSpinner animates its own rotation. */
.erp-dropzone-icon__spinner { width: 48px; height: 48px; }
.erp-dropzone-icon__spinner :deep(svg) { width: 48px; height: 48px; }
</style>
