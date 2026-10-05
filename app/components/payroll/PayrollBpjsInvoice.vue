<script setup lang="ts">
/**
 * BPJS invoice match (OD-21). One invoice per month per BPJS body, typed by programme
 * with headcount. The comparison shows payroll, invoice and difference by programme;
 * Mark reviewed needs a note on every non-zero row. A new version after review reads
 * "Changed since review" and keeps the notes. Programmes per BPJS pay item are suggested
 * from the name and confirmed by the Accountant; an item with none sits on "Unassigned".
 */
import { MpButton, MpInput, MpSegmentedControl, MpBadge } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  payroll, can, rupiah, monthLabel, bpjsComparison, saveBpjsInvoice, markBpjsReviewed, bpjsProgrammeOf, setBpjsProgramme, BPJS_PROGRAMMES,
  type BpjsBody, type BpjsProgramme,
} from '~/data/payrollStore'
import { ACC } from '~/data/payrollMaster'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ month: string }>()
const { t } = useLocale()

const body = ref<BpjsBody>('BPJS Ketenagakerjaan')
const bodyOptions = [{ id: 'bpjs-tk', label: 'BPJS Ketenagakerjaan', value: 'BPJS Ketenagakerjaan' }, { id: 'bpjs-kes', label: 'BPJS Kesehatan', value: 'BPJS Kesehatan' }]
const cmp = computed(() => bpjsComparison(props.month, body.value))
const editing = ref(false)
const draft = reactive<Record<string, { amount: string; headcount: string }>>({})
const notes = reactive<Record<string, string>>({})
const blockedRow = ref<string | null>(null)
const error = ref('')

function load() {
  for (const k of Object.keys(draft)) delete draft[k]
  for (const p of BPJS_PROGRAMMES[body.value]) {
    const l = cmp.value.invoice?.lines.find((x) => x.programme === p)
    draft[p] = { amount: l ? String(l.amount) : '', headcount: l ? String(l.headcount) : '' }
  }
  for (const k of Object.keys(notes)) delete notes[k]
  for (const r of cmp.value.rows) notes[r.programme] = r.note ?? ''
  editing.value = !cmp.value.invoice && can('bpjs.invoice')
  blockedRow.value = null
  error.value = ''
}
watch([() => props.month, body], load, { immediate: true })

const num = (s: string) => Number(String(s).replace(/[^\d-]/g, '')) || 0
function saveInvoice() {
  error.value = ''
  if (BPJS_PROGRAMMES[body.value].some((p) => draft[p]!.amount === '')) { error.value = t('Type an amount for every programme. Use 0 when the invoice has none.'); return }
  const r = saveBpjsInvoice(props.month, body.value, BPJS_PROGRAMMES[body.value].map((p) => ({ programme: p, amount: num(draft[p]!.amount), headcount: num(draft[p]!.headcount) })))
  if (!r.ok) { error.value = r.message ?? ''; return }
  editing.value = false
  successToast(t('Invoice saved'))
}
function review() {
  error.value = ''
  const r = markBpjsReviewed(props.month, body.value, Object.fromEntries(Object.entries(notes).filter(([, v]) => v.trim())) as Partial<Record<BpjsProgramme, string>>)
  if (!r.ok) { error.value = r.message ?? ''; blockedRow.value = (r.programme as string) ?? null; return }
  blockedRow.value = null
  successToast(t('Invoice match marked reviewed'))
}
const statusType = computed(() => ({ Reviewed: 'completed', 'Changed since review': 'warning', 'Not reviewed': 'warning', 'No invoice': 'announcement' } as const)[cmp.value.status as 'Reviewed'] ?? 'announcement')
const totals = computed(() => ({
  payroll: cmp.value.rows.reduce((s, r) => s + r.payroll, 0),
  invoice: cmp.value.invoice ? cmp.value.rows.reduce((s, r) => s + (r.invoice ?? 0), 0) : null,
}))

// Programme per BPJS pay item.
const bpjsItems = computed(() => payroll.settings.mapping.filter((m) => m.credit === ACC.bpjsKes || m.credit === ACC.bpjsTk))
const programmeOptions = computed(() => ['Kesehatan', 'JHT', 'JKK', 'JKM', 'JP'].map((p) => ({ value: p, label: p })))
function setProgramme(key: string, v: string) {
  const r = setBpjsProgramme(key, (v || null) as BpjsProgramme | null)
  if (r.ok) successToast(t('Programme saved'))
}
</script>

