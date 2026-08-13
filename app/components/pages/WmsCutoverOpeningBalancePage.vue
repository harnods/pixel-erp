<script setup lang="ts">
/**
 * Data migration → WMS cutover → Step 3: Set opening balance.
 *
 * A double-entry opening balance (trial balance) over the whole chart of
 * accounts:
 *  - The conversion date is editable (defaults 01/01/2026).
 *  - Every account shows a Debit and Credit the accountant fills in by hand,
 *    EXCEPT the inventory accounts mapped in Step 2 — those are "Synced":
 *    pre-filled from the product setup and read-only.
 *  - Total Debit must equal Total Credit (and be > 0) before it can be published.
 *
 * Reference: prototype "Set opening balance" (ACCOUNT · DEBIT · CREDIT, grouped
 * by Asset / Liability & Equity, inventory rows badged "Synced", balanced total).
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MpTextlink, MpIcon, MpDatePicker, toast } from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import {
  coaAccounts, computeOpeningBalance, cutoverState,
  CUTOVER_STEPS, isCutoverStepComplete, type CutoverStep, type CoaAccount,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// ── Conversion date (Pixel MpDatePicker uses DD/MM/YYYY; state keeps ISO) ────
function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function dmyToISO(dmy: string): string {
  const [d, m, y] = dmy.split('/')
  return `${y}-${m}-${d}`
}
const convDate = ref(isoToDMY(cutoverState.conversionDate))
watch(convDate, (v) => {
  if (v && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) cutoverState.conversionDate = dmyToISO(v)
})

// ── Formatting ──────────────────────────────────────────────────────────────
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 })
function fmtIDR(n: number): string { return idr.format(n).replace(/^(Rp)\s/, '$1') }
const grp = new Intl.NumberFormat('id-ID')
function fmtAmount(n: number | null): string { return n === null ? '' : grp.format(n) }
function parseAmount(raw: string): number | null {
  const d = raw.replace(/\D/g, '')
  return d === '' ? null : Number(d)
}

// ── Synced (locked) inventory debits carried from Step 2 ────────────────────
const syncedDebit = computed(() => {
  const m = new Map<string, number>()
  for (const line of computeOpeningBalance()) m.set(line.accountCode, line.debit)
  return m
})
function isSynced(code: string): boolean { return syncedDebit.value.has(code) }

// ── Editable debit/credit per account ───────────────────────────────────────
const entries = reactive<Record<string, { debit: number | null; credit: number | null }>>({})
for (const a of coaAccounts) entries[a.code] = { debit: null, credit: null }

function debitOf(code: string): number {
  return isSynced(code) ? (syncedDebit.value.get(code) ?? 0) : (entries[code]?.debit ?? 0)
}
function creditOf(code: string): number {
  return isSynced(code) ? 0 : (entries[code]?.credit ?? 0)
}

// ── Balance-sheet accounts only, grouped by code prefix ─────────────────────
// An opening balance covers balance-sheet accounts (Asset / Liability / Equity);
// P&L accounts (4–9) are not part of it — matching the reference design.
const GROUP_ORDER = ['Asset', 'Liability & Equity']
function groupOf(code: string): string | null {
  const d = code[0]
  if (d === '1') return 'Asset'
  if (d === '2' || d === '3') return 'Liability & Equity'
  return null
}
const visibleAccounts = computed(() => coaAccounts.filter((a) => groupOf(a.code) !== null))
const groups = computed(() => {
  const g: Record<string, CoaAccount[]> = {}
  for (const a of visibleAccounts.value) (g[groupOf(a.code)!] ??= []).push(a)
  return GROUP_ORDER.filter((k) => g[k]?.length).map((k) => ({ name: k, accounts: g[k]! }))
})

// ── Balance ─────────────────────────────────────────────────────────────────
const totalDebit = computed(() => visibleAccounts.value.reduce((s, a) => s + debitOf(a.code), 0))
const totalCredit = computed(() => visibleAccounts.value.reduce((s, a) => s + creditOf(a.code), 0))
const difference = computed(() => totalDebit.value - totalCredit.value)
const isBalanced = computed(() => difference.value === 0 && totalDebit.value > 0)

// ── Stepper / nav ───────────────────────────────────────────────────────────
const doneSteps = computed(() => CUTOVER_STEPS.filter((s) => isCutoverStepComplete(s.key)).map((s) => s.key))
function goStep(step: CutoverStep) { router.push(`/data-migration/wms-cutover/${step}`) }
function goBack() { router.push('/data-migration/wms-cutover/products') }
function cancel() { router.push('/data-migration') }
function saveDraft() {
  toast.notify({ variant: 'success', title: t('Saved as draft'), maxWidth: 'max-content' })
  router.push('/data-migration')
}

function publish() {
  if (!isBalanced.value) {
    toast.notify({ variant: 'danger', title: t('Total debit and credit must be equal'), maxWidth: 'max-content' })
    return
  }
  cutoverState.published = true
  toast.notify({ variant: 'success', title: t('Opening balance published'), maxWidth: 'max-content' })
  router.push('/data-migration')
}
</script>

<template>
  <div class="ob-page">

    <!-- ── Title bar ── -->
    <div class="ob-titlebar">
      <div class="ob-titlebar-left">
        <MpTextlink id="ob-breadcrumb" as="a" class="ob-breadcrumb" @click.prevent="goBack">{{ t('Set up opening balance') }}</MpTextlink>
        <h1 class="ob-title">{{ t('Set up opening balance') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="ob-stage">
      <div class="ob-wrapper">

        <ErpStepper :steps="CUTOVER_STEPS" current="opening-balance" :done="doneSteps" @select="goStep" />

        <!-- Conversion date (editable) -->
        <div class="ob-field">
          <label class="ob-field-label" for="ob-conv-date">{{ t('Conversion date') }}</label>
          <MpDatePicker
            id="ob-conv-date"
            v-model="convDate"
            format="DD/MM/YYYY"
            value-type="format"
            is-full-width
            use-portal
          />
          <span class="ob-field-hint">{{ t('First day of recording in ERP') }}</span>
        </div>

        <p class="ob-note">
          {{ t('Enter the opening debit and credit for every account. Inventory accounts are synced from your product setup and locked. Total debit must equal total credit to publish.') }}
        </p>

        <!-- Out-of-balance hint (above the table so it never bleeds below the sticky total) -->
        <p v-if="!isBalanced && totalDebit > 0" class="ob-imbalance">
          <MpIcon name="warning-triangle" size="sm" color="icon.warning" />
          {{ t('Out of balance by') }} {{ fmtIDR(Math.abs(difference)) }}
        </p>

        <!-- ── Trial balance table ── -->
        <div class="ob-table-wrap">
          <table class="ob-table">
            <colgroup>
              <col>
              <col class="ob-col--amount">
              <col class="ob-col--amount">
            </colgroup>
            <thead>
              <tr>
                <th class="ob-th">{{ t('Account') }}</th>
                <th class="ob-th ob-th--num">{{ t('Debit') }}</th>
                <th class="ob-th ob-th--num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in groups" :key="group.name">
                <tr class="ob-group-row">
                  <td class="ob-td ob-td--group" colspan="3">{{ t(group.name) }}</td>
                </tr>
                <tr v-for="a in group.accounts" :key="a.code" :class="{ 'ob-tr--synced': isSynced(a.code) }">
                  <td class="ob-td">
                    <span class="ob-acct-code">{{ a.code }}</span>{{ a.name }}
                    <span v-if="isSynced(a.code)" class="ob-synced">{{ t('Synced') }}</span>
                  </td>

                  <!-- Debit -->
                  <td class="ob-td ob-td--num" :class="{ 'ob-td--locked': isSynced(a.code), 'ob-td--input': !isSynced(a.code) }">
                    <span v-if="isSynced(a.code)">{{ fmtIDR(debitOf(a.code)) }}</span>
                    <div v-else class="ob-money">
                      <span class="ob-money-rp">Rp</span>
                      <input
                        :value="fmtAmount(entries[a.code].debit)"
                        class="ob-cell-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="0"
                        :aria-label="`${t('Debit')} — ${a.name}`"
                        @input="entries[a.code].debit = parseAmount(($event.target as HTMLInputElement).value)"
                      >
                    </div>
                  </td>

                  <!-- Credit -->
                  <td class="ob-td ob-td--num" :class="{ 'ob-td--locked': isSynced(a.code), 'ob-td--input': !isSynced(a.code) }">
                    <span v-if="isSynced(a.code)">{{ fmtIDR(0) }}</span>
                    <div v-else class="ob-money">
                      <span class="ob-money-rp">Rp</span>
                      <input
                        :value="fmtAmount(entries[a.code].credit)"
                        class="ob-cell-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="0"
                        :aria-label="`${t('Credit')} — ${a.name}`"
                        @input="entries[a.code].credit = parseAmount(($event.target as HTMLInputElement).value)"
                      >
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <td class="ob-td ob-td--total">{{ t('Total') }}</td>
                <td class="ob-td ob-td--num ob-td--total" :class="{ 'ob-td--balanced': isBalanced }">{{ fmtIDR(totalDebit) }}</td>
                <td class="ob-td ob-td--num ob-td--total" :class="{ 'ob-td--balanced': isBalanced }">{{ fmtIDR(totalCredit) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="ob-footer">
      <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="goBack">
        {{ t('Back') }}
      </button>
      <div class="ob-footer-actions">
        <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">{{ t('Cancel') }}</button>
        <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="saveDraft">{{ t('Save as draft') }}</button>
        <button type="button" class="btn-enterprise btn-enterprise--primary" @click="publish">{{ t('Publish opening balance') }}</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.ob-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar ── */
