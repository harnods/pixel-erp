<script setup lang="ts">
/**
 * New invoice (project-tagged) — the billing side of Project accounting.
 *
 * Everything that bills routes through this one form, prefilled from whatever
 * raised it. What it was raised from lives in the URL, so a refresh rebuilds the
 * same document:
 *
 *   ?kind=tm       every reviewed, uninvoiced cost line on the engagement
 *   ?kind=billing  one line from the input method's billing schedule
 *   ?kind=output   one line for a verified milestone (recognition already posted)
 *   ?kind=adhoc    a single blank line
 *
 * Project is tagged per line here too, so a single invoice can bill more than one
 * project. This is the module's own form — the shared Sales invoices page is left
 * untouched.
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpAutocomplete, MpDatePicker, MpIcon, toast, MpTextlink,
} from '@mekari/pixel3'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import {
  findEngagement, projectOptions, saveInvoice, newInvoiceLine,
  invoiceLineAmount, invoiceLineTax, readyToInvoice, entryFinal, entryLabel,
  revenue, billed, TAX_OPTIONS, PAYMENT_TERMS_OPTIONS, TODAY, formatIdr,
  type InvoiceDraftLine, type InvoiceKind,
} from '~/data/projectAccounting'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const engId = String(route.query.project ?? '')
const kind = (String(route.query.kind ?? 'adhoc') || 'adhoc') as InvoiceKind
const label = String(route.query.label ?? t('Invoice'))
const milestoneId = route.query.milestone ? String(route.query.milestone) : null

const engagement = computed(() => findEngagement(engId))

/**
 * Which cost lines this invoice consumes. Captured once at mount so that saving —
 * which flips them to invoiced — cannot shrink the list mid-edit.
 */
const sourceEntryIds = ref<string[]>([])

function buildLines(): InvoiceDraftLine[] {
  const e = engagement.value
  if (!e) return [newInvoiceLine('Professional services', '', 0, '')]

  if (kind === 'tm') {
    const items = readyToInvoice(e)
    sourceEntryIds.value = items.map(x => x.id)
    if (items.length) return items.map(x => newInvoiceLine('Professional services', entryLabel(x), entryFinal(x), e.id))
  }
  if (kind === 'billing' && milestoneId) {
    const m = e.billing?.find(x => x.id === milestoneId)
    if (m) return [newInvoiceLine('Progress billing', m.label, (e.contractValue * m.pct) / 100, e.id)]
  }
  if (kind === 'output' && milestoneId) {
    const m = e.milestones?.find(x => x.id === milestoneId)
    if (m) return [newInvoiceLine('Milestone billing', m.label, m.recognized, e.id)]
  }
  return [newInvoiceLine('Professional services', '', 0, e.id)]
}

// ── Draft ─────────────────────────────────────────────────────────────────────
const customer = ref(engagement.value?.client ?? '')
const email = ref('')
const address = ref('')
const date = ref(TODAY)
const dueDate = ref('2026-09-02')
const terms = ref(PAYMENT_TERMS_OPTIONS[0]!)
const reference = ref('')
const message = ref('')
const memo = ref('')
const lines = reactive<InvoiceDraftLine[]>(buildLines())

const taxData = TAX_OPTIONS.map(a => ({ id: a, name: a }))
const termsData = PAYMENT_TERMS_OPTIONS.map(a => ({ id: a, name: a }))
const projectData = computed(() => projectOptions().map(p => ({ id: p.id, name: p.name })))

function addLine() {
  lines.push(newInvoiceLine('Professional services', '', 0, engId))
}
function removeLine(id: string) {
  const i = lines.findIndex(l => l.id === id)
  if (i !== -1) lines.splice(i, 1)
}

const subtotal = computed(() => lines.reduce((a, l) => a + invoiceLineAmount(l), 0))
const taxTotal = computed(() => lines.reduce((a, l) => a + invoiceLineTax(l), 0))
const grandTotal = computed(() => subtotal.value + taxTotal.value)

const sourceNote = computed(() => {
  if (kind === 'tm') return t('Lines are prefilled from the reviewed, uninvoiced work on this engagement.')
  if (kind === 'output') return t('Recognition has already posted for this milestone — saving this invoice completes the same action.')
  if (kind === 'billing') return t('Prefilled from the milestone billing schedule.')
  return t('A blank invoice against this project.')
})

