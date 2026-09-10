<script setup lang="ts">
/**
 * CrmDealPreviewDrawer — quick-preview a Deal from a kanban card. Read-only
 * snapshot of the record's key fields (ContentList key/values + a Product List
 * table), with a **View details** action plus a "…" menu (Move to… / Edit /
 * Archive / Delete). Reads the live Deal from the store. Hand-rolled Teleport
 * overlay shell (Pixel MpDrawer has no structural CSS in this build — see
 * CLAUDE.md); overlay click closes it (read-only preview, not a form).
 */
import { computed, ref } from 'vue'
import {
  MpIcon, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatMoney } from '~/utils/currency'
import { formatDate, formatDateTime } from '~/utils/date'
import { CATALOG } from '~/data/catalog'
import {
  crmCustomers, dealExpectedValue, lineSubtotal, skuFor, DEAL_STAGES,
  dealComments, addDealComment, dealNo,
  type Deal, type DealStage,
} from '~/data/crm'

const props = defineProps<{ open: boolean; deal: Deal | null }>()
const emit = defineEmits<{
  close: []; 'view-details': [id: string]; edit: [deal: Deal]
  'move-stage': [deal: Deal, stage: DealStage]; archive: [deal: Deal]; delete: [deal: Deal]
}>()

// Product photo + real SKU come from the shared CATALOG, keyed by product id.
const catalogById = new Map<string, (typeof CATALOG)[number]>()
for (const c of CATALOG) catalogById.set(c.id, c)
function productPhoto(id: string): string | undefined { return catalogById.get(id)?.img }
function productSku(name: string, id: string): string { return catalogById.get(id)?.sku ?? skuFor(name) }

// "…" actions popover — swaps between the main menu and an inline stage picker
// (Move to…) so changing stage needs no modal.
const actionsOpen = ref(false)
const moveView = ref<'menu' | 'stages'>('menu')
function toggleActions() { actionsOpen.value = !actionsOpen.value; if (actionsOpen.value) moveView.value = 'menu' }
function act(name: 'edit' | 'archive' | 'delete') { actionsOpen.value = false; if (d.value) emit(name, d.value) }
function pickStage(s: DealStage) { actionsOpen.value = false; moveView.value = 'menu'; if (d.value) emit('move-stage', d.value, s) }
const moveStages = computed<DealStage[]>(() => DEAL_STAGES.filter((s) => s !== d.value?.stage))

// ── Notes / comments ──
const comments = computed(() => (d.value ? dealComments(d.value.id) : []))
const noteText = ref('')
function addNote() {
  const t = noteText.value.trim()
  if (!t || !d.value) return
  addDealComment(d.value.id, t)
  noteText.value = ''
}

const d = computed(() => props.deal)
const money = (n: number) => formatMoney(n, d.value?.currency ?? 'IDR')
const customer = computed(() => (d.value ? crmCustomers.find((c) => c.id === d.value!.customerId) : undefined))
const productCount = computed(() => d.value?.products?.length ?? 0)
const contactEmail = computed(() => d.value?.email || customer.value?.email || '')
const contactPhone = computed(() => (d.value?.phones?.length ? d.value.phones.join(', ') : (customer.value?.phone || '')))

