<script setup lang="ts">
/**
 * The body shared by ConvertPrToPoModal and BulkConvertPrToPoModal: banner,
 * ship-to select, header summary and ONE form table of order lines with the
 * vendor as an editable column (docs/patterns/FormTable.md). The parent owns the
 * plan, the edits and the footer; this renders them.
 *
 * Rules: rule/table-header-uppercase, rule/table-outer-border-bold,
 * rule/table-form-cell-no-border, rule/table-nonform-bg-gray,
 * rule/table-form-header-white, rule/select-erpfilterselect,
 * rule/form-errors-inline, rule/copy-id-translations.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpFormControl, MpFormLabel,
  MpInput, MpIcon, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList,
  MpPopoverListItem, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import type { DraftPoGroup, DraftPoLine, SkippedLine } from '~/data/replenishmentDraftPo'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{
  idPrefix: string
  bannerTitle: string
  bannerDescription: string
  /** Header summary fields; the last one is the total value. */
  summary: { label: string; value: string | number }[]
  warehouseId: string
  warehouseOptions: { value: string; label: string }[]
  /** Header of the read-only need column ("Needed" / "Merged need"). */
  needLabel: string
  groups: DraftPoGroup[]
  skipped: SkippedLine[]
  /** Row order — a vendor change re-groups the plan but must not move a row. */
  skuOrder: string[]
  /** Linked vendors for a product, already formatted as one line each. */
  vendorOptions: (sku: string) => { vendorId: string; label: string }[]
  /** Short notes under the vendor (rounding, merged sources). */
  notesFor: (line: DraftPoLine) => string[]
  skipLabel: (reason: SkippedLine['reason']) => string
  pendingRecommend: Record<string, { from: number; to: number; vendorName: string | null }>
  showQtyErrors: boolean
  /** What the user typed, by SKU — the plan rounds a typed 0 back up, so the error reads this. */
  qtyOverrides: Record<string, number>
  error: string
  emptyText: string
}>()
const emit = defineEmits<{
  (e: 'update:warehouseId', v: string): void
  (e: 'choose-vendor', sku: string, vendorId: string): void
  (e: 'set-qty', sku: string, raw: string): void
  (e: 'apply', sku: string): void
  (e: 'dismiss', sku: string): void
}>()

const { t, tf } = useLocale()

const lines = computed(() => {
  const bySku = new Map<string, { line: DraftPoLine; leadTimeDays: number; vendorName: string }>()
  for (const g of props.groups) {
    for (const line of g.lines) bySku.set(line.sku, { line, leadTimeDays: g.leadTimeDays, vendorName: g.vendorName })
  }
  return props.skuOrder.map((s) => bySku.get(s)).filter((x): x is NonNullable<typeof x> => !!x)
})

/** Skipped products sit just before the total, so the total stays the last field. */
const fields = computed(() => {
  if (!props.skipped.length) return props.summary
  return [...props.summary.slice(0, -1), { label: t('Skipped products'), value: props.skipped.length }, ...props.summary.slice(-1)]
})

function pendingNote(sku: string): string {
  const p = props.pendingRecommend[sku]
  if (!p) return ''
  return p.vendorName
    ? tf('Suggested qty for {vendor} is {to}. Your qty is {from}', { vendor: p.vendorName, to: p.to, from: p.from })
    : tf('Suggested qty without a vendor is {to}. Your qty is {from}', { to: p.to, from: p.from })
}
</script>

