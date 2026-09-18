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
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Adding a lease is not part of this screen yet.'))">
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

.ls__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ls__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.ls__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.ls__totals {
  display: flex; gap: var(--mp-spacing-8); flex-wrap: wrap;
  padding: var(--mp-spacing-4) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral);
}
.ls__totallabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ls__totalvalue { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.ls__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ls__table { width: 100%; border-collapse: collapse; }
.ls__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ls__th--num { text-align: right; }
.ls__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ls__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ls__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.ls__name { display: block; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ls__id { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
