<script setup lang="ts">
/**
 * "Review tax impact" drawer — shown before anything is written to a Sales Invoice
 * that carries a DJP-approved Output Tax Document (PRD-05 US-001 ▸ AC-001..AC-004).
 *
 * It answers one question: what does this oblige you to do about the faktur you
 * already issued? The verdict banner states the required tax action, and the
 * primary button both commits the change and raises whatever DJP needs (AC-005 /
 * AC-006) — so the invoice and its tax document can never drift apart by way of
 * this screen.
 *
 * Two triggers reach it, and they differ in what evidence there is to show:
 *
 *   • 'edit'         — an edited invoice. There is a before/after, so the body is
 *                      a change table classifying every detected difference.
 *   • 'sales-return' — a sales return. Nothing was edited, so there is nothing to
 *                      diff; the body is the follow-up the return obliges instead.
 *
 * Chrome follows CreateTaxDocumentDrawer.vue (920px floating drawer, header /
 * scrolling body / pinned footer); see that file for why size="full" is required
 * alongside the width override.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpText, MpIcon,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import {
  TAX_ACTION_CONFIG, decidingChanges, RETURN_NOTE_FOLLOW_UPS,
  type DetectedTaxChange, type TaxAction,
} from '~/data/taxDocumentChanges'
import {
  formatTaxDocumentNumber, formatTaxDocumentKind, type TaxDocument,
} from '~/data/taxDocuments'

const props = defineProps<{
  isOpen: boolean
  action: TaxAction
  changes: DetectedTaxChange[]
  /** The approved document this edit answers to — null only in the no-document
   *  case, which never opens this drawer. */
  sourceDocument: TaxDocument | null
  /** What opened the drawer; see the header comment. Defaults to an edit. */
  trigger?: 'edit' | 'sales-return'
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useLocale()

const config = computed(() => TAX_ACTION_CONFIG[props.action])

/** A sales return has no before/after, so the change table is replaced by the
 *  follow-up it obliges. */
const isReturn = computed(() => props.trigger === 'sales-return')

/** The changes that decided the verdict — listed first, and called out as the
 *  reason, so the user isn't left matching rows against a banner themselves. */
const deciding = computed(() => decidingChanges(props.changes))
/** Did THIS change set the verdict? Drives the table's Remark column, which
 *  replaced the standalone "Why ... is required" section. */
const decidingKeys = computed(() => new Set(deciding.value.map(c => c.key)))
function isDeciding(c: DetectedTaxChange): boolean {
  return decidingKeys.value.has(c.key)
}

/** What confirming will produce, spelled out rather than implied. */
const generatedDrafts = computed<string[]>(() => {
  if (props.action === 'replacement') return ['Replacement tax document (draft)']
  if (props.action === 'cancellation') return ['Cancellation tax document (draft)', 'New output tax document (draft)']
  if (props.action === 'return-note') return ['Return note (awaiting from buyer)']
  return []
})

/** Why the generated records aren't with DJP yet — different promise per trigger:
 *  an edit's drafts are ours to submit, a return note is the buyer's to send. */
const generatedNote = computed(() => isReturn.value
  ? 'Nothing is submitted to DJP. The return note is added to the Tax document tab so the invoice shows what is still outstanding.'
  : 'Drafts are not sent to DJP automatically. Review them on the Tax document tab and submit when ready.')

/**
 * Ghost button — "back to editing" only makes sense if you were editing.
 *
 * "Close" rather than "Cancel" on the return path on purpose: Cancel translates
 * to "Batalkan", which in a tax drawer reads as cancelling the faktur pajak —
 * the opposite of walking away without doing anything.
 */
const dismissLabel = computed(() => (isReturn.value ? 'Close' : 'Back to editing'))

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm') }
</script>

