<script setup lang="ts">
/**
 * ErpTagList — MpTag chips clamped to 2 lines (rule/tag-list-mptag /
 * rule/tag-gray-only — chips are real MpTag, gray, md). When more tags
 * overflow than fit in two lines, a "View N more" link appears at the
 * bottom-right; clicking it opens a self-contained popover (header + close,
 * scrollable full list, "Showing X of X values" footer) listing every tag —
 * same controlled-popover pattern as ApprovalCommentPopover. Used in table
 * tag cells across all index pages.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, MpTag, css } from '@mekari/pixel3'

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
  /** Count-based overflow instead of the default 2-line wrap clamp — renders
   *  at most this many chips, hiding the rest behind the "more" link. Opt-in
   *  per consumer (e.g. Dimensions' Values column: max 7). */
  maxVisible?: number
  /** Text before the hidden count, e.g. "View 3 more" vs "Show 3 more".
   *  Defaults to 'View' (wrap-clamp consumers); count-based consumers can
   *  pass 'Show'. */
  moreLabel?: string
}>(), { title: undefined, id: undefined, variant: 'compact', maxVisible: undefined, moreLabel: 'View' })

const { t } = useLocale()

const popoverId = props.id ?? `erp-tags-more-${++uid}`

const countBased = computed(() => typeof props.maxVisible === 'number')
const visibleTags = computed(() => (countBased.value ? (props.tags ?? []).slice(0, props.maxVisible) : props.tags ?? []))

const rootEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const hiddenCount = ref(0)
const open = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  if (countBased.value) {
    const total = props.tags?.length ?? 0
    overflowing.value = total > (props.maxVisible ?? total)
    hiddenCount.value = Math.max(0, total - (props.maxVisible ?? total))
    return
  }
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
  if (!overflowing.value) { hiddenCount.value = 0; return }
  const maxHeight = el.clientHeight
  const chips = Array.from(el.querySelectorAll<HTMLElement>('[id^="erp-tag-"]'))
  const visible = chips.filter((c) => c.offsetTop + c.offsetHeight <= maxHeight + 1).length
  hiddenCount.value = Math.max(0, chips.length - visible)
}

onMounted(() => {
  nextTick(measure)
  if (!countBased.value) {
    resizeObserver = new ResizeObserver(() => measure())
    if (rootEl.value) resizeObserver.observe(rootEl.value)
  }
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
watch(() => props.tags, () => nextTick(measure))
</script>

<template>
  <div v-if="tags?.length" ref="rootEl" class="erp-tags" :class="{ 'erp-tags--count-based': countBased }">
    <MpTag v-for="(tag, i) in visibleTags" :id="`erp-tag-${i}`" :key="tag">{{ tag }}</MpTag>

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
        <a class="erp-tags-more" :class="{ 'erp-tags-more--label': countBased }" @click.stop="open = !open">{{ t(moreLabel) }} {{ hiddenCount }} {{ t('more') }}</a>
      </MpPopoverTrigger>
      <!-- 'compact' — every existing consumer's tinted header/footer, 260px popover. -->
      <MpPopoverContent
        v-if="variant === 'compact'"
        :class="css({ width: '260px', padding: '0', overflow: 'hidden' })"
        @blur="open = false" @escape="open = false"
      >
        <div class="etl-header">
          <span class="etl-header-title">{{ title ?? t('Values') }}</span>
          <MpButton class="etl-close-btn" type="button" variant="ghost" :aria-label="t('Close')" @click.stop="open = false">
            <MpIcon name="close" size="sm" />
          </MpButton>
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
        <MpButton class="etl-card-close" type="button" variant="ghost" :aria-label="t('Close')" @click.stop="open = false">
          <MpIcon name="close" size="sm" />
        </MpButton>
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
  overflow: hidden;                /* max-height set at runtime = 2 chip rows + gap */
  background: inherit;             /* so the "More" mask matches the row bg (incl. hover) */
}

/* Count-based overflow (maxVisible) doesn't clip via max-height, so the chips
   never grow past their natural height — the "more" link sits inline instead
   of needing to mask a clipped second line. */
.erp-tags--count-based {
  overflow: visible;
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
  white-space: nowrap;
}

/* Count-based overflow: link flows after the visible chips (Label/Regular,
   14px) instead of absolutely masking a clipped second line. */
.erp-tags-more--label {
  position: static;
  padding-left: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-regular, 400);
}

/* ── Popover — header/close, scrollable list, footer (ApprovalCommentPopover pattern) ── */
.etl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
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
.etl-close-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

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
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.etl-list-item:last-child { border-bottom: none; }

.etl-footer {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
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
  border: 1px solid var(--mp-border-default, #e3e7e9);
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
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
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
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
</style>
