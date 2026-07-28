<script setup lang="ts">
import { MpToggle } from '@mekari/pixel3'

// ─── Advanced settings toggles ────────────────────────────────────────────────

const advanced = reactive({
  transactionApproval:       true,
  multipleWithholdingTax:    true,
  companyPerformanceSummary: true,
  taxInclusive:              true,
  transactionLog:            true,
  multiCurrency:             true,
})
</script>

<template>
  <div class="cp-page">

    <!-- ── Company info ──────────────────────────────────────────────────────── -->
    <section class="cp-section">
      <h2 class="cp-section-title">Company info</h2>
      <p class="cp-section-desc">Synced from your Mekari account and used for invoices.</p>

      <div class="cp-grid">
        <div class="cp-field">
          <span class="cp-label">Company name</span>
          <span class="cp-value">PT Central Perk Indonesia</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Company address</span>
          <span class="cp-value">
            MidPlaza 2 Lantai 4<br>
            Jl. Jenderal Sudirman No.Kav. 10-11, Kec. Tanah Abang,<br>
            Jakarta Pusat, DKI Jakarta 10220
          </span>
        </div>

        <div class="cp-field">
          <span class="cp-label">Email</span>
          <span class="cp-value">rizal.candra@centralperk.co.id</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Phone</span>
          <span class="cp-value">+628129209988</span>
        </div>

        <div class="cp-field">
          <span class="cp-label">Account owner</span>
          <span class="cp-value">
            Rizal Candra<br>
            <span class="cp-value-subtle">rizal.candra@centralperk.co.id</span>
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Company ID</span>
          <span class="cp-value">676424</span>
        </div>
      </div>

      <!-- Company logo -->
      <div class="cp-field cp-field--logo">
        <span class="cp-label">Company logo</span>
        <div class="cp-logo">
          <span class="cp-logo-name">Central Perk</span>
        </div>
      </div>

      <!-- Shipping / Fax / Website — part of Company info -->
      <div class="cp-grid cp-grid--spaced">
        <div class="cp-field">
          <span class="cp-label">Shipping address</span>
          <span class="cp-value">
            MidPlaza 2 Lantai 4<br>
            Jl. Jenderal Sudirman No.Kav. 10-11, Kec. Tanah Abang,<br>
            Jakarta Pusat, DKI Jakarta 10220
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Fax</span>
          <span class="cp-value">+62215559999</span>
        </div>

        <div class="cp-field">
          <span class="cp-label">Website</span>
          <a href="https://centralperk.co.id" class="cp-link" target="_blank" rel="noopener">
            https://centralperk.co.id
          </a>
        </div>
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Tax info ───────────────────────────────────────────────────────────── -->
    <section class="cp-section">
      <h2 class="cp-section-title">Tax info</h2>
      <p class="cp-section-desc">This information appears on invoices and tax documents.</p>

      <!-- Tax identity -->
      <div class="cp-subhead">
        <span class="cp-subhead-title">Tax identity</span>
        <span class="cp-status cp-status--ok">Validated</span>
      </div>
      <p class="cp-subhead-desc">NPWP details</p>

      <div class="cp-grid">
        <div class="cp-field">
          <span class="cp-label">
            NPWP
            <span class="cp-status cp-status--muted">Not validated</span>
          </span>
          <span class="cp-value">00098765432102222</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">NITKU</span>
          <span class="cp-value">000022</span>
        </div>
      </div>

      <!-- Coretax info -->
      <div class="cp-subhead cp-subhead--spaced">
        <span class="cp-subhead-title">Coretax info</span>
      </div>
      <p class="cp-subhead-desc">Enter Coretax information to validate your e-faktur.</p>

      <div class="cp-grid">
        <div class="cp-field">
          <span class="cp-label">
            NPWP signee
            <span class="cp-status cp-status--ok">Validated</span>
          </span>
          <span class="cp-value">
            00098765432100000<br>
            <span class="cp-value-subtle">R****l C****ra</span>
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">
            NPWP signee
            <span class="cp-status cp-status--ok">Validated</span>
          </span>
          <span class="cp-value">
            00098765432100000<br>
            <span class="cp-value-subtle">B**u F*****n</span>
          </span>
        </div>
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Payment info ───────────────────────────────────────────────────────── -->
    <section class="cp-section">
      <h2 class="cp-section-title">Payment info</h2>
      <p class="cp-section-desc">Bank details appear on sales invoices.</p>

      <div class="cp-grid">
        <div class="cp-field">
          <span class="cp-label">Bank name</span>
          <span class="cp-value">Bank BCA</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Branch</span>
          <span class="cp-value">BCA KCU Sudirman</span>
        </div>

        <div class="cp-field">
          <span class="cp-label">Branch address</span>
          <span class="cp-value">Chase Plaza, DKI Jakarta</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">Account no.</span>
          <span class="cp-value">78806350373</span>
        </div>

        <div class="cp-field">
          <span class="cp-label">Account name</span>
          <span class="cp-value">PT Central Perk Indonesia</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">SWIFT code</span>
          <span class="cp-value">—</span>
        </div>
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Advanced settings ──────────────────────────────────────────────────── -->
    <section class="cp-section">
      <h2 class="cp-section-title">Advanced settings</h2>
      <p class="cp-section-desc">System-wide settings for transactions, approvals, and currencies.</p>

      <div class="cp-toggles">

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Transaction approval</span>
            <span class="cp-toggle-desc">Transactions require approval before they are processed.</span>
          </div>
          <MpToggle v-model="advanced.transactionApproval" />
        </div>

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Multiple withholding tax</span>
            <span class="cp-toggle-desc">Multiple withholding tax lines can be added per transaction.</span>
          </div>
          <MpToggle v-model="advanced.multipleWithholdingTax" />
        </div>

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Company performance summary</span>
            <span class="cp-toggle-desc">A weekly performance summary will be sent to your email.</span>
          </div>
          <MpToggle v-model="advanced.companyPerformanceSummary" />
        </div>

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Tax inclusive</span>
            <span class="cp-toggle-desc">Include tax (PPN) in transaction prices by default.</span>
          </div>
          <MpToggle v-model="advanced.taxInclusive" />
        </div>

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Transaction log</span>
            <span class="cp-toggle-desc">A detailed audit trail is recorded for user activities.</span>
          </div>
          <MpToggle v-model="advanced.transactionLog" />
        </div>

        <div class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">Multi-currency</span>
            <span class="cp-toggle-desc">Transactions can be made in foreign currencies.</span>
          </div>
          <MpToggle v-model="advanced.multiCurrency" />
        </div>

      </div>

      <!-- Currency display info -->
      <div class="cp-currency-info">
        <span class="cp-value">Base currency: Indonesian Rupiah (Rp)</span>
        <span class="cp-value">Amount display: Full number (with decimals), e.g. Rp2.000.000,00</span>
      </div>
    </section>

  </div>
