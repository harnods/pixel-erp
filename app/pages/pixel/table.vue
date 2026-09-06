<script setup lang="ts">
import { ref } from 'vue'
import {
  MpBadge, MpButton, MpButtonGroup, MpTooltip, MpIcon, MpInput,
  MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage from '~/components/patterns/ErpTablePage.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import PopoverSelect from '~/components/patterns/PopoverSelect.vue'
import { COLUMN_WIDTH } from '~/components/patterns/columnWidths'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Table · Pixel 3 Enterprise' })

// ── Column-width standard (kind → [min,max]) — source of truth columnWidths.ts ──
const WIDTHS = Object.entries(COLUMN_WIDTH).map(([kind, w]) => ({
  kind,
  min: w.minWidth,
  max: w.maxWidth,
  fixed: w.minWidth === w.maxWidth,
}))

// filter-bar demo state (index table always has a filter bar + pagination)
const fStatus = ref('')
const search = ref('')

// progressive-loading demo (embedded line-items → bordered internal-scroll panel)
const ALL_PROG = Array.from({ length: 124 }, (_, i) => ({
  sku: `SKU-${1000 + i}`, name: `Product ${i + 1}`, qty: (i % 20) + 1,
}))
const PAGE = 10
// variant A — explicit "Load more" text-link
const shownMore = ref(PAGE)
function loadMore() { shownMore.value = Math.min(shownMore.value + PAGE, ALL_PROG.length) }
// variant B — auto lazy-load on scroll to bottom
const shownLazy = ref(PAGE)
function onLazyScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && shownLazy.value < ALL_PROG.length) {
    shownLazy.value = Math.min(shownLazy.value + PAGE, ALL_PROG.length)
  }
}

// ── 1. Basic index table (real ErpTablePage) ────────────────────────────────
const columns = [
  { key: 'date', label: 'Order date', kind: 'date', sortType: 'date' },
  { key: 'number', label: 'Order number', kind: 'number', sortType: 'text' },
  { key: 'customer', label: 'Customer', kind: 'name', sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'tags', label: 'Tags', kind: 'tags' },
  { key: 'amount', label: 'Total', kind: 'amount', align: 'right', sortType: 'number' },
]
const STATUSES = [
  { s: 'completed', l: 'Paid' }, { s: 'warning', l: 'Pending' }, { s: 'announcement', l: 'Draft' },
  { s: 'information', l: 'Sent' }, { s: 'critical', l: 'Voided' },
]
const CUSTOMERS = ['Anomali Coffee', 'PT Maju Jaya', 'CV Sinar Abadi', 'Toko Kopi Nusantara', 'PT Berkah Abadi']
const TAGSETS = [['Wholesale', 'Priority'], ['Net-30', 'Jakarta', 'Recurring', 'VIP'], ['Retail'], ['Export'], ['Wholesale']]
// one page of 10 rows; total 30 → 3 pages (shows both pagination groups)
const rows = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  date: `${String(23 - (i % 20)).padStart(2, '0')}/06/2026`,
  number: `SO-2026-0${187 - i}`,
  customer: CUSTOMERS[i % CUSTOMERS.length],
  status: STATUSES[i % STATUSES.length].s,
  statusLabel: STATUSES[i % STATUSES.length].l,
  tags: TAGSETS[i % TAGSETS.length],
  amount: `Rp ${(12500000 - i * 350000).toLocaleString('id-ID')}`,
}))
const TOTAL = 30
const bulkOpen = ref(false)

// 40px product photo placeholder (inventory index uses a 40px thumbnail)
const PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='6' fill='%23e3e7e9'/><path d='M12 27l6-7 4 5 3-4 5 6z' fill='%23b7c0c2'/><circle cx='15' cy='15' r='3' fill='%23b7c0c2'/></svg>"

