<script setup lang="ts">
/**
 * Asset record — the screen every other asset screen links to.
 *
 * The record splits into panes by audience rather than by data type, so
 * General Affairs can maintain custody on the same record accounting uses
 * without acquisition cost or book value being visible to them. Two registers
 * is how the count-variance problem starts; one record with scoped panes is
 * the answer.
 *
 * The Depreciation tab carries the derivation: any charge opens to show how it
 * was arrived at — opening basis, method, rate, months, adjustments, result.
 * That is the capability a preparer needs in order to stop keeping a parallel
 * spreadsheet, because it is what they would otherwise rebuild by hand.
 */
import { computed, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css, MpSegmentedControl,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ValueChangeDrawer from '~/components/patterns/ValueChangeDrawer.vue'
import { fixedAssets, assignTaxGroupTo, canSeeFinancials, viewAs, ledgerOf } from '~/data/assetStore'
import {
  findAsset, detailFigures, detailPanes, derivation, monthlySchedule, scheduleTotal, assetHistory,
  versionViews,
} from '~/data/fixedAssetDetail'
import { VALUE_ACTIONS, type ValueAction } from '~/data/assetValueChange'
import { assetTaxGroups } from '~/data/fixedAssets'
import AssetLifeSchedule from '~/components/patterns/AssetLifeSchedule.vue'
import IntangibleCodePicker from '~/components/patterns/IntangibleCodePicker.vue'
import { lifeSchedule } from '~/data/assetPreview'
import { leaseOfAsset } from '~/data/assetLeases'

// The shared detailMatch slot in [...slug].vue passes `order-id` to every
// detail component, so the prop is named to match rather than special-casing
// the router for one page.
const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const router = useRouter()

const asset = computed(() => findAsset(props.orderId))

/** The statutory group, including one assigned in this session. */
const effectiveTaxGroup = computed(() => asset.value?.taxGroup ?? null)

const figures = computed(() => (asset.value ? detailFigures(asset.value) : []))
// LR-6: General Affairs sees the physical pane and nothing financial.
const panes = computed(() => {
  const all = asset.value ? detailPanes(asset.value) : []
  return canSeeFinancials.value ? all : all.filter((p) => p.owner === 'General Affairs')
})
const history = computed(() => (asset.value ? assetHistory(asset.value) : []))
// The whole of FY2026, so a change's effect on the months ahead is visible.
const schedule = computed(() => (asset.value ? monthlySchedule(asset.value, 12) : []))
const scheduleToDate = computed(() => schedule.value.filter((r) => r.state !== 'projected'))
const total = computed(() => scheduleTotal(scheduleToDate.value))

// ── Tabs ────────────────────────────────────────────────────────────────────
type Tab = 'depreciation' | 'identity' | 'history'
const tab = ref<Tab>('depreciation')
const allTabs: { key: Tab; label: string }[] = [
  { key: 'depreciation', label: 'Depreciation' },
  { key: 'identity', label: 'Identity and parameters' },
  { key: 'history', label: 'History' },
]
const tabs = computed(() => (canSeeFinancials.value ? allTabs : allTabs.filter((x) => x.key === 'identity')))
watch(canSeeFinancials, (ok) => { if (!ok) tab.value = 'identity' }, { immediate: true })

// ── Previous versions (OD-42) ───────────────────────────────────────────────
const versionsOpen = ref(false)
const versionBook = ref<'accounting' | 'tax'>('accounting')
const versionBookOptions = computed(() => [
  { id: 'version-accounting', value: 'accounting', label: t('Accounting book') },
  { id: 'version-tax', value: 'tax', label: t('Tax book') },
])
const versions = computed(() => (asset.value ? versionViews(asset.value, versionBook.value) : []))
const supersededCount = computed(() => {
  if (!asset.value) return 0
  return versionViews(asset.value, 'accounting').filter((v) => !v.live).length
    + versionViews(asset.value, 'tax').filter((v) => !v.live).length
})
const hasTaxBook = computed(() => !!(asset.value && ledgerOf(asset.value.id)?.books.tax))

// OD-45: the whole life on both books, beside the fiscal-year schedule.
const life = computed(() => {
  const l = asset.value ? ledgerOf(asset.value.id) : null
  return l ? lifeSchedule(l) : null
})
const isGoodwillAsset = computed(() => !!(asset.value && ledgerOf(asset.value.id)?.isGoodwill))
// OD-38: a right-of-use asset names the lease it comes from.
const lease = computed(() => (asset.value ? leaseOfAsset(asset.value.id) : undefined))

// ── Change this asset (UX6) ─────────────────────────────────────────────────
const changeOpen = ref(false)
const changeAction = ref<ValueAction>('revise')
const isGone = computed(() => asset.value?.status === 'Disposed' || asset.value?.status === 'Split')
function openChange(a: ValueAction) {
  if (isGone.value) {
    infoToast(t(asset.value!.status === 'Split' ? 'This asset was split. Change its parts instead.' : 'This asset is disposed of. Nothing further can change it.'))
    return
  }
  changeAction.value = a
  changeOpen.value = true
}
function onCommitted(message: string, newIds: string[]) {
  changeOpen.value = false
  successToast(t(message))
  if (newIds.length) tab.value = 'history'
}
const splitLinks = computed(() => {
  if (!asset.value) return { from: null as string | null, into: [] as string[] }
  return {
    from: asset.value.splitFrom ?? null,
    into: fixedAssets.value.filter((a) => a.splitFrom === asset.value!.id).map((a) => a.id),
  }
})

// ── Derivation ──────────────────────────────────────────────────────────────
// Opened from a charge, on the basis that charge belongs to, so the panel
// always answers the number the reader actually clicked.
const derivationOpen = ref(false)
const derivationBasis = ref<'accounting' | 'tax'>('accounting')
const derivationPeriod = ref('September 2026')
const derivationSteps = computed(() =>
  asset.value ? derivation(asset.value, derivationBasis.value, derivationPeriod.value) : [],
)
function explain(basis: 'accounting' | 'tax', period: string) {
  derivationBasis.value = basis
  derivationPeriod.value = period
  derivationOpen.value = true
}

// ── Jump to another asset ───────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const rows = q
    ? fixedAssets.value.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    : fixedAssets.value
  return rows.slice(0, 40)
})
function jumpTo(id: string) {
  jumpSearch.value = ''
  router.push(`/assets/${id}`)
}

