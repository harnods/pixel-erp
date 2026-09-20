<script setup lang="ts">
/**
 * "Journal entry & stock adjustment" — the accounting behind a work order.
 *
 * Follows the pattern the product already uses on a standard work order: a link
 * out of the detail header into a modal with two tabs, the journal summarised one
 * row per account with a Total, and the stock movements listed beside it. A subcon
 * order posts different entries, but an accountant should not have to learn a
 * second screen to read them.
 *
 * Both columns print a figure even when it is zero, as the reference does — a
 * blank cell reads as "not applicable", and here zero is a fact.
 *
 * Not MpModal: it has no working CSS in this Pixel build (measured — stays
 * `position: static`, `opacity: 0` seconds after opening; see the amended
 * rule/modal-use-mpmodal). Same Teleport shell as the other subcon dialogs.
 */
import { MpIcon } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { accountTotals, type SubconJournalEntry } from '~/data/subconAccounting'

const props = defineProps<{
  isOpen: boolean
  workOrderNumber: string
  entries: SubconJournalEntry[]
  /** Stock movements this work order produced, newest last. */
  stockAdjustments: { id: string; number: string; account: string; date: string; warehouse: string }[]
  /**
   * True when the plan has moved since the entries were posted — a component
   * quantity revised after material went out. The figures are still what was
   * posted; they just no longer match the plan.
   */
  isStale?: boolean
}>()

const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

const { t } = useLocale()
const router = useRouter()

/** Open a movement's own record. The modal closes on the way — leaving an
 *  overlay up over a page the user has navigated to would trap them. */
function openAdjustment(id: string) {
  emit('update:isOpen', false)
  router.push(`/stock-adjustments/${id}`)
}

const tab = ref<'journal' | 'stock'>('journal')
watch(() => props.isOpen, (open) => { if (open) tab.value = 'journal' })

const rows = computed(() => accountTotals(props.entries))
const totalDebit = computed(() => rows.value.reduce((s, r) => s + r.debit, 0))
const totalCredit = computed(() => rows.value.reduce((s, r) => s + r.credit, 0))

