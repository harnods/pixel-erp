<script setup lang="ts">
/**
 * New invoice (project-tagged) — the billing side of Project accounting.
 *
 * Everything that bills routes through this one form, prefilled from whatever
 * raised it. What it was raised from lives in the URL, so a refresh rebuilds the
 * same document:
 *
 *   ?kind=tm       every reviewed, uninvoiced cost line on the project
 *   ?kind=billing  one line from the Percentage of completion billing schedule
 *   ?kind=output   one line for a verified milestone (recognition already posted)
 *   ?kind=adhoc    a single blank line
 *
 * Guardrails are inline: a milestone invoice is blocked until the milestone is
 * verified, and the form warns when the amount differs from the milestone or
 * schedule amount or exceeds what is left to bill on the contract.
 *
 * Lines start with no tax; the user picks it. The invoice posts its pre-tax amount against
 * the project, so billed-to-date compares like for like with recognized revenue.
 *
 * The line table copies NewExpensePage's `ex-*` markup (docs/patterns/FormTable.md).
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpButton,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpInput, MpTextarea, MpAutocomplete, MpDatePicker, MpIcon, toast, MpTextlink,
} from '@mekari/pixel3'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import {
  findEngagement, projectOptions, saveInvoice, newInvoiceLine,
  invoiceLineAmount, invoiceLineTax, readyToInvoice, entryFinal, entryLabel,
  revenue, billed, remainingToBill, milestoneBillable,
  TAX_OPTIONS, PAYMENT_TERMS_OPTIONS, TODAY, formatIdr,
  type InvoiceDraftLine, type InvoiceKind,
} from '~/data/projectAccounting'
import { contactsOfType } from '~/data/contacts'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

// MpDatePicker works in the display format (DESIGN.md → dd/mm/yyyy); the data
// layer stores ISO. Convert at the boundary, both ways.
function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }

const engId = String(route.query.project ?? '')
const kind = (String(route.query.kind ?? 'adhoc') || 'adhoc') as InvoiceKind
const label = String(route.query.label ?? t('Invoice'))
const milestoneId = route.query.milestone ? String(route.query.milestone) : null

const engagement = computed(() => findEngagement(engId))

/** No default tax: the user picks it per line (user decision). */
const DEFAULT_TAX = 'No tax'

function line(product: string, description: string, unitPrice: number, project: string): InvoiceDraftLine {
  return { ...newInvoiceLine(product, description, unitPrice, project), tax: DEFAULT_TAX }
}

// ── What this invoice was raised from ─────────────────────────────────────────
const outputMilestone = computed(() =>
  kind === 'output' && milestoneId ? engagement.value?.milestones?.find(x => x.id === milestoneId) : undefined,
)
const billingRow = computed(() =>
  kind === 'billing' && milestoneId ? engagement.value?.billing?.find(x => x.id === milestoneId) : undefined,
)

/** A milestone invoice needs a verified, not-yet-invoiced milestone. */
const milestoneBlock = computed<string>(() => {
  if (kind !== 'output' || !milestoneId) return ''
  const e = engagement.value
  const m = outputMilestone.value
  if (!e || !m) return t('This milestone no longer exists on the project.')
  if (milestoneBillable(e, milestoneId)) return ''
  if (m.invId) return t('This milestone is already invoiced on {inv}.').replace('{inv}', m.invId)
  return t('Verify this milestone on the project before you invoice it. Its revenue is not recognized yet.')
})

/** The amount the source says this invoice should carry, if it names one. */
const expectedAmount = computed<number | null>(() => {
  const e = engagement.value
  if (!e) return null
  if (outputMilestone.value && !milestoneBlock.value) return outputMilestone.value.recognized
  if (billingRow.value) return Math.round((e.contractValue * billingRow.value.pct) / 100)
  return null
})

/**
 * Which cost lines this invoice consumes. Captured once at mount so that saving —
 * which flips them to invoiced — cannot shrink the list mid-edit.
 */
const sourceEntryIds = ref<string[]>([])

