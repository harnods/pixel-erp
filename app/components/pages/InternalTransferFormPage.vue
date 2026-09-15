<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
  type DataInterface,
} from '@mekari/pixel3'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { cashAccounts } from '~/data/cashAccounts'
import { useRoute } from 'vue-router'
import { addInternalTransfer, updateInternalTransfer, getInternalTransfer, nextInternalTransferNo } from '~/data/internalTransfers'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

// Mode is derived from the route: /internal-transfer (create) ·
// /internal-transfer/:id/edit (edit) · /internal-transfer/:id/duplicate (duplicate).
const mode = route.path.endsWith('/edit') ? 'edit' : route.path.endsWith('/duplicate') ? 'duplicate' : 'create'
const isEdit = mode === 'edit'

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Account options (source + destinations) — live cash/bank accounts, code-prefixed ──
const accountOptions = computed(() =>
  cashAccounts.filter((a) => !a.isArchived).map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })),
)

// ── Transfer from (source, required) ──────────────────────────────────────────
const fromAccountId = ref('')
const fromError = ref(false)

// ── Header fields ─────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

// ── Transaction no. settings (auto-numbering) ─────────────────────────────────
const noSettingsOpen = ref(false)
const nextTransferNo = computed(() => nextInternalTransferNo())
const transferNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// ── Destination — an internal transfer moves money to exactly ONE account, so a
// single fixed line (no add/remove row). ─────────────────────────────────────
const toAccountId = ref('')
const lineDescription = ref('')
const lineAmount = ref('') // display string, thousand-grouped (e.g. "120.000")
const toError = ref(false)
const amountError = ref(false)
// Destination options exclude the source account (can't transfer to itself).
const destinationOptions = computed(() => accountOptions.value.filter((o) => o.id !== fromAccountId.value))

// Amount input shows Indonesian thousand separators live as you type; the raw
// numeric value is derived by stripping the dots.
function amountNum(): number { return Number(String(lineAmount.value).replace(/\./g, '')) || 0 }
function onAmountInput(val: string | number) {
  const digits = String(val).replace(/\D/g, '')
  lineAmount.value = digits ? Number(digits).toLocaleString('id-ID') : ''
  amountError.value = false
}
const totalAmount = computed(() => amountNum())

// ── Memo / Attachment ─────────────────────────────────────────────────────────
const memo = ref('')
const attachedFiles = ref<File[]>([])
function onAttachmentChange(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
  }
}
function removeAttachedFile(name: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.name !== name)
}
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  if (ext === 'zip') return 'zip'
  return 'doc'
}

function goBack() {
  if (isEdit && props.orderId) router.push(`/cash-management/internal-transfer/${props.orderId}`)
  else router.push('/cash-management')
}

// ── Save ──────────────────────────────────────────────────────────────────────
function handleSave() {
  let ok = true
  if (!fromAccountId.value) { fromError.value = true; ok = false }
  if (!toAccountId.value) { toError.value = true; ok = false }
  if (amountNum() <= 0) { amountError.value = true; ok = false }
  if (!ok) return

  const payload = {
    fromAccountId: fromAccountId.value,
    transactionDate: toISODate(transactionDate.value),
    referenceNo: referenceNo.value.trim() || undefined,
    tags: tags.value.map((tg) => tg.label ?? String(tg.value ?? '')).filter(Boolean),
    lines: [{ accountId: toAccountId.value, description: lineDescription.value.trim(), amount: amountNum() }],
    memo: memo.value.trim() || undefined,
  }
  if (isEdit && props.orderId) updateInternalTransfer(props.orderId, payload)
  else addInternalTransfer(payload)
  toast.notify({ variant: 'success', title: isEdit ? t('Internal transfer saved') : t('Internal transfer saved') })
  goBack()
}