// ── 2. Form table ────────────────────────────────────────────────────────────
const items = ref([
  { id: 'a', name: 'Arabica beans 1kg', qty: '10', price: '120000' },
  { id: 'b', name: 'Robusta beans 1kg', qty: '5', price: '90000' },
])
const units = ['kg', 'pcs', 'box']
const unit = ref('kg')
function amount(it: { qty: string; price: string }) {
  const n = (Number(it.qty) || 0) * (Number(it.price) || 0)
  return 'Rp ' + n.toLocaleString('id-ID')
}
// drag-to-reorder + remove (mirrors /expenses/new line-item table)
const ftDrag = ref<number | null>(null)   // source row being dragged
const ftOver = ref<number | null>(null)   // row currently hovered as drop target
function ftDragStart(i: number) { ftDrag.value = i }
function ftDragOver(i: number) { ftOver.value = i }
function ftDragEnd() { ftDrag.value = null; ftOver.value = null }
function ftDrop(i: number) {
  const f = ftDrag.value
  if (f === null || f === i) { ftDragEnd(); return }
  const a = [...items.value]
  const [m] = a.splice(f, 1)
  a.splice(i, 0, m)
  items.value = a
  ftDragEnd()
}
function ftRemove(id: string) { items.value = items.value.filter((x) => x.id !== id) }

// ── 5. Accordion table ───────────────────────────────────────────────────────
const groups = [
  { id: 'g1', product: 'Arabica beans 1kg', sku: 'ARB-1KG', batches: [
    { batch: 'B-2401', qty: 40, exp: '30/09/2026' },
    { batch: 'B-2402', qty: 25, exp: '31/10/2026' },
  ] },
  { id: 'g2', product: 'Robusta beans 1kg', sku: 'ROB-1KG', batches: [
    { batch: 'B-2501', qty: 60, exp: '15/11/2026' },
  ] },
]
const open = ref<Set<string>>(new Set(['g1']))
function toggle(id: string) {
  const s = new Set(open.value)
  s.has(id) ? s.delete(id) : s.add(id)
  open.value = s
}
</script>

<template>
  <div>
    <DemoHeader title="Table" tag="ErpTablePage + variants"
      lead="Every index/list page is ErpTablePage (never MpTable, never a hand-rolled &lt;table&gt;) — it carries the column-width standard, sorting, pagination, the merged row-checkbox, the header bulk-action bar, and the sticky-right actions column. Header is 28px, UPPERCASE, 12px semibold. The specialised variants below (form / sticky / merged / accordion) are the sanctioned extensions where ErpTablePage can't reach; each still follows the table rules."
      :rules="['rule/table-use-erptablepage', 'rule/table-column-kind', 'rule/table-checkbox-first-cell', 'rule/table-header-uppercase', 'rule/table-header-height']" />

    <DemoSection title="Column-width standard — set `kind`, never a pixel width"
      desc="Each semantic column declares a `kind`; the width comes from columnWidths.ts (the source of truth), resolved to a [min,max] range so columns grow to max and a flexible spacer soaks up the rest. Never hardcode a pixel width on a semantic column."
      :rules="['rule/table-column-kind']"
      code="{ key: 'total', label: 'Total', kind: 'amount', align: 'right' }  // width from the table below">
      <table class="wtbl">
        <thead><tr><th>Kind</th><th>Min</th><th>Max</th><th>Notes</th></tr></thead>
        <tbody>
          <tr v-for="w in WIDTHS" :key="w.kind">
            <td>{{ w.kind }}</td>
            <td>{{ w.min }}</td>
            <td>{{ w.max }}</td>
            <td>{{ w.fixed ? 'fixed' : '' }}</td>
          </tr>
        </tbody>
      </table>
    </DemoSection>

    <DemoSection title="1 · Basic index table — ErpTablePage"
      desc="An index table ALWAYS has a filter bar (#filters) and pagination (both built in). Header is gray (neutral-subtle), no outer border. Columns declare a semantic `kind` → widths from columnWidths.ts. Row checkbox merged into the FIRST cell (12px gap) — no separate column. Transaction number & customer are span links (hover underline). Status = MpBadge, tags = ErpTagList, amount right-aligned, kebab actions flush right. Select a row → header bulk-action bar."
      :rules="['rule/table-use-erptablepage', 'rule/table-full-width', 'rule/table-column-kind', 'rule/table-filter-bar-pagination', 'rule/table-actions-column', 'rule/table-row-hover', 'rule/table-cell-text-plain', 'rule/table-bg-white', 'rule/table-name-link-span', 'rule/table-bulk-actions-bar']"
      code="<ErpTablePage :columns=&quot;columns&quot; :rows=&quot;rows&quot; :total=&quot;rows.length&quot;
  :current-page=&quot;1&quot; has-checkbox bulk-label=&quot;order&quot;&gt;
  <template #cell-number=&quot;{ row }&quot;><span class=&quot;cell-link&quot;>{{ row.number }}</span></template>
  <template #cell-status=&quot;{ row }&quot;><MpBadge for=&quot;tableStatus&quot; :type=&quot;row.status&quot;>{{ row.statusLabel }}</MpBadge></template>
  <template #cell-tags=&quot;{ row }&quot;><ErpTagList :tags=&quot;row.tags&quot; /></template>
  <template #bulk-actions=&quot;{ count, deselectAll }&quot;>…bulk buttons…</template>
  <template #actions&gt;…kebab…</template>
