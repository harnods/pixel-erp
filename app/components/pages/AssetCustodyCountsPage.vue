<script setup lang="ts">
/**
 * Custody and counts.
 *
 * One surface, not two. Custody says who holds each asset; a count session
 * verifies that the register matches reality. They were separate screens in an
 * earlier draft and each was half empty — and the two questions are asked in
 * the same breath anyway.
 *
 * The rule the screen enforces: a session cannot close while a variance is
 * unresolved. A count that ends in a list of discrepancies has not finished, and
 * marking it complete would put false audit evidence on the record — worse than
 * not counting at all.
 */
import { computed } from 'vue'
import { MpButton, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import { countRows, countSession, custodyRows, varianceRows, type CountTone } from '~/data/fixedAssetScreens'

const { t } = useLocale()

const open = computed(() => varianceRows.filter((v) => v.status === 'Open'))
const resolved = computed(() => varianceRows.filter((v) => v.status !== 'Open'))
const canClose = computed(() => open.value.length === 0)

const toneClass: Record<CountTone, string> = {
  ok: 'cc__res--ok',
  warn: 'cc__res--warn',
  bad: 'cc__res--bad',
  muted: 'cc__res--muted',
}

/**
 * Closing is always clickable (rule/btn-no-disabled-validation) — a disabled
 * button tells the user they cannot proceed without telling them why. Validate
 * on click and name what is in the way.
 */
function closeSession() {
  if (!canClose.value) {
    infoToast(
      t(`${open.value.length} ${open.value.length === 1 ? 'variance is' : 'variances are'} still open. Resolve each one before closing the session.`),
    )
    return
  }
  infoToast(t('Closing the session is not part of this screen yet.'))
}
</script>

<template>
  <div class="cc">
    <header class="cc__head">
      <p class="cc__sub">{{ countSession }}</p>
      <div class="cc__actions">
        <MpButton variant="secondary" is-rounded @click="infoToast(t('Starting a session is not part of this screen yet.'))">
          {{ t('New count session') }}
        </MpButton>
        <!-- Disabled rather than hidden: the reader should see that closing is
             possible and understand why it is not available yet. -->
        <MpButton is-rounded @click="closeSession">{{ t('Close session') }}</MpButton>
      </div>
    </header>

    <MpBanner v-if="!canClose" id="cc__note-banner" variant="warning" class="cc__note">
      <MpBannerIcon id="b-icon" />
      <MpBannerTitle>
        {{ open.length }} {{ t(open.length === 1 ? 'variance is unresolved' : 'variances are unresolved') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ t('The session cannot close until each one resolves into something the ledger understands: a location change, a capitalisation, a write-off or a partial disposal. A session closed with findings outstanding would record a verification that did not happen.') }}
      </MpBannerDescription>
    </MpBanner>

    <div class="cc__grid">
      <div class="cc__card">
        <div class="cc__cardhead">
          <span class="cc__cardtitle">{{ t('Count results') }}</span>
          <span class="cc__hint">{{ countRows.length }} {{ t('assets in the frozen population') }}</span>
        </div>
        <table class="cc__table">
          <thead>
            <tr>
              <th class="cc__th">{{ t('Tag') }}</th>
              <th class="cc__th">{{ t('Asset') }}</th>
              <th class="cc__th">{{ t('Expected at') }}</th>
              <th class="cc__th">{{ t('Result') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in countRows" :key="i" class="cc__tr">
              <td class="cc__td cc__td--mono">
                <!-- An untagged asset found on the floor has no tag by
                     definition. The dash is the display, not the data. -->
                <span v-if="r.tag">{{ r.tag }}</span>
                <span v-else class="cc__muted">{{ t('Untagged') }}</span>
              </td>
              <td class="cc__td">{{ r.asset }}</td>
              <td class="cc__td">{{ r.location }}</td>
              <td class="cc__td">
                <span class="cc__res" :class="toneClass[r.tone]">{{ r.result }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="cc__card">
        <div class="cc__cardhead">
          <span class="cc__cardtitle">{{ t('Custody') }}</span>
          <span class="cc__hint">{{ t('Who holds what') }}</span>
        </div>
        <table class="cc__table">
          <thead>
            <tr>
              <th class="cc__th">{{ t('Custodian') }}</th>
              <th class="cc__th">{{ t('Department') }}</th>
              <th class="cc__th cc__th--num">{{ t('Assets') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in custodyRows" :key="i" class="cc__tr">
              <td class="cc__td">
                {{ r.custodian }}
                <span class="cc__where">{{ r.location }}</span>
              </td>
              <td class="cc__td">
                {{ r.department }}
                <span class="cc__where">{{ r.branch }}</span>
              </td>
              <td class="cc__td cc__td--num">{{ r.assets }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="cc__card">
      <div class="cc__cardhead">
        <span class="cc__cardtitle">{{ t('Variance resolution') }}</span>
        <span class="cc__hint">
          {{ open.length }} {{ t('open') }} · {{ resolved.length }} {{ t('resolved') }}
        </span>
      </div>
      <table class="cc__table">
        <thead>
          <tr>
            <th class="cc__th">{{ t('Asset') }}</th>
            <th class="cc__th">{{ t('Finding') }}</th>
            <th class="cc__th">{{ t('What happened') }}</th>
            <th class="cc__th">{{ t('Resolves as') }}</th>
            <th class="cc__th">{{ t('Status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in varianceRows" :key="String(v.id)" class="cc__tr">
            <td class="cc__td">{{ v.asset }}</td>
            <td class="cc__td">{{ v.kind }}</td>
            <td class="cc__td cc__td--wrap">{{ v.explanation }}</td>
            <td class="cc__td">{{ v.action }}</td>
            <td class="cc__td">
              <span class="cc__res" :class="v.status === 'Open' ? 'cc__res--warn' : 'cc__res--ok'">{{ v.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>

.cc__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.cc__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.cc__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }
.cc__actions { display: flex; gap: var(--mp-spacing-2); flex: none; }
.cc__note { margin-bottom: var(--mp-spacing-4); }

.cc__grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
@media (max-width: 1100px) { .cc__grid { grid-template-columns: 1fr; } }

.cc__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.cc__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cc__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cc__table { width: 100%; border-collapse: collapse; }
.cc__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cc__th--num { text-align: right; }
.cc__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.cc__td--num { text-align: right; font-variant-numeric: tabular-nums; }
/* A tag is one token. Wrapping it across lines makes it unreadable and
   misaligns every row it appears in. */
.cc__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-default); white-space: nowrap; }
.cc__td--wrap { max-width: 320px; }
.cc__muted { color: var(--mp-text-subtle); }
.cc__where { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }

.cc__res { display: inline-block; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); white-space: nowrap; }
.cc__res--ok { background: var(--mp-background-success-subtle); color: var(--mp-text-success); }
.cc__res--warn { background: var(--mp-background-warning-subtle); color: var(--mp-text-warning); }
.cc__res--bad { background: var(--mp-background-critical-subtle); color: var(--mp-text-critical); }
.cc__res--muted { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
</style>
