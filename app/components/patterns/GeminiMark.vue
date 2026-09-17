<script setup lang="ts">
/**
 * GeminiMark — Google Gemini's gradient four-point-star glyph. Used wherever a
 * Gemini model is named (chat composer model picker, agent detail Model field).
 * A unique gradient id per instance avoids <defs> id collisions on a page.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
let _seq = 0
const gradId = `gemini-mark-${(_seq += 1)}-${Math.floor(performance.now())}`
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="gradId" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#1BA1E3" />
        <stop offset="0.3" stop-color="#5489D6" />
        <stop offset="0.55" stop-color="#9B72CB" />
        <stop offset="0.8" stop-color="#D96570" />
        <stop offset="1" stop-color="#F49C46" />
      </linearGradient>
    </defs>
    <path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" :fill="`url(#${gradId})`" />
  </svg>
</template>
