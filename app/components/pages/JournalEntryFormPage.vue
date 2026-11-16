<!-- prod-parity: jurnal-accounting-frontend/src/modules/journal-entries/views/JournalEntryCreateView.vue -->
<script setup lang="ts">
/** Create journal entry — /journal-entries/new (also ?duplicateFrom=<id>). */
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, toast,
  type DataInterface,
} from '@mekari/pixel3'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { addJournalEntry, getJournalEntry, nextJournalEntryNumber } from '~/data/journalEntries'
import { LINE_ACCOUNT_OPTIONS } from '~/data/bankTransactions'
import { formatIDR } from '~/utils/currency'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }

const transactionDate = ref(toDisplayDate(new Date().toISOString().slice(0, 10)))
const tags = ref<DataInterface[]>([])
function onTagsChange(d: DataInterface[]) { tags.value = d }
const memo = ref('')
const files = ref<File[]>([])
function onAttach(list: FileList | null) { if (list) for (const f of Array.from(list)) if (!files.value.some((x) => x.name === f.name)) files.value.push(f) }

const noSettingsOpen = ref(false)
const nextNo = computed(() => String(nextJournalEntryNumber()))
function onNoFormatSave(_c: NumberFormatConfig) { noSettingsOpen.value = false }

interface Row { id: number; accountCode: string; description: string; debit: string; credit: string }
let seq = 1
const blank = (): Row => ({ id: seq++, accountCode: '', description: '', debit: '', credit: '' })
const rows = ref<Row[]>([blank(), blank()])
const num = (s: string) => Number(String(s).replace(/\./g, '')) || 0
function fmt(v: string | number) { const d = String(v).replace(/\D/g, ''); return d ? Number(d).toLocaleString('id-ID') : '' }
function onDebit(r: Row, v: string | number) { r.debit = fmt(v); if (r.debit) r.credit = ''; autoAppend(r) }
function onCredit(r: Row, v: string | number) { r.credit = fmt(v); if (r.credit) r.debit = ''; autoAppend(r) }
function autoAppend(r: Row) { const last = rows.value[rows.value.length - 1]; if (last && last.id === r.id && (r.accountCode || r.debit || r.credit)) rows.value.push(blank()) }
function removeRow(id: number) { if (rows.value.length > 2) rows.value = rows.value.filter((r) => r.id !== id) }

const totalDebit = computed(() => rows.value.reduce((s, r) => s + num(r.debit), 0))
const totalCredit = computed(() => rows.value.reduce((s, r) => s + num(r.credit), 0))
const showError = ref(false)
const errorText = ref('')

function cancel() { router.push('/cash-management') }
function save(andNew: boolean) {
  const filled = rows.value.filter((r) => r.accountCode && (num(r.debit) || num(r.credit)))
  if (filled.length < 2 || totalDebit.value !== totalCredit.value || totalDebit.value === 0) {
    errorText.value = t('Debit and credit must be the same')
    showError.value = true
    return
  }
  const e = addJournalEntry({
    transactionDate: toISODate(transactionDate.value),
    tags: tags.value.map((x) => x.label ?? String(x.value ?? '')).filter(Boolean),
    lines: filled.map((r) => ({ accountCode: r.accountCode, description: r.description.trim(), debit: num(r.debit), credit: num(r.credit) })),
    memo: memo.value.trim() || undefined,
  })
  toast.notify({ variant: 'success', title: t('Journal entry created.') })
  if (andNew) {
    rows.value = [blank(), blank()]; memo.value = ''; tags.value = []; showError.value = false
  } else {
    router.push(`/journal-entries/${e.id}`)
  }
}