</template>

<style scoped>
/* ─── Page root ───────────────────────────────────────────────────────────── */

.cp-page {
  /* No inner scroll — the surrounding .stage owns the scroll (page/browser). */
  max-width: 720px;   /* custom — readable line length for a detail page */
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

.cp-section {
  padding: var(--mp-spacing-6) 0;
}

.cp-section:first-child {
  padding-top: 0;
}

.cp-section-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cp-section-desc {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

.cp-divider {
  height: 1px;  /* custom */
  background: var(--mp-border-default);
}

/* ─── Sub-headings within a section (Tax identity / Coretax info) ──────────── */

.cp-subhead {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.cp-subhead--spaced {
  margin-top: var(--mp-spacing-6);
}
.cp-subhead-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cp-subhead-desc {
  margin: var(--mp-spacing-0\.5) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

/* Inline validation status text (green = validated, gray = not validated) */
.cp-status {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-normal);
}
.cp-status--ok { color: var(--mp-text-success); }
.cp-status--muted { color: var(--mp-text-subtle); }

/* ─── Info grid ───────────────────────────────────────────────────────────── */

.cp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mp-spacing-5) var(--mp-spacing-8);
}

.cp-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.cp-field--logo {
  margin-top: var(--mp-spacing-5);
}

.cp-grid--spaced {
  margin-top: var(--mp-spacing-5);
}

.cp-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.cp-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}

.cp-value-subtle {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.cp-link {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  text-decoration: none;
}
.cp-link:hover { text-decoration: underline; }

/* ─── Company logo ────────────────────────────────────────────────────────── */

.cp-logo {
  display: inline-flex;
  align-items: center;
}

.cp-logo-name {
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-bold);
  letter-spacing: -0.01em;
  color: var(--mp-text-default);
}

/* ─── Advanced settings toggles ───────────────────────────────────────────── */

.cp-toggles {
  display: flex;
  flex-direction: column;
}

.cp-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) 0;
  border-bottom: 1px solid var(--mp-border-default);
}

.cp-toggle-row:first-child {
  border-top: 1px solid var(--mp-border-default);
}

.cp-toggle-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
}

.cp-toggle-title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.cp-toggle-desc {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

/* ─── Currency info (below toggles) ──────────────────────────────────────── */

.cp-currency-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  margin-top: var(--mp-spacing-4);
  color: var(--mp-text-subtle);
}

.cp-currency-info .cp-value {
  color: var(--mp-text-subtle);
  font-size: var(--mp-font-sizes-sm);
}
</style>
