import { ref } from 'vue'

/**
 * usePointerSortable — the ERP standard drag-to-reorder for a SINGLE-axis list
 * (rule/dnd-live-sortable). Pointer-based (not native HTML5 DnD, which proved
 * unreliable): press a handle → the item LIFTS into a floating ghost that tracks
 * the cursor → its place becomes a live-moving dashed placeholder so siblings
 * FLIP-slide to open the gap → release drops it.
 *
 * The composable owns the pointer math + ghost position/size; the consumer renders:
 *   • each item with `:class="{ 'is-dragging': dragIndex === i }"` (→ dashed slot),
 *   • a Teleported floating ghost positioned from `ghost` (content is the consumer's —
 *     usually `list[dragIndex]`), and
 *   • a `<TransitionGroup>` around the list for the FLIP slide.
 * Give the handle `touch-action: none; user-select: none`.
 *
 * `move(from, to)` mutates the underlying array (splice-move). `axis` is the layout
 * direction: 'x' for a row of columns (pipeline swimlanes), 'y' for a stacked list.
 */
export interface SortableGhost { x: number; y: number; w: number; h: number }

export function usePointerSortable(opts: {
  axis: 'x' | 'y'
  itemSelector: string
  move: (from: number, to: number) => void
}) {
  const dragIndex = ref<number | null>(null)   // live index of the dragged item (tracks it as it moves)
  const ghost = ref<SortableGhost | null>(null)
  let grabDX = 0
  let grabDY = 0

  function start(index: number, e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const item = (e.currentTarget as HTMLElement).closest(opts.itemSelector) as HTMLElement | null
    const container = item?.parentElement ?? null
    if (!item || !container) return
    const r = item.getBoundingClientRect()
    grabDX = e.clientX - r.left
    grabDY = e.clientY - r.top
    ghost.value = { x: r.left, y: r.top, w: r.width, h: r.height }
    dragIndex.value = index

    const onMove = (ev: PointerEvent) => {
      const from = dragIndex.value
      if (from === null || !ghost.value) return
      ghost.value.x = ev.clientX - grabDX
      ghost.value.y = ev.clientY - grabDY
      const items = Array.from(container.querySelectorAll<HTMLElement>(opts.itemSelector))
      // Insertion index: before the first item whose axis-midpoint is past the
      // cursor; past all → the end. (The dragged item's own placeholder is included.)
      let target = items.length
      for (let k = 0; k < items.length; k++) {
        const rr = items[k]!.getBoundingClientRect()
        const mid = opts.axis === 'x' ? rr.left + rr.width / 2 : rr.top + rr.height / 2
        const pos = opts.axis === 'x' ? ev.clientX : ev.clientY
        if (pos < mid) { target = k; break }
      }
      if (target > from) target -= 1        // account for the placeholder's own removal
      if (target === from) return
      opts.move(from, target)
      dragIndex.value = target
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragIndex.value = null
      ghost.value = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { dragIndex, ghost, start }
}