</ErpTablePage>">
      <ErpTablePage :columns="columns" :rows="rows" :total="TOTAL" :current-page="1" :per-page="10" has-checkbox bulk-label="order">
        <template #filters>
          <!-- LEFT: quick filter + All filters -->
          <div class="fb-left">
            <PopoverSelect id="tbl-status" v-model="fStatus" :options="['Paid','Pending','Draft','Sent','Voided']" placeholder="Status" width="12rem" />
            <MpButton variant="secondary" left-icon="filter" is-rounded>All filters</MpButton>
          </div>
          <!-- RIGHT: AI · column settings · export (icon group) + pill search -->
          <div class="fb-right">
            <MpButtonGroup>
              <MpTooltip label="Ask Airene"><MpButton variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded /></MpTooltip>
              <MpTooltip label="Column settings"><MpButton variant="ghost" left-icon="table-view-column" aria-label="Column settings" is-rounded /></MpTooltip>
              <MpTooltip label="Export"><MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded /></MpTooltip>
            </MpButtonGroup>
            <MpInputGroup id="tbl-search" class="fb-search">
              <MpInputLeftAddon><MpIcon name="search" size="sm" /></MpInputLeftAddon>
              <MpInput v-model="search" placeholder="Search..." />
              <MpInputRightAddon v-if="search"><div class="fb-clear" role="button" tabindex="0" aria-label="Clear search" @click="search=''"><MpIcon name="close" size="sm" /></div></MpInputRightAddon>
            </MpInputGroup>
          </div>
        </template>
        <template #cell-number="{ row }"><span class="cell-link">{{ row.number }}</span></template>
        <template #cell-customer="{ row }"><span class="cell-link">{{ row.customer }}</span></template>
        <template #cell-status="{ row }"><MpBadge for="tableStatus" :type="row.status">{{ row.statusLabel }}</MpBadge></template>
        <template #cell-tags="{ row }"><ErpTagList :tags="row.tags" /></template>
        <!-- Bulk bar buttons are ALWAYS secondary + sm — never primary. Default is an
             "Actions" secondary-sm dropdown; the actions live inside it. The far-right
             "Press Esc to deselect" is ErpTablePage's default. (rule/btn-sm-secondary-only) -->
        <template #bulk-actions>
          <MpPopover id="bulk-menu" is-manual :is-open="bulkOpen" use-portal placement="bottom-start" @close="bulkOpen=false">
            <MpPopoverTrigger>
              <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded @click.stop="bulkOpen=!bulkOpen">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="bulkOpen=false"><MpIcon name="download" size="sm" />Export</MpPopoverListItem>
                <MpPopoverListItem @click="bulkOpen=false"><MpIcon name="document-sent" size="sm" />Print PDF</MpPopoverListItem>
                <MpPopoverListItem @click="bulkOpen=false"><MpIcon name="document-sent" size="sm" />Share via email</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
        <template #actions>
          <MpButton variant="ghost" left-icon="menu-kebab" aria-label="Row actions" is-rounded />
        </template>
      </ErpTablePage>
    </DemoSection>

    <DemoSection title="2 · Form table — editable cells"
      desc="Mirrors /expenses/new. Editable &lt;td&gt; has padding:0 and OWNS the border (focus-within inset ring); the inner input has no border. Rows sit on a 40px baseline. A drag handle at the far LEFT reorders rows; a (–) at the far RIGHT removes a row. Money inputs carry an 'Rp' prefix. Non-editable / calculated cells use the disabled gray; the thead stays white."
      :rules="['rule/table-form-cell-no-border', 'rule/table-form-money-prefix', 'rule/table-form-row-controls', 'rule/table-bg-white', 'rule/table-form-header-white']"
      code="<td class=&quot;ft-td--input&quot;>            <!-- padding:0; cell owns the focus ring -->
  <MpInput v-model=&quot;it.qty&quot; />         <!-- input border stripped -->