function buildLines(): InvoiceDraftLine[] {
  const e = engagement.value
  if (!e) return [line('Professional services', '', 0, '')]

  if (kind === 'tm') {
    const items = readyToInvoice(e)
    sourceEntryIds.value = items.map(x => x.id)
    if (items.length) return items.map(x => line('Professional services', entryLabel(x), entryFinal(x), e.id))
  }
  if (billingRow.value) {
    return [line('Progress billing', billingRow.value.label, (e.contractValue * billingRow.value.pct) / 100, e.id)]
  }
  if (outputMilestone.value) {
    // An unverified milestone has nothing recognized yet, so it prefills no amount.
    const m = outputMilestone.value
    return [line('Milestone billing', m.label, milestoneBlock.value ? 0 : m.recognized, e.id)]
  }
  return [line('Professional services', '', 0, e.id)]
}

// ── Customer ──────────────────────────────────────────────────────────────────
// Picked from the Contacts master like every other sales form, prefilled with the
// project's customer. A seeded project whose customer is not in Contacts yet is
// kept as an option so the prefill still shows.
const customerContacts = computed(() => contactsOfType('customer').filter(c => !c.archived && c.displayName))
const customerData = computed(() => {
  const list = customerContacts.value.map(c => ({ id: c.id, name: c.displayName }))
  const own = engagement.value?.client
  if (own && !list.some(c => c.name === own)) list.unshift({ id: `project-${engId}`, name: own })
  return list
})

const customer = ref(engagement.value?.client ?? '')
const email = ref('')
const address = ref('')

function fillFromContact(name: string) {
  const c = customerContacts.value.find(x => x.displayName === name)
  email.value = c?.emails[0] ?? ''
  address.value = c?.billingAddress ?? ''
}
fillFromContact(customer.value)

function onCustomerPicked(name: string) {
  customerError.value = false
  fillFromContact(name)
}
function openNewContact() { window.open('/customers/new', '_blank', 'noopener') }

// ── Draft ─────────────────────────────────────────────────────────────────────
const date = ref(toDisplayDate(TODAY))
const dueDate = ref(toDisplayDate('2026-09-02'))
const terms = ref(PAYMENT_TERMS_OPTIONS[0]!)
const reference = ref('')
const message = ref('')
const memo = ref('')
const lines = reactive<InvoiceDraftLine[]>(buildLines())

const taxData = TAX_OPTIONS.map(a => ({ id: a, name: a }))
const termsData = PAYMENT_TERMS_OPTIONS.map(a => ({ id: a, name: a }))
const projectData = computed(() => projectOptions().map(p => ({ id: p.id, name: p.name })))

function addLine() {
  lines.push(line('Professional services', '', 0, engId))
}
function removeLine(id: string) {
  const i = lines.findIndex(l => l.id === id)
  if (i !== -1) lines.splice(i, 1)
}

const subtotal = computed(() => lines.reduce((a, l) => a + invoiceLineAmount(l), 0))
const taxTotal = computed(() => lines.reduce((a, l) => a + invoiceLineTax(l), 0))
const grandTotal = computed(() => subtotal.value + taxTotal.value)

const sourceNote = computed(() => {
  if (kind === 'tm') return t('Prefilled with reviewed cost lines not yet invoiced')
  if (kind === 'output') return milestoneBlock.value ? '' : t('Prefilled from the verified milestone. Its revenue is already recognized.')
  if (kind === 'billing') return t('Prefilled from the billing schedule')
  return ''
})

// ── Project context strip + amount guardrails ─────────────────────────────────
const contextProject = computed(() => {
  const id = lines.find(l => l.project)?.project
  return id ? findEngagement(id) : undefined
})

/** Pre-tax amount of this invoice billed to the context project. */
const thisDoc = computed(() => {
  const e = contextProject.value
  return e ? lines.filter(l => l.project === e.id).reduce((a, l) => a + invoiceLineAmount(l), 0) : 0
})

const contextStats = computed<ProjectStat[]>(() => {
  const e = contextProject.value
  if (!e) return []
  return [
    { key: 'cv', label: e.method === 'tm' ? t('Fee estimate') : t('Contract value'), value: e.method === 'tm' && e.budget === null ? t('No budget') : formatIdr(e.method === 'tm' ? e.feeEstimate : e.contractValue) },
    { key: 'rec', label: t('Revenue recognized'), value: formatIdr(revenue(e)) },
    { key: 'billed', label: t('Billed to date'), value: formatIdr(billed(e)) },
    { key: 'doc', label: t('This invoice'), value: formatIdr(thisDoc.value) },
  ]
})

