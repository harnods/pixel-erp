<script setup lang="ts">
/**
 * Close a PPh 21 amendment task (OD-16, PMK 81/2024). Amended needs the pembetulan number and
 * the new PPh 21 total, compared with the expected figure (LR-10). Not filed yet applies before
 * the filing date: the return is filed with the new figures. Dismissed needs a reason.
 */
import { MpInput, MpTextarea, MpFormControl, MpFormLabel, MpFormErrorMessage, MpRadio } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import { amendmentTasks, closeAmendmentTask, pph21Month, monthLabel, dateLabel, nextMonthOf, today, rupiah } from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

type Task = (typeof amendmentTasks.value)[number]
const props = defineProps<{ task: Task | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

type Outcome = 'Amended' | 'Not filed yet' | 'Dismissed'
const OUTCOMES: { value: Outcome; label: string; sub: string }[] = [
  { value: 'Amended', label: 'Amended', sub: 'The pembetulan is filed in e-Bupot 21/26.' },
  { value: 'Not filed yet', label: 'Not filed yet', sub: 'The return is not filed yet; it is filed with the new figures.' },
  { value: 'Dismissed', label: 'Dismissed', sub: 'No amendment is needed.' },
]
const outcome = ref<Outcome | ''>('')
const pembetulan = ref('')
const newTotal = ref('')
const reason = ref('')
const error = ref('')
watch(() => props.task, () => { outcome.value = ''; pembetulan.value = ''; newTotal.value = ''; reason.value = ''; error.value = '' })

const expected = computed(() => (props.task ? pph21Month(props.task.taxMonth).rule : 0))
const filingDue = computed(() => (props.task ? `${nextMonthOf(props.task.taxMonth)}-20` : ''))
const beforeDue = computed(() => !!filingDue.value && today() <= filingDue.value)
const parsed = computed(() => { const n = Number(newTotal.value.replace(/[^\d-]/g, '')); return newTotal.value.trim() && Number.isFinite(n) ? n : null })
const vsExpected = computed(() => (parsed.value == null ? null : parsed.value - expected.value))

function save() {
  const x = props.task
  if (!x) return
  error.value = ''
  if (!outcome.value) { error.value = t('Pick an outcome.'); return }
  const r = closeAmendmentTask(x.id, outcome.value, {
    pembetulanNo: pembetulan.value.trim() || undefined,
    newTotal: parsed.value ?? undefined,
    reason: reason.value.trim() || undefined,
  })
  if (!r.ok) { error.value = t(r.message ?? 'The task could not be closed.'); return }
  successToast(t(`Task closed as ${outcome.value}`))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="!!task" :title="t('Close amendment task')" @close="emit('close')">
    <template v-if="task">
      <div class="pac__identity">{{ t(task.title) }}</div>
      <dl class="pac__facts">
        <div><dt>{{ t('Period total change') }}</dt><dd>{{ rupiah(task.periodChange) }}</dd></div>
        <div><dt>{{ t('Expected PPh 21') }}</dt><dd>{{ rupiah(expected) }}</dd></div>
        <div><dt>{{ t('Deposit') }}</dt><dd>{{ t(task.depositGap) }}</dd></div>
        <div><dt>{{ t('Filing date') }}</dt><dd>{{ dateLabel(filingDue) }}</dd></div>
      </dl>

      <MpFormControl id="pac-outcome" is-required>
        <MpFormLabel>{{ t('Outcome') }}</MpFormLabel>
        <div class="pac__choices">
          <label v-for="o in OUTCOMES" :key="o.value" class="pac__choice">
            <MpRadio :id="`pac-${o.value.replace(/ /g, '-').toLowerCase()}`" name="pac-outcome" :is-checked="outcome === o.value" @change="outcome = o.value; error = ''" />
            <span>
              <span class="pac__choicetitle">{{ t(o.label) }}</span>
              <span class="pac__choicesub">{{ t(o.sub) }}</span>
            </span>
          </label>
        </div>
      </MpFormControl>
      <div v-if="outcome === 'Not filed yet' && !beforeDue" class="pac__note">
        {{ t(`The filing date for ${monthLabel(task.taxMonth)} was ${dateLabel(filingDue)}. Check that the return is not filed before you pick this.`) }}
      </div>

      <template v-if="outcome === 'Amended'">
        <MpFormControl id="pac-pembetulan" is-required>
          <MpFormLabel>{{ t('Pembetulan number') }}</MpFormLabel>
          <MpInput id="pac-pembetulan-input" v-model="pembetulan" is-full-width @input="error = ''" />
        </MpFormControl>
        <MpFormControl id="pac-total" is-required>
          <MpFormLabel>{{ t(`New ${monthLabel(task.taxMonth)} PPh 21 total (Rp)`) }}</MpFormLabel>
          <MpInput id="pac-total-input" v-model="newTotal" inputmode="numeric" is-full-width @input="error = ''" />
        </MpFormControl>
        <div v-if="vsExpected != null" class="pac__compare" :class="{ 'pac__compare--off': Math.abs(vsExpected) > 1000 }" data-testid="pac-compare">
          {{ Math.abs(vsExpected) <= 1000 ? t('Matches the expected PPh 21.') : t(`${rupiah(Math.abs(vsExpected))} ${vsExpected > 0 ? 'above' : 'below'} the expected PPh 21 of ${rupiah(expected)}.`) }}
        </div>
      </template>

      <MpFormControl v-if="outcome === 'Dismissed'" id="pac-reason" is-required>
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpTextarea id="pac-reason-input" v-model="reason" :rows="4" is-full-width @input="error = ''" />
      </MpFormControl>

      <MpFormControl v-if="error" id="pac-error" is-invalid>
        <MpFormErrorMessage data-testid="pac-error">{{ error }}</MpFormErrorMessage>
      </MpFormControl>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="pac-save" @click="save">{{ t('Close task') }}</button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.pac__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pac__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; }
.pac__facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pac__facts dd { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pac__choices { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pac__choice { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer; }
.pac__choicetitle { display: block; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pac__choicesub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pac__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pac__compare { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-success); }
.pac__compare--off { color: var(--mp-colors-text-warning); }
</style>
