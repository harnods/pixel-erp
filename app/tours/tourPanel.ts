/**
 * Guided tours: the panel a step renders inside MpTour.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry.
 *
 * A render function rather than a .vue file, because MpTour takes a render
 * callback and mounts it in an app of its own. Its styles live in
 * TourLauncher.vue, which is mounted whenever a tour can run.
 *
 * Step copy arrives as prose. The panel breaks it up so a step can be read at
 * a glance: one sentence per line, the figures picked out, and the Notice as a
 * list rather than a paragraph. Nothing here edits the copy; it only decides
 * how it is laid out, so every tour gets the same treatment.
 */
import { defineComponent, h, type PropType, type VNode } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'

export type PanelKind = 'intro' | 'step' | 'waiting' | 'closing'

/**
 * Split prose into lines a reader can take one at a time, one per sentence.
 * Indonesian figures use dots as thousand separators (Rp1.850.000.000,00), so
 * only a stop with whitespace after it ends a sentence. A semicolon joining a
 * clause long enough to stand alone also starts a line; a short tail stays put
 * rather than becoming an orphan.
 */
export function clauses(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    const parts = sentence.split(/;\s+/)
    parts.forEach((part, i) => {
      const t = part.trim()
      if (!t) return
      if (out.length && t.length < 25) { out[out.length - 1] += `; ${t}`; return }
      // A clause promoted to its own line is a sentence: it opens with a
      // capital and closes with a stop, or it reads as cut off.
      if (i > 0) { out.push(t.charAt(0).toUpperCase() + t.slice(1)); return }
      out.push(parts.length > 1 && !/[.!?]$/.test(t) ? `${t}.` : t)
    })
  }
  return out
}

/** Money, percentages and record codes, so the eye finds them without reading. */
const FIGURE = /(Rp\d[\d.]*(?:,\d+)?|\b\d+(?:[.,]\d+)?%|\b[A-Z]{2,4}-\d{3,}\b|\bv\d\b)/g

/** Every figure a line quotes, in order. Exported so the spec can check them. */
export function figures(text: string): string[] {
  return (text.match(FIGURE) ?? [])
}

/**
 * The closing recap's lines. A sentence listing three or more things it did
 * becomes bullets; everything else stays prose. Exported so the spec can check
 * every tour's recap without a DOM.
 */
export function recapItems(text: string): { kind: 'item' | 'line'; text: string }[] {
  const out: { kind: 'item' | 'line'; text: string }[] = []
  for (const sentence of clauses(text)) {
    const items = sentence
      .replace(/,\s+and\s+/g, ', ')
      .split(/,\s+(?=[a-z])/)
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter(Boolean)
    // Short comma-separated items are a rhetorical tail ("Same register,
    // three roles, one trail"), not a list of things that happened.
    if (items.length >= 3 && items.every((s) => s.length >= 20)) {
      for (const i of items) out.push({ kind: 'item', text: i })
    } else {
      out.push({ kind: 'line', text: sentence })
    }
  }
  return out
}

/** The line with its figures in a strong, tabular style. */
function withFigures(text: string): (string | VNode)[] {
  const out: (string | VNode)[] = []
  let last = 0
  for (const m of text.matchAll(FIGURE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(h('span', { class: 'gt-fig' }, m[0]))
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export const TourPanel = defineComponent({
  name: 'AssetTourPanel',
  props: {
    kind: { type: String as PropType<PanelKind>, required: true },
    caption: { type: String, required: true },
    title: { type: String, required: true },
    body: String,
    action: String,
    watch: String,
    nextLabel: String,
    backLabel: String,
    /** 1-based position, for the progress bar. Absent on the intro and closing panels. */
    stepNo: Number,
    stepTotal: Number,
    onNext: { type: Function as PropType<() => void>, required: true },
    onBack: { type: Function as PropType<() => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(p) {
    // A single line reads as a sentence; several read as a list.
    const block = (label: string, tone: string, text: string) => {
      const lines = clauses(text)
      return h('div', { class: `gt-block gt-block--${tone}` }, [
        h('span', { class: 'gt-label' }, label),
        lines.length > 1
          ? h('ul', { class: 'gt-list' }, lines.map((l) => h('li', { class: 'gt-item' }, withFigures(l))))
          : h('span', { class: 'gt-text' }, withFigures(text)),
      ])
    }
    const prose = (text: string) =>
      h('div', { class: 'gt-body' }, clauses(text).map((l) => h('p', { class: 'gt-line' }, withFigures(l))))

    /**
     * The closing recap is one long sentence listing everything the tour did.
     * As a paragraph it is unreadable; as a list of what happened it is the
     * summary the reader came for.
     */
    const recap = (text: string) =>
      h('div', { class: 'gt-body' }, (() => {
        const parts: VNode[] = []
        let bullets: VNode[] = []
        const flush = () => { if (bullets.length) { parts.push(h('ul', { class: 'gt-list' }, bullets)); bullets = [] } }
        for (const i of recapItems(text)) {
          if (i.kind === 'item') bullets.push(h('li', { class: 'gt-item' }, withFigures(i.text)))
          else { flush(); parts.push(h('p', { class: 'gt-line' }, withFigures(i.text))) }
        }
        flush()
        return parts
      })())

    return () => h('div', { class: 'gt-panel', 'data-kind': p.kind }, [
      h('div', { class: 'gt-head' }, [
        h('span', { class: 'gt-caption' }, p.caption),
        h(MpButton, { class: 'gt-close', variant: 'ghost', isRounded: true, 'aria-label': 'Close tour', onClick: p.onClose }, () => h(MpIcon, { name: 'close', size: 'sm' })),
      ]),
      p.stepNo && p.stepTotal
        ? h('div', { class: 'gt-progress' }, [h('div', { class: 'gt-progress-fill', style: { width: `${(p.stepNo / p.stepTotal) * 100}%` } })])
        : null,
      h('div', { class: 'gt-scroll' }, [
        h('div', { class: 'gt-title' }, p.title),
        p.body ? (p.kind === 'closing' ? recap(p.body) : prose(p.body)) : null,
        p.action ? block('Do this', 'action', p.action) : null,
        p.watch ? block('What changed', 'watch', p.watch) : null,
      ]),
      h('div', { class: 'gt-foot' }, [
        p.backLabel ? h(MpButton, { variant: 'ghost', isRounded: true, onClick: p.onBack }, () => p.backLabel) : null,
        p.nextLabel ? h(MpButton, { isRounded: true, onClick: p.onNext }, () => p.nextLabel) : null,
      ]),
    ])
  },
})
