<script setup lang="ts">
/**
 * Asset settings — the class master and the behaviour switches.
 *
 * The class master is why an asset arrives classified instead of needing to be
 * fixed later. Choosing a class sets the statutory group, both lives, the
 * method and the accounts, so the register's one unclassified asset is an
 * exception rather than the normal state.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import { classMaster, settingToggles } from '~/data/fixedAssetScreens'

const { t } = useLocale()
</script>

<template>
  <div class="st">
    <header class="st__head">
      <div>
        <h2 class="st__title">{{ t('Asset settings') }}</h2>
        <p class="st__sub">
          {{ t('The class master sets an asset up correctly at creation. Every field here has a statutory consequence.') }}
        </p>
      </div>
      <MpButton variant="secondary" @click="infoToast(t('Editing settings is not part of this screen yet.'))">
        {{ t('Edit') }}
      </MpButton>
    </header>

    <div class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ t('Asset classes') }}</span>
        <span class="st__hint">{{ t('Selecting a class fills the rest') }}</span>
      </div>
      <table class="st__table">
        <thead>
          <tr>
            <th class="st__th">{{ t('Class') }}</th>
            <th class="st__th">{{ t('Statutory group') }}</th>
            <th class="st__th">{{ t('Fiscal life') }}</th>
            <th class="st__th">{{ t('Commercial life') }}</th>
            <th class="st__th">{{ t('Method') }}</th>
            <th class="st__th">{{ t('Accounts') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in classMaster" :key="i" class="st__tr">
            <td class="st__td st__td--strong">{{ c.class }}</td>
            <td class="st__td">{{ c.defaultTaxGroup }}</td>
            <!-- The two lives sit beside each other because their disagreement
                 is the reason the module holds two books at all. -->
            <td class="st__td st__td--num">{{ c.fiscalLife }}</td>
            <td class="st__td st__td--num">{{ c.commercialLife }}</td>
            <td class="st__td">{{ c.method }}</td>
            <td class="st__td st__td--mono">{{ c.accounts }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-for="(g, gi) in settingToggles" :key="gi" class="st__card">
      <div class="st__cardhead">
        <span class="st__cardtitle">{{ g.head }}</span>
      </div>
      <div class="st__toggles">
        <div v-for="(item, ii) in g.items" :key="ii" class="st__toggle">
          <!-- On or off is carried by the design's own box styling; a filled box
               is on. Reading it from the style string keeps this screen faithful
               without inventing a state the design did not specify. -->
          <span class="st__box" :class="{ 'st__box--on': String(item.box).includes('#029861') }">
            <MpIcon v-if="String(item.box).includes('#029861')" name="check" size="xs" />
          </span>
          <div>
            <div class="st__togglek">{{ item.k }}</div>
            <div class="st__togglev">{{ item.v }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st { padding: 4px 0 32px; }
.st__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.st__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.st__sub { font-size: 13px; color: #758195; margin: 4px 0 0; max-width: 640px; }

.st__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; overflow: hidden; margin-bottom: 16px; }
.st__cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #eef1f4; }
.st__cardtitle { font-size: 14px; font-weight: 600; color: #1e2e2b; }
.st__hint { font-size: 12px; color: #758195; }

.st__table { width: 100%; border-collapse: collapse; }
.st__th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; background: #f8fafb; padding: 8px 16px; border-bottom: 1px solid #eef1f4; }
.st__td { font-size: 13px; color: #232933; padding: 10px 16px; border-bottom: 1px solid #f4f6f8; }
.st__td--strong { font-weight: 600; color: #1e2e2b; }
.st__td--num { font-variant-numeric: tabular-nums; }
.st__td--mono { font-variant-numeric: tabular-nums; color: #758195; }

.st__toggles { display: flex; flex-direction: column; }
.st__toggle { display: flex; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #f4f6f8; }
.st__toggle:last-child { border-bottom: 0; }
.st__box { width: 16px; height: 16px; border-radius: 4px; border: 1px solid #8c9596; background: #fff; flex: none; margin-top: 2px; display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.st__box--on { background: #029861; border-color: #029861; }
.st__togglek { font-size: 13px; color: #232933; }
.st__togglev { font-size: 12px; color: #758195; margin-top: 2px; }
</style>