/** Blocking: billing more than the milestone / schedule row, or more than is left on the contract. */
const amountErrors = computed<string[]>(() => {
  const e = contextProject.value
  const out: string[] = []
  if (!e || thisDoc.value <= 0) return out
  const exp = e.id === engId ? expectedAmount.value : null
  if (exp !== null && thisDoc.value > exp) {
    out.push((outputMilestone.value
      ? t('This invoice is {amount}, more than the milestone amount of {expected}.')
      : t('This invoice is {amount}, more than the billing schedule amount of {expected}.'))
      .replace('{amount}', formatIdr(thisDoc.value)).replace('{expected}', formatIdr(exp)))
  }
  // A cost plus margin fee is an estimate, not a cap, so only contracts are checked.
  if (e.method !== 'tm' && thisDoc.value > remainingToBill(e)) {
    out.push(t('This invoice is {over} more than the {left} left to bill on the contract.')
      .replace('{over}', formatIdr(thisDoc.value - remainingToBill(e))).replace('{left}', formatIdr(remainingToBill(e))))
  }
  return out
})

/** Non-blocking: billing less than the milestone / schedule row (a partial bill). */
const amountWarnings = computed<string[]>(() => {
  const e = contextProject.value
  if (!e || thisDoc.value <= 0) return []
  const exp = e.id === engId ? expectedAmount.value : null
  if (exp === null || thisDoc.value >= exp) return []
  return [(outputMilestone.value
    ? t('This invoice is {amount}, less than the milestone amount of {expected}.')
    : t('This invoice is {amount}, less than the billing schedule amount of {expected}.'))
    .replace('{amount}', formatIdr(thisDoc.value)).replace('{expected}', formatIdr(exp))]
})

const showAmountErrors = ref(false)

// ── Save ──────────────────────────────────────────────────────────────────────
// Every error shows inline; toasts only report success.
const customerError = ref(false)
const linesError = ref(false)
const isSaving = ref(false)

function back() {
  if (engId) router.push({ path: `/project-accounting/${engId}`, query: { tab: 'billing' } })
  else router.push('/project-accounting')
}

