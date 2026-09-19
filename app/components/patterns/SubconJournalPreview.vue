<script setup lang="ts">
/**
 * SubconJournalPreview — the journal entries a subcon work order has produced.
 *
 * Read-only, and deliberately laid out the way an accountant reads a journal
 * rather than the way a table renders: debit lines flush left, credit lines
 * indented beneath them, separate Debit and Credit columns, and a total per entry
 * so each one can be seen to balance on its own.
 *
 * Rendered INLINE on the work order rather than behind `JournalEntryDrawer`,
 * which uses `MpModal` — that component has no working CSS in this Pixel build
 * (measured: stays `position: static`, `opacity: 0` seconds after opening; see
 * the amended rule/modal-use-mpmodal in docs/design/RULES.md). Inline also suits
 * it better: this is reference material to read alongside the order, not a
 * blocking decision.
 */
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import type { SubconJournalEntry } from '~/data/subconAccounting'

const props = defineProps<{ entries: SubconJournalEntry[] }>()

const { t } = useLocale()

/** Debits first, then credits — the order a journal is written in. */
const ordered = computed(() =>
  props.entries.map(e => ({
    ...e,
    sorted: [...e.lines].sort((a, b) => (b.debit ?? 0) - (a.debit ?? 0)),
    totalDebit: e.lines.reduce((s, l) => s + (l.debit ?? 0), 0),
    totalCredit: e.lines.reduce((s, l) => s + (l.credit ?? 0), 0),
  })),
)
</script>

<template>
  <div v-if="ordered.length" class="sjp">
    <article v-for="entry in ordered" :key="entry.id" class="sjp-entry">
      <header class="sjp-entry__head">
        <span class="sjp-entry__desc">{{ entry.description }}</span>
        <span class="sjp-entry__meta">
          {{ entry.date ? formatDate(entry.date) : '—' }}
          <template v-if="entry.documentNumber"> · {{ entry.documentNumber }}</template>
        </span>
      </header>

      <table class="sjp-table">
        <thead>
          <tr>
            <th class="sjp-th">{{ t('Account') }}</th>
            <th class="sjp-th sjp-th--num">{{ t('Debit') }}</th>
            <th class="sjp-th sjp-th--num">{{ t('Credit') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in entry.sorted" :key="`${entry.id}-${i}`" class="sjp-tr">
            <!-- Credit lines are indented under the debits they answer. -->
            <td class="sjp-td" :class="{ 'sjp-td--credit': line.credit != null }">{{ line.account }}</td>
            <td class="sjp-td sjp-td--num">{{ line.debit != null ? formatIDR(line.debit) : '' }}</td>
            <td class="sjp-td sjp-td--num">{{ line.credit != null ? formatIDR(line.credit) : '' }}</td>
          </tr>
          <tr class="sjp-tr sjp-tr--total">
            <td class="sjp-td">{{ t('Total') }}</td>
            <td class="sjp-td sjp-td--num">{{ formatIDR(entry.totalDebit) }}</td>
            <td class="sjp-td sjp-td--num">{{ formatIDR(entry.totalCredit) }}</td>
          </tr>
        </tbody>
      </table>
    </article>
  </div>

  <p v-else class="sjp-empty">
    {{ t('No journal entries yet — they appear as materials are issued, the vendor invoices, and goods come back.') }}
  </p>
</template>

<style scoped>
.sjp { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

.sjp-entry__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-2);
}
.sjp-entry__desc {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sjp-entry__meta {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}

.sjp-table { width: 100%; border-collapse: collapse; }
.sjp-th {
  text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.sjp-th--num { text-align: right; }

.sjp-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.sjp-td--num { text-align: right; font-variant-numeric: tabular-nums; }
/* The indent is what tells a credit from a debit at a glance. */
.sjp-td--credit { padding-left: var(--mp-spacing-8, 32px); }

.sjp-tr--total .sjp-td {
  font-weight: var(--mp-font-weights-semi-bold);
  border-bottom: none;
  border-top: 1px solid var(--mp-border-bold, var(--mp-border-default));
}

.sjp-empty {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