</td>
<td class=&quot;ft-td--calc&quot;>{{ amount(it) }}</td>  <!-- calculated → gray bg -->">
      <div class="ft-wrap">
      <table class="ft">
        <colgroup>
          <col style="width:44px"><col style="width:240px"><col style="width:120px"><col style="width:128px"><col style="width:180px"><col style="width:180px"><col style="width:44px">
        </colgroup>
        <thead>
          <tr>
            <th class="ft-th ft-th--icon" />
            <th class="ft-th">Item</th>
            <th class="ft-th">Qty</th>
            <th class="ft-th">Unit</th>
            <th class="ft-th">Unit price</th>
            <th class="ft-th">Amount</th>
            <th class="ft-th ft-th--icon" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, idx) in items" :key="it.id" class="ft-tr"
            :class="{ 'ft-tr--dragging': ftDrag === idx, 'ft-tr--dragover': ftOver === idx && ftDrag !== idx }"
            draggable="true"
            @dragstart="ftDragStart(idx)" @dragover.prevent="ftDragOver(idx)" @drop="ftDrop(idx)" @dragend="ftDragEnd">
            <td class="ft-td ft-td--drag"><MpIcon name="drag" size="sm" /></td>
            <td class="ft-td ft-td--text">{{ it.name }}</td>
            <td class="ft-td ft-td--input"><MpInput :id="`q-${it.id}`" v-model="it.qty" type="number" is-full-width /></td>
            <td class="ft-td ft-td--input"><PopoverSelect :id="`u-${it.id}`" v-model="unit" :options="units" width="100%" /></td>
            <td class="ft-td ft-td--input">
              <div class="ft-money"><span class="ft-money-prefix">Rp</span><MpInput :id="`p-${it.id}`" v-model="it.price" type="number" is-full-width class="ft-money-input" /></div>
            </td>
            <td class="ft-td ft-td--calc">{{ amount(it) }}</td>
            <td class="ft-td ft-td--del">
              <MpButton class="ft-del-btn" :aria-label="`Remove ${it.name}`" @click="ftRemove(it.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </DemoSection>

    <DemoSection title="3 · Sticky first column + horizontal scroll"
      desc="A wide table pins its first column (position:sticky; left:0, opaque bg) so the row identity stays visible while the rest scrolls. Scroll the table sideways — the first column holds."
      :rules="['rule/table-sticky-first-col', 'rule/table-no-outer-border']"
      code=".sticky-first th:first-child,
.sticky-first td:first-child { position: sticky; left: 0; background: inherit; z-index: 1; }">
      <div class="sticky-wrap">
        <table class="stbl sticky-first">
          <thead>
            <tr><th>Customer</th><th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th><th>Jul</th><th>Aug</th></tr>
          </thead>
          <tbody>
            <tr><td>Anomali Coffee</td><td>12.5M</td><td>10.2M</td><td>9.8M</td><td>11.1M</td><td>13.4M</td><td>12.0M</td><td>10.9M</td><td>14.2M</td></tr>
            <tr><td>PT Maju Jaya</td><td>8.2M</td><td>7.9M</td><td>8.5M</td><td>9.0M</td><td>8.8M</td><td>9.4M</td><td>10.1M</td><td>9.7M</td></tr>
            <tr><td>CV Sinar Abadi</td><td>3.7M</td><td>4.1M</td><td>3.9M</td><td>4.4M</td><td>4.0M</td><td>4.6M</td><td>4.2M</td><td>4.8M</td></tr>
          </tbody>
        </table>
      </div>
    </DemoSection>

    <DemoSection title="4 · Merged rows (rowspan)"
      desc="When a column groups several rows, merge it with rowspan. The bordered variant gives every th/td left+right borders (no double border, no outer border on the edge columns) so the merge reads clearly."
      :rules="['rule/table-merged-row-borders']"
      code="<td :rowspan=&quot;2&quot;>Warehouse A</td>   <!-- spans the group's rows -->">
      <div class="tscroll">
      <table class="mtbl mtbl--bordered">
        <colgroup><col style="width:200px"><col style="width:280px"><col style="width:160px"><col style="width:128px"></colgroup>
        <thead>
          <tr><th>Warehouse</th><th>Product</th><th>Batch</th><th>Qty</th></tr>
        </thead>
        <tbody>
          <tr><td rowspan="2">Warehouse A</td><td>Arabica beans 1kg</td><td>B-2401</td><td>40</td></tr>
          <tr><td>Arabica beans 1kg</td><td>B-2402</td><td>25</td></tr>
          <tr><td rowspan="1">Warehouse B</td><td>Robusta beans 1kg</td><td>B-2501</td><td>60</td></tr>
        </tbody>
      </table>
      </div>
    </DemoSection>

    <DemoSection title="5 · Accordion rows"
      desc="A summary row expands to reveal child rows. The WHOLE summary row is the toggle (chevron is affordance-only); inner controls would use @click.stop. Click a group row to expand."
      :rules="['rule/table-accordion-row-click']"
      code="<tr class=&quot;acc-group&quot; @click=&quot;toggle(g.id)&quot;>   <!-- whole row toggles -->
  <td><MpIcon name=&quot;chevrons-down&quot; :class=&quot;{ open }&quot; /> {{ g.product }}</td>