// ── Budget context strip ──────────────────────────────────────────────────────
const contextProject = computed(() => {
  const id = lines.find(l => l.project)?.project
  return id ? findEngagement(id) : undefined
})

const contextStats = computed<ProjectStat[]>(() => {
  const e = contextProject.value
  if (!e) return []
  const thisDoc = lines.filter(l => l.project === e.id).reduce((a, l) => a + invoiceLineAmount(l), 0)
  return [
    { key: 'cv', label: t('Contract value'), value: formatIdr(e.method === 'tm' ? e.feeEstimate : e.contractValue) },
    { key: 'rec', label: t('Recognized'), value: formatIdr(revenue(e)) },
    { key: 'billed', label: t('Billed to date'), value: formatIdr(billed(e)) },
    { key: 'doc', label: t('This invoice'), value: formatIdr(thisDoc) },
  ]
})

// ── Save ──────────────────────────────────────────────────────────────────────
const customerError = ref(false)
const isSaving = ref(false)

function back() {
  if (engId) router.push({ path: `/project-accounting/${engId}`, query: { tab: 'billing' } })
  else router.push('/project-accounting')
}

async function save() {
  customerError.value = !customer.value.trim()
  if (customerError.value) {
    toast.notify({ variant: 'error', title: t('Customer is required') })
    return
  }
  if (grandTotal.value <= 0) {
    toast.notify({ variant: 'error', title: t('Add at least one line with a quantity and unit price'), maxWidth: 'max-content' })
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 300))
  const inv = saveInvoice({
    engId,
    kind,
    label,
    milestoneId,
    entryIds: kind === 'tm' ? sourceEntryIds.value : null,
    date: date.value,
    amount: grandTotal.value,
  })
  isSaving.value = false
  if (!inv) {
    toast.notify({ variant: 'error', title: t('This project no longer exists') })
    return
  }
  toast.notify({ variant: 'success', title: `${t('Invoice')} ${inv.id} ${t('saved for')} ${formatIdr(inv.amount)}`, maxWidth: 'max-content' })
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
        <p class="detail-subtitle">{{ sourceNote }}</p>
      </div>
    </header>

    <div class="detail-stage">
      <section v-if="contextStats.length" class="pi-context">
        <p class="pi-context-title">{{ t('Project budget') }} · {{ contextProject?.name }}</p>
        <ProjectStatCards :stats="contextStats" />
      </section>

      <div class="pi-doc">
        <!-- ── Header fields ── -->
        <div class="pi-head-grid">
          <div class="pi-head-col">
            <MpFormControl id="pi-customer" is-required :is-invalid="customerError">
              <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
              <MpInput
                id="pi-customer-input" v-model="customer" is-full-width :is-invalid="customerError"
                @update:model-value="customerError = false"
              />
              <MpFormErrorMessage>{{ t('You must fill in customer') }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="pi-address">
              <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
              <MpTextarea id="pi-address-input" v-model="address" is-full-width placeholder="Jl. …" />
            </MpFormControl>
          </div>

          <div class="pi-head-col">
            <MpFormControl id="pi-email">
              <MpFormLabel>{{ t('Email') }}</MpFormLabel>
              <MpInput id="pi-email-input" v-model="email" is-full-width placeholder="finance@client.co.id" />
            </MpFormControl>
            <MpFormControl id="pi-date">
              <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
              <MpDatePicker id="pi-date-input" v-model="date" is-full-width />
            </MpFormControl>
            <MpFormControl id="pi-due">
              <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
              <MpDatePicker id="pi-due-input" v-model="dueDate" is-full-width />
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
              <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
              <MpInput id="pi-ref-input" v-model="reference" is-full-width />
            </MpFormControl>
          </div>
        </div>

        <!-- ── Lines ── -->
        <div class="pi-table-scroll">
          <table class="pi-table">
            <thead>
              <tr>
                <th class="pi-th">{{ t('Product / service') }}</th>
                <th class="pi-th">{{ t('Description') }}</th>
                <th class="pi-th pi-th--num">{{ t('Qty') }}</th>
                <th class="pi-th pi-th--num">{{ t('Unit price') }}</th>
                <th class="pi-th pi-th--num">{{ t('Disc %') }}</th>
                <th class="pi-th">{{ t('Tax') }}</th>
                <th class="pi-th pi-th--project">{{ t('Project') }}</th>
                <th class="pi-th pi-th--num">{{ t('Amount') }}</th>
                <th class="pi-th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.id">
                <td class="pi-td"><MpInput :id="`pi-prod-${l.id}`" v-model="l.product" is-full-width /></td>
                <td class="pi-td"><MpInput :id="`pi-desc-${l.id}`" v-model="l.description" is-full-width :placeholder="t('Description')" /></td>
                <td class="pi-td pi-td--qty"><MpInput :id="`pi-qty-${l.id}`" v-model="l.qty" type="number" is-full-width /></td>
                <td class="pi-td pi-td--price">
                  <MpInputGroup :id="`pi-price-group-${l.id}`" is-full-width>
                    <MpInputLeftAddon>Rp</MpInputLeftAddon>
                    <MpInput :id="`pi-price-${l.id}`" v-model="l.unitPrice" type="number" is-full-width />
                  </MpInputGroup>
                </td>
                <td class="pi-td pi-td--qty"><MpInput :id="`pi-disc-${l.id}`" v-model="l.discount" type="number" placeholder="0" is-full-width /></td>
                <td class="pi-td pi-td--tax">
                  <MpAutocomplete
                    :id="`pi-tax-${l.id}`" v-model="l.tax" :data="taxData"
                    label-prop="name" value-prop="id" use-portal is-full-width
                  />
                </td>
                <td class="pi-td pi-td--project">
                  <MpAutocomplete
                    :id="`pi-proj-${l.id}`" v-model="l.project" :data="projectData"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('No project')"
                  />
                </td>
                <td class="pi-td pi-td--num pi-num">{{ formatIdr(invoiceLineAmount(l)) }}</td>
                <td class="pi-td pi-td--del">
                  <button
                    type="button" class="btn-enterprise btn-enterprise--plain"
                    :aria-label="t('Remove line')" @click="removeLine(l.id)"
                  >
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pi-foot">
          <div class="pi-foot-left">
            <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm btn-enterprise--icon-before" @click="addLine">
              <MpIcon name="add" size="sm" />
              {{ t('Add line') }}
            </button>
            <p class="pi-hint">
              {{ t('Project is tagged per line here too, so a single invoice can bill more than one project. Saving posts the invoice against the tagged project and returns you to Invoices & payments.') }}
            </p>
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
            <p class="pi-hint">{{ t('Visible to customer.') }}</p>
          </MpFormControl>
          <MpFormControl id="pi-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="pi-memo-input" v-model="memo" is-full-width />
            <p class="pi-hint">{{ t('Only visible to you and your team.') }}</p>
          </MpFormControl>
        </div>

        <div class="pi-actions">
          <button type="button" class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">
            {{ isSaving ? t('Saving...') : t('Save') }}
          </button>
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="back">{{ t('Cancel') }}</button>
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
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
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
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

.pi-context { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4); }
.pi-context-title {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary);
}

