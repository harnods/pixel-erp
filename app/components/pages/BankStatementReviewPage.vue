<script setup lang="ts">
/**
 * BankStatementReviewPage — "File review N of M" for a file uploaded through
 * Cash management's "Import with OCR" modal.
 *
 * Same spine as the Expense / Purchase invoice reviews: the chrome comes from
 * FileReviewShell, the footer and section headers follow their patterns. What a
 * bank statement actually needs is much smaller than a document review, though —
 * there's no vendor, no tax, no totals. Just two things:
 *
 *   Account         which cash account these lines belong to. AI proposes one by
 *                   reading the bank's name off the letterhead.
 *   Statement lines the rows OCR lifted off the page, each editable before they
 *                   are committed to the account's statement.
 *
 * A statement runs to hundreds of rows, so the table reveals ten at a time
 * rather than paginating — the user is proof-reading top to bottom, not jumping
 * around, and paging would hide rows they've already corrected.
 */
import { ref, computed, watch } from 'vue'
import {
  MpAutocomplete, MpCheckbox, MpDatePicker, MpIcon, MpInput, MpTextarea, MpTextlink, toast,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import FileReviewShell from '~/components/patterns/FileReviewShell.vue'
import {
  cashAccounts, bankStatementReviewFiles, ensureBankStatementReviewRun,
  getBankStatementLines, addImportedStatementLines,
} from '~/data'
import type { StatementLineDraft, BankStatementLine } from '~/data'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()

// A reload wipes the in-memory run, so a refreshed or shared review URL would
// land on nothing — reseed the sample files before the first render.
ensureBankStatementReviewRun()

const queue = computed(() => bankStatementReviewFiles)
const index = computed(() => {
  const i = queue.value.findIndex((rf) => rf.id === props.orderId)
  return i === -1 ? 0 : i
})
const reviewFile = computed(() => queue.value.find((rf) => rf.id === props.orderId) ?? queue.value[0])

function goBack() { router.push('/cash-management') }

/** Next file in the run, resolved *before* the current one is removed — see
 *  useReviewQueue's goToNext for why this returns a thunk. */
function goToNext(): () => void {
  const list = queue.value
  const here = index.value
  const next = list[here + 1] ?? list[here - 1]
  const nextId = next && next.id !== props.orderId ? next.id : null
  return () => {
    if (nextId) router.push(`/cash-management/review/${nextId}`)
    else goBack()
  }
}

// ── Account ──────────────────────────────────────────────────────────────────
const accountOptions = computed(() =>
  cashAccounts
    .filter((a) => !a.isArchived)
    .map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })),
)
const account = ref('')
const accountError = ref(false)
/** Only shown while the field still holds what AI proposed — once the user
 *  overrides it the hint is stale, so it goes away. */
const aiMatchedBank = computed(() =>
  reviewFile.value?.aiMatchedBank && account.value === reviewFile.value.accountId
    ? reviewFile.value.aiMatchedBank
    : '',
)

// ── Statement lines ──────────────────────────────────────────────────────────
const PAGE_SIZE = 10

type Movement = 'in' | 'out'
const MOVEMENT_OPTIONS: { id: Movement; name: string }[] = [
  { id: 'in',  name: 'Money in'  },
  { id: 'out', name: 'Money out' },
]

/** Editable copy of what OCR extracted — `amountText` is what the input shows,
 *  kept as a string so a half-typed value survives between keystrokes. Sign is
 *  driven entirely by `movement`, not by anything the user types into the
 *  amount field — see normalizeAmount. */
interface LineRow { id: string; date: string; description: string; movement: Movement; amountText: string }
const lines = ref<LineRow[]>([])
const visibleCount = ref(PAGE_SIZE)
const selected = ref(new Set<string>())

/** 'Rp' is rendered as a separate prefix cell, so this formats the magnitude
 *  only: money out always reads as accounting parentheses, money in bare —
 *  regardless of what sign (if any) the user typed. */
