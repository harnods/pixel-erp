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
      <p class="st__sub">
        {{ t('The class master sets an asset up correctly at creation. Every field here has a statutory consequence.') }}
      </p>
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Editing settings is not part of this screen yet.'))">
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
          <span class="st__box" :class="{ 'st__box--on': item.isOn }">
            <MpIcon v-if="item.isOn" name="check" size="xs" />
          </span>
          <div>
            <div class="st__togglek">{{ item.label }}</div>
            <div class="st__togglev">{{ item.detail }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.st__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.st__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.st__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.st__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.st__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.st__table { width: 100%; border-collapse: collapse; }
.st__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__td--strong { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.st__td--num { font-variant-numeric: tabular-nums; }
.st__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }

.st__toggles { display: flex; flex-direction: column; }
.st__toggle { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.st__toggle:last-child { border-bottom: 0; }
.st__box { width: var(--mp-sizes-4); height: var(--mp-sizes-4); border-radius: var(--mp-radii-sm); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); flex: none; margin-top: var(--mp-spacing-1); display: inline-flex; align-items: center; justify-content: center; color: var(--mp-background-neutral); }
.st__box--on { background: var(--mp-background-success-bold); border-color: var(--mp-background-success-bold); }
.st__togglek { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.st__togglev { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
