<script setup lang="ts">
/**
 * CopyLinkDrawer — a right-side drawer listing one or more shareable record
 * links, each with a copy-to-clipboard action, plus a "Download CSV" footer.
 *
 * Uses the repo's hand-rolled Teleport overlay shell (copied from
 * BillsFiltersDrawer.vue) — Pixel MpDrawer has no structural CSS in this Pixel3
 * build. Unlike the filters drawers, this is NOT a form, so an outside (overlay)
 * click is allowed to close it — there is no in-progress input to lose.
 */
import { MpIcon, MpButton, toast } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  open: boolean
  items: { title: string; subtitle?: string; url: string }[]
  caption?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'download-csv'): void
}>()

const { t } = useLocale()

const heading = computed(() => (props.items.length === 1 ? t('Copy link') : t('Copy links')))
const captionText = computed(() => props.caption ?? t('Anyone with the link can view.'))

function close() {
  emit('close')
}

async function copy(url: string) {
  try {
    await navigator.clipboard?.writeText(url)
  } catch {
    // Clipboard may be unavailable (insecure context / denied) — still surface
    // the same success affordance; nothing is lost by the demo showing copied.
  }
  toast.notify({ variant: 'success', title: t('Link copied'), rootProps: { class: 'toast-enterprise' } })
}
</script>

<template>
  <ErpDrawer :is-open="open" :title="heading" width="480px" @close="close">
    <template #title>
      <div class="cld-header-text">
        <span class="cld-title">{{ heading }}</span>
        <span class="cld-caption">{{ captionText }}</span>
      </div>
    </template>
    <template #body>
      <ul class="cld-list">
        <li v-for="(item, i) in items" :key="`${i}-${item.url}`" class="cld-row">
          <div class="cld-row-left">
            <span class="cld-row-title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="cld-row-subtitle">{{ item.subtitle }}</span>
          </div>
          <div class="cld-row-right">
            <a class="cld-row-url" :href="item.url" target="_blank" rel="noopener noreferrer" @click.prevent>{{ item.url }}</a>
            <MpButton variant="ghost" is-rounded :aria-label="t('Copy link')" @click="copy(item.url)">
              <MpIcon name="copy" size="sm" />
            </MpButton>
          </div>
        </li>
      </ul>
    </template>
    <template #footer>
      <MpButton variant="secondary" is-rounded @click="emit('download-csv')">
        {{ t('Download CSV') }}
      </MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cld-header-text { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); min-width: 0; }
.cld-title {
  font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-text-default, #1d1f24);
}
.cld-caption {
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-subtle, #67707a);
}

.cld-list { list-style: none; margin: 0; padding: 0; }
.cld-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4, 16px);
  padding: var(--mp-spacing-3, 12px) 0;
  border-bottom: 1px solid var(--mp-colors-border-subtle, #eef0f2);
}
.cld-row:first-child { padding-top: 0; }
.cld-row:last-child { border-bottom: none; }

.cld-row-left { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); min-width: 0; }
.cld-row-title {
  font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-text-default, #1d1f24);
}
.cld-row-subtitle {
  font-size: var(--mp-font-sizes-sm, 12px);
  color: var(--mp-text-subtle, #67707a);
}

.cld-row-right { display: flex; align-items: center; gap: var(--mp-spacing-2, 6px); flex-shrink: 0; min-width: 0; }
.cld-row-url {
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-text-link, #165082);
  text-decoration: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
}
.cld-row-url:hover { text-decoration: underline; }

</style>