function formatAmount(magnitude: number | null, movement: Movement): string {
  if (magnitude === null || Number.isNaN(magnitude)) return ''
  const text = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.abs(magnitude))
  return movement === 'out' ? `(${text})` : text
}

/** Reads back whatever the user typed as an unsigned magnitude — a leading
 *  minus or wrapping parens are just how they expressed "money out" and don't
 *  carry through; `movement` is what decides the sign on display. */
function parseAmount(text: string): number | null {
  const raw = text.trim()
  if (!raw) return null
  const digits = raw.replace(/[^0-9,]/g, '').replace(',', '.')
  if (!digits) return null
  const n = Number(digits)
  return Number.isNaN(n) ? null : n
}

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toIsoDate(display: string) {
  const [d, m, y] = display.split('/')
  return y && m && d ? `${y}-${m}-${d}` : display
}
function movementLabel(m: Movement) {
  return MOVEMENT_OPTIONS.find((o) => o.id === m)?.name ?? ''
}
function setMovement(row: LineRow, m: Movement) {
  row.movement = m
  normalizeAmount(row)
}

/** Reload the editable rows whenever the page switches to another file. */
watch(
  () => reviewFile.value?.id,
  () => {
    const file = reviewFile.value
    lines.value = (file?.lines ?? []).map((l: StatementLineDraft) => {
      const movement: Movement = (l.amount ?? 0) < 0 ? 'out' : 'in'
      return {
        id: l.id,
        date: toDisplayDate(l.date),
        description: l.description,
        movement,
        amountText: formatAmount(l.amount === null ? null : Math.abs(l.amount), movement),
      }
    })
    account.value = file?.accountId ?? ''
    accountError.value = false
    visibleCount.value = PAGE_SIZE
    selected.value = new Set()
  },
  { immediate: true },
)

const visibleLines = computed(() => lines.value.slice(0, visibleCount.value))
const remaining = computed(() => Math.max(0, lines.value.length - visibleCount.value))
const nextChunk = computed(() => Math.min(PAGE_SIZE, remaining.value))
function loadMore() { visibleCount.value = Math.min(lines.value.length, visibleCount.value + PAGE_SIZE) }

/** Reformat on blur so the cell always settles into the canonical shape,
 *  whatever the user typed. Left alone while focused. */
function normalizeAmount(row: LineRow) {
  row.amountText = formatAmount(parseAmount(row.amountText), row.movement)
}

const allVisibleSelected = computed(
  () => visibleLines.value.length > 0 && visibleLines.value.every((l) => selected.value.has(l.id)),
)
const someVisibleSelected = computed(() => selected.value.size > 0 && !allVisibleSelected.value)
function toggleAll() {
  selected.value = allVisibleSelected.value ? new Set() : new Set(visibleLines.value.map((l) => l.id))
}
function toggleRow(id: string) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

// ── Save ─────────────────────────────────────────────────────────────────────
/** Commits the reviewed rows onto the chosen account's Bank statement tab as
 *  unreconciled lines, then lands the user right there — that's the point of
 *  the import, not continuing on to the next queued file. */
