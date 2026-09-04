<script setup lang="ts">
/**
 * ErpTagList — tag chips clamped to 2 lines. When more tags overflow than fit in
 * two lines, a "View N more" link appears at the bottom-right; clicking it opens
 * a self-contained popover (header + close, scrollable full list, "Showing X of X
 * values" footer) listing every tag — same controlled-popover pattern as
 * ApprovalCommentPopover. Used in table tag cells across all index pages.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, css } from '@mekari/pixel3'

let uid = 0

const props = withDefaults(defineProps<{
  tags?: string[]
  /** Popover header title, e.g. "Branch values". Defaults to a generic label. */
  title?: string
  /** Unique id for the popover instance — auto-generated if omitted. */
  id?: string
  /** 'compact' (default) — every existing consumer's tinted header/footer, 260px
   *  popover. 'card' — Figma fileKey nZdSEnyXOmQVbSWYhcwyGT node 4850:254618
   *  ("Popover / Values Info"): plain white 400px card, bold title, bordered
   *  row table with every row divided (incl. the last). Opt-in per consumer so
   *  this doesn't reflow the popover on every other index page's tag column. */
  variant?: 'compact' | 'card'
}>(), { title: undefined, id: undefined, variant: 'compact' })

const { t } = useLocale()

const popoverId = props.id ?? `erp-tags-more-${++uid}`

const rootEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const hiddenCount = ref(0)
const open = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = rootEl.value
  if (!el) return
  // chips on line 3+ are clipped by max-height/overflow → scrollHeight exceeds clientHeight
  overflowing.value = el.scrollHeight - el.clientHeight > 1
  if (!overflowing.value) { hiddenCount.value = 0; return }
  const maxHeight = el.clientHeight
  const chips = Array.from(el.querySelectorAll<HTMLElement>('.erp-tag'))
  const visible = chips.filter((c) => c.offsetTop + c.offsetHeight <= maxHeight + 1).length
  hiddenCount.value = Math.max(0, chips.length - visible)
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

    <MpPopover
      v-if="overflowing"
      :id="popoverId"
      is-manual
      :is-open="open"
      use-portal
      :is-keep-alive="false"
      placement="bottom-end"
      @open="open = true"
      @close="open = false"
    >
      <MpPopoverTrigger>
        <a class="erp-tags-more" @click.stop="open = !open">{{ t('View') }} {{ hiddenCount }} {{ t('more') }}</a>
      </MpPopoverTrigger>
      <!-- 'compact' — every existing consumer's tinted header/footer, 260px popover. -->
      <MpPopoverContent
        v-if="variant === 'compact'"
        :class="css({ width: '260px', padding: '0', overflow: 'hidden' })"
        @blur="open = false" @escape="open = false"
      >
        <div class="etl-header">
          <span class="etl-header-title">{{ title ?? t('Values') }}</span>
          <button class="etl-close-btn" type="button" :aria-label="t('Close')" @click.stop="open = false">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
        <ul class="etl-list">
          <li v-for="tag in tags" :key="tag" class="etl-list-item">{{ tag }}</li>
        </ul>
        <div class="etl-footer">{{ t('Showing') }} {{ tags?.length ?? 0 }} {{ t('of') }} {{ tags?.length ?? 0 }} {{ t('values') }}</div>
      </MpPopoverContent>

      <!-- 'card' — plain white 400px card, bold title, bordered row table. -->
      <MpPopoverContent
        v-else
        :class="css({ width: '400px', padding: '24px', position: 'relative' })"
        @blur="open = false" @escape="open = false"
      >
        <button class="etl-card-close" type="button" :aria-label="t('Close')" @click.stop="open = false">
          <MpIcon name="close" size="sm" />
        </button>
        <span class="etl-card-title">{{ title ?? t('Values') }}</span>
        <div class="etl-card-table">
          <ul class="etl-card-list">
            <li v-for="tag in tags" :key="tag" class="etl-card-list-item">{{ tag }}</li>
          </ul>
          <div class="etl-card-footer">{{ t('Showing') }} {{ tags?.length ?? 0 }} {{ t('of') }} {{ tags?.length ?? 0 }} {{ t('values') }}</div>
        </div>
      </MpPopoverContent>
    </MpPopover>
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
  white-space: nowrap;
}

/* ── Popover — header/close, scrollable list, footer (ApprovalCommentPopover pattern) ── */
.etl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-bottom: 1px solid var(--mp-border-default);
}
.etl-header-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.etl-close-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  padding: 0; border: none; background: none;
  border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
  flex-shrink: 0;
}
.etl-close-btn:hover { background: var(--mp-background-neutral-hovered); }

.etl-list {
  margin: 0;
  padding: var(--mp-spacing-1) 0;
  max-height: 168px;
  overflow-y: auto;
  list-style: none;
}
.etl-list-item {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.etl-list-item:last-child { border-bottom: none; }

.etl-footer {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-top: 1px solid var(--mp-border-default);
}

/* ── 'card' variant (Figma "Popover / Values Info") — plain white surface,
   bold title, bordered row table. Close floats over the padded corner instead
   of sitting in a tinted header row. ── */
.etl-card-close {
  position: absolute; top: var(--mp-spacing-2); right: var(--mp-spacing-2);
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px);
  padding: 0; border: none; background: none;
  border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.etl-card-close:hover { color: var(--mp-text-default); }

.etl-card-title {
  display: block;
  margin-bottom: var(--mp-spacing-3, 12px);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-* resolve to unitless multipliers, not px — hardcode
     the Figma spec (line-height-xl = 32px) rather than trusting the var. */
  line-height: 32px;
  color: var(--mp-text-default);
}

.etl-card-table {
  height: 205px;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.etl-card-list {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.etl-card-list-item {
  height: 40px;
  padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2);
  display: flex;
  align-items: center;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.etl-card-footer {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral, #fff);
  border-top: 1px solid var(--mp-border-default);
}
</style>
