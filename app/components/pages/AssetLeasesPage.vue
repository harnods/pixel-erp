<script setup lang="ts">
/**
 * Leases and right-of-use assets.
 *
 * A lease produces a right-of-use asset that sits in the ordinary register and
 * depreciates through the ordinary engine. The alternative — a parallel lease
 * register that posts into accounting — is the two-register problem given a
 * different name.
 *
 * PSAK 73 applies where a lease is neither short-term nor low-value. Those
 * exemptions are why leases are conditionally rather than universally statutory,
 * and why their tier placement differs from the fiscal book.
 */
import { computed } from 'vue'
import { MpButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { leaseRows } from '~/data/fixedAssetScreens'

const { t } = useLocale()

const totals = computed(() => ({
  liability: leaseRows.reduce((s, l) => s + Number(l.liability ?? 0), 0),
  rou: leaseRows.reduce((s, l) => s + Number(l.rouBookValue ?? 0), 0),
}))
</script>

<template>
  <div class="ls">
    <header class="ls__head">
      <p class="ls__sub">
        {{ t('PSAK 73 · each lease creates a right-of-use asset in the register, depreciating through the normal engine') }}
      </p>
      <MpButton variant="secondary" @click="infoToast(t('Adding a lease is not part of this screen yet.'))">
        {{ t('New lease') }}
      </MpButton>
    </header>

    <div class="ls__totals">
      <div class="ls__total">
        <div class="ls__totallabel">{{ t('Leases') }}</div>
        <div class="ls__totalvalue">{{ leaseRows.length }}</div>
      </div>
      <div class="ls__total">
        <div class="ls__totallabel">{{ t('Lease liability') }}</div>
        <div class="ls__totalvalue">{{ formatIDR(totals.liability) }}</div>
      </div>
      <div class="ls__total">
        <div class="ls__totallabel">{{ t('Right-of-use book value') }}</div>
        <div class="ls__totalvalue">{{ formatIDR(totals.rou) }}</div>
      </div>
    </div>

    <div class="ls__card">
      <table class="ls__table">
        <thead>
          <tr>
            <th class="ls__th">{{ t('Lease') }}</th>
            <th class="ls__th">{{ t('Term') }}</th>
            <th class="ls__th">{{ t('Right-of-use asset') }}</th>
            <th class="ls__th ls__th--num">{{ t('Liability') }}</th>
            <th class="ls__th ls__th--num">{{ t('ROU book value') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in leaseRows" :key="String(l.id)" class="ls__tr">
            <td class="ls__td">
              <span class="ls__name">{{ l.name }}</span>
              <span class="ls__id">{{ l.id }}</span>
            </td>
            <td class="ls__td">{{ l.term }}</td>
            <!-- The ROU asset is a register asset, not a lease-module concept.
                 Naming it here is what makes that visible. -->
            <td class="ls__td ls__td--mono">{{ l.rouAsset }}</td>
            <td class="ls__td ls__td--num">{{ formatIDR(Number(l.liability)) }}</td>
            <td class="ls__td ls__td--num">{{ formatIDR(Number(l.rouBookValue)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ls { padding: 4px 0 32px; }
.ls__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; min-height: 32px; }
.ls__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.ls__sub { font-size: 13px; color: #758195; margin: 0; max-width: 720px; }

.ls__totals {
  display: flex; gap: 32px; flex-wrap: wrap;
  padding: 14px 16px; margin-bottom: 16px;
  border: 1px solid #e2e7ed; border-radius: 10px; background: #fff;
}
.ls__totallabel { font-size: 12px; color: #758195; }
.ls__totalvalue { font-size: 18px; font-weight: 600; color: #1e2e2b; font-variant-numeric: tabular-nums; }

.ls__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; overflow: hidden; }
.ls__table { width: 100%; border-collapse: collapse; }
.ls__th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; background: #f8fafb; padding: 8px 16px; border-bottom: 1px solid #eef1f4; }
.ls__th--num { text-align: right; }
.ls__td { font-size: 13px; color: #232933; padding: 10px 16px; border-bottom: 1px solid #f4f6f8; }
.ls__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ls__td--mono { font-variant-numeric: tabular-nums; color: #3a4749; }
.ls__name { display: block; font-weight: 600; color: #1e2e2b; }
.ls__id { display: block; font-size: 11px; color: #758195; margin-top: 2px; }
</style>