<template>
  <div class="pbi">
    <div class="pbi-bar">
      <MpSegmentedControl id="pbi-body" v-model="body" name="pbi-body" :data="bodyOptions" />
      <div class="pbi-bar-right">
        <MpBadge for="additionalInformation" :type="statusType">{{ t(cmp.status) }}</MpBadge>
        <MpButton v-if="can('bpjs.invoice')" variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Import invoice') }}</MpButton>
        <MpButton v-if="can('bpjs.invoice') && cmp.invoice && !editing" variant="secondary" is-rounded @click="editing = true">{{ t('Edit invoice') }}</MpButton>
      </div>
    </div>

    <div class="pbi-card">
      <div class="pbi-cardhead">
        <span class="pbi-cardtitle">{{ body }} · {{ monthLabel(month) }}</span>
        <span v-if="cmp.invoice?.reviewed" class="pbi-sub">{{ t('Reviewed by') }} {{ cmp.invoice.reviewed.by }}</span>
      </div>
      <table class="pbi-table">
        <thead>
          <tr>
            <th>{{ t('Programme') }}</th>
            <th class="pbi-r">{{ t('Payroll') }}</th>
            <th class="pbi-r">{{ t('Invoice') }}</th>
            <th class="pbi-r">{{ t('Headcount') }}</th>
            <th class="pbi-r">{{ t('Difference') }}</th>
            <th>{{ t('Note') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in cmp.rows" :key="r.programme" :class="{ 'pbi-blocked': blockedRow === r.programme }">
            <td>{{ t(r.programme) }}</td>
            <td class="pbi-r">{{ rupiah(r.payroll) }}</td>
            <td class="pbi-r">
              <MpInput v-if="editing && draft[r.programme]" :id="`pbi-amt-${r.programme}`" v-model="draft[r.programme]!.amount" autocomplete="off" />
              <template v-else>{{ r.invoice == null ? t('No data') : rupiah(r.invoice) }}</template>
            </td>
            <td class="pbi-r">
              <MpInput v-if="editing && draft[r.programme]" :id="`pbi-hc-${r.programme}`" v-model="draft[r.programme]!.headcount" autocomplete="off" />
              <template v-else>{{ r.headcount ?? '-' }}</template>
            </td>
            <td class="pbi-r" :class="{ 'pbi-diff': r.difference }">{{ r.difference == null ? '-' : rupiah(r.difference) }}</td>
            <td>
              <MpInput v-if="!editing && r.difference && can('bpjs.review')" :id="`pbi-note-${r.programme}`" v-model="notes[r.programme]" autocomplete="off" />
              <span v-else class="pbi-sub">{{ r.note ?? '' }}</span>
            </td>
          </tr>
          <tr class="pbi-total">
            <td>{{ t('Total') }}</td>
            <td class="pbi-r">{{ rupiah(totals.payroll) }}</td>
            <td class="pbi-r">{{ totals.invoice == null ? t('No data') : rupiah(totals.invoice) }}</td>
            <td />
            <td class="pbi-r">{{ totals.invoice == null ? '-' : rupiah(totals.invoice - totals.payroll) }}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div class="pbi-foot">
        <p v-if="error" class="pbi-error">{{ error }}</p>
        <MpButton v-if="editing" variant="ghost" is-rounded @click="load">{{ t('Cancel') }}</MpButton>
        <MpButton v-if="editing" is-rounded @click="saveInvoice">{{ t('Save invoice') }}</MpButton>
        <MpButton v-if="!editing && cmp.invoice && can('bpjs.review') && cmp.status !== 'Reviewed'" is-rounded @click="review">{{ t('Mark reviewed') }}</MpButton>
      </div>
    </div>

    <div class="pbi-card">
      <div class="pbi-cardhead"><span class="pbi-cardtitle">{{ t('BPJS programme per pay item') }}</span></div>
      <table class="pbi-table">
        <thead><tr><th>{{ t('Pay item') }}</th><th>{{ t('Section') }}</th><th>{{ t('Payable') }}</th><th>{{ t('Programme') }}</th></tr></thead>
        <tbody>
          <tr v-for="m in bpjsItems" :key="m.key">
            <td>{{ m.name }}</td>
            <td>{{ t(m.section) }}</td>
            <td>{{ m.credit === ACC.bpjsKes ? 'BPJS Kesehatan' : 'BPJS Ketenagakerjaan' }}</td>
            <td>
              <ErpFilterSelect v-if="can('bpjs.programme')" :id="`pbi-prog-${m.key.replace(/\W/g, '')}`" :model-value="bpjsProgrammeOf(m) ?? ''" :placeholder="t('Unassigned')" :options="programmeOptions" variant="cell" @update:model-value="(v: string) => setProgramme(m.key, v)" />
              <template v-else>{{ bpjsProgrammeOf(m) ?? t('Unassigned') }}</template>
              <span v-if="!m.programme && bpjsProgrammeOf(m)" class="pbi-sub">{{ t('Suggested from the name') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pbi { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pbi-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.pbi-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pbi-card { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pbi-cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pbi-cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pbi-table { width: 100%; border-collapse: collapse; }
.pbi-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pbi-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: middle; }
.pbi-table .pbi-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pbi-total td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-colors-background-neutral-subtle); }
.pbi-diff { color: var(--mp-colors-text-warning); }
.pbi-blocked td { background: var(--mp-colors-background-danger); }
.pbi-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pbi-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pbi-foot:empty { display: none; }
.pbi-error { margin: 0 auto 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
