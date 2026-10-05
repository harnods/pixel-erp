<script setup lang="ts">
/**
 * Independent checks (OD-22, TN-04, LR-13): five checks that skip the mapping, so a wrong
 * account shows even when the main report reads Rp0. A check off by more than Rp1.000 blocks
 * sign-off until someone writes a confirmed note.
 */
import { MpButton, MpBadge, MpInput } from '@mekari/pixel3'
import { independentChecks, setCheckNote, can, rupiah } from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ month: string }>()
const { t } = useLocale()
const checks = computed(() => independentChecks(props.month))
const editing = ref<string | null>(null)
const draft = ref('')
const error = ref('')
const canNote = computed(() => can('recon.note') || can('recon.signoff'))

function edit(id: string, note: string | null) { editing.value = id; draft.value = note ?? ''; error.value = '' }
function save(id: string) {
  const r = setCheckNote(props.month, id, draft.value)
  if (!r.ok) { error.value = r.message ?? ''; return }
  editing.value = null
  successToast(t('Note confirmed'))
}
const type = (s: string) => (s === 'Matches' ? 'completed' : s === 'Explained' ? 'information' : s === 'Off' ? 'critical' : 'announcement')
const offCount = computed(() => checks.value.filter((c) => c.status === 'Off').length)
</script>

<template>
  <div class="prc" data-tour="payroll-recon-checks">
    <div class="prc-head">
      <span class="prc-title">{{ t('Independent checks') }}</span>
      <span class="prc-hint" :class="{ 'prc-bad': offCount }">{{ offCount ? `${offCount} ${t(offCount === 1 ? 'check is off. Sign-off waits for a confirmed note.' : 'checks are off. Sign-off waits for confirmed notes.')}` : t('No check blocks sign-off') }}</span>
    </div>
    <table class="prc-table">
      <thead>
        <tr><th>{{ t('Check') }}</th><th class="prc-r">{{ t('Source') }}</th><th class="prc-r">{{ t('Ledger') }}</th><th class="prc-r">{{ t('Difference') }}</th><th>{{ t('Status') }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in checks" :key="c.id">
          <td>
            <span>{{ t(c.label) }}</span>
            <template v-if="editing === c.id">
              <div class="prc-edit">
                <MpInput :id="`prc-note-${c.id}`" v-model="draft" autocomplete="off" />
                <MpButton variant="ghost" is-rounded @click="editing = null">{{ t('Cancel') }}</MpButton>
                <MpButton is-rounded @click="save(c.id)">{{ t('Confirm note') }}</MpButton>
              </div>
              <span v-if="error" class="prc-err">{{ error }}</span>
            </template>
            <span v-else-if="c.note" class="prc-sub">{{ t('Note') }}: {{ c.note.note }} · {{ c.note.by }}</span>
          </td>
          <td class="prc-r">
            {{ c.source == null ? t('No data') : rupiah(c.source) }}
            <span class="prc-sub">{{ t(c.sourceLabel) }}</span>
          </td>
          <td class="prc-r">
            {{ c.ledger == null ? t('No data') : rupiah(c.ledger) }}
            <span class="prc-sub">{{ t(c.ledgerLabel) }}</span>
          </td>
          <td class="prc-r" :class="{ 'prc-bad': c.status === 'Off' }">{{ c.difference == null ? '-' : rupiah(c.difference) }}</td>
          <td>
            <MpBadge for="tableStatus" :type="type(c.status)">{{ t(c.status) }}</MpBadge>
            <div v-if="canNote && editing !== c.id && (c.status === 'Off' || c.status === 'Explained')" class="prc-actions">
              <MpButton variant="secondary" size="sm" is-rounded @click="edit(c.id, c.note?.note ?? null)">{{ c.note ? t('Edit note') : t('Add note') }}</MpButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.prc { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.prc-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.prc-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.prc-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.prc-table { width: 100%; border-collapse: collapse; }
.prc-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.prc-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.prc-table tr:last-child td { border-bottom: 0; }
.prc-table .prc-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prc-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); white-space: normal; }
.prc-bad { color: var(--mp-text-danger); }
.prc-err { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.prc-edit { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.prc-actions { margin-top: var(--mp-spacing-2); }
</style>