onMounted(() => {
  const dup = typeof route.query.duplicateFrom === 'string' ? getJournalEntry(route.query.duplicateFrom) : undefined
  if (!dup) return
  tags.value = dup.tags.map((l) => ({ value: l, label: l } as DataInterface))
  memo.value = dup.memo ?? ''
  rows.value = [...dup.lines.map((l) => ({ ...blank(), accountCode: l.accountCode, description: l.description, debit: l.debit ? fmt(l.debit) : '', credit: l.credit ? fmt(l.credit) : '' })), blank()]
})
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <a class="detail-breadcrumb" @click.prevent="router.push('/chart-of-accounts')">{{ t('Chart of accounts') }}</a>
        </nav>
        <h1 class="detail-title">{{ t('Create journal entry') }}</h1>
      </div>
    </header>

    <div class="it-stage">
      <div class="ex-grid-2">
        <MpFormControl id="je-date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <MpDatePicker id="je-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
        </MpFormControl>
        <MpFormControl id="je-no">
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <button class="ex-label-icon btn-enterprise" type="button" :aria-label="t('Transaction numbering')" @click="noSettingsOpen = true"><MpIcon name="settings" size="sm" /></button>
          </div>
          <MpInput id="je-no-input" :placeholder="t('[Auto]')" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="je-tags">
          <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
          <MpInputTag id="je-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" :placeholder="t('Select tags')" @change="onTagsChange" />
        </MpFormControl>
      </div>

      <div class="ex-table-section">
        <table class="ex-table">
          <colgroup><col class="je-col-account" /><col /><col class="je-col-amt" /><col class="je-col-amt" /><col class="je-col-del" /></colgroup>
          <thead>
            <tr>
              <th class="ex-th">{{ t('Account') }}</th>
              <th class="ex-th">{{ t('Description') }}</th>
              <th class="ex-th ex-th--num">{{ t('Debit') }}</th>
              <th class="ex-th ex-th--num">{{ t('Credit') }}</th>
              <th class="ex-th" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="ex-td ex-td--input ex-td--border">
                <MpAutocomplete :id="`je-acc-${r.id}`" v-model="r.accountCode" :data="LINE_ACCOUNT_OPTIONS" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :placeholder="t('Select account')" @update:model-value="autoAppend(r)" />
              </td>
              <td class="ex-td ex-td--input ex-td--border"><MpInput :id="`je-desc-${r.id}`" v-model="r.description" is-full-width /></td>
              <td class="ex-td ex-td--input ex-td--border"><MpInput :id="`je-debit-${r.id}`" :model-value="r.debit" inputmode="numeric" placeholder="0" is-full-width class="je-num" @update:model-value="(v: string | number) => onDebit(r, v)" /></td>
              <td class="ex-td ex-td--input ex-td--border"><MpInput :id="`je-credit-${r.id}`" :model-value="r.credit" inputmode="numeric" placeholder="0" is-full-width class="je-num" @update:model-value="(v: string | number) => onCredit(r, v)" /></td>
              <td class="ex-td ex-td--del">
                <MpButton class="ex-del-btn" is-rounded :aria-label="t('Remove')" @click="removeRow(r.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <MpBanner v-if="showError" id="je-error" variant="danger" align-items="center" class="je-banner">
        <MpBannerIcon id="je-error-icon" />
        <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
        <MpBannerDescription>{{ errorText }}</MpBannerDescription>
      </MpBanner>

      <div class="it-summary">
        <div class="je-notes-left">
          <MpFormControl id="je-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="je-memo-ta" v-model="memo" :rows="3" is-full-width />
            <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
          </MpFormControl>
          <MpFormControl id="je-attach">
            <MpFormLabel>{{ t('Attachment') }}</MpFormLabel>
            <MpUpload id="je-attach-up" accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" is-multiple is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Browse file')" @change="onAttach" />
            <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
            <MpUploadList v-for="f in files" :id="`je-file-${f.name}`" :key="f.name" :title="f.name" status="success" :subtitle="t('Uploaded')" icon-name="doc" is-show-remove-button @remove="files = files.filter((x) => x.name !== f.name)" />
          </MpFormControl>
        </div>
        <div class="je-totals">
          <div class="je-total-row"><span>{{ t('Total debit') }}</span><span>{{ formatIDR(totalDebit) }}</span></div>
          <div class="je-total-row"><span>{{ t('Total credit') }}</span><span>{{ formatIDR(totalCredit) }}</span></div>
        </div>
      </div>
    </div>

    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="secondary" is-rounded @click="save(true)">{{ t('Create & new') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save(false)">{{ t('Save') }}</MpButton>
    </footer>

    <NumberFormatSettingsModal v-model:open="noSettingsOpen" :title="t('Transaction numbering')" :caption="t('Numbers are auto-generated by the system.')" :next-number="nextNo" :existing-formats="[{ label: t('Auto'), value: 'auto' }]" @save="onNoFormatSave" />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-self: flex-start; }
.detail-breadcrumb { cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.it-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-neutral); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; padding: var(--mp-spacing-6); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-neutral); border-top: 1px solid var(--mp-border-default); }
.ex-grid-2 { display: grid; grid-template-columns: repeat(3, minmax(0, 260px)); gap: var(--mp-spacing-4) var(--mp-spacing-6); padding-bottom: var(--mp-spacing-6); }
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; background: none; border: none; padding: 0; }
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table { width: 100%; min-width: 764px; table-layout: fixed; border-collapse: collapse; }
.je-col-account { width: 280px; }
.je-col-amt { width: 200px; }
.je-col-del { width: 44px; }
.ex-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.ex-th--num { text-align: right; }
.ex-td { height: var(--mp-sizes-10, 40px); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused); }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
.ex-td--del { padding: 0; text-align: center; vertical-align: middle; }
.je-num :deep(input), .je-num { text-align: right; }
.ex-del-btn { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important; border: none !important; background: none !important; color: var(--mp-text-secondary); }
.je-banner { margin-top: var(--mp-spacing-4); }
.it-summary { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); padding: var(--mp-spacing-4) 0; flex-wrap: wrap; }
.je-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: min(432px, 100%); }
.ex-helper-text { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.je-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); }
.je-total-row { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
