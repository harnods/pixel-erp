<script setup lang="ts">
/**
 * ErpTagList — tag chips clamped to 2 lines. When more tags overflow than fit in
 * two lines, a "More" text-link appears at the bottom-right (use it to reveal the
 * rest, e.g. a popover). Used in table tag cells across all index pages.
 */
const props = defineProps<{ tags?: string[] }>()

const rootEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = rootEl.value
  if (!el) return
  // chips on line 3+ are clipped by max-height/overflow → scrollHeight exceeds clientHeight
  overflowing.value = el.scrollHeight - el.clientHeight > 1
}

onMounted(() => {
  measure()
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
    <span v-for="tag in tags" :key="tag" class="erp-tag">{{ tag }}</span>
    <a v-if="overflowing" class="erp-tags-more">More</a>
  </div>
</template>

<style scoped>
.erp-tags {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--mp-spacing-1);
  /* exactly two chip rows (chip 20px) + one row gap */
  max-height: calc(var(--mp-sizes-5, 20px) * 2 + var(--mp-spacing-1));
  overflow: hidden;
  background: inherit;   /* so the "More" mask matches the row bg (incl. hover) */
}

.erp-tag {
  display: inline-flex;
  align-items: center;
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md);
  padding: 0 var(--mp-spacing-1\.5);
  height: var(--mp-sizes-5, 20px);
  border-radius: var(--mp-radii-sm);
  white-space: nowrap;
}

/* "More" link masks the end of line 2; bg matches the row (inherits hover bg) */
.erp-tags-more {
  position: absolute;
  right: 0;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  height: var(--mp-sizes-5, 20px);
  padding-left: var(--mp-spacing-2);
  background: inherit;
  color: var(--mp-text-link);
  font-size: var(--mp-font-sizes-sm);
  line-height: 1;
  cursor: pointer;
}
</style>
