<script setup lang="ts">
/**
 * Bring existing assets onto both books (OD-03, OD-29, FG6-AC4).
 *
 * For the assets held at the cut-over (31/12/2025): the commercial opening
 * reconstructed from each asset's journal history, reconciled in total to
 * the opening balances in the ledger; and the fiscal opening computed from
 * the statutory group, set beside the prior tax working paper. The fiscal
 * opening can be edited, because the prior paper is what the tax office has
 * already seen.
 *
 * Activation is refused while any asset differs, and the differing assets
 * are named. Every reconciliation run is kept below as the session's
 * evidence, including the refused ones.
 */
import { computed, ref } from 'vue'
import { MpButton, MpInput, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import {
  migrationRows, setFiscalOpening, reconcileMigration, activateMigration, reconciliations, migrationActivated,
  ledgerOpening, canMigrate, CUTOVER_DATE,
} from '~/data/assetMigration'
import { viewAs } from '~/data/assetStore'

const { t } = useLocale()
const router = useRouter()

const rows = migrationRows
const ob = computed(() => ledgerOpening())
const totals = computed(() => ({
  cost: rows.value.reduce((s, r) => s + r.cost, 0),
  commercial: rows.value.reduce((s, r) => s + r.commercialAccumulated, 0),
  fiscal: rows.value.reduce((s, r) => s + (r.fiscalOpening ?? 0), 0),
  prior: rows.value.reduce((s, r) => s + (r.priorFiscal ?? 0), 0),
}))
const differing = computed(() => rows.value.filter((r) => (r.difference ?? 0) !== 0))
const commercialTies = computed(() => totals.value.cost === ob.value.cost && totals.value.commercial === ob.value.accumulated)

// ── Editing one fiscal opening ──────────────────────────────────────────────
const editing = ref<string | null>(null)
const editValue = ref('')
const editError = ref('')
function startEdit(id: string, current: number | null) {
  if (migrationActivated.value) return
  if (!canMigrate.value) { infoToast(t(`Viewing as ${viewAs.value}. A migration reconciliation needs the Owner or Accounting role.`)); return }
  editing.value = id
  editValue.value = current === null ? '' : String(current)
  editError.value = ''
}
function saveEdit() {
  if (!editing.value) return
  const n = Number(editValue.value.replace(/[^\d-]/g, ''))
  const r = setFiscalOpening(editing.value, Number.isFinite(n) ? n : null)
  if (r) { editError.value = r; return }
  editing.value = null
}
function resetEdit(id: string) {
  setFiscalOpening(id, null)
  editing.value = null
}

const lastResult = ref<string | null>(null)
function reconcile() {
  const ev = reconcileMigration()
  lastResult.value = null
  if (ev.result === 'reconciled') successToast(t(`${ev.number}: reconciled. Every asset agrees with the prior system`))
  else infoToast(t(`${ev.number}: ${ev.differing.length} ${ev.differing.length === 1 ? 'asset differs' : 'assets differ'}`))
}
function activate() {
  const r = activateMigration()
  if (!r.ok) { lastResult.value = r.reason; return }
  lastResult.value = null
  successToast(t(`Activated on the evidence of ${r.evidence.number}. Both books open from ${CUTOVER_DATE}`))
}
</script>

<template>
  <div class="mg">
    <header class="mg__head">
      <p class="mg__sub">
        {{ t(`Bring existing assets onto both books · cut-over ${CUTOVER_DATE} · ${rows.length} assets held at the cut-over`) }}
      </p>
      <div class="mg__actions">
        <MpButton variant="secondary" is-rounded :is-disabled="!!migrationActivated" @click="reconcile">{{ t('Reconcile') }}</MpButton>
        <MpButton is-rounded :is-disabled="!!migrationActivated || !canMigrate" @click="activate">{{ t('Activate') }}</MpButton>
      </div>
    </header>

    <MpBanner v-if="migrationActivated" id="mg-done" variant="success" class="mg__note">
      <MpBannerIcon id="mg-ok" />
      <MpBannerTitle>{{ t('Activated') }} {{ migrationActivated.at }} · {{ migrationActivated.by }}</MpBannerTitle>
      <MpBannerDescription>
        {{ t(`On the evidence of ${migrationActivated.evidence}. `) }}
        <template v-if="migrationActivated.openingsSet.length">
          {{ t(`Agreed fiscal openings carried onto the tax book for ${migrationActivated.openingsSet.join(', ')}; it charges the remaining life from there.`) }}
        </template>
        <span class="mg__link" @click="router.push('/asset-roll-forward')">{{ t('See the roll-forward') }}</span>
      </MpBannerDescription>
    </MpBanner>
    <MpBanner v-else-if="lastResult" id="mg-refused" variant="danger" class="mg__note">
      <MpBannerIcon id="mg-bad" />
      <MpBannerTitle>{{ t(lastResult) }}</MpBannerTitle>
      <MpBannerDescription>
        {{ t('Agree each one with the prior working paper: edit the fiscal opening to the figure the tax office has, or leave it and correct the prior paper. The refusal is kept as evidence below.') }}
      </MpBannerDescription>
    </MpBanner>

    <!-- The commercial side: register against the ledger's opening balances. -->
    <div class="mg__tiles">
      <div class="mg__tile" :class="commercialTies ? 'mg__tile--ok' : 'mg__tile--bad'">
        <span class="mg__tilek">{{ t('Commercial opening · cost') }}</span>
        <span class="mg__tilev">{{ formatIDRWhole(totals.cost) }}</span>
        <span class="mg__tilesub">{{ t('Ledger 1-1600 at the cut-over') }} {{ formatIDRWhole(ob.cost) }}</span>
      </div>
      <div class="mg__tile" :class="commercialTies ? 'mg__tile--ok' : 'mg__tile--bad'">
        <span class="mg__tilek">{{ t('Commercial opening · accumulated') }}</span>
        <span class="mg__tilev">{{ formatIDRWhole(totals.commercial) }}</span>
        <span class="mg__tilesub">{{ t('Ledger 1-1700 at the cut-over') }} {{ formatIDRWhole(ob.accumulated) }}</span>
      </div>
      <div class="mg__tile" :class="differing.length ? 'mg__tile--bad' : 'mg__tile--ok'">
        <span class="mg__tilek">{{ t('Fiscal opening · accumulated') }}</span>
        <span class="mg__tilev">{{ formatIDRWhole(totals.fiscal) }}</span>
        <span class="mg__tilesub">{{ t('Prior tax working paper') }} {{ formatIDRWhole(totals.prior) }}</span>
      </div>
      <div class="mg__tile" :class="differing.length ? 'mg__tile--bad' : 'mg__tile--ok'">
        <span class="mg__tilek">{{ t('Assets that differ') }}</span>
        <span class="mg__tilev">{{ differing.length }}</span>
        <span class="mg__tilesub">{{ differing.length ? differing.map((d) => d.id).join(', ') : t('None') }}</span>
      </div>
    </div>

    <div class="mg__card">
      <div class="mg__cardhead">
        <span class="mg__cardtitle">{{ t('Per asset at the cut-over') }}</span>
        <span class="mg__hint">{{ t('Commercial from the journal history, fixed. Fiscal computed from the group, editable until activation.') }}</span>
      </div>
      <table class="mg__table">
        <thead>
          <tr>
            <th class="mg__th">{{ t('Asset') }}</th>
            <th class="mg__th mg__th--num">{{ t('Cost') }}</th>
            <th class="mg__th mg__th--num">{{ t('Commercial accumulated') }}</th>
            <th class="mg__th mg__th--num">{{ t('Fiscal computed') }}</th>
            <th class="mg__th mg__th--num">{{ t('Fiscal opening') }}</th>
            <th class="mg__th mg__th--num">{{ t('Prior system') }}</th>
            <th class="mg__th mg__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.id">
            <tr class="mg__tr" :class="{ 'mg__tr--diff': r.difference }">
              <td class="mg__td">
                <span class="mg__link" @click="router.push(`/assets/${r.id}`)">{{ r.id }}</span> {{ r.name }}
                <span v-if="r.priorNote" class="mg__why">{{ t(r.priorNote) }}</span>
              </td>
              <td class="mg__td mg__td--num">{{ formatIDRWhole(r.cost) }}</td>
              <td class="mg__td mg__td--num">{{ formatIDRWhole(r.commercialAccumulated) }}</td>
              <td class="mg__td mg__td--num">{{ r.computedFiscal === null ? t('No tax book') : formatIDRWhole(r.computedFiscal) }}</td>
              <td class="mg__td mg__td--num">
                <template v-if="editing === r.id">
                  <div class="mg__edit">
                    <MpInput v-model="editValue" :is-invalid="!!editError" />
                    <MpButton size="sm" is-rounded @click="saveEdit">{{ t('Save') }}</MpButton>
                    <MpButton size="sm" variant="ghost" is-rounded @click="editing = null">{{ t('Cancel') }}</MpButton>
                  </div>
                </template>
                <template v-else-if="r.fiscalOpening === null">–</template>
                <template v-else>
                  <span :class="{ 'mg__edited': r.edited }">{{ formatIDRWhole(r.fiscalOpening) }}</span>
                  <span v-if="!migrationActivated" class="mg__link mg__editlink" @click="startEdit(r.id, r.fiscalOpening)">{{ t('Edit') }}</span>
                  <span v-if="r.edited" class="mg__link mg__editlink" @click="resetEdit(r.id)">{{ t('Use computed') }}</span>
                </template>
              </td>
              <td class="mg__td mg__td--num">{{ r.priorFiscal === null ? '–' : formatIDRWhole(r.priorFiscal) }}</td>
              <td class="mg__td mg__td--num" :class="{ 'mg__td--bad': r.difference }">{{ r.difference === null ? '–' : formatIDRWhole(r.difference) }}</td>
            </tr>
            <tr v-if="editing === r.id && editError" class="mg__tr">
              <td class="mg__td mg__td--error" colspan="7">{{ t(editError) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- The evidence: every run, refused or not, in the order it happened. -->
    <div class="mg__card">
      <div class="mg__cardhead">
        <span class="mg__cardtitle">{{ t('Reconciliation evidence') }}</span>
        <span class="mg__hint">{{ t('Kept for this session') }}</span>
      </div>
      <table v-if="reconciliations.length" class="mg__table">
        <thead>
          <tr>
            <th class="mg__th">{{ t('Run') }}</th>
            <th class="mg__th">{{ t('When · who') }}</th>
            <th class="mg__th">{{ t('Result') }}</th>
            <th class="mg__th">{{ t('Assets that differed') }}</th>
            <th class="mg__th">{{ t('Activation') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in reconciliations" :key="ev.number" class="mg__tr">
            <td class="mg__td">{{ ev.number }}</td>
            <td class="mg__td">{{ ev.at }} · {{ ev.by }}</td>
            <td class="mg__td" :class="ev.result === 'reconciled' ? 'mg__td--ok' : 'mg__td--bad'">
              {{ ev.result === 'reconciled' ? t('Reconciled') : t('Differs') }}
              · {{ ev.assets }} {{ t('assets') }}
            </td>
            <td class="mg__td">
              <template v-if="ev.differing.length">
                <div v-for="d in ev.differing" :key="d.id">{{ d.id }} · {{ formatIDRWhole(d.fiscalOpening) }} {{ t('against') }} {{ formatIDRWhole(d.priorFiscal) }}</div>
              </template>
              <template v-else>{{ t('None') }}</template>
            </td>
            <td class="mg__td">{{ ev.activation === 'activated' ? t('Activated') : ev.activation === 'refused' ? t('Refused') : '–' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="mg__empty">{{ t('No reconciliation run yet. Reconcile, or try to activate: either one is kept here.') }}</p>
    </div>
  </div>
</template>

<style scoped>
.mg__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.mg__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; }
.mg__actions { display: flex; gap: var(--mp-spacing-2); }
.mg__note { margin-bottom: var(--mp-spacing-4); }
.mg__link { color: var(--mp-text-link); cursor: pointer; }
.mg__link:hover { text-decoration: underline; }
.mg__tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.mg__tile { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
.mg__tile--bad { border-color: var(--mp-colors-border-danger); }
.mg__tilek { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mg__tilev { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.mg__tilesub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mg__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.mg__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.mg__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mg__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mg__table { width: 100%; border-collapse: collapse; }
.mg__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.mg__th--num { text-align: right; }
.mg__td { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.mg__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mg__td--bad { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.mg__td--ok { color: var(--mp-colors-text-success); }
.mg__td--error { color: var(--mp-text-danger); text-align: right; }
.mg__tr--diff { background: var(--mp-colors-background-danger); }
.mg__why { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.mg__edited { font-weight: var(--mp-font-weights-semi-bold); }
.mg__editlink { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); }
.mg__edit { display: flex; gap: var(--mp-spacing-2); align-items: center; justify-content: flex-end; }
.mg__edit :deep(input) { width: 160px; text-align: right; }
.mg__empty { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-4); }
</style>