async function save() {
  if (milestoneBlock.value) return
  customerError.value = !customer.value.trim()
  linesError.value = subtotal.value <= 0
  showAmountErrors.value = amountErrors.value.length > 0
  if (customerError.value || linesError.value || showAmountErrors.value) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const inv = saveInvoice({
    engId,
    kind,
    label,
    milestoneId,
    entryIds: kind === 'tm' ? sourceEntryIds.value : null,
    date: toISODate(date.value),
    amount: subtotal.value,
  })
  isSaving.value = false
  if (!inv) {
    toast.notify({ variant: 'error', title: t('Project not found. It may have been deleted.') })
    return
  }
  toast.notify({ variant: 'success', title: t('Invoice {no} saved').replace('{no}', inv.id), maxWidth: 'max-content' })
  back()
}
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar (form variant) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="pi-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="back">{{ t('Project accounting') }}</MpTextlink>
        <h1 class="detail-title">{{ t('New invoice') }}</h1>
        <p v-if="sourceNote" class="detail-subtitle">{{ sourceNote }}</p>
      </div>
    </header>

    <div class="detail-stage">
      <section v-if="contextStats.length" class="pi-context" data-tour="pa-invoice-context">
        <p class="pi-context-title">{{ t('Project') }} · {{ contextProject?.name }}</p>
        <ProjectStatCards :stats="contextStats" />
      </section>

      <MpBanner v-if="milestoneBlock" id="pi-milestone-block" variant="danger" align-items="center">
        <MpBannerIcon id="pi-milestone-block-icon" />
        <MpBannerDescription>{{ milestoneBlock }}</MpBannerDescription>
      </MpBanner>

      <div class="pi-doc">
        <!-- ── Header fields ── -->
        <div class="pi-head-grid">
          <div class="pi-head-col">
            <MpFormControl id="pi-customer" is-required :is-invalid="customerError">
              <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
              <MpAutocomplete
                id="pi-customer-input" v-model="customer" :data="customerData"
                label-prop="name" value-prop="name" is-searchable use-portal is-full-width
                :is-invalid="customerError" :placeholder="t('Select a contact')"
                is-show-button-action
                @update:model-value="onCustomerPicked"
                @button-action="openNewContact"
              >
                <template #buttonAction>{{ t('Add new contact') }}</template>
              </MpAutocomplete>
              <MpFormErrorMessage>{{ t('You must select customer') }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="pi-address">
              <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
              <MpTextarea id="pi-address-input" v-model="address" is-full-width />
            </MpFormControl>
          </div>

          <div class="pi-head-col">
            <MpFormControl id="pi-email">
              <MpFormLabel>{{ t('Email') }}</MpFormLabel>
              <MpInput id="pi-email-input" v-model="email" is-full-width />
            </MpFormControl>
            <MpFormControl id="pi-date">
              <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
              <MpDatePicker id="pi-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
            </MpFormControl>
            <MpFormControl id="pi-due">
              <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
              <MpDatePicker id="pi-due-input" v-model="dueDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </MpFormControl>
          </div>

          <div class="pi-head-col">
            <MpFormControl id="pi-terms">
              <MpFormLabel>{{ t('Payment terms') }}</MpFormLabel>
              <MpAutocomplete
                id="pi-terms-input" v-model="terms" :data="termsData"
                label-prop="name" value-prop="id" use-portal is-full-width
              />
            </MpFormControl>
            <MpFormControl id="pi-ref">
              <MpFormLabel>{{ t('Reference number') }}</MpFormLabel>
              <MpInput id="pi-ref-input" v-model="reference" is-full-width />
            </MpFormControl>
          </div>
        </div>

        <!-- ── Lines (NewExpensePage ex-* markup) ── -->
        <div class="ex-table-section" data-tour="pa-invoice-lines">
          <table class="ex-table pi-lines">
            <colgroup>
              <col class="pi-col-product" />
              <col class="pi-col-desc" />
              <col class="pi-col-qty" />
              <col class="pi-col-price" />
              <col class="pi-col-disc" />
              <col class="pi-col-tax" />
              <col class="pi-col-project" />
              <col class="pi-col-amount" />
              <col class="pi-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ t('Product / service') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th ex-th--num">{{ t('Qty') }}</th>
                <th class="ex-th ex-th--num">{{ t('Unit price') }}</th>
                <th class="ex-th ex-th--num">{{ t('Disc. %') }}</th>
                <th class="ex-th">{{ t('Tax') }}</th>
                <th class="ex-th">{{ t('Project') }}</th>
                <th class="ex-th ex-th--num">{{ t('Amount') }}</th>
                <th class="ex-th ex-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.id" class="ex-tr">
                <td class="ex-td ex-td--input ex-td--border" :title="l.product">
                  <MpInput :id="`pi-prod-${l.id}`" v-model="l.product" is-full-width :aria-label="t('Product / service')" />
                </td>
                <td class="ex-td ex-td--input ex-td--border" :title="l.description">
                  <MpInput :id="`pi-desc-${l.id}`" v-model="l.description" is-full-width :aria-label="t('Description')" />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpInput :id="`pi-qty-${l.id}`" v-model="l.qty" type="number" is-full-width class="pi-num-input" :aria-label="t('Qty')" @update:model-value="linesError = false" />
                </td>
                <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': linesError }">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <MpInput
                      :id="`pi-price-${l.id}`" v-model="l.unitPrice" type="number" is-full-width
                      :aria-label="t('Unit price')" @update:model-value="linesError = false"
                    />
                  </div>
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpInput :id="`pi-disc-${l.id}`" v-model="l.discount" type="number" is-full-width class="pi-num-input" :aria-label="t('Discount (%)')" />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpAutocomplete
                    :id="`pi-tax-${l.id}`" v-model="l.tax" :data="taxData"
                    label-prop="name" value-prop="id" use-portal is-full-width
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpAutocomplete
                    :id="`pi-proj-${l.id}`" v-model="l.project" :data="projectData"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('No project')"
                  />
                </td>
                <td class="ex-td ex-td--border ex-td--readonly pi-num">{{ formatIdr(invoiceLineAmount(l)) }}</td>
                <td class="ex-td ex-td--del">
                  <div class="ex-cell-center">
                    <MpButton class="ex-del-btn" is-rounded :aria-label="t('Remove line')" @click="removeLine(l.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="linesError" class="pi-error">{{ t('You must fill in qty and unit price on at least one line') }}</p>
        <div v-if="amountErrors.length" class="pi-warnings">
          <p v-for="w in amountErrors" :key="w" class="pi-error pi-error--amount">
            <MpIcon name="error" size="sm" class="pi-warning-icon" />
            <span>{{ w }}</span>
          </p>
        </div>
        <div v-if="amountWarnings.length" class="pi-warnings">
          <p v-for="w in amountWarnings" :key="w" class="pi-warning">
            <MpIcon name="warning-circular" size="sm" class="pi-warning-icon" />
            <span>{{ w }}</span>
          </p>
        </div>

        <div class="pi-foot">
          <div class="pi-foot-left">
            <MpButton variant="secondary" is-rounded left-icon="add" @click="addLine">{{ t('Add line') }}</MpButton>
          </div>
          <div class="pi-totals">
            <div class="pi-total-row">
              <span class="pi-total-key">{{ t('Subtotal') }}</span>
              <b class="pi-num">{{ formatIdr(subtotal) }}</b>
            </div>
            <div class="pi-total-row">
              <span class="pi-total-key">PPN 11%</span>
              <b class="pi-num">{{ formatIdr(taxTotal) }}</b>
            </div>
            <div class="pi-total-row pi-total-row--grand">
              <span>{{ t('Balance due') }}</span>
              <span class="pi-num">{{ formatIdr(grandTotal) }}</span>
            </div>
          </div>
        </div>

        <div class="pi-notes">
          <MpFormControl id="pi-message">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <MpTextarea id="pi-message-input" v-model="message" is-full-width />
            <p class="pi-hint">{{ t('Shown on the invoice') }}</p>
          </MpFormControl>
          <MpFormControl id="pi-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="pi-memo-input" v-model="memo" is-full-width />
            <p class="pi-hint">{{ t('Only visible to you and your team') }}</p>
          </MpFormControl>
        </div>

        <div class="pi-actions">
          <MpButton variant="ghost" is-rounded @click="back">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="isSaving" @click="save">{{ t('Save') }}</MpButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page shell (shared detail-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-subtitle { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

.pi-context { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4); }
.pi-context-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
}

/* Flat on the stage, like the expense form: no document frame. */
.pi-doc { min-width: 0; }
.pi-head-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.pi-head-col { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

/* ── Line table: NewExpensePage ex-* markup (FormTable.md) ───────────────── */
.ex-table-section { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.pi-lines { min-width: 980px; }
.pi-col-product { width: 140px; }
.pi-col-qty { width: 56px; }
.pi-col-price { width: 136px; }
.pi-col-disc { width: 64px; }
.pi-col-tax { width: 116px; }
.pi-col-project { width: 152px; }
.pi-col-amount { width: 152px; }
.pi-col-del { width: var(--mp-sizes-11, 44px); }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.ex-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ex-th--del { padding: 0; }
.ex-td {
  height: var(--mp-sizes-10, 40px); padding: 0; vertical-align: top;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--input { position: relative; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: var(--mp-sizes-10, 40px);
  box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused); pointer-events: none; /* pixel-police-allow-shadow: focus ring, not a surface lift */
}
.ex-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
/* Pixel inputs carry an intrinsic min width; let them shrink to the column. */
.ex-td--input :deep(.mp-input__root), .ex-td--input :deep(input) { min-width: 0; width: 100%; }
/* Calculated cell: read-only, subtle fill, right-aligned figure. */
.ex-td--readonly {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9); text-align: right; white-space: nowrap;
}
.ex-td--del { text-align: center; }
.ex-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.ex-td--error { background: var(--mp-colors-background-danger); }
.ex-td--error :deep([class*='input']) { background: transparent; }
.ex-td--amount { position: relative; }
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-amount-cell :deep(.mp-input__root) { flex: 1; min-width: 0; height: var(--mp-sizes-10, 40px); }
.ex-amount-cell :deep(input), :deep(input.pi-num-input) { text-align: right; font-variant-numeric: tabular-nums; }
.ex-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary);
}
.ex-del-btn:hover { color: var(--mp-text-danger); }
.pi-num { font-variant-numeric: tabular-nums; }

.pi-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger); }
.pi-warnings { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin-top: var(--mp-spacing-2); }
.pi-warning { display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.pi-warning-icon { flex-shrink: 0; }
.pi-error--amount { display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0; }

/* ── Foot ─────────────────────────────────────────────────────────────────── */
.pi-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-3); flex-wrap: wrap; }
.pi-foot-left { flex: 1; min-width: 280px; }
.pi-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pi-totals { min-width: 300px; }
.pi-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1\.5, 6px) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-md); }
.pi-total-row--grand { border-bottom: none; padding-top: var(--mp-spacing-2\.5, 10px); font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); }
.pi-total-key { color: var(--mp-text-secondary); }

.pi-notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-5); margin-top: var(--mp-spacing-5); }
.pi-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-6); }
</style>