.pi-doc { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-6); }
.pi-head-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.pi-head-col { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

/* ── Line table ───────────────────────────────────────────────────────────── */
.pi-table-scroll { overflow-x: auto; }
.pi-table { width: 100%; border-collapse: collapse; min-width: 1120px; }
.pi-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.pi-th--project { background: var(--mp-background-success-subtle, #e8f4ef); color: var(--mp-text-default); }
.pi-th--num { text-align: right; }
.pi-td { padding: var(--mp-spacing-2); vertical-align: top; border-bottom: 1px solid var(--mp-border-default); }
.pi-td--project { background: var(--mp-background-success-subtle, #f5fbf8); min-width: 180px; }
.pi-td--num { text-align: right; }
.pi-td--qty { width: 90px; }
.pi-td--price { width: 180px; }
.pi-td--tax { width: 140px; }
.pi-td--del { width: var(--mp-sizes-12, 48px); text-align: right; }
.pi-num { font-variant-numeric: tabular-nums; }

/* ── Foot ─────────────────────────────────────────────────────────────────── */
.pi-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-4); flex-wrap: wrap; }
.pi-foot-left { flex: 1; min-width: 280px; }
.pi-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 460px; }
.pi-totals { min-width: 300px; }
.pi-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1\.5, 6px) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); }
.pi-total-row--grand { border-bottom: none; padding-top: var(--mp-spacing-2\.5, 10px); font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); }
.pi-total-key { color: var(--mp-text-secondary); }

.pi-notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-5); margin-top: var(--mp-spacing-5); }
.pi-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-6); }
</style>
