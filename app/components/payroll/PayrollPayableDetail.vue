<script setup lang="ts">
/**
 * One payable row opened (OD-18): the journal lines behind "owed", by tag; the payments
 * behind "paid" with billing code and NTPN; a void per payment (a linked reversal, never an
 * edit, LR-8); and a note that explains a balance left open. No employee names.
 */
import { MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextarea } from '@mekari/pixel3'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { voidPayment, can, rupiah, accountLabel, monthLabel, type PayableRow } from '~/data/payrollStore'
import { payableDrill, payableNote, setPayableNote } from '~/data/payrollUiPayables'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; row: PayableRow | null }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()
const { t } = useLocale()

const drill = computed(() => (props.row ? payableDrill(props.row) : { owed: [], paid: [] }))
const note = computed(() => (props.row ? payableNote(props.row) : null))
const draftNote = ref('')
const noteError = ref('')
watch(() => props.isOpen, (o) => { if (o) { draftNote.value = note.value?.note ?? ''; noteError.value = '' } })

function saveNote() {
  if (!props.row) return
  const r = setPayableNote(props.row, draftNote.value)
  if (!r.ok) { noteError.value = r.message ?? ''; return }
  noteError.value = ''
  successToast(t('Note saved'))
}

const voidOpen = ref(false)
const voidId = ref('')
function askVoid(id: string) { voidId.value = id; voidOpen.value = true }
function confirmVoid() {
  const r = voidPayment(voidId.value)
  if (r.ok) successToast(`${t('Payment voided by')} ${r.number as string}`)
}
</script>

<template>
  <PayrollPayDrawer :is-open="isOpen" :title="row ? row.label : ''" wide @update:is-open="(v: boolean) => emit('update:isOpen', v)">
    <template v-if="row">
      <dl class="ppx-facts">
        <div><dt>{{ t('Payable') }}</dt><dd>{{ accountLabel(row.account) }}</dd></div>
        <div><dt>{{ t('Period') }}</dt><dd>{{ monthLabel(row.month) }}</dd></div>
        <div><dt>{{ t('Owed') }}</dt><dd class="ppx-num">{{ rupiah(row.owed) }}</dd></div>
        <div><dt>{{ t('Paid') }}</dt><dd class="ppx-num">{{ rupiah(row.paid) }}</dd></div>
        <div><dt>{{ t('Balance') }}</dt><dd class="ppx-num">{{ rupiah(row.balance) }}</dd></div>
        <div><dt>{{ t('Due') }}</dt><dd>{{ row.dueLabel }}</dd></div>
      </dl>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Owed: journal lines by tag') }}</h3>
        <table class="ppx-table">
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Type') }}</th><th>{{ t('Date') }}</th><th>{{ t('Tag') }}</th><th class="ppx-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in drill.owed" :key="i">
              <td><NuxtLink v-if="l.runId" class="ppx-link" :to="`/payroll-runs/${l.runId}`">{{ l.number }}</NuxtLink><span v-else>{{ l.number }}</span></td>
              <td>{{ t(l.type) }}</td><td>{{ l.date }}</td><td>{{ l.tags }}</td><td class="ppx-r">{{ rupiah(l.amount) }}</td>
            </tr>
            <tr v-if="!drill.owed.length"><td colspan="5" class="ppx-empty">{{ t('No journal lines') }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Paid: payments') }}</h3>
        <table class="ppx-table">
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Date') }}</th><th>{{ t('Bank') }}</th><th>{{ t('Billing code / NTPN') }}</th><th class="ppx-r">{{ t('Amount') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="p in drill.paid" :key="p.id" :class="{ 'ppx-voided': p.voided }">
              <td>
                {{ p.number }}
                <span v-if="p.voided" class="ppx-sub">{{ p.voided }}</span>
                <span v-for="w in p.warnings" :key="w" class="ppx-warn">{{ w }}</span>
              </td>
              <td>{{ p.date }}</td>
              <td>
                {{ p.splits.length ? `${p.splits.length} ${t('banks by branch')}` : p.bank }}
                <span v-for="s in p.splits" :key="s.branch" class="ppx-sub">{{ s.branch }}: {{ accountLabel(s.bank) }} {{ rupiah(s.amount) }}</span>
              </td>
              <td>{{ [p.billingCode, p.ntpn].filter(Boolean).join(' / ') || '-' }}</td>
              <td class="ppx-r">{{ rupiah(p.amount) }}</td>
              <td class="ppx-r">
                <MpButton v-if="!p.voided && can('payment.void')" variant="ghost" is-rounded @click="askVoid(p.id)">{{ t('Void') }}</MpButton>
              </td>
            </tr>
            <tr v-if="!drill.paid.length"><td colspan="6" class="ppx-empty">{{ t('No payments yet') }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Note on the open balance') }}</h3>
        <p v-if="note" class="ppx-sub">{{ note.by }} · {{ note.at.slice(0, 10) }}</p>
        <template v-if="can('recon.note')">
          <MpFormControl id="ppx-note" :is-invalid="!!noteError">
            <MpFormLabel>{{ t('Note') }}</MpFormLabel>
            <MpTextarea id="ppx-note-input" v-model="draftNote" />
            <MpFormErrorMessage>{{ noteError }}</MpFormErrorMessage>
          </MpFormControl>
          <div><MpButton variant="secondary" is-rounded @click="saveNote">{{ t('Save note') }}</MpButton></div>
        </template>
        <p v-else class="ppx-body">{{ note?.note ?? t('No note') }}</p>
      </section>
    </template>
  </PayrollPayDrawer>

  <ConfirmModal
    v-model:is-open="voidOpen"
    :title="t('Void payment')"
    :description="t('Jurnal posts a linked reversal in the first open period. The payment journal stays in the ledger.')"
    :confirm-label="t('Void')"
    @confirm="confirmVoid"
  />
</template>

<style scoped>
.ppx-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.ppx-facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.ppx-facts dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.ppx-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ppx-h { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.ppx-table { width: 100%; border-collapse: collapse; border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.ppx-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); }
.ppx-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.ppx-table .ppx-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ppx-num { font-variant-numeric: tabular-nums; }
.ppx-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.ppx-warn { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.ppx-voided td { color: var(--mp-colors-text-secondary); }
.ppx-empty { color: var(--mp-colors-text-secondary); text-align: center; }
.ppx-link { color: var(--mp-colors-text-link, var(--mp-text-link)); text-decoration: none; }
.ppx-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
</style>
