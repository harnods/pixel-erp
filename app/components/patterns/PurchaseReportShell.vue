<!-- prod-parity: jurnal-frontend-app/src/pages/reports/purchases_list/purchases_list.vue (filter bar, export, blank slates; shared by the three Purchases reports) -->
<script setup lang="ts">
/**
 * Shared chrome for the three Purchases reports (Reports › Purchases):
 * title bar with breadcrumb back to the Purchases tab, the prod filter bar
 * (Start date - End date / Period · primary button · Filter button with a
 * red dot once the drawer filters are applied · Export popover), the
 * "View example" link, and prod's blank slates (idle / not found).
 * The report table itself is the default slot.
 */
import { MpButton, MpIcon, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSkeleton, css } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import { infoToast } from '~/utils/toasts'

const props = withDefaults(defineProps<{
  id: string
  title: string
  range: Date[]
  state: 'idle' | 'loading' | 'ready'
  hasRows: boolean
  /** Prod: Purchase List says "Filter" / "More filter"; the v3 reports say "Show" / "Filter". */
  primaryLabel: string
  filterLabel: string
  filterActive: boolean
  showExample?: boolean
  error?: string
}>(), { showExample: false, error: '' })
const emit = defineEmits<{
  (e: 'update:range', v: Date[]): void
  (e: 'show'): void
  (e: 'open-filter'): void
}>()

const router = useRouter()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmt = (x: Date) => `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`
const caption = computed(() => { const [s, e] = props.range; return s && e ? `${fmt(s)} - ${fmt(e)}` : '' })
const EXPORT_TYPES = ['PDF', 'Excel', 'CSV']
function notInPrototype() { infoToast('Not in this prototype') }
</script>

<template>
  <div class="prr">
    <header class="prr-titlebar">
      <div class="prr-titlebar-left">
        <a class="prr-breadcrumb" role="link" tabindex="0" @click="router.push('/purchase-report')" @keydown.enter="router.push('/purchase-report')">Purchases</a>
        <h1 class="prr-title">{{ title }} <span class="prr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="prr-stage">
      <div class="prr-controls">
        <div class="prr-controls-left">
          <MpFormControl :id="`${id}-date-fc`" class="prr-datefield">
            <MpFormLabel>Start date - End date</MpFormLabel>
            <AdvancedDateRangePicker :id="`${id}-date`" :model-value="range" is-full-width hide-label period-mode @update:model-value="(v: Date[]) => emit('update:range', v)" />
          </MpFormControl>
          <MpButton is-rounded :is-loading="state === 'loading'" @click="emit('show')">{{ primaryLabel }}</MpButton>
          <MpButton variant="secondary" is-rounded class="prr-filter-btn" @click="emit('open-filter')">
            <span class="prr-filter-icon"><MpIcon name="filter" size="sm" /><span v-if="filterActive" class="prr-filter-dot" /></span>
            {{ filterLabel }}
          </MpButton>
          <slot name="controls-left" />
        </div>
        <div class="prr-controls-right">
          <slot name="controls-right" />
          <MpPopover :id="`${id}-export`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="secondary" is-rounded right-icon="caret-down">Export</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '120px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="x in EXPORT_TYPES" :key="x" @click="notInPrototype">{{ x }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="error" class="prr-error">{{ error }}</p>

      <div v-if="showExample" class="prr-example">
        <a class="prr-link" role="link" tabindex="0" @click="notInPrototype" @keydown.enter="notInPrototype"><MpIcon name="pdf-document" size="sm" /> View example</a>
      </div>

      <slot name="badges" />

      <div v-if="state === 'idle'" class="prr-empty prr-empty--idle">
        <img src="/illustrations/report-empty.png" alt="" class="prr-empty-img" width="240" height="200" />
        <p class="prr-empty-title">Report will appear here</p>
        <p class="prr-empty-desc">Select dates or period, then click <strong>{{ primaryLabel }}</strong> button.</p>
      </div>

      <template v-else>
        <div class="prr-report-head">
          <span class="prr-caption">{{ caption }}</span>
          <slot name="report-head-right" />
        </div>
        <div v-if="state === 'loading'" class="prr-skeleton">
          <MpSkeleton v-for="n in 6" :key="n" height="12px" rounded="sm" duration="0s" class="prr-skel" />
        </div>
        <slot v-else-if="hasRows" />
        <div v-else class="prr-empty">
          <img src="/illustrations/empty-folder.png" alt="" class="prr-empty-img" width="240" height="200" />
          <p class="prr-empty-title">There was no report data on this date/period</p>
          <p class="prr-empty-desc">Recheck the filter or select another date/period.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.prr { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.prr-titlebar { flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.prr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.prr-breadcrumb { align-self: flex-start; cursor: pointer; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-link); }
.prr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.prr-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.prr-title-cur { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.prr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-top-left-radius: var(--mp-radii-lg); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.prr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.prr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.prr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.prr-datefield { width: var(--mp-sizes-64, 256px); }
.prr-filter-btn :deep(> *) { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.prr-filter-icon { position: relative; display: inline-flex; }
.prr-filter-dot { position: absolute; top: calc(-1 * var(--mp-spacing-1)); right: calc(-1 * var(--mp-spacing-1)); width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px); border-radius: var(--mp-radii-full); background: var(--mp-colors-background-danger-bold, var(--mp-text-danger)); border: 1px solid var(--mp-background-stage); }
.prr-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.prr-example { display: flex; justify-content: flex-end; }
.prr-link { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.prr-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.prr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0 0; }
.prr-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.prr-skeleton { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4) 0; }
.prr-skel { background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

.prr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10) 0; text-align: center; }
.prr-empty--idle { padding: var(--mp-spacing-16, 64px) 0; }
.prr-empty-img { width: var(--mp-sizes-60, 240px); height: var(--mp-sizes-50, 200px); object-fit: contain; }
.prr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.prr-empty-desc strong { font-weight: var(--mp-font-weights-semi-bold); }
</style>

<!-- Report table styles shared by the three Purchases report pages (unscoped, prefixed). -->
<style>
.prr-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.prr-table { width: 100%; min-width: 960px; border-collapse: collapse; }
.prr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.prr-th--num, .prr-td--num { text-align: right; }
.prr-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top; }
.prr-td--num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.prr-td--nowrap { white-space: nowrap; }
.prr-td--type { white-space: nowrap; }
.prr-td--muted { color: var(--mp-text-secondary); }
.prr-row:hover .prr-td { background: var(--mp-background-neutral-subtle); }
.prr-row--group { cursor: pointer; }
.prr-row--group .prr-td { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.prr-row--sub .prr-td { font-weight: var(--mp-font-weights-semi-bold); }
.prr-row--sub .prr-td:first-child { box-shadow: inset 4px 0 0 var(--mp-colors-violet-400, var(--mp-border-brand)); }
.prr-row--total .prr-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-text-default); border-bottom: 1px solid var(--mp-text-default); }
.prr-group-name { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.prr-a { color: var(--mp-text-link); cursor: pointer; }
.prr-a:hover { text-decoration: underline; text-underline-offset: 2px; }
.prr-foot-note { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.prr-desc { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 220px; }
.prr-wrap { word-break: break-word; min-width: 160px; }
.prr-td--memo { min-width: 220px; }
.prr-td--name { min-width: 180px; }
</style>