function handleSave() {
  if (!account.value) {
    accountError.value = true
    return
  }
  if (selected.value.size === 0) {
    toast.notify({
      variant: 'error',
      title: t('You must select at least one statement line'),
      maxWidth: 'max-content',
      rootProps: { class: 'toast-enterprise' },
    })
    return
  }
  const acct = cashAccounts.find((a) => a.id === account.value)
  if (!acct) return

  const selectedLines = lines.value.filter((row) => selected.value.has(row.id))

  // Chain balances forward from the account's current top-of-statement figure
  // so the newly imported rows read as a continuation of it.
  const currentTop = getBankStatementLines(acct.id, acct.bookBalance, acct.unreconciledCount)[0]?.balance ?? acct.bookBalance
  let balance = currentTop
  const imported: BankStatementLine[] = selectedLines.map((row) => {
    const magnitude = parseAmount(row.amountText) ?? 0
    const moneyIn = row.movement === 'in' ? magnitude : 0
    const moneyOut = row.movement === 'out' ? magnitude : 0
    balance = balance + moneyIn - moneyOut
    return {
      id: `${row.id}-imported`,
      date: toIsoDate(row.date),
      description: row.description,
      moneyIn, moneyOut, balance,
      status: 'unreconciled',
    }
  })
  // Statement tab sorts newest-first; the rows above were walked in the order
  // OCR extracted them (oldest first), so flip before prepending.
  addImportedStatementLines(acct.id, imported.reverse())

  const saved = imported.length
  const i = queue.value.findIndex((rf) => rf.id === props.orderId)
  if (i !== -1) queue.value.splice(i, 1)
  toast.notify({
    variant: 'success',
    title: `${saved} ${saved === 1 ? t('statement line') : t('statement lines')} ${t('imported')}`,
    maxWidth: 'max-content',
    rootProps: { class: 'toast-enterprise' },
  })
  router.push(`/cash-management/${acct.id}?tab=statement`)
}
</script>