function goRegister() { router.push('/assets') }

function setTaxGroup(group: string) {
  if (!asset.value) return
  const r = assignTaxGroupTo(asset.value.id, group)
  if (!r.ok) { infoToast(r.reason); return }
  successToast(t(`Statutory group set to ${group}`))
}
</script>

<template>
  <div v-if="asset" class="ad">
    <!-- ── Title bar ── -->
    <header class="ad__bar">
      <div class="ad__barleft">
        <nav class="ad__crumbs">
          <MpTextlink id="ad-crumb" as="a" class="ad__crumb" @click.prevent="goRegister">
            {{ t('Assets') }}
          </MpTextlink>
        </nav>
        <div class="ad__titlerow">
          <h1 class="ad__title">{{ asset.name }}</h1>
          <ErpStatusBadge :status="asset.status.toLowerCase()" size="md" badge-for="additionalInformation" />
          <!-- rule/detail-jump-to — move record to record without going back. -->
          <MpPopover id="ad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="ad__jump" is-rounded :aria-label="t('Switch asset')">
                <MpIcon name="chevrons-down" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="ad__jumpwrap">
                <input v-model="jumpSearch" class="ad__jumpsearch" type="text" :placeholder="t('Search...')" />
                <div class="ad__jumplist">
                  <button v-for="o in jumpResults" :key="o.id" class="ad__jumpitem" @click="jumpTo(o.id)">
                    <span class="ad__jumpname">{{ o.name }}</span>
                    <span class="ad__jumpsub">{{ o.id }}</span>
                  </button>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <p class="ad__sub">
          {{ asset.id }}<template v-if="asset.tag"> · {{ asset.tag }}</template>
          · {{ asset.class }} · {{ asset.branch }} · {{ t('acquired') }} {{ asset.acquired }}
        </p>
        <p v-if="lease" class="ad__sub">
          {{ t('Right-of-use asset of lease') }}
          <span class="ad__figurelink" @click="router.push('/assets/leases')">{{ lease.id }} {{ lease.name }}</span>
        </p>
        <!-- OD-32: a split keeps the parent and its parts linked both ways. -->
        <p v-if="splitLinks.from || splitLinks.into.length" class="ad__sub">
          <template v-if="splitLinks.from">
            {{ t('Split from') }}
            <span class="ad__figurelink" @click="router.push(`/assets/${splitLinks.from}`)">{{ splitLinks.from }}</span>
          </template>
          <template v-else>
            {{ t('Split into') }}
            <template v-for="(id, i) in splitLinks.into" :key="id">
              <span class="ad__figurelink" @click="router.push(`/assets/${id}`)">{{ id }}</span><template v-if="i < splitLinks.into.length - 1">, </template>
            </template>
          </template>
        </p>
      </div>

      <div class="ad__baractions">
        <MpPopover v-if="canSeeFinancials" id="ad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu ad__actionsmenu">
            <!-- UX6: one entry point for every change to the asset's value. -->
            <div class="ad__menuhead">{{ t('Change this asset') }}</div>
            <MpPopoverList>
              <MpPopoverListItem v-for="a in VALUE_ACTIONS" :key="a.key" @click="openChange(a.key)">{{ t(a.label) }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="ad__body">
      <!-- The one thing that blocks every tax output, fixable from here. -->
      <div v-if="!effectiveTaxGroup && canSeeFinancials && !isGone" class="ad__blocked">
        <MpIcon name="information" size="sm" />
        <div class="ad__blockedbody">
          <div class="ad__blockedtitle">{{ t('No statutory group') }}</div>
          <div class="ad__blockedtext">
            {{ t('This asset is excluded from the tax book, the difference total and the statutory filing until a group is set.') }}
          </div>
        </div>
        <MpPopover id="ad-setgroup" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Set group') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem v-for="g in assetTaxGroups" :key="g" @click="setTaxGroup(g)">{{ g }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <!-- LR-6: the scoped role reads the physical pane only. -->
      <div v-if="!canSeeFinancials" class="ad__scoped">
        <MpIcon name="information" size="sm" />
        <span>{{ t(`Viewing as ${viewAs}. Cost, book values and schedules are not shown to this role.`) }}</span>
      </div>

      <!-- ── Headline figures ── -->
      <!-- The house index-page stats band: divider-separated columns sitting
           directly on the stage, caption above the figure. -->
      <div v-if="canSeeFinancials" class="stats-section">
        <div
          v-for="(f, i) in figures" :key="f.label"
          class="stat-card" :class="{ 'stat-card--bordered': i < figures.length - 1 }"
        >
          <div class="stat-title">{{ t(f.label) }}</div>
          <div class="stat-period">{{ t(f.caption) }}</div>
          <div v-if="f.value === null" class="stat-amount stat-amount--absent">{{ t(f.absent ?? 'Not computed') }}</div>
          <div v-else class="stat-amount">{{ formatIDR(f.value) }}</div>
          <div v-if="f.sub" class="stat-sub">{{ t(f.sub) }}</div>
        </div>
      </div>

      <!-- ── Tabs ── -->
      <div class="ad__tabs" role="tablist">
        <button
          v-for="tb in tabs" :key="tb.key" class="ad__tab"
          :class="{ 'ad__tab--on': tab === tb.key }"
          role="tab" :aria-selected="tab === tb.key"
          @click="tab = tb.key"
        >{{ t(tb.label) }}</button>
      </div>

      <!-- ── Depreciation ── -->
      <div v-if="tab === 'depreciation'" class="ad__card">
        <div class="ad__cardhead ad__cardhead--split">
          <div>
            <div class="ad__cardtitle">{{ t('FY2026 schedule') }}</div>
            <div class="ad__cardsub">{{ t('January to December 2026 · months after September are projected on the live basis') }}</div>
          </div>
          <MpButton variant="secondary" is-rounded @click="versionsOpen = true">
            {{ t('Previous versions') }}<template v-if="supersededCount"> ({{ supersededCount }})</template>
          </MpButton>
        </div>
        <table class="ad__table">
          <thead>
            <tr>
              <th class="ad__th">{{ t('Period') }}</th>
              <th class="ad__th ad__th--num">{{ t('Accounting') }}</th>
              <th class="ad__th ad__th--num">{{ t('Tax') }}</th>
              <th class="ad__th ad__th--num">{{ t('Difference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in schedule" :key="r.period" class="ad__tr" :class="{ 'ad__tr--projected': r.state === 'projected', 'ad__tr--basis': r.basisMarker }">
              <td class="ad__td">
                <span class="ad__period">
                  {{ r.period }}
                  <span v-if="r.state !== 'posted'" class="ad__state">{{ t(r.state === 'open' ? 'Open' : 'Projected') }}</span>
                </span>
                <!-- OD-42: where the basis changed, the boundary is marked. -->
                <span v-if="r.basisMarker" class="ad__basismarker">{{ t(r.basisMarker) }}</span>
                <!-- The month an event landed in is the month the reader needs
                     it named, not a footnote under the table. -->
                <span v-if="r.event" class="ad__event-inline">{{ t(r.event) }}</span>
              </td>
              <!-- Every charge is clickable. This is the differentiator: the
                   product shows its work rather than asserting a number. -->
              <td class="ad__td ad__td--num">
                <span v-if="r.accounting === null" class="ad__absent">{{ t(r.accountingAbsent ?? 'Not computed') }}</span>
                <span v-else class="ad__figurelink" @click="explain('accounting', r.period)">
                  {{ formatIDR(r.accounting) }}
                </span>
              </td>
              <td class="ad__td ad__td--num">
                <span v-if="r.tax === null" class="ad__absent">{{ t(r.taxAbsent ?? 'Not computed') }}</span>
                <span v-else class="ad__figurelink" @click="explain('tax', r.period)">
                  {{ formatIDR(r.tax) }}
                </span>
              </td>
              <td class="ad__td ad__td--num">
                {{ r.accounting !== null && r.tax !== null ? formatIDR(r.accounting - r.tax) : '—' }}
              </td>
            </tr>
            <tr class="ad__tr ad__tr--total">
              <td class="ad__td">{{ t('FY2026 to 30/09') }}</td>
              <td class="ad__td ad__td--num">
                {{ total.accounting === null ? '—' : formatIDR(total.accounting) }}
              </td>
              <td class="ad__td ad__td--num">
                {{ total.tax === null ? '—' : formatIDR(total.tax) }}
              </td>
              <td class="ad__td ad__td--num">
                {{ total.accounting !== null && total.tax !== null ? formatIDR(total.accounting - total.tax) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="ad__hint">{{ t('Select any charge to see how it was derived.') }}</p>
      </div>

      <!-- OD-45: the full-life schedule, year by year, on both books. -->
      <div v-if="tab === 'depreciation' && life" class="ad__card" data-tour="int-schedule">
        <div class="ad__cardhead">
          <div>
            <div class="ad__cardtitle">{{ t(asset.type === 'Intangible' ? 'Amortisation schedule · whole life' : 'Depreciation schedule · whole life') }}</div>
            <div class="ad__cardsub">
              {{ life.first }} {{ t('to') }} {{ life.last }} · {{ t('years after 2026 are projected on the live basis') }}
            </div>
          </div>
        </div>
        <div class="ad__lifewrap">
          <AssetLifeSchedule :schedule="life" />
        </div>
      </div>

      <!-- OD-47: an intangible's statutory code, from the eleven intangible codes. -->
      <div v-if="tab === 'identity' && asset.type === 'Intangible' && canSeeFinancials" class="ad__card ad__codecard" data-tour="int-code">
        <div class="ad__panehead">
          <span class="ad__panetitle">{{ t('Statutory intangible code') }}</span>
          <span class="ad__paneowner">{{ t('Tax') }}</span>
        </div>
        <div class="ad__codebody">
          <IntangibleCodePicker id="ad-intangible-code" :asset-id="asset.id" :current="asset.statutoryCode" :is-goodwill="isGoodwillAsset" />
        </div>
      </div>

      <!-- ── Identity and parameters ── -->
      <div v-if="tab === 'identity'" class="ad__panes">
        <div v-for="p in panes" :key="p.head" class="ad__card ad__pane">
          <div class="ad__panehead">
            <span class="ad__panetitle">{{ t(p.head) }}</span>
            <!-- Naming the owner is what makes "marked, not hidden" legible:
                 a reader can see which pane is theirs. -->
            <span class="ad__paneowner">{{ t(p.owner) }}</span>
          </div>
          <div class="ad__panefields">
            <ContentList v-for="f in p.fields" :key="f.k" horizontal :label="t(f.k)" :value="f.v" />
          </div>
        </div>
      </div>

      <!-- ── History ── -->
      <div v-if="tab === 'history'" class="ad__card">
        <div v-for="(h, i) in history" :key="i" class="ad__event">
          <div class="ad__eventwhen">{{ h.when }}</div>
          <div class="ad__eventbody">
            <div class="ad__eventwhat">{{ h.what }}</div>
            <div v-if="h.note" class="ad__eventnote">{{ h.note }}</div>
          </div>
          <div class="ad__eventwho">{{ h.who }}</div>
        </div>
      </div>
    </div>

    <ValueChangeDrawer
      :is-open="changeOpen" :asset="asset" :action="changeAction"
      @close="changeOpen = false" @committed="onCommitted"
    />

    <!-- ── Previous versions (OD-42, LR-3) ── -->
    <Teleport to="body">
      <div v-if="versionsOpen" class="ad__overlay">
        <aside class="ad__drawer ad__drawer--wide" role="dialog" :aria-label="t('Schedule versions')">
          <header class="ad__drawerhead">
            <div>
              <div class="ad__drawertitle">{{ t('Schedule versions') }}</div>
              <div class="ad__drawersub">{{ asset.id }} · {{ t('superseded versions stay readable with their basis') }}</div>
            </div>
            <MpButton class="ad__drawerclose" variant="ghost" is-rounded :aria-label="t('Close')" @click="versionsOpen = false">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>
          <div class="ad__drawerbody">
            <div v-if="hasTaxBook" class="ad__booktabs">
              <MpSegmentedControl id="version-book-switch" name="version-book-switch" v-model="versionBook" :data="versionBookOptions" />
            </div>
            <p v-if="versions.length === 1" class="ad__drawernote">{{ t('This book has one version. Nothing has changed its basis.') }}</p>
            <div v-for="v in versions" :key="v.id" class="ad__version">
              <div class="ad__versionhead">
                <span class="ad__versiontitle">{{ t('Version') }} {{ v.number }} · {{ t(v.label) }}</span>
                <span class="ad__versionstate">{{ v.live ? t('Live') : `${t('Superseded from')} ${v.supersededFrom}` }}</span>
              </div>
              <div class="ad__versionsub">{{ t('From') }} {{ v.fromPeriod }}</div>
              <div class="ad__versionbasis">
                <ContentList v-for="b in v.basis" :key="b.k" horizontal :label="t(b.k)" :value="b.v" />
              </div>
              <table class="ad__table ad__table--compact">
                <thead>
                  <tr>
                    <th class="ad__th">{{ t('Period') }}</th>
                    <th class="ad__th ad__th--num">{{ t('Charge') }}</th>
                    <th class="ad__th ad__th--num">{{ t('Book value') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in v.rows" :key="r.period" class="ad__tr">
                    <td class="ad__td">{{ r.label }}<span v-if="r.adjustmentOnly" class="ad__event-inline">{{ t('Adjustment only') }}</span></td>
                    <td class="ad__td ad__td--num">{{ formatIDR(r.charge + (r.adjustment ?? 0)) }}</td>
                    <td class="ad__td ad__td--num">{{ formatIDR(r.netBookValue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>

    <!-- ── Derivation panel ── -->
    <Teleport to="body">
      <div v-if="derivationOpen" class="ad__overlay">
        <aside class="ad__drawer" role="dialog" :aria-label="t('How this figure was derived')">
          <header class="ad__drawerhead">
            <div>
              <div class="ad__drawertitle">{{ t('How this figure was derived') }}</div>
              <div class="ad__drawersub">
                {{ asset.id }} · {{ derivationBasis === 'accounting' ? t('Accounting basis') : t('Tax basis') }}
              </div>
            </div>
            <MpButton class="ad__drawerclose" variant="ghost" is-rounded :aria-label="t('Close')" @click="derivationOpen = false">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>

          <div class="ad__drawerbody">
            <div v-for="(s, i) in derivationSteps" :key="i" class="ad__step" :class="{ 'ad__step--result': s.isResult }">
              <div class="ad__steplabel">{{ s.label }}</div>
              <div class="ad__stepvalue">{{ s.value }}</div>
            </div>
            <p class="ad__drawernote">
              {{ t('Read from the basis that produced this figure, not recomputed from today\'s parameters — so a charge from before a correction still explains itself.') }}
            </p>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>

  <!-- Not found -->
  <div v-else class="ad__missing">
    <div class="ad__missingtitle">{{ t('Asset not found') }}</div>
    <MpTextlink id="ad-back" as="a" @click.prevent="goRegister">{{ t('Back to Assets') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* A detail page owns its whole layout, including the title bar and the 24px
   stage padding (rule/surface-no-double-pad applies to pageRegistry pages). */
.ad { display: flex; flex-direction: column; height: 100%; overflow: auto; }

.ad__bar {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  /* flex: none is load-bearing — .ad is a flex column, so without it the bar
     shrinks to min-height and the identity line spills past its own border
     into the figures below. */
  flex: none;
  min-height: 72px; padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ad__barleft { display: flex; flex-direction: column; min-width: 0; }
/* rule/detail-breadcrumb-no-gap — the breadcrumb sits directly above the title. */
.ad__crumbs { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ad__crumb { font-size: var(--mp-font-sizes-sm); }
.ad__titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ad__title {
  font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin: 0;
}
.ad__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-1) 0 0; }
/* rule/detail-jump-to-anatomy fixes this control at 28px — a component size,
   not a spacing step, so it has no token on the scale. */
.ad__jump {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-0); display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
}
.ad__baractions { flex: none; }
.ad__lifewrap { padding: var(--mp-spacing-0) var(--mp-spacing-4) var(--mp-spacing-4); }
.ad__codecard { margin-bottom: var(--mp-spacing-4); }
.ad__codebody { padding: var(--mp-spacing-3) var(--mp-spacing-4); max-width: 480px; }

.ad__jumpwrap { padding: var(--mp-spacing-2); }
.ad__jumpsearch {
  width: 100%; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
}
.ad__jumplist { max-height: 280px; overflow: auto; margin-top: var(--mp-spacing-2); }
.ad__jumpitem {
  display: flex; flex-direction: column; align-items: flex-start; width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 0; background: transparent;
  cursor: pointer; text-align: left; border-radius: var(--mp-radii-sm);
}
.ad__jumpitem:hover { background: var(--mp-background-neutral-hovered); }
.ad__jumpname { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ad__jumpsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.ad__body { padding: var(--mp-spacing-6); }

.ad__blocked {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-warning-subtle); border-radius: var(--mp-radii-md);
  color: var(--mp-text-warning);
}
.ad__blockedbody { flex: 1; min-width: 0; }
.ad__blockedtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.ad__blockedtext { font-size: var(--mp-font-sizes-sm); margin-top: var(--mp-spacing-1); }

/* The house index-page stats band (BillsIndexPage). Divider-separated columns
   on the stage, caption above the figure — not a bordered card. */
.stats-section {
  display: flex; gap: var(--mp-spacing-6); align-items: flex-start;
  padding-bottom: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.stat-period {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px);
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px);
  font-variant-numeric: tabular-nums;
}
/* Never a zero where the figure does not exist. */
.stat-amount--absent { color: var(--mp-text-critical); font-size: var(--mp-font-sizes-lg); }
.stat-sub {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px); font-variant-numeric: tabular-nums;
}

.ad__tabs { display: flex; gap: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.ad__tab {
  border: 0; background: transparent; cursor: pointer;
  padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); border-bottom: 2px solid transparent;
}
.ad__tab--on { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-text-selected); }

.ad__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ad__cardhead { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ad__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ad__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ad__table { width: 100%; border-collapse: collapse; }
.ad__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ad__th--num { text-align: right; }
.ad__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ad__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ad__period { display: block; }
/* The event names itself in the month it happened, not in a footnote. */
.ad__event-inline { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
/* An absent charge says why. Never a zero. */
.ad__absent { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ad__tr--total .ad__td {
  font-weight: var(--mp-font-weights-semi-bold);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 0;
}
.ad__figurelink { color: var(--mp-text-link); cursor: pointer; }
.ad__figurelink:hover { text-decoration: underline; }
.ad__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; }

.ad__panes { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ad__panehead { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ad__panetitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ad__paneowner { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ad__panefields { padding: var(--mp-spacing-2) var(--mp-spacing-4); }

.ad__event { display: flex; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ad__event:last-child { border-bottom: 0; }
.ad__eventwhen { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); min-width: 88px; font-variant-numeric: tabular-nums; }
.ad__eventbody { flex: 1; min-width: 0; }
.ad__eventwhat { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ad__eventnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ad__eventwho { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* rule/drawer-custom-shell — a hand-rolled Teleport overlay; the backdrop is a
   backdrop, close is the × only. */
/* 1300 matches BillsFiltersDrawer: the app header is 1100, and a drawer
   below it renders with its own header hidden behind the chrome. */
.ad__overlay { position: fixed; inset: 0; background: var(--mp-background-overlay); z-index: 1300; }
.ad__drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 420px; max-width: 92vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default);
  /* The panel scrolls in its body only — the head stays put. */
  overflow: hidden;
}
.ad__drawerhead {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  /* The drawer is a column; the head must not shrink or scroll away. */
  flex: none;
}
.ad__drawertitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ad__drawersub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.ad__drawerclose { flex: none; }
.ad__drawerbody { padding: var(--mp-spacing-4) var(--mp-spacing-6); overflow: auto; }

.ad__step { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default); }
.ad__steplabel { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ad__stepvalue { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; font-variant-numeric: tabular-nums; }
/* The answer, distinguished from its inputs by weight rather than colour. */
.ad__step--result .ad__steplabel,
.ad__step--result .ad__stepvalue { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ad__step--result { border-bottom: 0; }
.ad__drawernote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-4); }

.ad__cardhead--split { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.ad__state { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ad__tr--projected .ad__td { color: var(--mp-text-secondary); }
/* A basis boundary is drawn on the row, so two bases are never read as one. */
.ad__tr--basis .ad__td { border-top: 2px solid var(--mp-border-selected, var(--mp-border-default)); }
.ad__basismarker { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-selected); margin-top: var(--mp-spacing-1); }
.ad__scoped {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.ad__menuhead { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
:global(.ad__actionsmenu) { min-width: 240px; }
.ad__drawer--wide { width: 560px; }
.ad__booktabs { display: flex; gap: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.ad__version { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); margin-bottom: var(--mp-spacing-4); overflow: hidden; }
.ad__versionhead { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4) 0; }
.ad__versiontitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ad__versionstate { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.ad__versionsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding: 0 var(--mp-spacing-4); }
.ad__versionbasis { padding: var(--mp-spacing-2) var(--mp-spacing-4); }
.ad__table--compact .ad__td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); }

.ad__missing { padding: var(--mp-spacing-10); text-align: center; }
.ad__missingtitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2); }
</style>