function stageBadge(stage: DealStage) {
  if (stage === 'Won') return { status: 'active', type: 'completed' as const, label: 'Won' }
  if (stage === 'Lost') return { status: 'churned', type: 'announcement' as const, label: 'Lost' }
  if (stage === 'Negotiation' || stage === 'Proposal') return { status: 'prospect', type: 'warning' as const, label: stage }
  return { status: 'prospect', type: 'information' as const, label: stage }
}
function ownerInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
function ownerAvatarStyle(name: string): { background: string; color: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { background: `hsl(${hue} 62% 86%)`, color: `hsl(${hue} 55% 30%)` }
}
function stampTime(id: string): string {
  const n = parseInt(id.replace(/\D/g, ''), 10) || 0
  const hh = 8 + (n % 9)
  const mm = (n * 7) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cdp">
      <div v-if="open && d" class="cdp-overlay" @click.self="emit('close')">
        <div class="cdp-panel" role="dialog" aria-label="Deal preview">
          <header class="cdp-header">
            <div class="cdp-header-main">
              <span class="cdp-number">{{ dealNo(d.id) }}</span>
              <h2 class="cdp-title">{{ d.name }}</h2>
            </div>
            <MpButton class="cdp-close" aria-label="Close" @click="emit('close')"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="cdp-body">
            <!-- Overview -->
            <section class="cdp-section">
              <h3 class="cdp-section-title">Overview</h3>
              <div class="cdp-grid">
                <ContentList label="Expected deal value" :value="money(dealExpectedValue(d))" />
                <ContentList label="Deal owner">
                  <span class="cdp-owner">
                    <span class="cdp-avatar" :style="ownerAvatarStyle(d.owner)">{{ ownerInitials(d.owner) }}</span>
                    {{ d.owner }}
                  </span>
                </ContentList>
                <ContentList label="Customer" :value="d.company" />
                <ContentList label="Stage"><ErpStatusBadge v-bind="stageBadge(d.stage)" /></ContentList>
                <ContentList label="Created" :value="`${formatDate(d.createdAt)}, ${stampTime(d.id)}`" />
                <ContentList label="Due date" :value="d.expectedCloseDate ? formatDate(d.expectedCloseDate) : '—'" />
                <ContentList label="Reference number" :value="d.referenceNumber || '—'" />
                <ContentList v-if="d.stage === 'Lost'" label="Lost reason" :value="d.lostReason || '—'" />
              </div>
            </section>

            <!-- Contact -->
            <section class="cdp-section">
              <h3 class="cdp-section-title">Contact</h3>
              <div class="cdp-grid">
                <ContentList label="Primary contact" :value="d.picName || customer?.contact || '—'" />
                <ContentList label="Email">
                  <a v-if="contactEmail" class="cdp-link" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
                  <span v-else>—</span>
                </ContentList>
                <ContentList label="Phone">
                  <a v-if="contactPhone" class="cdp-link" :href="`tel:${contactPhone.replace(/\s/g, '')}`">{{ contactPhone }}</a>
                  <span v-else>—</span>
                </ContentList>
              </div>
            </section>

            <!-- Products -->
            <section class="cdp-section">
              <h3 class="cdp-section-title">Products <span class="cdp-count">{{ productCount }}</span></h3>
              <div v-if="productCount" class="cdp-ptable">
                <div class="cdp-phead">
                  <span>Product</span><span class="cdp-num">Qty</span><span>Unit</span><span class="cdp-num">Amount</span>
                </div>
                <div v-for="(li, i) in d.products" :key="i" class="cdp-prow">
                  <div class="cdp-pname-cell">
                    <span class="cdp-pthumb">
                      <img v-if="productPhoto(li.productId)" :src="productPhoto(li.productId)" :alt="li.productName" class="cdp-pimg">
                      <MpIcon v-else name="img" size="sm" />
                    </span>
                    <div class="cdp-pname-wrap">
                      <span class="cdp-pname">{{ li.productName }}</span>
                      <span class="cdp-psku">SKU {{ productSku(li.productName, li.productId) }}</span>
                    </div>
                  </div>
                  <span class="cdp-num">{{ li.quantity }}</span>
                  <span>{{ li.unit }}</span>
                  <span class="cdp-num">{{ money(lineSubtotal(li)) }}</span>
                </div>
              </div>
              <p v-else class="cdp-empty">No products on this deal.</p>
            </section>

            <!-- Notes / comments -->
            <section class="cdp-section">
              <h3 class="cdp-section-title">Notes <span v-if="comments.length" class="cdp-count">{{ comments.length }}</span></h3>
              <div class="cdp-note-add">
                <textarea v-model="noteText" class="cdp-note-input" rows="2" aria-label="Add a note" @keydown.meta.enter="addNote" @keydown.ctrl.enter="addNote" />
                <button class="btn-enterprise btn-enterprise--secondary cdp-note-btn" type="button" @click="addNote">Add note</button>
              </div>
              <ul v-if="comments.length" class="cdp-notes">
                <li v-for="c in comments" :key="c.id" class="cdp-note">
                  <span class="cdp-avatar cdp-note-avatar" :style="ownerAvatarStyle(c.author)">{{ ownerInitials(c.author) }}</span>
                  <div class="cdp-note-body">
                    <div class="cdp-note-head">
                      <span class="cdp-note-author">{{ c.author }}</span>
                      <span class="cdp-note-time">{{ formatDateTime(c.at) }}</span>
                    </div>
                    <p class="cdp-note-text">{{ c.text }}</p>
                  </div>
                </li>
              </ul>
              <p v-else class="cdp-empty">No notes yet.</p>
            </section>
          </div>

          <footer class="cdp-footer">
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="emit('view-details', d.id)">View details</button>
            <MpPopover
              id="cdp-actions"
              is-manual
              :is-open="actionsOpen"
              use-portal
              :is-keep-alive="false"
              placement="top-end"
              @close="actionsOpen = false"
            >
              <MpPopoverTrigger>
                <MpButton variant="secondary" left-icon="menu-kebab" aria-label="More actions" is-rounded @click="toggleActions" />
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                <MpPopoverList v-if="moveView === 'menu'">
                  <MpPopoverListItem @click="moveView = 'stages'">Move to…</MpPopoverListItem>
                  <MpPopoverListItem @click="act('edit')">Edit</MpPopoverListItem>
                  <MpPopoverListItem @click="act('archive')">Archive</MpPopoverListItem>
                  <MpPopoverListItem :class="css({ color: 'var(--mp-text-danger)' })" @click="act('delete')">Delete</MpPopoverListItem>
                </MpPopoverList>
                <MpPopoverList v-else>
                  <MpPopoverListItem :class="css({ color: 'var(--mp-text-secondary)' })" @click="moveView = 'menu'">← Back</MpPopoverListItem>
                  <MpPopoverListItem v-for="s in moveStages" :key="s" @click="pickStage(s)">{{ s }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cdp-enter-active, .cdp-leave-active { transition: background-color 250ms ease; }
.cdp-enter-from, .cdp-leave-to { background-color: transparent; }
.cdp-enter-active .cdp-panel { transition: transform 350ms ease-out; }
.cdp-leave-active .cdp-panel { transition: transform 250ms ease-in; }
.cdp-enter-from .cdp-panel, .cdp-leave-to .cdp-panel { transform: translateX(calc(100% + 12px)); }

.cdp-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cdp-panel { margin: var(--mp-spacing-3); width: min(560px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }

.cdp-header { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-5); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cdp-header-main { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.cdp-number { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md, 20px); }
.cdp-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg, 24px); }
.cdp-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cdp-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.cdp-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-5); }

