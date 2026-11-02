<script setup lang="ts">
/**
 * Multi-level BOM structure as a tree table — Product · Available qty · Qty needed ·
 * Stock availability · Create work order. The root row is the finished good of the
 * BOM; every raw material whose product is another BOM's output is a sub-BOM row
 * (BOM number + version under the name, caret to collapse, "Create work order"),
 * its own materials indented beneath it with tree guide lines.
 *
 *  • From a BOM: sub-BOMs show the Active version they resolve to (resolve-at-WO).
 *  • From a work order (`pins`): sub-BOMs show the version the work order pinned
 *    at creation, plus a neutral "vN available" when a newer one exists.
 *
 * Qty needed is cumulative for `rootQty` units of the finished good; availability
 * compares it with the product's on-hand stock.
 */
import { MpButton, MpBadge, MpIcon, MpTooltip } from '@mekari/pixel3'
import { COLUMN_WIDTH } from '~/components/patterns/columnWidths'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { billOfMaterials, bomTree, bomVersionContent, catalogProduct, type BomTreeNode } from '~/data/billOfMaterials'

const props = withDefaults(defineProps<{
  bomId: string
  version?: number
  /** a work order's multi-level pins (sub-BOM id → version) */
  pins?: Record<string, number>
  showDrift?: boolean
  /** finished-good units the quantities are computed for */
  rootQty?: number
  /** show "Create work order" on BOM rows */
  showActions?: boolean
}>(), { version: undefined, pins: undefined, showDrift: true, rootQty: 1, showActions: true })
const emit = defineEmits<{ openBom: [id: string, version: number]; openDrift: [id: string, fromVersion: number]; createWorkOrder: [bomId: string]; openProduct: [productId: string] }>()
const { t } = useLocale()

interface Row {
  key: string
  productId: string
  depth: number
  needed: number
  subBomId?: string
  subVersion?: number
  hasChildren: boolean
  /** per ancestor level: draw a continuing guide line through this row */
  guides: boolean[]
  isLast: boolean
}

const record = computed(() => billOfMaterials.find(b => b.id === props.bomId))
const collapsed = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

const rows = computed<Row[]>(() => {
  const b = record.value
  if (!b) return []
  const content = bomVersionContent(b, props.version) ?? b
  const children = bomTree({ ...content, id: b.id }, props.pins ? { pinFor: id => props.pins![id] } : {})
  const perRoot = props.rootQty / (content.finishedGoodQty || 1)
  const out: Row[] = [{
    key: 'root', productId: content.finishedGoodId, depth: 0, needed: props.rootQty,
    subBomId: b.id, subVersion: props.version ?? b.version, hasChildren: children.length > 0, guides: [], isLast: true,
  }]
  const walk = (nodes: BomTreeNode[], depth: number, mult: number, guides: boolean[], prefix: string) => {
    nodes.forEach((n, i) => {
      const key = `${prefix}/${i}`
      const isLast = i === nodes.length - 1
      const needed = n.needed * mult
      out.push({ key, productId: n.productId, depth, needed, subBomId: n.subBomId, subVersion: n.subVersion, hasChildren: n.children.length > 0, guides, isLast })
      if (n.children.length && !collapsed.value.has(key)) {
        const sub = billOfMaterials.find(x => x.id === n.subBomId)
        const subContent = sub && n.subVersion !== undefined ? bomVersionContent(sub, n.subVersion) ?? sub : sub
        walk(n.children, depth + 1, needed / (subContent?.finishedGoodQty || 1), [...guides, !isLast], key)
      }
    })
  }
  if (!collapsed.value.has('root')) walk(children, 1, perRoot, [], 'root')
  return out
})

const subOf = (id?: string) => billOfMaterials.find(b => b.id === id)
const available = (productId: string) => catalogProduct(productId)?.stock ?? 0
const newer = (r: Row) => {
  const s = subOf(r.subBomId)
  return r.key !== 'root' && props.pins && props.showDrift && s && r.subVersion !== undefined && s.version > r.subVersion ? s.version : undefined
}
const num = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100).toLocaleString('id-ID')
</script>