</tr>
<tr v-for=&quot;b in (isOpen ? g.batches : [])&quot;>…child…</tr>">
      <div class="tscroll">
      <table class="atbl">
        <colgroup><col style="width:280px"><col style="width:160px"><col style="width:160px"><col style="width:128px"><col style="width:160px"></colgroup>
        <thead><tr><th>Product</th><th>SKU</th><th>Batch</th><th>Qty</th><th>Expiry</th></tr></thead>
        <tbody>
          <template v-for="g in groups" :key="g.id">
            <tr class="acc-group" @click="toggle(g.id)">
              <td>
                <span class="acc-caret" :class="{ 'acc-caret--open': open.has(g.id) }"><MpIcon name="chevrons-down" size="sm" /></span>
                {{ g.product }}
              </td>
              <td>{{ g.sku }}</td>
              <td colspan="3">{{ g.batches.length }} batch{{ g.batches.length > 1 ? 'es' : '' }}</td>
            </tr>
            <tr v-for="b in (open.has(g.id) ? g.batches : [])" :key="b.batch" class="acc-child">
              <td></td><td></td><td>{{ b.batch }}</td><td>{{ b.qty }}</td><td>{{ b.exp }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      </div>
    </DemoSection>

    <DemoSection title="6 · Product name cell"
      desc="A product row's name cell ALWAYS leads with a 40px product photo, then the name. Optional second line: the SKU (caption) OR a description clamped to 2 lines with Show more / Show less. Photo size = 40px (from the Inventory index). Uses ProductCell — never hand-roll it."
      :rules="['rule/table-product-cell']"
      code="<ProductCell :image=&quot;p.photo&quot; :name=&quot;p.name&quot; />                 <!-- name only -->
<ProductCell :image=&quot;p.photo&quot; :name=&quot;p.name&quot; :desc=&quot;p.sku&quot; />     <!-- + SKU line -->
<ProductCell :image=&quot;p.photo&quot; :name=&quot;p.name&quot; :desc=&quot;p.longDesc&quot; /> <!-- + 2-line desc + Show more -->">
      <div class="tscroll">
      <table class="pctbl">
        <colgroup><col style="width:360px"><col style="width:128px"><col style="width:160px"></colgroup>
        <thead><tr><th>Product</th><th>Stock</th><th>Updated</th></tr></thead>
        <tbody>
          <tr>
            <td><ProductCell :image="PHOTO" name="Arabica beans 1kg" /></td>
            <td>120</td><td>23/06/2026</td>
          </tr>
          <tr>
            <td><ProductCell :image="PHOTO" name="Robusta beans 1kg" desc="ROB-1KG" /></td>
            <td>60</td><td>22/06/2026</td>
          </tr>
          <tr>
            <td><ProductCell :image="PHOTO" name="House blend 250g" desc="Single-origin Arabica and Robusta blend, medium roast, ground for espresso; packed in a resealable 250g valve bag to keep it fresh." /></td>
            <td>340</td><td>21/06/2026</td>
          </tr>
        </tbody>
      </table>
      </div>
    </DemoSection>

    <DemoSection title="7 · Pagination model & outer border"
      desc="Two pagination models. REGULAR (index pages, above): rows-per-page + page controls; the table has NO outer border — horizontal overflow shows only a sticky separator, never a surrounding box. PROGRESSIVE / infinite (embedded detail line-item tables): when the list exceeds ~10 rows it becomes a CONTAINED panel with a 1px outer border that scrolls INTERNALLY (sticky header, 'Showing 10 of N' footer inside), auto-loading the next 10 on scroll. ≤10 rows = borderless, grows naturally. The outer border is for VERTICAL internal scroll ONLY — a table that merely scrolls sideways stays borderless."
      :rules="['rule/table-pagination-model', 'rule/table-outer-border-conditional', 'rule/table-no-outer-border']"
      code="// index page → regular pagination, no outer border (ErpTablePage default)
// embedded line-items → progressive:
const isProgressive = items.length > 10
<div :class=&quot;{ 'pr-items--bordered': isProgressive }&quot;>  <!-- border only when scrolling internally -->
  <table>…sticky thead…</table>
  <footer>Showing 10 of 124 products</footer>
</div>">
      <div class="prog-grid">
        <!-- Variant A — explicit "Load more" text-link -->
        <div>
          <p class="prog-label">Load more (button)</p>
          <div class="prog">
            <div class="prog-scroll">
              <table class="ptbl">
                <thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead>
                <tbody>
                  <tr v-for="r in ALL_PROG.slice(0, shownMore)" :key="r.sku"><td>{{ r.sku }}</td><td>{{ r.name }}</td><td>{{ r.qty }}</td></tr>
                </tbody>
              </table>
            </div>
            <footer class="prog-foot">
              <span>Showing {{ shownMore }} of {{ ALL_PROG.length }} products</span>
              <a v-if="shownMore < ALL_PROG.length" class="prog-more" role="button" tabindex="0" @click="loadMore">Load more</a>
            </footer>
          </div>
        </div>
        <!-- Variant B — auto lazy-load on scroll -->
        <div>
          <p class="prog-label">Lazy load (scroll to bottom)</p>
          <div class="prog">
            <div class="prog-scroll" @scroll="onLazyScroll">
              <table class="ptbl">
                <thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead>
                <tbody>
                  <tr v-for="r in ALL_PROG.slice(0, shownLazy)" :key="r.sku"><td>{{ r.sku }}</td><td>{{ r.name }}</td><td>{{ r.qty }}</td></tr>
                </tbody>
              </table>
              <div v-if="shownLazy < ALL_PROG.length" class="prog-loading">Loading items…</div>
            </div>
            <footer class="prog-foot"><span>Showing {{ shownLazy }} of {{ ALL_PROG.length }} products</span></footer>
          </div>
        </div>
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
/* Table demos are full-width block content — override the gallery's flex preview so a
   wide table constrains to the column and scrolls horizontally inside its own wrapper
   (instead of a flex item stretching the page). */
:deep(.ds__preview) { display: block; }

/* generic horizontal-scroll wrapper for wide hand-rolled tables (thin scrollbar) */
.tscroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #c3c9ca #f1f5f9; }
.tscroll::-webkit-scrollbar { height: 8px; }
.tscroll::-webkit-scrollbar-thumb { background: #c3c9ca; border-radius: 999px; border: 2px solid #f1f5f9; }
.tscroll::-webkit-scrollbar-track { background: #f1f5f9; }

/* filter bar — left (quick filter + All filters) split from right (AI · columns · export · search) */
.fb-left { display: flex; align-items: center; gap: var(--mp-spacing-4, 16px); }
.fb-right { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
/* icon button group in the filter bar — buttons sit flush (no gap); the 36px hit
   areas already provide visual separation */
.fb-right :deep(.mp-pixel-button-group) { gap: 0; }
.fb-search { width: 16rem; flex: 0 0 16rem; }
.fb-search, .fb-search :deep(.mp-input__control) { border-radius: var(--mp-radii-full, 999px); }
.fb-clear { display: inline-flex; cursor: pointer; color: var(--mp-colors-text-secondary, #5f6b6d); }
.fb-clear:hover { color: var(--mp-colors-text-default, #080d0e); }

/* shared bare-table look — matches ErpTablePage spec (docs/patterns/ErpTablePage.md):
   header 28px UPPERCASE 12px semibold on gray surface, padding 4/16/4/8;
   row 40px baseline, 10/16/10/8 padding, border-bottom default;
   row hover = neutral-hovered. */
.ft, .stbl, .mtbl, .atbl, .ptbl, .wtbl, .pctbl { border-collapse: collapse; font-size: var(--mp-font-sizes-md, 0.875rem); }
.ft th, .stbl th, .mtbl th, .atbl th, .ptbl th, .wtbl th, .pctbl th {
  text-align: left; font-weight: var(--mp-font-weights-semi-bold, 600);
  font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-text-secondary, #3a4749);
  text-transform: uppercase; letter-spacing: 0.04em;
  height: var(--mp-sizes-7, 28px);
  padding: 4px 16px 4px 8px;
  /* header gray — slate-100 token is near-white (#f8f9f9) in this build, use the
     ERP header literal so it reads gray (matches ErpTablePage). */
  background: #f1f5f9;
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); white-space: nowrap;
}
.ft td, .stbl td, .mtbl td, .atbl td, .ptbl td, .wtbl td, .pctbl td {
  padding: 10px 16px 10px 8px;
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); color: var(--mp-colors-text-default, #080d0e);
}
/* product-name-cell table — fixed widths; cells align top (product cell can be 2 lines) */
.pctbl { width: 100%; min-width: 648px; table-layout: fixed; }
.pctbl td { vertical-align: top; }
/* No row hover on these tables — a row only highlights on hover when it has a
   clickable (text-link) column (rule/table-row-hover). None of these do. */

/* Cell text-link — text-link colour, underline on hover (rule/table-name-link-span) */
.cell-link { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

/* width-standard reference table — full width, Inter, text-default (no mono/blue) */
.wtbl { width: 100%; }

/* 2 · form table — fixed column widths (follow the standard); scroll horizontally
   when the panel is narrower than the columns' total. */
.ft-wrap { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #c3c9ca #f1f5f9; }
.ft-wrap::-webkit-scrollbar { height: 8px; }
.ft-wrap::-webkit-scrollbar-thumb { background: #c3c9ca; border-radius: 999px; border: 2px solid #f1f5f9; }
.ft-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
.ft { width: 100%; min-width: 936px; table-layout: fixed; }
.ft th.ft-th { background: var(--mp-colors-background-neutral, #fff); }    /* form header white (beats shared gray) */
.ft-th--icon { padding: 0; }
.ft-td { height: var(--mp-sizes-10, 40px); box-sizing: border-box; }  /* 40px baseline incl. padding, so every cell (and the Rp prefix) is exactly one row tall */
/* non-editable / calculated cells = disabled bg (table bg is otherwise always white) */
.ft-td--text, .ft-td--calc { background: #f1f3f5; }
.ft-td--text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }  /* keep rows 40px so the Rp prefix fills full height */
.ft-td--calc { text-align: right; font-variant-numeric: tabular-nums; }
/* padding:0 needs `.ft td.` specificity to beat the shared `.ft td { padding:10px }` */
.ft td.ft-td--input { padding: 0; height: var(--mp-sizes-10, 40px); }  /* cell owns the ring; definite height so inner fills */
.ft-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-colors-border-bold, #8c9596); }
.ft-td--input :deep([class*='input__control']),
.ft-td--input :deep(.ps-trigger) { border-color: transparent !important; border-radius: 0 !important; box-shadow: none !important; background: transparent !important; }
/* drag-to-reorder feedback (mirrors /expenses/new): source dims, drop target shows a
   2px blue top border where the row will land */
.ft-tr--dragging { opacity: 0.4; }
.ft-tr--dragover > td { box-shadow: inset 0 2px 0 0 var(--mp-colors-border-focused, #2563eb); }
.ft-tr--dragging .ft-td--drag { cursor: grabbing; }
/* drag handle (left) + remove (right), mirroring /expenses/new */
.ft td.ft-td--drag { padding: 0; text-align: center; vertical-align: middle; color: var(--mp-colors-text-placeholder, #8c9596); cursor: grab; }
.ft td.ft-td--del { padding: 0; text-align: center; vertical-align: middle; }
.ft-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: 32px !important; height: 32px !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm, 4px) !important;
  cursor: pointer; color: var(--mp-colors-text-secondary, #3a4749);
}
.ft-del-btn:hover { background: var(--mp-colors-background-neutral, #fff) !important; color: var(--mp-colors-text-danger, #dc2626); }
/* Rp prefix inside a money cell (unit price) */
.ft-money { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.ft-money-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2, 8px); background: #f1f3f5;
  font-size: var(--mp-font-sizes-md, 0.875rem); font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-colors-text-default, #080d0e);
}
.ft-money-input { flex: 1; min-width: 0; }

/* 3 · sticky first column */
.sticky-wrap {
  overflow-x: auto; max-width: 100%;
  scrollbar-width: thin; scrollbar-color: #c3c9ca #f1f5f9;
}
.sticky-wrap::-webkit-scrollbar { height: 8px; }
.sticky-wrap::-webkit-scrollbar-thumb { background: #c3c9ca; border-radius: 999px; border: 2px solid #f1f5f9; }
.sticky-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
.stbl { min-width: 60rem; }
.stbl td, .stbl th { white-space: nowrap; }
.sticky-first td:first-child {
  position: sticky; left: 0; z-index: 1;
  background: var(--mp-colors-background-neutral, #fff);
  box-shadow: inset -1px 0 var(--mp-colors-border-default, #e3e7e9);
}
.sticky-first th:first-child {
  position: sticky; left: 0; z-index: 2;
  box-shadow: inset -1px 0 var(--mp-colors-border-default, #e3e7e9);
}
.sticky-first th:first-child { z-index: 2; }

/* 4 · merged / bordered */
.mtbl { width: 100%; min-width: 768px; table-layout: fixed; }
/* merged/bordered: right border on every cell, none on the last column (no outer edge).
   Using right-borders (not left) keeps the divider on the spanning cell, so rows under a
   rowspan don't lose their left edge. */
.mtbl--bordered th, .mtbl--bordered td { border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.mtbl--bordered th:last-child, .mtbl--bordered td:last-child { border-right: none; }
.mtbl--bordered td[rowspan] { vertical-align: top; }   /* merged cell stays white (table bg is always white) */

/* 6 · progressive-loading panel — bordered, internal vertical scroll, sticky header */
.prog {
  width: 100%;
  /* outer border on a bordered table = border-bold (rule/table-outer-border-conditional) */
  border: 1px solid var(--mp-colors-border-bold, #8c9596);
  border-radius: var(--mp-radii-lg, 8px);
  overflow: hidden;
}
.prog-scroll {
  max-height: 12rem; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #c3c9ca #f1f5f9;
}
.prog-scroll::-webkit-scrollbar { width: 8px; }
.prog-scroll::-webkit-scrollbar-thumb { background: #c3c9ca; border-radius: 999px; border: 2px solid #f1f5f9; }
.prog-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
.ptbl { width: 100%; }
.ptbl thead th { position: sticky; top: 0; z-index: 1; }   /* header sticks while scrolling */
.prog-foot {
  display: flex; align-items: center; gap: var(--mp-spacing-3, 12px);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px);
  border-top: 1px solid var(--mp-colors-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-colors-text-secondary, #3a4749);
}
.prog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-5, 20px); }
@media (max-width: 52rem) { .prog-grid { grid-template-columns: 1fr; } }
.prog-label { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-colors-text-secondary, #3a4749); margin-bottom: var(--mp-spacing-2, 8px); }
.prog-more { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.prog-more:hover { text-decoration: underline; }
.prog-loading { padding: var(--mp-spacing-3, 12px); text-align: center; font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-colors-text-secondary, #3a4749); }

/* 5 · accordion — fixed layout so columns DON'T shift when rows expand/collapse */
.atbl { width: 100%; min-width: 888px; table-layout: fixed; }
.atbl td, .atbl th { overflow: hidden; text-overflow: ellipsis; }
.acc-group { cursor: pointer; }   /* hover handled by shared .atbl tbody tr:hover td */
/* cell text is always 14px regular text-default — no semibold/italic (rule/table-cell-text-plain) */
.acc-caret { display: inline-flex; vertical-align: middle; margin-right: var(--mp-spacing-2, 8px); transition: transform 0.15s; }
.acc-caret--open { transform: rotate(180deg); }
.acc-child td { color: var(--mp-text-secondary, #3a4749); }
</style>
