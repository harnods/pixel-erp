<script setup lang="ts">
/**
 * Draft review (OD-12, TS-05): the four sections the Accountant checks before
 * Post. (1) pay item totals by section (Talenta sends no totals), (2) change from the
 * last posted period by account and tag with notes on flagged rows, (3) headcount
 * by group: this run's employee_ids against the previous posted run, with who is
 * new, not in this run or moved, each group's change markable Expected (HR settles
 * the people; Posting is never blocked by it), (4) the exact lines Post writes, each with
 * "Why this line". Tax lines sit under the one PPh 21 rule (LR-10).
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpInput } from '@mekari/pixel3'
import {
  can, runById, draftReview, whyLine, addChangeNote, accountLabel, tagsLabel, rupiah, currentVersionOf, isDraftStale,
  markHeadcountExpected, clearHeadcountExpected, payroll, type Tags,
} from '~/data/payrollStore'
import { taxRuleRows } from '~/data/payrollUiIntake'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const review = computed(() => (run.value && currentVersionOf(run.value) ? draftReview(props.runId) : null))
const tax = computed(() => taxRuleRows(props.runId))
const stale = computed(() => isDraftStale(props.runId))
const label = (account: string, tags: Tags) => `${accountLabel(account)}${tagsLabel(tags) ? ` | ${tagsLabel(tags)}` : ''}`
const pct = (n: number | null) => (n == null ? t('New') : `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`)
const signed = (n: number) => `${n >= 0 ? '+' : ''}${rupiah(n)}`

const totals = computed(() => {
  const lines = review.value?.lines ?? []
  return { debit: lines.reduce((s, l) => s + l.debit, 0), credit: lines.reduce((s, l) => s + l.credit, 0) }
})
const sections = computed(() => {
  const by = (s: string) => (review.value?.payItems ?? []).filter((p) => p.section === s).sort((a, b) => b.amount - a.amount)
  return (['allowance', 'deduction', 'benefit'] as const).map((s) => ({ section: s, items: by(s), total: review.value?.totals.find((x) => x.section === s) }))
})
const flagged = computed(() => (review.value?.changes ?? []).filter((c) => c.flag))
const otherChanges = computed(() => (review.value?.changes ?? []).filter((c) => !c.flag))
const showAllChanges = ref(false)

const notes = reactive<Record<string, string>>({})
const noteErr = reactive<Record<string, string>>({})
function saveNote(key: string) {
  const r = addChangeNote(props.runId, key, notes[key] ?? '')
  if (!r.ok) { noteErr[key] = r.message ?? ''; return }
  noteErr[key] = ''
  successToast(t('Note saved'))
}

const openWhy = ref<number | null>(null)
const why = computed(() => (openWhy.value == null ? null : whyLine(props.runId, openWhy.value)))
const safeId = (k: string) => k.replace(/[^a-zA-Z0-9-]/g, '-')

// ── Headcount by group ──
const hc = computed(() => review.value?.headcount ?? null)
const hcNotes = reactive<Record<string, string>>({})
const hcErr = reactive<Record<string, string>>({})
const signedCount = (n: number) => (n > 0 ? `+${n}` : String(n))
function markExpected(key: string) {
  const r = markHeadcountExpected(props.runId, key, hcNotes[key] ?? '')
  if (!r.ok) { hcErr[key] = r.message ?? ''; return }
  hcErr[key] = ''
  successToast(t('Marked expected'))
}
function unmarkExpected(key: string) {
  clearHeadcountExpected(props.runId, key)
  successToast(t('Expected mark removed'))
}
</script>

<template>
  <div v-if="review && review.lines.length" class="pdr">
    <div v-if="stale" class="pdr__notice">
      {{ t('Settings changed since this draft was built. Post rebuilds it and shows the lines that moved.') }}
    </div>

    <!-- 1. Pay item totals against Talenta -->
    <section class="pdr__card" data-section="pay-items">
      <header class="pdr__cardhead">
        <div class="pdr__cardtitle">{{ t('Pay item totals') }}</div>
        <div class="pdr__cardsub">{{ t('Talenta sends pay items only. Take-home pay is allowances less deductions.') }} {{ rupiah(review.takeHome) }}</div>
      </header>
      <table class="pdr__table">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Section') }}</th>
            <th class="pdr__th pdr__num">{{ t('Pay item lines') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in review.totals" :key="s.section">
            <td class="pdr__td pdr__strong">{{ t(`${s.section[0]!.toUpperCase()}${s.section.slice(1)}s`) }}</td>
            <td class="pdr__td pdr__num">{{ rupiah(s.amount) }}</td>
          </tr>
        </tbody>
      </table>
      <table class="pdr__table pdr__table--sub">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Pay item') }}</th>
            <th class="pdr__th">{{ t('Role') }}</th>
            <th class="pdr__th pdr__num">{{ t('Staff') }}</th>
            <th class="pdr__th pdr__num">{{ t('Amount') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="s in sections" :key="s.section">
            <tr v-for="p in s.items" :key="`${s.section}-${p.name}`">
              <td class="pdr__td">{{ p.name }} <span class="pdr__muted">· {{ t(p.section) }}</span></td>
              <td class="pdr__td">{{ p.role ? t(p.role) : t('No role') }}</td>
              <td class="pdr__td pdr__num">{{ p.staff }}</td>
              <td class="pdr__td pdr__num">{{ rupiah(p.amount) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <!-- 2. Change from last period -->
    <section class="pdr__card" data-section="changes">
      <header class="pdr__cardhead">
        <div class="pdr__cardtitle">{{ t('Change from last period') }}</div>
        <div class="pdr__cardsub">
          <template v-if="review.previous">{{ t('Against posted') }} {{ review.previous.label }} · {{ t('flagged when a row moves more than') }} {{ payroll.settings.limits.largeChangePct }}% {{ t('and') }} {{ rupiah(payroll.settings.limits.largeChangeAmount) }}</template>
          <template v-else>{{ t('No earlier period') }}</template>
        </div>
      </header>
      <table v-if="review.previous" class="pdr__table">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Account and dimension') }}</th>
            <th class="pdr__th pdr__num">{{ t('Last period') }}</th>
            <th class="pdr__th pdr__num">{{ t('This draft') }}</th>
            <th class="pdr__th pdr__num">{{ t('Change') }}</th>
            <th class="pdr__th">{{ t('Note') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in [...flagged, ...(showAllChanges ? otherChanges : [])]" :key="c.key">
            <td class="pdr__td">
              {{ label(c.account, c.tags) }}
              <span v-if="c.flag" class="pdr__flag">{{ t('Check') }}</span>
            </td>
            <td class="pdr__td pdr__num">{{ rupiah(Math.abs(c.old)) }}</td>
            <td class="pdr__td pdr__num">{{ rupiah(Math.abs(c.new)) }}</td>
            <td class="pdr__td pdr__num">{{ signed(Math.abs(c.new) - Math.abs(c.old)) }} <span class="pdr__muted">({{ pct(c.pct == null ? null : (Math.abs(c.new) - Math.abs(c.old)) / Math.abs(c.old) * 100) }})</span></td>
            <td class="pdr__td pdr__notecell">
              <template v-if="c.flag && can('draft.note')">
                <div class="pdr__noteform">
                  <MpInput :id="`pdr-note-${safeId(c.key)}`" :model-value="notes[c.key] ?? c.note ?? ''" :is-invalid="!!noteErr[c.key]" @update:model-value="(v: string | number) => notes[c.key] = String(v)" />
                  <MpButton variant="secondary" is-rounded @click="saveNote(c.key)">{{ t('Save') }}</MpButton>
                </div>
                <p v-if="noteErr[c.key]" class="pdr__error">{{ t(noteErr[c.key]!) }}</p>
              </template>
              <span v-else-if="c.note">{{ c.note }}</span>
              <span v-else-if="c.flag" class="pdr__danger">{{ t('No note') }}</span>
            </td>
          </tr>
          <tr v-if="!flagged.length && !showAllChanges">
            <td class="pdr__td pdr__muted" colspan="5">{{ t('No row moves past the change limit.') }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="review.previous && otherChanges.length" class="pdr__cardfoot">
        <MpButton variant="ghost" is-rounded @click="showAllChanges = !showAllChanges">
          {{ showAllChanges ? t('Show flagged rows only') : `${t('Show all changes')} (${otherChanges.length + flagged.length})` }}
        </MpButton>
      </div>
    </section>

    <!-- 3. Headcount by group: employee_ids against the previous posted run -->
    <section v-if="hc" class="pdr__card" data-section="headcount" data-tour="payroll-draft-headcount">
      <header class="pdr__cardhead">
        <div class="pdr__cardtitle">{{ t('Headcount by group') }}</div>
        <div class="pdr__cardsub">
          <template v-if="hc.previous">
            {{ t('Against posted') }} {{ hc.previous.label }} · {{ hc.last }} {{ t('staff then') }}, {{ hc.current }} {{ t('in this run') }} ·
            {{ hc.flagged ? `${hc.flagged} ${t(hc.flagged === 1 ? 'group changed' : 'groups changed')}` : t('No group changed') }}<template v-if="hc.flagged">, {{ hc.unexpected }} {{ t('not marked expected') }}</template>
          </template>
          <template v-else>{{ t('No earlier posted run to compare with') }}</template>
        </div>
      </header>
      <table class="pdr__table">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Group') }}</th>
            <th class="pdr__th pdr__num">{{ t('Last period') }}</th>
            <th class="pdr__th pdr__num">{{ t('This run') }}</th>
            <th class="pdr__th pdr__num">{{ t('Change') }}</th>
            <th v-if="hc.flagged" class="pdr__th">{{ t('Expected') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in hc.groups" :key="h.key" :data-group="h.key">
            <td class="pdr__td">
              {{ h.label }}
              <span v-if="h.flagged && h.expected" class="pdr__flag pdr__flag--ok">{{ t('Expected') }}</span>
              <span v-else-if="h.flagged" class="pdr__flag">{{ t('Check') }}</span>
              <ul v-if="h.flagged" class="pdr__hclist">
                <li v-if="h.left.length">{{ t('Not in this run') }}: {{ h.left.join(', ') }}</li>
                <li v-if="h.joined.length">{{ t('New in this run') }}: {{ h.joined.join(', ') }}</li>
                <li v-for="m in [...h.movedOut, ...h.movedIn]" :key="m.employee_id">{{ t('Moved') }}: {{ m.employee_id }} {{ m.from }} {{ t('to') }} {{ m.to }}</li>
              </ul>
            </td>
            <td class="pdr__td pdr__num">{{ hc.previous ? h.last : '' }}</td>
            <td class="pdr__td pdr__num pdr__strong">{{ h.current }}</td>
            <td class="pdr__td pdr__num" :class="{ 'pdr__danger': h.flagged && !h.expected }">{{ hc.previous ? signedCount(h.change) : '' }}</td>
            <td v-if="hc.flagged" class="pdr__td pdr__notecell">
              <template v-if="h.flagged && h.expected">
                <div>{{ h.expected.note || t('No note') }}</div>
                <div class="pdr__muted">{{ h.expected.by }}</div>
                <span v-if="can('draft.note')" class="pdr__link" @click="unmarkExpected(h.key)">{{ t('Undo') }}</span>
              </template>
              <template v-else-if="h.flagged && can('draft.note')">
                <div class="pdr__noteform">
                  <MpInput :id="`pdr-hc-${safeId(h.key)}`" :placeholder="t('Note (optional)')" :model-value="hcNotes[h.key] ?? ''" :is-invalid="!!hcErr[h.key]" @update:model-value="(v: string | number) => hcNotes[h.key] = String(v)" />
                  <MpButton variant="secondary" is-rounded @click="markExpected(h.key)">{{ t('Expected') }}</MpButton>
                </div>
                <p v-if="hcErr[h.key]" class="pdr__error">{{ t(hcErr[h.key]!) }}</p>
              </template>
              <span v-else-if="h.flagged" class="pdr__danger">{{ t('Not marked') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Tax rows under the one PPh 21 rule -->
    <section v-if="tax" class="pdr__card" data-section="tax">
      <header class="pdr__cardhead">
        <div class="pdr__cardtitle">{{ t('Tax lines') }}</div>
        <div class="pdr__cardsub">
          {{ t('Regular PPh 21 = PPh 21 Benefit') }} {{ rupiah(tax.benefit) }} + {{ t('PPh 21 Payment') }} {{ rupiah(tax.payment) }} - {{ t('PPh 21 DTP received') }} {{ rupiah(tax.dtp) }} = {{ rupiah(tax.expected) }}
        </div>
      </header>
      <table class="pdr__table">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Tax line') }}</th>
            <th class="pdr__th">{{ t('Account') }}</th>
            <th class="pdr__th pdr__num">{{ t('Tax rule') }}</th>
            <th class="pdr__th pdr__num">{{ t('In the draft') }}</th>
            <th class="pdr__th pdr__num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in tax.rows" :key="r.label">
            <td class="pdr__td">{{ t(r.label) }}</td>
            <td class="pdr__td">{{ accountLabel(r.account) }}</td>
            <td class="pdr__td pdr__num">{{ rupiah(r.rule) }}</td>
            <td class="pdr__td pdr__num">{{ r.ledger == null ? t('In Regular PPh 21') : rupiah(r.ledger) }}</td>
            <td class="pdr__td pdr__num" :class="{ 'pdr__danger': r.ledger != null && Math.abs(r.ledger - r.rule) > 1000 }">{{ r.ledger == null ? '' : rupiah(r.ledger - r.rule) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 4. The lines Post writes -->
    <section class="pdr__card" data-section="lines" data-tour="payroll-draft-lines">
      <header class="pdr__cardhead">
        <div class="pdr__cardtitle">{{ t('Journal preview') }}</div>
        <div class="pdr__cardsub">{{ run && currentVersionOf(run)?.draft?.memo }}</div>
      </header>
      <table class="pdr__table">
        <thead>
          <tr>
            <th class="pdr__th">{{ t('Account') }}</th>
            <th class="pdr__th">{{ t('Dimensions') }}</th>
            <th class="pdr__th pdr__num">{{ t('Debit') }}</th>
            <th class="pdr__th pdr__num">{{ t('Credit') }}</th>
            <th class="pdr__th" />
          </tr>
        </thead>
        <tbody>
          <template v-for="(l, i) in review.lines" :key="i">
            <tr>
              <td class="pdr__td">{{ accountLabel(l.account) }}<span v-if="l.review" class="pdr__flag">{{ t('Credit on an expense, review') }}</span></td>
              <td class="pdr__td">{{ tagsLabel(l.tags) }}</td>
              <td class="pdr__td pdr__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
              <td class="pdr__td pdr__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
              <td class="pdr__td pdr__whycell"><span class="pdr__link" @click="openWhy = openWhy === i ? null : i">{{ openWhy === i ? t('Hide') : t('Why this line') }}</span></td>
            </tr>
            <tr v-if="openWhy === i && why">
              <td class="pdr__td pdr__why" colspan="5">
                <ul class="pdr__whylist"><li v-for="(w, wi) in why.why" :key="wi">{{ w }}</li></ul>
                <table class="pdr__table pdr__table--inner">
                  <thead>
                    <tr>
                      <th class="pdr__th">{{ t('Source') }}</th>
                      <th class="pdr__th">{{ t('Role') }}</th>
                      <th class="pdr__th pdr__num">{{ t('Staff') }}</th>
                      <th class="pdr__th pdr__num">{{ t('Amount') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, si) in why.sources" :key="si">
                      <td class="pdr__td">{{ s.item }} <span class="pdr__muted">· {{ t(s.section) }}</span>
                        <div v-if="s.employeeIds.length" class="pdr__muted pdr__ids">{{ s.employeeIds.join(', ') }}</div>
                      </td>
                      <td class="pdr__td">{{ s.role ? t(s.role) : '' }}</td>
                      <td class="pdr__td pdr__num">{{ s.employees || '' }}</td>
                      <td class="pdr__td pdr__num">{{ rupiah(s.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
          <tr class="pdr__total">
            <td class="pdr__td pdr__strong" colspan="2">{{ t('Total') }}</td>
            <td class="pdr__td pdr__num pdr__strong">{{ rupiah(totals.debit) }}</td>
            <td class="pdr__td pdr__num pdr__strong">{{ rupiah(totals.credit) }}</td>
            <td class="pdr__td" />
          </tr>
        </tbody>
      </table>
      <div v-if="review.otherEntity?.staff" class="pdr__cardfoot pdr__muted">
        {{ t('Other entity, left out of this journal') }}: {{ review.otherEntity.staff }} {{ t('staff') }}, {{ rupiah(review.otherEntity.amount) }}
      </div>
    </section>
  </div>
  <div v-else-if="review && run && currentVersionOf(run)?.draft?.nothingToPost" class="pdr__card pdr__empty">{{ t('Nothing to post') }}</div>
</template>

<style scoped>
.pdr { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pdr__notice {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pdr__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pdr__empty { padding: var(--mp-spacing-4); color: var(--mp-text-secondary); }
.pdr__cardhead { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pdr__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pdr__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pdr__cardfoot { padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pdr__table { width: 100%; border-collapse: collapse; }
.pdr__table--sub { border-top: 1px solid var(--mp-border-default); }
.pdr__table--inner { margin-top: var(--mp-spacing-2); border: 1px solid var(--mp-border-default); }
.pdr__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.pdr__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.pdr__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pdr__strong { font-weight: var(--mp-font-weights-semi-bold); }
.pdr__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pdr__danger { color: var(--mp-text-danger); }
.pdr__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: var(--mp-spacing-1) 0 0; }
.pdr__flag {
  display: inline-block; margin-left: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  font-size: var(--mp-font-sizes-sm); background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning);
}
.pdr__flag--ok { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.pdr__hclist { margin: var(--mp-spacing-1) 0 0; padding: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pdr__hclist li { overflow-wrap: anywhere; }
.pdr__notecell { min-width: 280px; }
.pdr__noteform { display: flex; gap: var(--mp-spacing-2); align-items: center; }
.pdr__whycell { text-align: right; white-space: nowrap; }
.pdr__link { color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-sm); }
.pdr__link:hover { text-decoration: underline; }
.pdr__why { background: var(--mp-background-neutral-subtle); }
.pdr__whylist { margin: 0; padding-left: var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.pdr__ids { overflow-wrap: anywhere; margin-top: var(--mp-spacing-1); }
.pdr__total .pdr__td { border-bottom: 0; }
</style>
