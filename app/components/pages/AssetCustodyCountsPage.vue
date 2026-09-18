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

function closeSession() {
  if (!canClose.value) {
    infoToast(t(`${open.value.length} variances are still open. Resolve them before closing.`))
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
        <MpButton variant="secondary" @click="infoToast(t('Starting a session is not part of this screen yet.'))">
          {{ t('New count session') }}
        </MpButton>
        <!-- Disabled rather than hidden: the reader should see that closing is
             possible and understand why it is not available yet. -->
        <MpButton :is-disabled="!canClose" @click="closeSession">{{ t('Close session') }}</MpButton>
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
.cc { padding: 4px 0 32px; }
.cc__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; min-height: 32px; }
.cc__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.cc__sub { font-size: 13px; color: #758195; margin: 0; max-width: 720px; }
.cc__actions { display: flex; gap: 8px; flex: none; }
.cc__note { margin-bottom: 16px; }

.cc__grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 1100px) { .cc__grid { grid-template-columns: 1fr; } }

.cc__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; overflow: hidden; margin-bottom: 16px; }
.cc__cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #eef1f4; }
.cc__cardtitle { font-size: 14px; font-weight: 600; color: #1e2e2b; }
.cc__hint { font-size: 12px; color: #758195; }

.cc__table { width: 100%; border-collapse: collapse; }
.cc__th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; background: #f8fafb; padding: 8px 16px; border-bottom: 1px solid #eef1f4; }
.cc__th--num { text-align: right; }
.cc__td { font-size: 13px; color: #232933; padding: 10px 16px; border-bottom: 1px solid #f4f6f8; vertical-align: top; }
.cc__td--num { text-align: right; font-variant-numeric: tabular-nums; }
/* A tag is one token. Wrapping it across lines makes it unreadable and
   misaligns every row it appears in. */
.cc__td--mono { font-variant-numeric: tabular-nums; color: #3a4749; white-space: nowrap; }
.cc__td--wrap { max-width: 320px; }
.cc__muted { color: #9aa5b1; }
.cc__where { display: block; font-size: 11px; color: #758195; margin-top: 2px; }

.cc__res { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.cc__res--ok { background: #e8f4ef; color: #027a4f; }
.cc__res--warn { background: #fdf9c4; color: #7a5700; }
.cc__res--bad { background: #fceeed; color: #a8352d; }
.cc__res--muted { background: #f4f4f4; color: #3a4749; }
</style>