<template>
  <Teleport to="body">
    <Transition name="tir">
      <div v-if="isOpen" class="tir-overlay">
        <div class="tir-panel" role="dialog">
          <div class="tir-header">
            <MpText weight="semiBold">{{ t('Review tax impact') }}</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
          </div>

          <div class="tir-body">
            <!-- ── Verdict ── -->
            <MpBanner id="tir-verdict" :variant="config.variant" class="tir-verdict">
              <MpBannerIcon id="tir-verdict-icon" />
              <MpBannerTitle>{{ t(config.title) }}</MpBannerTitle>
              <MpBannerDescription>{{ t(config.description) }}</MpBannerDescription>
            </MpBanner>

            <!-- ── The document this edit answers to ── -->
            <!-- Read as a summary, not as a form: ContentList (label above value)
                 laid out across the panel, the same shape a detail page's header
                 summary uses. The old label-left / value-right-aligned rows
                 stretched a three-field summary across the full width and read
                 as an editable form. -->
            <section v-if="sourceDocument" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('Approved tax document') }}</MpText>
              <div class="tir-summary">
                <ContentList :label="t('Number')" :value="formatTaxDocumentNumber(sourceDocument)" />
                <ContentList :label="t('Type')" :value="t(formatTaxDocumentKind(sourceDocument))" />
                <ContentList :label="t('Tax document date')" :value="sourceDocument.date" />
              </div>
            </section>

            <!-- ── Sales return: what the return obliges, in place of a diff ── -->
            <section v-if="isReturn" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('What you need to do') }}</MpText>
              <ol class="tir-steps">
                <li v-for="step in RETURN_NOTE_FOLLOW_UPS" :key="step" class="tir-reason">{{ t(step) }}</li>
              </ol>
            </section>

            <!-- ── Every detected change (edit only — a return diffs nothing) ── -->
            <section v-if="!isReturn" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">
                {{ t('Detected changes') }} ({{ changes.length }})
              </MpText>

              <p v-if="!changes.length" class="tir-empty">
                {{ t('No changes were detected on this sales invoice.') }}
              </p>

              <table v-else class="tir-table">
                <colgroup>
                  <col class="tir-col-field" />
                  <col />
                  <col />
                  <col class="tir-col-impact" />
                  <col class="tir-col-remark" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="tir-th">{{ t('Field') }}</th>
                    <th class="tir-th">{{ t('Before') }}</th>
                    <th class="tir-th">{{ t('After') }}</th>
                    <th class="tir-th">{{ t('Tax impact') }}</th>
                    <th class="tir-th">{{ t('Remark') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in changes" :key="c.key" class="tir-tr">
                    <td class="tir-td tir-td--field">{{ t(c.label) }}</td>
                    <td class="tir-td tir-td--muted">{{ c.before }}</td>
                    <td class="tir-td">{{ c.after }}</td>
                    <td class="tir-td">
                      <ErpStatusBadge
                        :status="c.action"
                        :label="t(TAX_ACTION_CONFIG[c.action].label)"
                        :type="TAX_ACTION_CONFIG[c.action].badgeType"
                      />
                    </td>
                    <!-- Why this row forced the verdict. Only the deciding rows
                         carry one: a change that didn't set the outcome has no
                         bearing to explain, and repeating a reason against every
                         row would bury the one that actually decided it. -->
                    <td class="tir-td tir-td--muted">
                      {{ isDeciding(c) ? t(c.reason) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <!-- ── What confirming will create ── -->
            <section v-if="generatedDrafts.length" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('Will be generated') }}</MpText>
              <!-- Not a <ul>: the leading document icon IS the marker here, and a
                   list whose bullets are suppressed fights the every-li-shows-a-marker
                   rule instead of complying with it. Flush left — the old 20px
                   bullet indent pushed these out of line with every other section. -->
              <div class="tir-generated">
                <div v-for="d in generatedDrafts" :key="d" class="tir-generated-item">
                  <MpIcon name="doc" size="sm" class="tir-generated-icon" />
                  <span>{{ t(d) }}</span>
                </div>
              </div>
              <p class="tir-note">{{ t(generatedNote) }}</p>
            </section>
          </div>

          <div class="tir-footer">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="close">
              {{ t(dismissLabel) }}
            </button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="confirm">
              {{ t(config.confirmLabel) }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Standard ERP drawer shell (rule/drawer-custom-shell) — copied from
   BillsFiltersDrawer.vue. Pixel's MpDrawer has no structural CSS in this build:
   its header and footer detach and the body renders as a bare floating card,
   which is what these drawers did once they were widened past 600px. The
   overlay carries NO click handler and there is no Esc listener
   (rule/modal-drawer-close-explicit-only). */
.tir-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.tir-panel {
  margin: var(--mp-spacing-3);
  width: min(920px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.tir-enter-active, .tir-leave-active { transition: background-color 250ms ease; }
.tir-enter-from, .tir-leave-to { background-color: transparent; }
.tir-enter-active .tir-panel { transition: transform 350ms ease-out; }
.tir-leave-active .tir-panel { transition: transform 250ms ease-in; }
.tir-enter-from .tir-panel,
.tir-leave-to .tir-panel { transform: translateX(calc(100% + 12px)); }
.tir-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.tir-body {
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.tir-verdict { flex-shrink: 0; }
.tir-section { display: flex; flex-direction: column; }
.tir-section-title { display: block; margin-bottom: var(--mp-spacing-2); }

/* label/value rows — same metrics as TaxDocumentDetailDrawer.vue */
/* Auto-fit so the three fields sit side by side at 920px and reflow to fewer
   columns if the panel is ever narrower, rather than being pinned to 3. */
.tir-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--mp-spacing-2) var(--mp-spacing-6);
}

/* Ordered, and the numbers matter — these are sequential steps, not a bag of
   reasons. So no flex column here: `display: flex` on a list drops its
   markers. */
.tir-steps { margin: 0; padding-left: var(--mp-spacing-5); list-style: decimal; }
.tir-steps > li + li { margin-top: var(--mp-spacing-2); }
.tir-reason {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
}

/* Change table — ErpTablePage header/row metrics (28px header, 40px rows). */
.tir-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.tir-col-field  { width: 120px; }
.tir-col-impact { width: 108px; }
/* Wide enough for a full sentence — this column carries the explanation that
   used to be its own "Why ... is required" section, so it is the widest in the
   table rather than an afterthought. */
.tir-col-remark { width: 280px; }
.tir-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.tir-td {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  /* before/after values are full sentences (a line item reads
     "Arabica — 10 KG × Rp100.000,00") — wrap rather than truncate, so the user
     can actually verify what changed. */
  vertical-align: top;
  overflow-wrap: anywhere;
}
.tir-td--field { font-weight: var(--mp-font-weights-semi-bold); }
.tir-td--muted { color: var(--mp-text-secondary); }
.tir-tr:last-child .tir-td { border-bottom: none; }

.tir-empty {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

.tir-generated { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.tir-generated-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.tir-generated-icon { flex-shrink: 0; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.tir-note {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.tir-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