<template>
  <div class="bst-scroll" data-devchange="bom-structure">
    <table class="bst-table">
      <!-- Semantic widths from the column-width standard (columnWidths.ts); the action column is layout-only -->
      <colgroup><col /><col :style="{ width: COLUMN_WIDTH.default.minWidth }" /><col :style="{ width: COLUMN_WIDTH.default.minWidth }" /><col :style="{ width: COLUMN_WIDTH.status.maxWidth }" /><col v-if="showActions" class="bst-col-action" /></colgroup>
      <thead>
        <tr>
          <th>{{ t('Product') }}</th>
          <th>{{ t('Available qty') }}</th>
          <th>{{ t('Qty needed') }}</th>
          <th>{{ t('Stock availability') }}</th>
          <th v-if="showActions" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key" :class="{ 'bst-row--bom': !!r.subBomId }">
          <td class="bst-product" :style="{ '--depth': r.depth }">
            <div class="bst-cell">
              <!-- Tree guides: continuing lines for ancestors, then this row's elbow -->
              <span v-for="(g, gi) in r.guides" v-show="g" :key="gi" class="bst-guide" :style="{ '--level': gi }" aria-hidden="true" />
              <span v-if="r.depth > 0" class="bst-elbow" :class="{ 'bst-elbow--last': r.isLast }" aria-hidden="true" />
              <!-- Icon-only button → aria-label + tooltip (rule/btn-icon-tooltip) -->
              <MpTooltip v-if="r.hasChildren" :id="`bst-caret-tip-${r.key}`" :label="collapsed.has(r.key) ? t('Expand') : t('Collapse')" placement="top" use-portal>
                <MpButton
                  variant="ghost" is-rounded class="bst-caret" :aria-label="collapsed.has(r.key) ? t('Expand') : t('Collapse')"
                  @click="toggle(r.key)"
                >
                  <MpIcon :name="collapsed.has(r.key) ? 'caret-right' : 'caret-down'" size="sm" />
                </MpButton>
              </MpTooltip>
              <span v-else class="bst-caret-spacer" />
              <div class="bst-text">
                <!-- Clickable name in a cell = <span> styled as a link (rule/table-name-link-span) -->
                <span class="bst-link" role="link" tabindex="0" @click="emit('openProduct', r.productId)" @keydown.enter="emit('openProduct', r.productId)">{{ catalogProduct(r.productId)?.name ?? r.productId }}</span>
                <span v-if="r.subBomId" class="bst-bom">
                  <span class="bst-bom-link" role="link" tabindex="0" @click="emit('openBom', r.subBomId!, r.subVersion!)" @keydown.enter="emit('openBom', r.subBomId!, r.subVersion!)">{{ subOf(r.subBomId)?.number }} · v{{ r.subVersion }}</span>
                  <MpBadge
                    v-if="newer(r)" :id="`bst-drift-${r.key}`" for="tableStatus" type="information" class="bst-drift"
                    role="button" tabindex="0" @click="emit('openDrift', r.subBomId!, r.subVersion!)"
                  >v{{ newer(r) }} {{ t('available') }}</MpBadge>
                </span>
              </div>
            </div>
          </td>
          <td>{{ num(available(r.productId)) }}</td>
          <td>{{ num(r.needed) }}</td>
          <td>
            <ErpStatusBadge
              :status="available(r.productId) >= r.needed ? 'available' : 'unavailable'"
              :type="available(r.productId) >= r.needed ? 'completed' : 'critical'"
              :label="available(r.productId) >= r.needed ? t('Available') : t('Not available')"
            />
          </td>
          <td v-if="showActions" class="bst-action">
            <MpButton v-if="r.subBomId" variant="secondary" is-rounded @click="emit('createWorkOrder', r.subBomId!)">{{ t('Create work order') }}</MpButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Hand-rolled tree table, matched to the ERP table metrics: no outer border box
   (rule/table-no-outer-border), UPPERCASE 12px semibold secondary header on the gray
   surface, 28px tall (rule/table-header-uppercase, rule/table-header-height), 8px cell
   padding with single-line rows aligned middle (rule/table-cell-padding-align),
   14px regular cell text (rule/table-cell-text-plain), white background (rule/table-bg-white). */
.bst-scroll { overflow-x: auto; }
.bst-table { width: 100%; min-width: 900px; border-collapse: collapse; table-layout: fixed; background: var(--mp-background-stage, #ffffff); }
.bst-table th {
  height: var(--mp-sizes-7); padding: var(--mp-spacing-1) var(--mp-spacing-2); text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-colors-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.bst-table td {
  padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-colors-text-default); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: middle;
}
.bst-action { text-align: right; }
.bst-col-action { width: var(--mp-sizes-48, 12rem); }

/* ── Product cell + tree guides (indent = spacing-10 per level) ──
   The row divider under the product starts at the row's own indent (as in the
   reference), so nested rows read as children of the row above. */
.bst-product { --bst-indent: var(--mp-spacing-10); --bst-guide: var(--mp-spacing-4); position: relative; padding-left: 0 !important; border-bottom: none !important; }
.bst-product::after {
  content: ''; position: absolute; right: 0; bottom: 0; left: calc(var(--depth) * var(--bst-indent) + var(--mp-spacing-2));
  border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.bst-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); padding-left: calc(var(--depth) * var(--bst-indent)); }
.bst-guide, .bst-elbow { position: absolute; pointer-events: none; }
/* an ancestor that has more siblings below: full-height line through this row */
.bst-guide { top: 0; bottom: 0; left: calc(var(--level) * var(--bst-indent) + var(--bst-guide)); border-left: 1px solid var(--mp-colors-border-bold, #b8c0c8); }
/* this row's own elbow: down from the top to the middle, then right to the caret */
.bst-elbow { top: 0; bottom: 0; left: calc((var(--depth) - 1) * var(--bst-indent) + var(--bst-guide)); border-left: 1px solid var(--mp-colors-border-bold, #b8c0c8); }
.bst-elbow::after {
  content: ''; position: absolute; top: 50%; left: 0; width: var(--mp-spacing-6);
  border-top: 1px solid var(--mp-colors-border-bold, #b8c0c8);
}
.bst-elbow--last { bottom: 50%; }
.bst-elbow--last::after { top: 100%; }
.bst-caret { min-width: 0 !important; width: var(--mp-sizes-8); height: var(--mp-sizes-8); padding: 0 !important; flex-shrink: 0; position: relative; z-index: 1; }
.bst-caret-spacer { width: var(--mp-sizes-8); flex-shrink: 0; }
.bst-text { display: flex; flex-direction: column; min-width: 0; }
.bst-link { color: var(--mp-text-link); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bst-link:hover, .bst-bom-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.bst-bom { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.bst-bom-link { cursor: pointer; }
.bst-drift { cursor: pointer; }
</style>
