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
 * Chrome follows CreateTaxDocumentDrawer.vue (600px floating drawer, header /
 * scrolling body / pinned footer); see that file for why size="full" is required
 * alongside the width override.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpText,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
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
  <MpDrawer
    id="tax-impact-review-drawer"
    :is-open="isOpen"
    placement="right"
    size="full"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="tir-card">
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
            <section v-if="sourceDocument" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('Approved tax document') }}</MpText>
              <div class="tir-row">
                <span class="tir-row-label">{{ t('Number') }}</span>
                <span class="tir-row-value">{{ formatTaxDocumentNumber(sourceDocument) }}</span>
              </div>
              <div class="tir-row">
                <span class="tir-row-label">{{ t('Type') }}</span>
                <span class="tir-row-value">{{ t(formatTaxDocumentKind(sourceDocument)) }}</span>
              </div>
              <div class="tir-row">
                <span class="tir-row-label">{{ t('Tax document date') }}</span>
                <span class="tir-row-value">{{ sourceDocument.date }}</span>
              </div>
            </section>

            <!-- ── Sales return: what the return obliges, in place of a diff ── -->
            <section v-if="isReturn" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('What you need to do') }}</MpText>
              <ol class="tir-steps">
                <li v-for="step in RETURN_NOTE_FOLLOW_UPS" :key="step" class="tir-reason">{{ t(step) }}</li>
              </ol>
            </section>

            <!-- ── Why (only when an action is actually required) ── -->
            <section v-if="deciding.length" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">
                {{ action === 'cancellation' ? t('Why cancellation is required') : t('Why a replacement is required') }}
              </MpText>
              <ul class="tir-reasons">
                <li v-for="c in deciding" :key="c.key" class="tir-reason">
                  <strong>{{ t(c.label) }}</strong> — {{ t(c.reason) }}
                </li>
              </ul>
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
                </colgroup>
                <thead>
                  <tr>
                    <th class="tir-th">{{ t('Field') }}</th>
                    <th class="tir-th">{{ t('Before') }}</th>
                    <th class="tir-th">{{ t('After') }}</th>
                    <th class="tir-th">{{ t('Tax impact') }}</th>
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
                  </tr>
                </tbody>
              </table>
            </section>

            <!-- ── What confirming will create ── -->
            <section v-if="generatedDrafts.length" class="tir-section">
              <MpText size="h3" weight="semiBold" class="tir-section-title">{{ t('Will be generated') }}</MpText>
              <ul class="tir-generated">
                <li v-for="d in generatedDrafts" :key="d" class="tir-generated-item">{{ t(d) }}</li>
              </ul>
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
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Same floating-drawer chrome as CreateTaxDocumentDrawer.vue — including the
   size="full" requirement explained there (a fixed size preset's stale width
   lookup fights this override and freezes the open animation). Kept at 600px
   like every other drawer in the app; the four-column change table fits by
   wrapping its before/after values rather than by widening the panel. */
.tir-card { display: flex; flex-direction: column; height: 100%; }
:deep([data-pixel-component="MpDrawerContent"]) {
  width: var(--mp-spacing-150, 600px) !important;
  max-width: 600px !important;
}
.tir-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
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
.tir-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
}
.tir-row-label { flex: 0 0 240px; color: var(--mp-text-secondary); }
.tir-row-value { flex: 1; text-align: right; color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }

.tir-reasons { margin: 0; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* Ordered, and the numbers matter — these are sequential steps, not a bag of
   reasons. So no flex column here: `display: flex` on a list drops its markers,
   which is why .tir-reasons above renders unbulleted. */
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

.tir-generated { margin: 0; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.tir-generated-item { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.tir-note {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.tir-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4) 0;
  border-top: 1px solid var(--mp-border-default);
  margin-top: auto;
  padding-bottom: var(--mp-spacing-3);
}
</style>