<template>
  <FileReviewShell
    v-if="reviewFile"
    :queue="queue"
    :file-id="orderId"
    :back-label="t('Cash management')"
    queue-base="/cash-management/review"
    :page-count="1"
    :preview-images="reviewFile.preview ? [reviewFile.preview] : undefined"
    @back="goBack"
  >
    <div class="bsr-form">
      <!-- ── Bank statements ── -->
      <section class="bsr-section">
        <h2 class="br-section-title">{{ t('Bank statements') }}</h2>

        <div class="br-ai-field bsr-account-field">
          <MpFormControl id="bsr-account" is-required :is-invalid="accountError" :class="{ 'br-ai-anchor': aiMatchedBank }">
            <MpFormLabel>{{ t('Account') }}</MpFormLabel>
            <MpAutocomplete
              id="bsr-account-ac" v-model="account" :data="accountOptions"
              label-prop="name" value-prop="id"
              is-searchable is-clearable use-portal is-full-width
              :is-invalid="accountError"
              @update:model-value="accountError = false"
            />
            <MpFormErrorMessage>{{ t('You must select account') }}</MpFormErrorMessage>
          </MpFormControl>
          <div v-if="aiMatchedBank" class="br-ai-banner">
            <MpIcon name="airene-brand" size="sm" />
            <span>{{ t('AI matched') }} — {{ aiMatchedBank }} {{ t('in doc') }}</span>
          </div>
        </div>
      </section>

      <!-- ── Statement lines ── -->
      <section class="bsr-section">
        <h2 class="br-section-title">{{ t('Statement lines') }}</h2>

        <div class="ex-table-section">
        <div class="ex-table-scroll">
          <table class="ex-table bsr-lines-table">
            <colgroup>
              <col class="bsr-col-check" />
              <col class="bsr-col-date" />
              <col class="bsr-col-desc" />
              <col class="bsr-col-movement" />
              <col class="bsr-col-amount" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th ex-th--check">
                  <MpCheckbox
                    id="bsr-select-all"
                    :is-checked="allVisibleSelected"
                    :is-indeterminate="someVisibleSelected"
                    @change="toggleAll"
                  />
                </th>
                <th class="ex-th">{{ t('Date') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th">{{ t('Movement') }}</th>
                <th class="ex-th">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleLines" :key="row.id" class="ex-tr">
                <td class="ex-td ex-td--check">
                  <MpCheckbox
                    :id="`bsr-row-${row.id}`"
                    :is-checked="selected.has(row.id)"
                    @change="() => toggleRow(row.id)"
                  />
                </td>
                <td class="ex-td ex-td--input">
                  <MpDatePicker
                    :id="`bsr-date-${row.id}`"
                    :model-value="row.date"
                    format="DD/MM/YYYY" value-type="format" use-portal
                    :is-clearable="false"
                    class="ex-datepicker"
                    @update:model-value="(v: string) => (row.date = v)"
                  />
                </td>
                <td class="ex-td ex-td--input">
                  <MpTextarea :id="`bsr-desc-${row.id}`" v-model="row.description" is-full-width :rows="2" class="bsr-desc-textarea" />
                </td>
                <td class="ex-td ex-td--input ex-td--movement">
                  <MpPopover
                    :id="`bsr-movement-pop-${row.id}`" is-close-on-select use-portal
                    :is-keep-alive="false" placement="bottom-start"
                  >
                    <MpPopoverTrigger>
                      <button type="button" class="bsr-movement-trigger">
                        <span>{{ t(movementLabel(row.movement)) }}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="o in MOVEMENT_OPTIONS" :key="o.id"
                          @click="setMovement(row, o.id)"
                        >{{ t(o.name) }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td class="ex-td ex-td--input ex-td--amount">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <MpInput
                      :id="`bsr-amount-${row.id}`" v-model="row.amountText"
                      is-full-width class="ex-amount-input bsr-amount-input"
                      @blur="normalizeAmount(row)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
            <!-- Progressive reveal — a statement is proof-read top to bottom, so
                 rows accumulate rather than paging away. Lives inside the table
                 (not a separate element) so it reads as the table's last row. -->
            <tfoot>
              <tr>
                <td class="bsr-lines-footer" colspan="5">
                  <span class="bsr-lines-count">
                    {{ t('Showing') }} {{ visibleLines.length }} {{ t('of') }} {{ lines.length }} {{ t('lines') }}
                  </span>
                  <MpTextlink v-if="remaining > 0" id="bsr-load-more" as="a" href="#" @click.prevent="loadMore">
                    {{ t('Load') }} {{ nextChunk }} {{ t('more...') }}
                  </MpTextlink>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      </section>

      <footer class="ex-footer">
        <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--secondary" @click="goToNext()()">{{ t('Skip without saving') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="handleSave">{{ t('Save') }}</button>
      </footer>
    </div>
  </FileReviewShell>
</template>

<style scoped>
.bsr-form { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.bsr-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.br-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl); color: var(--mp-text-default);
}
.bsr-account-field { max-width: 420px; }

/* ── Airene hint — same treatment as the vendor/warehouse hints on the
   invoice review (banner tucked under the field it explains). ───────────── */
.br-ai-field { display: flex; flex-direction: column; }
.br-ai-anchor { margin-bottom: calc(-1 * var(--mp-spacing-2)); position: relative; z-index: 2; }
.br-ai-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  position: relative; z-index: 1;
  background: var(--mp-airene-banner-bg, #f6f3ff); color: var(--mp-airene-banner-text, #5221a5);
  padding: var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-1\.5);
  border-radius: 0 0 var(--mp-radii-md) var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
}
/* The airene-brand glyph has no intrinsic box — MpIcon's size prop leaves it
   at its natural (oversized) dimensions, so pin it. */
.br-ai-banner :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Lines table — the shared ex-table shell from the other review pages ──
   Border + radius live on the OUTER wrapper with overflow:hidden so the box
   is always fully painted (incl. the bottom edge); horizontal scrolling is
   delegated to the inner wrapper so it doesn't clip that border itself. */
.ex-table-section { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.bsr-lines-table { min-width: 720px; }
.bsr-col-check { width: 44px; }
.bsr-col-date { width: 120px; }
.bsr-col-desc { width: auto; }
.bsr-col-movement { width: 148px; }
.bsr-col-amount { width: 180px; }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.ex-th--check { padding: 0 0 0 var(--mp-spacing-3); border-right: none; }
.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
/* Vertical grid lines — every column but the checkbox gets its own right
   border, so each field cell reads as its own box. */
.ex-th, .ex-td { border-right: 1px solid var(--mp-border-default); }
.ex-th--check, .ex-td--check { border-right: none; }
.ex-td--check { padding: var(--mp-sizes-2\.5, 10px) 0 0 var(--mp-spacing-3); vertical-align: top; }
.ex-td--input { padding: 0; vertical-align: top; }
.ex-td--input :deep([class*='input']),
.ex-td--input :deep([class*='textarea']),
.ex-td--input :deep([class*='datepicker']) { border-radius: 0; border-color: transparent; }
.ex-td--input .ex-datepicker { width: 100%; }
.ex-td--input .ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }
/* Description — MpTextarea wraps to 2 lines instead of scrolling horizontally
   like a single-line MpInput would; resizing stays off so the row height (and
   the top-aligned cells beside it) doesn't shift under the user. */
.ex-td--input :deep(.bsr-desc-textarea) { resize: none; }
/* Calendar icon addon — the field should still open the picker on focus, it
   just doesn't need the trailing glyph advertising that. */
.ex-datepicker :deep(.mp-input-addon__root) { display: none; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused, #41c6a0); }
/* A <td>'s height is "auto", and percentage/100% heights on a normal-flow
   child never resolve against an auto-height containing block (CSS2.1 10.5)
   — the row here is only ever taller than 40px because of the 2-line
   description textarea next to it, so `height:100%` on these cells silently
   no-ops and leaves the extra row height as blank space below them.
   `position:absolute; inset:0` sidesteps the rule (insets aren't `height`)
   and, as a side effect, drops the cell out of the flow that determines the
   td's own intrinsic height — which is fine, the row height is still set by
   the description column either way. */
.ex-td--amount { padding: 0; position: relative; }

/* Movement — popover-driven pick, styled to sit flush in the cell like the
   other inputs rather than as a standalone button. */
.ex-td--movement { padding: 0; position: relative; }
.bsr-movement-trigger {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px);
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-family: inherit;
}
.bsr-movement-trigger:hover { background: var(--mp-background-neutral-hovered); }
.bsr-movement-trigger svg { flex-shrink: 0; color: var(--mp-icon-default, var(--mp-text-secondary)); }

/* Rp prefix + editable amount — same cell markup as the expense line items */
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* MpInput forwards `class` onto the <input> itself (.mp-input__control), not a
   wrapper — so the growing flex child is its own __root div, and the alignment
   rule belongs directly on .bsr-amount-input. */
.ex-amount-cell :deep(.mp-input__root) { flex: 1; min-width: 0; align-items: flex-start; }
/* …and because that <input> isn't MpInput's root element, the scoped data-v
   attribute never reaches it — the rule has to go through :deep. A native
   <input>'s value text ignores align-items on the control itself (tested —
   Chrome still centers it regardless of flex-start), so stretching the input
   to the row's height can't be used to get top alignment. Left at its
   intrinsic (line-height + padding-top) height instead, which top-aligns for
   free since there's nothing to center within. Its background is white like
   the page anyway, so a shorter box isn't visible — only its own focus
   border would betray the shorter height, so that's suppressed below in
   favour of the full-height ring already on .ex-td--input:focus-within. */
.ex-amount-cell :deep(.bsr-amount-input) {
  text-align: right; font-variant-numeric: tabular-nums;
  padding-top: var(--mp-sizes-2\.5, 10px) !important;
}
.ex-amount-cell :deep(.bsr-amount-input:focus) { border-color: transparent !important; box-shadow: none !important; }

/* ── Lines footer — count + progressive "Load N more", rendered as the
   table's own last row (not a separate element below it). ── */
.bsr-lines-footer {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2);
  border-right: none; border-bottom: none; border-top: 1px solid var(--mp-border-default);
}
.bsr-lines-count {
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary); white-space: nowrap;
}

/* ── Footer ── */
.ex-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-6); padding-bottom: var(--mp-spacing-12, 48px);
}
</style>
