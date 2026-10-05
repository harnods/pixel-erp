<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/find-match/components/FindMatchModal.vue -->
<script setup lang="ts">
/**
 * Find match — pick the counterpart(s) for an anchor and confirm when the
 * selected total balances. Two directions, as in prod:
 *   • anchor = bank statement line(s) → candidates are book transactions
 *     ("Find transaction")
 *   • anchor = book transaction(s)    → candidates are bank statement lines
 *     ("Find bank statement line")
 * Candidates are restricted to the anchor's cash-flow direction.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpCheckbox, MpIcon,
} from '@mekari/pixel3'
import type { CashAccount, ReconDirection } from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'

export interface FindMatchItem {
  id: string
  date: string
  number?: string
  contact?: string
  description: string
  amount: number
  direction: ReconDirection
}

const props = defineProps<{
  open: boolean
  account: CashAccount
  mode: 'statement' | 'book'
  anchors: FindMatchItem[]
  candidates: FindMatchItem[]
}>()
const emit = defineEmits<{ close: []; confirm: [ids: string[]] }>()

const { t } = useLocale()
const search = ref('')
const selected = ref<string[]>([])
const error = ref('')
watch(() => props.open, (o) => { if (o) { search.value = ''; selected.value = []; error.value = '' } })

const direction = computed(() => props.anchors[0]?.direction ?? 'out')
const pool = computed(() => props.candidates.filter(c => c.direction === direction.value))
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return pool.value.filter(c => !selected.value.includes(c.id) && (!q
    || (c.number ?? '').toLowerCase().includes(q)
    || c.description.toLowerCase().includes(q)
    || (c.contact ?? '').toLowerCase().includes(q)))
})
const selectedItems = computed(() => selected.value.map(id => pool.value.find(c => c.id === id)).filter((c): c is FindMatchItem => !!c))
const totalToMatch = computed(() => props.anchors.reduce((s, a) => s + a.amount, 0))
const totalSelected = computed(() => selectedItems.value.reduce((s, a) => s + a.amount, 0))
const difference = computed(() => totalToMatch.value - totalSelected.value)

function add(id: string) { selected.value = [...selected.value, id]; error.value = '' }
function remove(id: string) { selected.value = selected.value.filter(x => x !== id) }
function addAll() { selected.value = [...selected.value, ...filtered.value.map(c => c.id)]; error.value = '' }
function money(n: number) { return formatMoney(n, props.account.currency) }

function confirm() {
  if (selectedItems.value.length === 0 || difference.value !== 0) {
    error.value = t('The selected total must balance the amount to confirm')
    return
  }
  emit('confirm', [...selected.value])
}
</script>

<template>
  <MpModal id="recon-find-match" :is-open="open" size="xl" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>
        {{ mode === 'statement' ? t('Find transaction') : t('Find bank statement line') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="fm">
          <!-- Anchor -->
          <section class="fm-anchor">
            <p class="fm-heading">{{ mode === 'statement' ? t('Bank statement line') : t('Book transaction line') }}</p>
            <div v-for="a in anchors" :key="a.id" class="fm-anchor__row">
              <span class="fm-muted">{{ formatDate(a.date) }}</span>
              <span class="fm-anchor__desc">{{ a.number ? `${a.number} · ` : '' }}{{ a.description }}</span>
              <span class="fm-anchor__dir">{{ a.direction === 'in' ? t('Money in') : t('Money out') }}</span>
              <span class="fm-amount">{{ money(a.amount) }}</span>
            </div>
          </section>

          <div class="fm-panes">
            <!-- Candidates -->
            <section class="fm-pane">
              <div class="fm-pane__head">
                <p class="fm-heading">{{ mode === 'statement' ? t('Book transactions') : t('Bank statement lines') }}</p>
                <MpButton v-if="filtered.length > 1" variant="ghost" is-rounded @click="addAll">{{ t('Add all') }}</MpButton>
              </div>
              <div class="filter-search fm-search">
                <MpIcon name="search" size="sm" />
                <input v-model="search" class="filter-search-input btn-enterprise" type="text" :placeholder="t('Search number or description')" :aria-label="t('Search number or description')" />
              </div>
              <ul v-if="filtered.length" class="fm-list">
                <li v-for="c in filtered" :key="c.id" class="fm-item" @click="add(c.id)">
                  <MpCheckbox :id="`fm-c-${c.id}`" :is-checked="false" @click.stop="add(c.id)" />
                  <div class="fm-item__main">
                    <span class="fm-item__title">{{ c.number ?? c.description }}</span>
                    <span class="fm-muted">{{ formatDate(c.date) }}<template v-if="c.contact"> · {{ c.contact }}</template><template v-if="c.number"> · {{ c.description }}</template></span>
                  </div>
                  <span class="fm-amount">{{ money(c.amount) }}</span>
                </li>
              </ul>
              <div v-else class="fm-empty">
                <template v-if="search">
                  <p class="fm-empty__title">“{{ search }}” {{ t('not found') }}</p>
                  <p class="fm-muted">{{ t('Recheck the keywords you have typed and try searching again, or create a new transaction.') }}</p>
                </template>
                <p v-else-if="pool.length" class="fm-muted">{{ t('All loaded candidates are in your selection') }}</p>
                <p v-else class="fm-muted">{{ t('No candidates found') }}</p>
              </div>
            </section>

            <!-- Selection -->
            <section class="fm-pane">
              <p class="fm-heading">{{ mode === 'statement' ? t('Selected book transactions') : t('Selected bank statement lines') }}</p>
              <ul v-if="selectedItems.length" class="fm-list">
                <li v-for="c in selectedItems" :key="c.id" class="fm-item fm-item--selected">
                  <div class="fm-item__main">
                    <span class="fm-item__title">{{ c.number ?? c.description }}</span>
                    <span class="fm-muted">{{ formatDate(c.date) }}<template v-if="c.contact"> · {{ c.contact }}</template></span>
                  </div>
                  <span class="fm-amount">{{ money(c.amount) }}</span>
                  <MpButton variant="ghost" is-rounded @click="remove(c.id)">{{ t('Remove') }}</MpButton>
                </li>
              </ul>
              <div v-else class="fm-empty">
                <p class="fm-empty__title">{{ mode === 'statement' ? t('No selected book transactions') : t('No selected bank statement lines') }}</p>
                <p class="fm-muted">{{ mode === 'statement' ? t('Selected book transactions will appear here.') : t('Selected bank statement lines will appear here.') }}</p>
              </div>
            </section>
          </div>

          <!-- Totals -->
          <div class="fm-totals">
            <div class="fm-totals__row"><span>{{ t('Total to match') }}</span><span class="fm-amount">{{ money(totalToMatch) }}</span></div>
            <div class="fm-totals__row"><span>{{ t('Total selected') }}</span><span class="fm-amount">{{ money(totalSelected) }}</span></div>
            <div class="fm-totals__row fm-totals__row--strong" :class="{ 'fm-totals__row--off': difference !== 0 }">
              <span>{{ t('Difference') }}</span><span class="fm-amount">{{ money(difference) }}</span>
            </div>
          </div>
          <p v-if="error" class="fm-error" role="alert">{{ error }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Confirm match') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.fm { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.fm-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.fm-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.fm-amount { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.fm-anchor { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle); }
.fm-anchor__row { display: grid; grid-template-columns: 96px 1fr auto auto; gap: var(--mp-spacing-4); align-items: center; font-size: var(--mp-font-sizes-md); }
.fm-anchor__desc { min-width: 0; overflow-wrap: anywhere; }
.fm-anchor__dir { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.fm-panes { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.fm-pane { display: flex; flex-direction: column; gap: var(--mp-spacing-3); min-width: 0; padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.fm-pane__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.fm-search { width: 100%; box-sizing: border-box; }
.fm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; }
.fm-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-1); border-bottom: 1px solid var(--mp-border-default); cursor: pointer; }
.fm-item:last-child { border-bottom: none; }
.fm-item:hover { background: var(--mp-background-neutral-hovered); }
.fm-item--selected { cursor: default; }
.fm-item--selected:hover { background: transparent; }
.fm-item__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fm-item__title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.fm-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-6) var(--mp-spacing-2); text-align: center; }
.fm-empty__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.fm-empty p { margin: 0; }
.fm-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-1); align-self: flex-end; min-width: 320px; }
.fm-totals__row { display: flex; justify-content: space-between; gap: var(--mp-spacing-6); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.fm-totals__row--strong { padding-top: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default); font-weight: var(--mp-font-weights-semi-bold); }
.fm-totals__row--off { color: var(--mp-text-danger); }
.fm-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); text-align: right; }
</style>