<template>
  <MpBanner :id="`${idPrefix}-banner`" variant="info" align-items="center">
    <MpBannerIcon :id="`${idPrefix}-banner-icon`" />
    <MpBannerTitle>{{ bannerTitle }}</MpBannerTitle>
    <MpBannerDescription>{{ bannerDescription }}</MpBannerDescription>
  </MpBanner>

  <!-- Header summary: key/value pairs are ContentList (docs/patterns/ContentList.md). -->
  <div v-if="lines.length" class="dpf-summary" :style="{ '--dpf-cols': fields.length }">
    <ContentList v-for="f in fields" :key="f.label" :label="f.label" :value="f.value" />
  </div>
  <p v-else class="dpf-empty">{{ emptyText }}</p>

  <!-- Ship-to: one per conversion — a PO has a single ship-to warehouse. -->
  <MpFormControl :id="`${idPrefix}-ship-to`" class="dpf-shipto">
    <MpFormLabel>{{ t('Ship to') }}</MpFormLabel>
    <ErpFilterSelect
      :id="`${idPrefix}-warehouse`"
      :model-value="warehouseId"
      :placeholder="t('Warehouse')"
      :options="warehouseOptions"
      width="280px"
      :is-clearable="false"
      @update:model-value="(v: string) => emit('update:warehouseId', v)"
    />
  </MpFormControl>

  <div v-if="lines.length" class="dpf-card">
    <div class="dpf-table-scroll">
      <table class="dpf-table">
        <colgroup>
          <col>
          <col class="dpf-col-vendor">
          <col class="dpf-col-qty">
          <col class="dpf-col-qty">
          <col class="dpf-col-unit">
          <col class="dpf-col-value">
        </colgroup>
        <thead>
          <tr>
            <th class="dpf-th">{{ t('Product') }}</th>
            <th class="dpf-th">{{ t('Vendor') }}</th>
            <th class="dpf-th dpf-th--num">{{ needLabel }}</th>
            <th class="dpf-th dpf-th--num">{{ t('Order qty') }}</th>
            <th class="dpf-th">{{ t('Unit') }}</th>
            <th class="dpf-th dpf-th--num">{{ t('Estimated value') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ line, leadTimeDays, vendorName } in lines" :key="line.sku" class="dpf-tr">
            <td class="dpf-td">
              <span class="dpf-product">{{ line.productName }}</span>
              <span class="dpf-sub">{{ line.sku }}</span>
            </td>

            <!-- Vendor: select-like cell (FormTable.md › Select / Search Cell). -->
            <td class="dpf-td dpf-td--select">
              <MpPopover
                :id="`${idPrefix}-vendor-${line.sku}`"
                is-close-on-select
                use-portal
                :is-keep-alive="false"
                placement="bottom-start"
              >
                <MpPopoverTrigger>
                  <div class="dpf-vendor-trigger" role="button" tabindex="0">
                    <span class="dpf-vendor-text">
                      <span class="dpf-vendor-name">{{ vendorName }}</span>
                      <span class="dpf-sub">{{ tf('Lead time: {n} days', { n: leadTimeDays }) }}</span>
                    </span>
                    <MpIcon name="chevrons-down" size="sm" class="dpf-vendor-chevron" />
                  </div>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="opt in vendorOptions(line.sku)"
                      :key="opt.vendorId"
                      :is-active="opt.vendorId === line.vendorId"
                      @click="emit('choose-vendor', line.sku, opt.vendorId)"
                    >{{ opt.label }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <span v-for="n in notesFor(line)" :key="n" class="dpf-note">{{ n }}</span>
            </td>

            <td class="dpf-td dpf-td--num">{{ line.needStock }}</td>
            <td class="dpf-td dpf-td--input" :class="{ 'dpf-td--error': showQtyErrors && (qtyOverrides[line.sku] ?? 1) <= 0 }">
              <MpInput
                :id="`${idPrefix}-qty-${line.sku}`"
                :model-value="String(line.finalQty)"
                type="number"
                :aria-label="t('Order qty')"
                @update:model-value="(v: string) => emit('set-qty', line.sku, v)"
              />
              <!-- Offered, never applied behind the user's back. -->
              <span v-if="pendingRecommend[line.sku]" class="dpf-note dpf-note--prompt">
                {{ pendingNote(line.sku) }}
                <span class="dpf-note-actions">
                  <MpTextlink :id="`${idPrefix}-apply-${line.sku}`" as="a" class="dpf-link" @click.prevent="emit('apply', line.sku)">{{ t('Use suggested qty') }}</MpTextlink>
                  <MpTextlink :id="`${idPrefix}-keep-${line.sku}`" as="a" class="dpf-link" @click.prevent="emit('dismiss', line.sku)">{{ t('Keep my qty') }}</MpTextlink>
                </span>
              </span>
            </td>
            <td class="dpf-td">{{ line.purchaseUnit }}</td>
            <td class="dpf-td dpf-td--num">{{ formatIDR(line.finalQty * line.unitCost) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Skipped lines are listed, never silently dropped. -->
  <section v-if="skipped.length" class="dpf-card">
    <header class="dpf-card-head">
      <h3 class="dpf-card-title">{{ tf('Skipped products: {n}', { n: skipped.length }) }}</h3>
    </header>
    <ul class="dpf-skip-list">
      <li v-for="s in skipped" :key="s.sku" class="dpf-skip-item">
        <span class="dpf-product">{{ s.productName }}</span>
        <span class="dpf-sub">{{ s.sku }}</span>
        <span class="dpf-note">{{ skipLabel(s.reason) }}</span>
      </li>
    </ul>
  </section>

  <!-- Errors sit below the form, never in a toast (rule/form-errors-inline). -->
  <p v-if="error" class="dpf-error" role="alert">{{ error }}</p>
</template>

<style scoped>
.dpf-shipto { margin-top: var(--mp-spacing-2); }
.dpf-empty { margin-top: var(--mp-spacing-4); color: var(--mp-text-secondary); }

/* ContentList carries its own 8px rhythm, so no row gap. */
.dpf-summary {
  display: grid; grid-template-columns: repeat(var(--dpf-cols, 4), minmax(0, 1fr));
  column-gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-2);
}

/* Boxed table inside a modal: bold outer edge, default inner rules (rule/table-outer-border-bold). */
.dpf-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.dpf-card-head {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.dpf-card-title {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}

.dpf-table-scroll { overflow-x: auto; }
.dpf-table { width: 100%; min-width: 760px; table-layout: fixed; border-collapse: collapse; }
.dpf-col-vendor { width: 200px; }
.dpf-col-qty { width: 128px; }
.dpf-col-unit { width: 72px; }
.dpf-col-value { width: 168px; }

.dpf-th {
  height: var(--mp-sizes-7);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; text-align: left; white-space: nowrap;
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.dpf-th:first-child, .dpf-td:first-child { padding-left: var(--mp-spacing-4); }
.dpf-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.dpf-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.dpf-td:last-child { border-right: none; }
.dpf-tr:last-child .dpf-td { border-bottom: none; }
.dpf-td--num {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* Editable cells: white, the cell owns border + focus ring (rule/table-form-cell-no-border). */
.dpf-td--input, .dpf-td--select { padding: 0; background: var(--mp-background-neutral); position: relative; }
.dpf-td--input :deep([class*='input']) {
  width: 100%; height: var(--mp-sizes-10);
  border-color: transparent; border-radius: 0; box-shadow: none !important; /* pixel-police-allow-shadow: strips the input's own ring, the cell draws it */
  text-align: right; font-variant-numeric: tabular-nums;
}
.dpf-td--input:focus-within::after, .dpf-td--select:focus-within::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-border-bold); pointer-events: none;
}
.dpf-td--input.dpf-td--error { background: var(--mp-colors-background-danger); }
.dpf-td--error::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10);
  border: 1px solid var(--mp-colors-border-danger); pointer-events: none;
}
.dpf-td--error :deep([class*='input']) { background: transparent; }

.dpf-vendor-trigger {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  cursor: pointer;
}
.dpf-vendor-text { display: flex; flex-direction: column; min-width: 0; }
.dpf-vendor-name { overflow-wrap: anywhere; }
.dpf-vendor-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5); }
.dpf-td--select .dpf-note { padding: 0 var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); }

.dpf-product { display: block; }
.dpf-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.dpf-link { display: inline-block; margin-left: calc(-1 * var(--mp-spacing-0\.5)); }
.dpf-note {
  display: block; margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning);
}
.dpf-note--prompt { padding: var(--mp-spacing-1) var(--mp-spacing-2); color: var(--mp-colors-text-information); }
.dpf-note-actions { display: flex; gap: var(--mp-spacing-3); }

/* A real list, so it keeps its markers (CLAUDE.md › List bullets). */
.dpf-skip-list {
  list-style: disc outside; margin: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-8);
}
.dpf-skip-item { display: list-item; padding: var(--mp-spacing-1) 0; font-size: var(--mp-font-sizes-md); }

.dpf-error { margin-top: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
