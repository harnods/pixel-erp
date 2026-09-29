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
 */
import { defineComponent, h, type PropType } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'

export type PanelKind = 'intro' | 'step' | 'waiting' | 'closing'

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
    onNext: { type: Function as PropType<() => void>, required: true },
    onBack: { type: Function as PropType<() => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(p) {
    const block = (label: string, text: string) => h('div', { class: 'gt-block' }, [
      h('span', { class: 'gt-label' }, label),
      h('span', { class: 'gt-text' }, text),
    ])
    return () => h('div', { class: 'gt-panel', 'data-kind': p.kind }, [
      h('div', { class: 'gt-head' }, [
        h('span', { class: 'gt-caption' }, p.caption),
        h(MpButton, { class: 'gt-close', variant: 'ghost', isRounded: true, 'aria-label': 'Close tour', onClick: p.onClose }, () => h(MpIcon, { name: 'close', size: 'sm' })),
      ]),
      h('div', { class: 'gt-title' }, p.title),
      p.body ? h('p', { class: 'gt-body' }, p.body) : null,
      p.action ? block('Do this', p.action) : null,
      p.watch ? block('Notice', p.watch) : null,
      h('div', { class: 'gt-foot' }, [
        p.backLabel ? h(MpButton, { variant: 'ghost', isRounded: true, onClick: p.onBack }, () => p.backLabel) : null,
        p.nextLabel ? h(MpButton, { isRounded: true, onClick: p.onNext }, () => p.nextLabel) : null,
      ]),
    ])
  },
})