// ── Sticky footer (border appears once the stage scrolls) ──────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
// Prefill for edit/duplicate from the source transfer.
function prefillFrom(id: string) {
  const tr = getInternalTransfer(id)
  if (!tr) return
  fromAccountId.value = tr.fromAccountId
  transactionDate.value = toDisplayDate(tr.transactionDate)
  referenceNo.value = tr.referenceNo ?? ''
  tags.value = tr.tags.map((label) => ({ value: label, label } as DataInterface))
  const first = tr.lines[0]
  if (first) {
    toAccountId.value = first.accountId
    lineDescription.value = first.description
    lineAmount.value = first.amount ? Number(first.amount).toLocaleString('id-ID') : ''
  }
  // Edit keeps the existing number; duplicate gets a fresh Auto number.
  if (mode === 'edit') transactionNo.value = tr.transferNo
}

let stageObserver: ResizeObserver | null = null
onMounted(() => {
  if ((mode === 'edit' || mode === 'duplicate') && props.orderId) prefillFrom(props.orderId)
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <span class="detail-breadcrumb detail-breadcrumb--static">{{ t('Cash management') }}</span>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t('Edit internal transfer') : t('New internal transfer') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="it-stage">
      <!-- Transfer from + Total -->
      <div class="ex-row-1">
        <MpFormControl id="it-from" class="ex-field-flex" :is-invalid="fromError" is-required>
          <MpFormLabel>{{ t('Transfer from') }}</MpFormLabel>
          <MpAutocomplete
            id="it-from-ac"
            v-model="fromAccountId"
            :data="accountOptions"
            label-prop="name" value-prop="id"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="fromError"
            :placeholder="t('Select account')"
            @update:model-value="fromError = false"
          />
          <MpFormErrorMessage>{{ t('You must select an account') }}</MpFormErrorMessage>
        </MpFormControl>
        <div class="it-total-inline">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t('Total') }}</span> {{ formatIDR(totalAmount) }}
          </span>
        </div>
      </div>

      <!-- Transaction date / Transaction no. / Reference no. / Tags -->
      <div class="ex-grid-2">
        <MpFormControl id="it-txdate">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker id="it-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>
        <MpFormControl id="it-transno">
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <button class="ex-label-icon" type="button" :aria-label="t('Transaction no. settings')" @click="noSettingsOpen = true">
              <MpIcon name="settings" size="sm" />
            </button>
          </div>
          <MpInput id="it-transno-input" v-model="transactionNo" :placeholder="t('Auto')" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="it-refno">
          <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
          <MpInput id="it-refno-input" v-model="referenceNo" is-full-width />
        </MpFormControl>
        <MpFormControl id="it-tags">
          <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
          <MpInputTag id="it-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
        </MpFormControl>
      </div>

      <!-- Line item — internal transfer moves to exactly ONE account (single row).
           Table replicates the New expense (NewExpensePage) form-table exactly:
           40px rows so inputs fill the cell, borderless inputs, focus-within inset
           on the cell (see docs/patterns/FormTable.md). -->
      <div class="ex-table-section">
        <div class="ex-table-scroll">
          <table class="ex-table ex-lineitems-table">
            <colgroup>
              <col class="ex-col-account" />
              <col class="ex-col-desc" />
              <col class="ex-col-amount" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ t('Account') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': toError }">
                  <MpAutocomplete
                    id="it-to-ac"
                    v-model="toAccountId"
                    :data="destinationOptions"
                    label-prop="name" value-prop="id"
                    is-searchable use-portal is-full-width
                    :placeholder="t('Select account')"
                    @update:model-value="toError = false"
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpInput id="it-desc" v-model="lineDescription" is-full-width />
                </td>
                <td class="ex-td ex-td--input ex-td--amount" :class="{ 'ex-td--error': amountError }">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <MpInput id="it-amount" :model-value="lineAmount" inputmode="numeric" is-full-width class="ex-amount-input" :placeholder="'0'" @update:model-value="onAmountInput" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Memo + Total -->
      <div class="it-summary">
        <div class="ex-section it-memo">
          <MpFormControl id="it-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="it-memo-textarea" v-model="memo" is-full-width :rows="3" />
          </MpFormControl>
          <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
        </div>
        <div class="it-total-block">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t('Total') }}</span> {{ formatIDR(totalAmount) }}
          </span>
        </div>
      </div>

      <!-- Attachment -->
      <div class="ex-section it-attachment-section">
        <div class="ex-section-label-row">
          <div class="ex-section-label">{{ t('Attachment') }}</div>
        </div>
        <div class="ex-attachment">
          <MpUpload
            id="it-attachment-upload"
            class="ex-attachment-upload"
            accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
            is-multiple is-full-width
            :placeholder="t('or drag and drop here')"
            :button-text="t('Choose file')"
            @change="onAttachmentChange"
          />
          <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
          <MpUploadList
            v-for="f in attachedFiles" :key="f.name"
            :id="`it-attachment-file-${f.name}`"
            :title="f.name" status="success" :subtitle="t('Uploaded')"
            :icon-name="fileIconName(f.name)"
            is-show-remove-button
            @remove="removeAttachedFile(f.name)"
          />
        </div>
      </div>
    </div>

    <!-- ── Sticky footer actions ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
    </footer>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTransferNo"
      :existing-formats="transferNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
