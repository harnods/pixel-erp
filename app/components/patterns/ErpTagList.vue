<script setup lang="ts">
/**
 * ErpTagList — MpTag chips clamped to 2 lines. When more tags overflow than fit in
 * two lines, a "More" text-link appears at the bottom-right (use it to reveal the
 * rest, e.g. a popover). Used in table tag cells across all index pages.
 *
 * Chips are real MpTag (gray, md) — rule/tag-list-mptag / rule/tag-gray-only.
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { MpTag } from '@mekari/pixel3'

const props = defineProps<{ tags?: string[] }>()

const rootEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = rootEl.value
  if (!el) return
  // Clamp to two chip rows based on the ACTUAL rendered chip height (MpTag ≠ 20px).
  const chip = el.querySelector<HTMLElement>('.mp-tag__root, [class*="tag"]')
  if (chip) {
    const gap = parseFloat(getComputedStyle(el).rowGap || '4') || 4
    el.style.maxHeight = `${chip.offsetHeight * 2 + gap}px`
  }
  // chips on line 3+ are clipped by max-height/overflow → scrollHeight exceeds clientHeight
  overflowing.value = el.scrollHeight - el.clientHeight > 1
}

onMounted(() => {
  nextTick(measure)
  resizeObserver = new ResizeObserver(() => measure())
  if (rootEl.value) resizeObserver.observe(rootEl.value)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
watch(() => props.tags, () => nextTick(measure))
</script>

<template>
  <div v-if="tags?.length" ref="rootEl" class="erp-tags">
    <MpTag v-for="(tag, i) in tags" :id="`erp-tag-${i}`" :key="tag">{{ tag }}</MpTag>
    <a v-if="overflowing" class="erp-tags-more">More</a>
  </div>
</template>

<style scoped>
.erp-tags {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--mp-spacing-1);
  overflow: hidden;                /* max-height set at runtime = 2 chip rows + gap */
  background: inherit;             /* so the "More" mask matches the row bg (incl. hover) */
}

/* "More" link masks the end of line 2; bg matches the row (inherits hover bg) */
.erp-tags-more {
  position: absolute;
  right: 0;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  padding-left: var(--mp-spacing-2);
  background: inherit;
  color: var(--mp-text-link);
  font-size: var(--mp-font-sizes-sm);
  line-height: 1;
  cursor: pointer;
}
</style>