.cdp-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cdp-section-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cdp-count { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-full, 999px); padding: 0 var(--mp-spacing-2); }

.cdp-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-1); }

.cdp-owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cdp-avatar { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--mp-radii-full, 999px); font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); flex-shrink: 0; }

.cdp-link { color: var(--mp-text-link); }
.cdp-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Product table — an outer-bordered table uses border-bold (rule/table-outer-border-bold). */
.cdp-ptable { border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.cdp-phead, .cdp-prow { display: grid; grid-template-columns: 1fr 48px 64px 110px; gap: var(--mp-spacing-3); align-items: center; padding: var(--mp-spacing-2) var(--mp-spacing-3); }
.cdp-phead { background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cdp-prow { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cdp-prow:last-child { border-bottom: none; }
.cdp-num { text-align: right; font-variant-numeric: tabular-nums; }
.cdp-pname-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.cdp-pthumb { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--mp-radii-md, 6px); background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-icon-subtle, #97a0af); flex-shrink: 0; overflow: hidden; border: 1px solid var(--mp-border-default, #e3e7e9); }
.cdp-pimg { width: 100%; height: 100%; object-fit: cover; }
.cdp-pname-wrap { display: flex; flex-direction: column; min-width: 0; }
.cdp-pname { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdp-psku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.cdp-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }

/* Notes / comments */
.cdp-note-add { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-2); }
.cdp-note-input { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; resize: vertical; min-height: 60px; line-height: var(--mp-line-heights-md); font-family: inherit; }
.cdp-note-input:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: 0 0 0 3px var(--mp-background-neutral-hovered, rgba(140, 149, 150, 0.24)); }
.cdp-note-btn { flex-shrink: 0; }
.cdp-notes { list-style: none; margin: var(--mp-spacing-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cdp-note { display: flex; gap: var(--mp-spacing-2); }
.cdp-note-avatar { width: 28px; height: 28px; margin-top: 2px; }
.cdp-note-body { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.cdp-note-head { display: flex; align-items: baseline; gap: var(--mp-spacing-2); }
.cdp-note-author { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cdp-note-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cdp-note-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: pre-wrap; word-break: break-word; }

.cdp-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f8f9f9); }
</style>