.ob-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-6);
}
.ob-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}
.ob-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  white-space: nowrap;
}
.ob-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ob-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
/* Stage is a non-scrolling flex column; the TABLE inside gets the leftover
   height and scrolls internally, so its header pins to the table top and its
   Total pins to the table bottom. */
.ob-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow: hidden;
  padding: var(--mp-spacing-6);
}
.ob-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 920px;
}
/* Everything except the table keeps its natural height; the table grows/scrolls. */
.ob-wrapper > :not(.ob-table-wrap) { flex-shrink: 0; }

/* ── Conversion date field ── */
.ob-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  max-width: 240px;
}
.ob-field-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ob-field-hint {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.ob-note {
  margin: 0;
  max-width: 760px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* ── Trial-balance table ── */
/* Fills the remaining height and scrolls internally; overflow clips to the
   rounded corners, and the sticky header/group/total pin against THIS box. */
.ob-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
}
.ob-table {
  width: 100%;
  border-collapse: collapse;
}
.ob-col--amount { width: 220px; }

.ob-th {
  position: sticky;
  top: 0;
  z-index: 3;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-4);
  text-align: left;
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
  white-space: nowrap;
}
.ob-th--num { text-align: right; }

.ob-td {
  height: var(--mp-sizes-12, 48px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  vertical-align: middle;
}
.ob-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ob-td--input { padding: 0; }
.ob-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.ob-td--locked { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }

/* Group divider row — sticks just below the header so the current category
   stays visible while scrolling its accounts. */
.ob-td--group {
  position: sticky;
  top: var(--mp-sizes-10, 40px);
  z-index: 2;
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  box-shadow: inset 0 -1px 0 var(--mp-border-default);
}

.ob-acct-code {
  color: var(--mp-text-secondary);
  margin-right: var(--mp-spacing-2);
  font-variant-numeric: tabular-nums;
}
.ob-synced {
  display: inline-flex;
  align-items: center;
  margin-left: var(--mp-spacing-2);
  padding: 2px var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-positive, #2fa36b);
  background: var(--mp-background-positive-subtle, #e8f5eb);
}

/* Editable money cell — Rp prefix left, amount right */
.ob-money {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  height: var(--mp-sizes-12, 48px);
  padding: 0 var(--mp-spacing-4);
}
.ob-money-rp { flex-shrink: 0; color: var(--mp-text-secondary); }
.ob-cell-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ob-cell-input::placeholder { color: var(--mp-text-placeholder); }

/* Totals — sticky to the bottom of the scroll area. */
.ob-table tfoot .ob-td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-bottom: none;
  border-top: 1px solid var(--mp-border-bold);
  background: var(--mp-background-neutral);
  font-weight: var(--mp-font-weights-semi-bold);
}
.ob-td--balanced { color: var(--mp-text-positive, #2fa36b); }

.ob-imbalance {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-warning, #a14a0b);
}

/* ── Sticky footer ── */
.ob-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
.ob-footer-actions {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
</style>
