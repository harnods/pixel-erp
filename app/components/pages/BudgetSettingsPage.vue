<script setup lang="ts">
/**
 * Budget settings (FG-3.6): how the check responds, the approval limits, the
 * invoice tolerance, which accounts the budget controls and the dimensions.
 *
 * The Finance Admin asks for a change; it waits for the CFO and starts the
 * next day, and holds already on the ledger stay. Everyone else reads.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpInput, MpSegmentedControl } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import {
  budget, actingPerson, decideSettingsChange, requestControlChange, canEditBudgetSettings, pendingSettingChanges,
  accountClassOf, setAccountClass, type ControlSettings, type Response,
} from '~/data/budgetStore'
import { BUDGET_ACCOUNTS, CFO_NAME } from '~/data/budgetMaster'
import {
  RESPONSE_OPTIONS, CONTROL_PERIODS, CLASS_OPTIONS, classFromOption, BUDGET_DIMENSIONS, SETTINGS_RELEASE_2,
  describeSettingChange, settingValueLabel,
} from '~/data/budgetUiSettings'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const notReady = () => infoToast(t('Not in this prototype'))

const isEditor = computed(() => { void budget.viewAs; return canEditBudgetSettings() })
const isCfo = computed(() => { void budget.viewAs; return actingPerson() === CFO_NAME })
const s = computed(() => budget.settings)
const rp = (n: number) => formatIDRWhole(n)

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+07:00` : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}

// ── Budget control: Block / Warn / Off per period ───────────────────────────
const control = reactive<Record<'year' | 'month' | 'ytd', Response>>({ year: s.value.year, month: s.value.month, ytd: s.value.ytd })
const controlDirty = computed(() => CONTROL_PERIODS.some((p) => control[p.key] !== s.value[p.key]))
const controlError = ref('')
const controlNotice = ref('')
const segData = (key: string) => RESPONSE_OPTIONS.map((r) => ({ id: `bs-${key}-${r.toLowerCase()}`, value: r, label: r }))

function resetControl() {
  CONTROL_PERIODS.forEach((p) => { control[p.key] = s.value[p.key] })
  controlError.value = ''
}
function saveControl() {
  controlError.value = ''
  controlNotice.value = ''
  const res = requestControlChange({ year: control.year, month: control.month, ytd: control.ytd })
  if (!res.ok) { controlError.value = res.reason!; return }
  controlNotice.value = 'Waiting for CFO approval, starts the next day'
  successToast(t('Change sent for approval'))
}

// ── Approval limits and invoice tolerance ───────────────────────────────────
type NumKey = 'smallMoveLimit' | 'smallMoveDays' | 'fundingCapPct' | 'fundingPerQuarter' | 'invoiceTolerancePct'
const nums = reactive<Record<NumKey, string>>({ smallMoveLimit: '', smallMoveDays: '', fundingCapPct: '', fundingPerQuarter: '', invoiceTolerancePct: '' })
function resetNums(keys: NumKey[]) {
  keys.forEach((k) => { nums[k] = k === 'smallMoveLimit' ? s.value[k].toLocaleString('id-ID') : String(s.value[k]) })
}
resetNums(['smallMoveLimit', 'smallMoveDays', 'fundingCapPct', 'fundingPerQuarter', 'invoiceTolerancePct'])

const APPROVAL_FIELDS: { key: NumKey; label: string; detail: string }[] = [
  { key: 'smallMoveLimit', label: 'One-approver limit (Rp)', detail: 'A same-department move up to this running total goes to the budget holder alone' },
  { key: 'smallMoveDays', label: 'Running total window (days)', detail: 'Moves in this window add up toward the one-approver limit' },
  { key: 'fundingCapPct', label: 'Funding cap over the gap (%)', detail: 'A funding request can ask this much above the blocked gap' },
  { key: 'fundingPerQuarter', label: 'Funding requests per line per quarter', detail: 'Past this count, the line needs a revision' },
]
const approvalError = ref('')
const approvalNotice = ref('')
const toleranceError = ref('')
const toleranceNotice = ref('')

function parseNum(v: string): number | undefined {
  const digits = v.replace(/[^\d]/g, '')
  return digits ? Number(digits) : undefined
}
function saveNums(keys: NumKey[], err: typeof approvalError, notice: typeof approvalNotice) {
  err.value = ''
  notice.value = ''
  const patch: Partial<ControlSettings> = {}
  for (const k of keys) {
    const n = parseNum(nums[k])
    if (n === undefined) { err.value = 'Fill in every field.'; return }
    ;(patch as Record<string, number>)[k] = n
  }
  const res = requestControlChange(patch)
  if (!res.ok) { err.value = res.reason!; return }
  notice.value = 'Waiting for CFO approval, starts the next day'
  successToast(t('Change sent for approval'))
}
const saveApproval = () => saveNums(['smallMoveLimit', 'smallMoveDays', 'fundingCapPct', 'fundingPerQuarter'], approvalError, approvalNotice)
const saveTolerance = () => saveNums(['invoiceTolerancePct'], toleranceError, toleranceNotice)

// Approved changes apply at once (labelled from tomorrow): redraw the fields.
watch(() => ({ ...budget.settings }), () => {
  resetControl()
  resetNums(['smallMoveLimit', 'smallMoveDays', 'fundingCapPct', 'fundingPerQuarter', 'invoiceTolerancePct'])
})

// ── Changes waiting for the CFO ─────────────────────────────────────────────
const pending = computed(() => pendingSettingChanges())
const decided = computed(() => budget.settingChanges.filter((x) => x.status !== 'Pending').slice(0, 5))
const decideError = ref('')
function decide(id: string, approve: boolean) {
  decideError.value = ''
  const res = decideSettingsChange(id, approve)
  if (!res.ok) { decideError.value = res.reason!; return }
  controlNotice.value = ''
  approvalNotice.value = ''
  toleranceNotice.value = ''
  successToast(t(approve ? 'Setting change approved' : 'Setting change rejected'))
}

// ── Budget accounts ─────────────────────────────────────────────────────────
const accountColumns: TableColumn[] = [
  { key: 'code', label: 'Code', kind: 'number' },
  { key: 'name', label: 'Account', kind: 'name' },
  { key: 'class', label: 'Class', kind: 'default' },
  { key: 'savingOnly', label: 'Saving only', kind: 'unit' },
  { key: 'controlled', label: 'Budget controlled', kind: 'status' },
]
const accountRows = computed(() => BUDGET_ACCOUNTS.map((a) => ({
  code: a.code, name: a.name, cls: accountClassOf(a.code), savingOnly: !!a.savingOnly, isControlled: !!a.controlled,
})))
const classError = reactive<Record<string, string>>({})
const classRedraw = ref(0)
function onClass(code: string, v: string) {
  Object.keys(classError).forEach((k) => delete classError[k])
  const res = setAccountClass(code, classFromOption(v))
  if (!res.ok) { classError[code] = res.reason!; classRedraw.value += 1; return }
  successToast(t('Account class saved'))
}

// ── Dimensions ──────────────────────────────────────────────────────────────
const dimensionColumns: TableColumn[] = [
  { key: 'name', label: 'Dimension', kind: 'name' },
  { key: 'rule', label: 'On a budget line', kind: 'status' },
  { key: 'detail', label: 'Rule', kind: 'address' },
]
</script>

<template>
  <div class="bs">
    <!-- ── Changes waiting for the CFO ── -->
    <div v-if="pending.length || decided.length" class="bs__card" data-testid="bs-changes">
      <div class="bs__cardhead">
        <span class="bs__cardtitle">{{ t('Setting changes') }}</span>
        <span class="bs__hint">{{ t('A change needs CFO approval and starts the next day. Holds already on the budget stay.') }}</span>
      </div>
      <div v-for="sc in pending" :key="sc.id" class="bs__row" :data-testid="`bs-pending-${sc.id}`">
        <div class="bs__rowmain">
          <div class="bs__rowk">{{ t(describeSettingChange(sc, budget.settings, rp)) }}</div>
          <div class="bs__rowv">{{ t(`Asked by ${sc.requestedBy} on ${fmtDate(sc.requestedAt)} · Waiting for CFO approval, starts the next day`) }}</div>
        </div>
        <div v-if="isCfo" class="bs__btns">
          <MpButton variant="ghost" is-rounded :data-testid="`bs-reject-${sc.id}`" @click="decide(sc.id, false)">{{ t('Reject') }}</MpButton>
          <MpButton is-rounded :data-testid="`bs-approve-${sc.id}`" @click="decide(sc.id, true)">{{ t('Approve') }}</MpButton>
        </div>
        <ErpStatusBadge v-else status="pending" :label="t('Waiting for CFO')" />
      </div>
      <div v-for="sc in decided" :key="sc.id" class="bs__row">
        <div class="bs__rowmain">
          <div class="bs__rowk">{{ t(describeSettingChange(sc, budget.settings, rp)) }}</div>
          <div class="bs__rowv">
            {{ sc.status === 'Approved'
              ? t(`Approved by ${sc.approvedBy} · Starts ${fmtDate(sc.effectiveFrom)}`)
              : t(`Rejected by ${sc.approvedBy}`) }}
          </div>
        </div>
        <ErpStatusBadge :status="sc.status.toLowerCase()" :label="t(sc.status)" />
      </div>
      <p v-if="decideError" class="bs__error">{{ t(decideError) }}</p>
    </div>

    <!-- ── Budget control ── -->
    <div class="bs__card" data-tour="budget-control-settings">
      <div class="bs__cardhead">
        <span class="bs__cardtitle">{{ t('Budget control') }}</span>
        <span class="bs__hint">{{ t('How a purchase request or order responds when it goes over what is left') }}</span>
      </div>
      <div v-for="p in CONTROL_PERIODS" :key="p.key" class="bs__row">
        <div class="bs__rowmain">
          <div class="bs__rowk">{{ t(p.label) }}</div>
          <div class="bs__rowv">{{ t(p.detail) }}</div>
        </div>
        <MpSegmentedControl
          :id="`bs-${p.key}`"
          :name="`bs-${p.key}`"
          v-model="control[p.key]"
          :data="segData(p.key)"
          :is-disabled="!isEditor"
          class="bs__seg"
          :data-testid="`bs-seg-${p.key}`"
        />
      </div>
      <div v-if="isEditor" class="bs__foot">
        <span v-if="controlNotice" class="bs__notice" data-testid="bs-control-notice">{{ t(controlNotice) }}</span>
        <span v-else-if="controlError" class="bs__ferror" data-testid="bs-control-error">{{ t(controlError) }}</span>
        <span v-else />
        <div class="bs__btns">
          <MpButton v-if="controlDirty" variant="ghost" is-rounded @click="resetControl">{{ t('Cancel') }}</MpButton>
          <MpButton is-rounded data-testid="bs-control-save" @click="saveControl">{{ t('Save') }}</MpButton>
        </div>
      </div>
      <p v-else class="bs__note">{{ t('Only the Finance Admin changes budget control settings.') }}</p>
    </div>

    <!-- ── Approval ── -->
    <div class="bs__card">
      <div class="bs__cardhead">
        <span class="bs__cardtitle">{{ t('Approval') }}</span>
        <span class="bs__hint">{{ t('Transfers and funding requests') }}</span>
      </div>
      <div v-for="f in APPROVAL_FIELDS" :key="f.key" class="bs__row">
        <div class="bs__rowmain">
          <label class="bs__rowk" :for="`bs-${f.key}`">{{ t(f.label) }}</label>
          <div class="bs__rowv">{{ t(f.detail) }}</div>
        </div>
        <div v-if="isEditor" class="bs__input"><MpInput :id="`bs-${f.key}`" v-model="nums[f.key]" /></div>
        <span v-else class="bs__value" :data-testid="`bs-val-${f.key}`">{{ settingValueLabel(f.key, s[f.key], rp) }}</span>
      </div>
      <div v-if="isEditor" class="bs__foot">
        <span v-if="approvalNotice" class="bs__notice">{{ t(approvalNotice) }}</span>
        <span v-else-if="approvalError" class="bs__ferror" data-testid="bs-approval-error">{{ t(approvalError) }}</span>
        <span v-else />
        <MpButton is-rounded data-testid="bs-approval-save" @click="saveApproval">{{ t('Save') }}</MpButton>
      </div>
    </div>

    <!-- ── Invoice tolerance ── -->
    <div class="bs__card">
      <div class="bs__cardhead">
        <span class="bs__cardtitle">{{ t('Invoice tolerance') }}</span>
      </div>
      <div class="bs__row">
        <div class="bs__rowmain">
          <label class="bs__rowk" for="bs-invoiceTolerancePct">{{ t('Tolerance over the purchase order line (%)') }}</label>
          <div class="bs__rowv">{{ t('An invoice within this much over its purchase order line posts without a new check') }}</div>
        </div>
        <div v-if="isEditor" class="bs__input"><MpInput id="bs-invoiceTolerancePct" v-model="nums.invoiceTolerancePct" /></div>
        <span v-else class="bs__value" data-testid="bs-val-tolerance">{{ settingValueLabel('invoiceTolerancePct', s.invoiceTolerancePct, rp) }}</span>
      </div>
      <div v-if="isEditor" class="bs__foot">
        <span v-if="toleranceNotice" class="bs__notice">{{ t(toleranceNotice) }}</span>
        <span v-else-if="toleranceError" class="bs__ferror">{{ t(toleranceError) }}</span>
        <span v-else />
        <MpButton is-rounded data-testid="bs-tolerance-save" @click="saveTolerance">{{ t('Save') }}</MpButton>
      </div>
    </div>

    <!-- ── Budget accounts ── -->
    <div class="bs__section">
      <div class="bs__sechead">
        <span class="bs__cardtitle">{{ t('Budget accounts') }}</span>
        <span class="bs__hint">{{ t('Every budget account carries Opex or Capex before a line can use it') }}</span>
      </div>
      <ErpTablePage
        :columns="accountColumns"
        :rows="accountRows"
        :total="accountRows.length"
        :current-page="1"
        :per-page="25"
        no-row-hover
      >
        <template #cell-class="{ row }">
          <div class="bs__cellstack">
            <ErpFilterSelect
              v-if="isEditor && !row.savingOnly"
              :id="`bs-class-${row.code}`"
              :key="`${row.code}-${classRedraw}`"
              :model-value="(row.cls as string | null) ?? 'none'"
              :placeholder="t('Class')"
              :options="CLASS_OPTIONS"
              :is-clearable="false"
              width="144px"
              @update:model-value="(v: string) => onClass(row.code as string, v)"
            />
            <span v-else>{{ row.savingOnly ? '-' : (row.cls ?? t('No class')) }}</span>
            <span v-if="classError[row.code as string]" class="bs__ferror" :data-testid="`bs-class-error-${row.code}`">{{ t(classError[row.code as string]!) }}</span>
          </div>
        </template>
        <template #cell-savingOnly="{ row }">{{ row.savingOnly ? t('Yes') : t('No') }}</template>
        <template #cell-controlled="{ row }">
          <ErpStatusBadge
            :status="row.isControlled ? 'active' : 'draft'"
            :label="row.isControlled ? t('Controlled') : t('Not budget controlled')"
          />
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Dimensions ── -->
    <div class="bs__section">
      <div class="bs__sechead">
        <span class="bs__cardtitle">{{ t('Dimensions') }}</span>
        <span class="bs__hint">{{ t('A budget line is one account and one mix of these, for one year') }}</span>
      </div>
      <ErpTablePage
        :columns="dimensionColumns"
        :rows="BUDGET_DIMENSIONS"
        :total="BUDGET_DIMENSIONS.length"
        :current-page="1"
        :per-page="25"
        no-row-hover
      >
        <template #cell-rule="{ value }">
          <ErpStatusBadge :status="value === 'Required' ? 'active' : 'draft'" :label="t(String(value))" />
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Release 2 ── -->
    <div class="bs__card">
      <div class="bs__cardhead">
        <span class="bs__cardtitle">{{ t('More rules') }}</span>
      </div>
      <div v-for="r in SETTINGS_RELEASE_2" :key="r.label" class="bs__row">
        <div class="bs__rowmain">
          <div class="bs__rowk">{{ t(r.label) }}</div>
          <div class="bs__rowv">{{ t(r.detail) }}</div>
        </div>
        <MpButton variant="secondary" is-rounded :data-testid="`bs-r2-${r.label}`" @click="notReady">{{ t('Set up') }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bs { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.bs__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.bs__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.bs__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bs__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bs__row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.bs__row:last-child { border-bottom: 0; }
.bs__rowmain { min-width: 0; flex: 1 1 auto; }
.bs__rowk { display: block; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bs__rowv { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.bs__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.bs__input { width: 200px; flex: none; }
.bs__seg { flex: none; }
.bs__seg :deep([data-part='item']), .bs__seg :deep(label) { min-width: max-content; }
.bs__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.bs__btns { display: flex; gap: var(--mp-spacing-2); flex: none; }
.bs__notice { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); font-weight: var(--mp-font-weights-semi-bold); }
.bs__ferror { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bs__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-3); }
.bs__note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.bs__section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bs__sechead { display: flex; align-items: baseline; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.bs__cellstack { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
</style>