/* ── Page shell — sticky-footer detail pattern (see CreateDeliveryOrderPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb--static { cursor: default; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}

/* Stage = the scroll area; footer pinned below it (flex, not position:sticky). */
.it-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-neutral, white); border-radius: 12px 12px 0 0;
  padding: 24px; container-type: inline-size;
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) 24px; background: var(--mp-background-neutral, white);
  border-top: 1px solid transparent; transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Transfer from + Total row ─────────────────────────────────────────────── */
.ex-row-1 {
  display: flex; align-items: flex-end; gap: 24px; flex-wrap: wrap;
  padding-bottom: 20px; border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}
.ex-field-flex { width: 316px; flex-shrink: 0; min-width: 0; }
.it-total-inline { margin-left: auto; display: flex; align-items: flex-end; padding-bottom: 8px; white-space: nowrap; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Header fields grid ────────────────────────────────────────────────────── */
/* 40px row gap below the header fields (Transaction date/no. row) before the table. */
.ex-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; padding: 20px 0 40px; max-width: 620px; }
@container (min-width: 860px) {
  .ex-grid-2 { grid-template-columns: repeat(4, 1fr); max-width: none; }
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; background: none; border: none; padding: 0; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Line item table — EXACT replica of the New expense (NewExpensePage) form
   table. Do not diverge; see docs/patterns/form-table.md. The 40px row height is
   load-bearing: it makes the input fill the cell so its own border never shows —
   the focus indicator is the cell's inset ring. ─────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-account { width: 240px; }
.ex-col-desc { width: auto; }
.ex-col-amount { width: 320px; }

.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal; text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}

.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  /* A taller Dimensions cell must not pull the row's other cells to its
     vertical center — everything pins to the top instead. */
  vertical-align: top;
}
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ex-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.ex-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.ex-td--error :deep([class*='autocomplete']), .ex-td--error :deep([class*='input']) { background: transparent; }

.ex-lineitems-table { min-width: 764px; margin-right: auto; }
.ex-lineitems-table .ex-td { height: var(--mp-sizes-10, 40px); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ex-lineitems-table .ex-td--amount { padding: 0; position: relative; }

/* inset:0 (not height:100%) fills the full — possibly Dimensions-stretched —
   row height. align-items:stretch then lets .ex-amount-prefix (auto cross-size)
   grow to match, while the input keeps its own fixed height and simply docks
   to the top (a flex item with a definite cross size doesn't stretch). */
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
.ex-amount-input { flex: 1; min-width: 0; }

/* ── Memo + Total ──────────────────────────────────────────────────────────── */
.it-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-6); padding: var(--mp-spacing-4) 0; flex-wrap: wrap; }
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.it-memo { max-width: 440px; flex: 1 1 320px; }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.it-total-block { display: flex; align-items: baseline; padding-top: var(--mp-spacing-4); white-space: nowrap; }

/* ── Attachment ────────────────────────────────────────────────────────────── */
.it-attachment-section { width: 316px; max-width: 100%; gap: 0; padding-top: var(--mp-spacing-2); }
.ex-section-label-row { margin-bottom: var(--mp-spacing-1); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) { color: var(--mp-text-placeholder, #6e7a7c) !important; }
</style>