function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="sjm">
      <!-- Closes only via × (rule/modal-drawer-close-explicit-only). -->
      <div v-if="isOpen" class="sjm-overlay">
        <div class="sjm-panel" role="dialog" :aria-label="t('Journal entry & stock adjustment')">
          <header class="sjm-bar">
            <h2 class="sjm-bar__title">{{ t('Journal entry & stock adjustment') }}</h2>
            <button class="sjm-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="sjm-body">
            <h3 class="sjm-heading">{{ t('Work order') }} #{{ workOrderNumber.split('-').pop() }}</h3>

            <div class="sjm-tabs" role="tablist">
              <button
                class="sjm-tab btn-enterprise" :class="{ 'sjm-tab--on': tab === 'journal' }"
                role="tab" :aria-selected="tab === 'journal'" @click="tab = 'journal'"
              >{{ t('Journal entry') }}</button>
              <button
                class="sjm-tab btn-enterprise" :class="{ 'sjm-tab--on': tab === 'stock' }"
                role="tab" :aria-selected="tab === 'stock'" @click="tab = 'stock'"
              >{{ t('Stock adjustment') }}</button>
            </div>

            <!-- ── Journal entry ── -->
            <template v-if="tab === 'journal'">
              <div v-if="isStale" class="sjm-warning">
                <MpIcon name="warning" size="md" />
                <span>{{ t('Journal entry is not actual due to transaction data changes affecting inventory value.') }}</span>
              </div>

              <table v-if="rows.length" class="sjm-table">
                <thead>
                  <tr>
                    <th class="sjm-th">{{ t('Account') }}</th>
                    <th class="sjm-th sjm-th--num">{{ t('Debit') }}</th>
                    <th class="sjm-th sjm-th--num">{{ t('Credit') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows" :key="row.code" class="sjm-tr">
                    <!-- Plain text, not a link: there is no per-account view to
                         open, and styling it as a link would promise one. -->
                    <td class="sjm-td">{{ row.code }} – {{ row.name }}</td>
                    <td class="sjm-td sjm-td--num">{{ formatIDR(row.debit) }}</td>
                    <td class="sjm-td sjm-td--num">{{ formatIDR(row.credit) }}</td>
                  </tr>
                  <tr class="sjm-tr sjm-tr--total">
                    <td class="sjm-td">{{ t('Total') }}</td>
                    <td class="sjm-td sjm-td--num">{{ formatIDR(totalDebit) }}</td>
                    <td class="sjm-td sjm-td--num">{{ formatIDR(totalCredit) }}</td>
                  </tr>
                </tbody>
              </table>

              <p v-else class="sjm-empty">
                {{ t('No journal entries yet — they appear as materials are issued, the vendor invoices, and goods come back.') }}
              </p>
            </template>

            <!-- ── Stock adjustment ── -->
            <template v-else>
              <table v-if="stockAdjustments.length" class="sjm-table">
                <thead>
                  <tr>
                    <th class="sjm-th">{{ t('Transaction no.') }}</th>
                    <th class="sjm-th">{{ t('Account') }}</th>
                    <th class="sjm-th">{{ t('Date') }}</th>
                    <th class="sjm-th">{{ t('Warehouse') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="adj in stockAdjustments" :key="adj.id" class="sjm-tr">
                    <td class="sjm-td">
                      <a class="cell-link" @click.prevent="openAdjustment(adj.id)">{{ adj.number }}</a>
                    </td>
                    <td class="sjm-td">{{ adj.account }}</td>
                    <td class="sjm-td">{{ adj.date ? formatDate(adj.date) : '—' }}</td>
                    <td class="sjm-td">{{ adj.warehouse }}</td>
                  </tr>
                </tbody>
              </table>

              <p v-else class="sjm-empty">
                {{ t('No stock movements yet — the components are issued when the work order starts.') }}
              </p>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sjm-enter-active, .sjm-leave-active { transition: opacity 200ms ease; }
.sjm-enter-from, .sjm-leave-to { opacity: 0; }
.sjm-enter-active .sjm-panel, .sjm-leave-active .sjm-panel { transition: transform 200ms ease, opacity 200ms ease; }
.sjm-enter-from .sjm-panel, .sjm-leave-to .sjm-panel { transform: scale(0.97); opacity: 0; }

.sjm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-12, 48px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.sjm-panel {
  width: min(880px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}

/* A grey title bar, as the reference has. */
.sjm-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) 0 0;
}
.sjm-bar__title {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.sjm-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.sjm-close:hover { background: var(--mp-background-neutral-hovered); }

.sjm-body { padding: var(--mp-spacing-5); }
.sjm-heading {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.sjm-tabs {
  display: flex; gap: var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
  margin-bottom: var(--mp-spacing-4);
}
.sjm-tab {
  padding: var(--mp-spacing-2) 0 var(--mp-spacing-3);
  border: none; background: transparent; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-bottom: var(--mp-border-width-lg, 2px) solid transparent;
  margin-bottom: calc(-1 * var(--mp-border-width-sm, 1px));
}
.sjm-tab--on {
  color: var(--mp-text-link);
  font-weight: var(--mp-font-weights-semi-bold);
  border-bottom-color: var(--mp-text-link);
}

.sjm-warning {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-warning-subtle, #fffaea);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md);
}
.sjm-warning :deep(svg) { color: var(--mp-text-warning, #b54708); flex: none; }

.sjm-table { width: 100%; border-collapse: collapse; }
.sjm-th {
  text-align: left;
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
}
.sjm-th--num { text-align: right; }
.sjm-td {
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.sjm-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.sjm-tr--total .sjm-td {
  font-weight: var(--mp-font-weights-semi-bold);
  border-bottom: none;
}

.sjm-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
