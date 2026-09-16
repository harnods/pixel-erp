<script setup lang="ts">
/**
 * "Start work order" — subcontracting variant.
 *
 * Starting a subcon work order is not just a status change: it unlocks the
 * documents that actually get materials to the vendor and the work bought. Which
 * documents those are depends on the order's supply method, so rather than
 * starting silently and leaving the user to find the right form in another
 * module, this asks which one to raise first and takes them straight there with
 * the form filled in.
 *
 * The goods receipt is not offered — it is raised when the vendor returns the
 * goods, not when the order begins (see `raisableDocuments`).
 *
 * NOT MpModal. `rule/modal-use-mpmodal` calls the "MpModal has no CSS" claim a
 * myth, but in THIS Pixel build it is real and measurable: an open MpModal's
 * `.mp-modal__rootChild` stays `position: static` (no fixed/inset/z-index layer)
 * and its `.mp-modal__contentChild` never leaves the enter animation — still
 * `opacity: 0`, `scale(0.95)` seconds later, rendered inline below the fold.
 * Verified on the shipped `ConfirmModal` (BOM ▸ Archive), so every MpModal in
 * the app is affected, not just this one. The hand-rolled Teleport overlay is
 * what actually works here — same shell as CompleteWorkOrderModal.vue, which is
 * already used by this very page. See the amended rule in docs/design/RULES.md.
 */
import { MpButton, MpButtonGroup, MpRadio, MpIcon } from '@mekari/pixel3'
import { raisableDocuments, type SubconDocKind, type SubconScope, type SubconSplit, type SubconMethod } from '~/data/subcon'

const props = defineProps<{
  isOpen: boolean
  scope: SubconScope
  split: SubconSplit
  method: SubconMethod
  vendorName: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  /** Start the work order and open this document's form, prefilled. */
  (e: 'start', kind: SubconDocKind): void
  /** Start the work order without raising anything yet. */
  (e: 'startOnly'): void
}>()

const { t } = useLocale()

const documents = computed(() => raisableDocuments(props.scope, props.split, props.method))

const selected = ref<SubconDocKind | ''>('')

// Default to the first document in the chain — the one that comes first is the
// one you almost always want, and pre-selecting it saves a click.
watch(() => props.isOpen, (open) => {
  if (open) selected.value = documents.value[0]?.kind ?? ''
}, { immediate: true })

function close() { emit('update:isOpen', false) }

function confirm() {
  if (!selected.value) { emit('startOnly'); return }
  emit('start', selected.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ssw">
      <!-- The overlay ignores clicks and there is no Esc listener: a modal closes
           only via its × (rule/modal-drawer-close-explicit-only), so an
           in-progress choice is never lost to a stray click. -->
      <div v-if="isOpen" class="ssw-overlay">
        <div class="ssw-panel" role="dialog" :aria-label="t('Start work order')">
          <header class="ssw-header">
            <h2 class="ssw-title">{{ t('Start work order') }}</h2>
            <button class="ssw-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="ssw-body">
            <p class="ssw-desc">
              {{ t('Starting this work order lets it raise the documents below. Pick the one to create now — you can raise the rest afterwards.') }}
            </p>

            <ul class="ssw-list">
              <li v-for="(doc, i) in documents" :key="doc.kind">
                <label class="ssw-option" :class="{ 'ssw-option--selected': selected === doc.kind }">
                  <MpRadio
                    :id="`ssw-${doc.kind}`"
                    name="ssw-doc"
                    :value="doc.kind"
                    :is-checked="selected === doc.kind"
                    @change="selected = doc.kind"
                  />
                  <span class="ssw-option__text">
                    <span class="ssw-option__title">
                      {{ t(doc.title) }}
                      <span class="ssw-option__tag" :class="`ssw-option__tag--${doc.tag.toLowerCase()}`">{{ t(doc.tag) }}</span>
                    </span>
                    <span class="ssw-option__detail">{{ t(doc.detail) }}</span>
                    <span class="ssw-option__meta">
                      {{ t('Step') }} {{ i + 1 }} · {{ t(doc.module) }} · {{ vendorName }}
                    </span>
                  </span>
                </label>
              </li>
            </ul>

            <!-- Starting without raising anything is legitimate: the paperwork may
                 already exist outside the system, or be someone else's job. -->
            <label class="ssw-option ssw-option--plain" :class="{ 'ssw-option--selected': selected === '' }">
              <MpRadio
                id="ssw-none"
                name="ssw-doc"
                value=""
                :is-checked="selected === ''"
                @change="selected = ''"
              />
              <span class="ssw-option__text">
                <span class="ssw-option__title">{{ t('Just start the work order') }}</span>
                <span class="ssw-option__detail">{{ t('Raise the documents later from the work order.') }}</span>
              </span>
            </label>
          </div>

          <footer class="ssw-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="confirm">
                {{ selected ? t('Start & create document') : t('Start work order') }}
              </MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ssw-enter-active, .ssw-leave-active { transition: opacity 200ms ease; }
.ssw-enter-from, .ssw-leave-to { opacity: 0; }
.ssw-enter-active .ssw-panel, .ssw-leave-active .ssw-panel { transition: transform 200ms ease, opacity 200ms ease; }
.ssw-enter-from .ssw-panel, .ssw-leave-to .ssw-panel { transform: scale(0.97); opacity: 0; }

.ssw-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.ssw-panel {
  width: min(560px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}
.ssw-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.ssw-title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ssw-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.ssw-close:hover { background: var(--mp-background-neutral-hovered); }
.ssw-body { padding: var(--mp-spacing-5); }
.ssw-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ssw-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}

.ssw-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  margin: var(--mp-spacing-4) 0 0; padding: 0; list-style: none;
}

.ssw-option {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-default, #fff);
  cursor: pointer;
}
.ssw-option:hover { background: var(--mp-background-neutral-hovered); }
.ssw-option--selected {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-information, #eef0fc);
}
.ssw-option--plain { margin-top: var(--mp-spacing-2); }

.ssw-option__text { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.ssw-option__title {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ssw-option__tag {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  border-radius: var(--mp-radii-sm); padding: 0 var(--mp-spacing-1\.5);
}
.ssw-option__tag--pr { background: var(--mp-background-information, #eef0fc); color: var(--mp-text-link); }
.ssw-option__tag--transfer { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-text-warning, #b54708); }
.ssw-option__detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ssw-option__meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle, #75808f); }
</style>
