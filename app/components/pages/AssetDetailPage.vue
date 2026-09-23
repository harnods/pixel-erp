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
import { computed, ref } from 'vue'
import {
  MpButton, MpIcon, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { fixedAssets } from '~/data/fixedAssets'
import {
  findAsset, detailFigures, detailPanes, derivation, schedulePreview, assetHistory,
} from '~/data/fixedAssetDetail'
import { assignedTaxGroup, assignTaxGroupTo } from '~/data/fixedAssetSession'
import { assetTaxGroups } from '~/data/fixedAssets'

// The shared detailMatch slot in [...slug].vue passes `order-id` to every
// detail component, so the prop is named to match rather than special-casing
// the router for one page.
const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const router = useRouter()

const asset = computed(() => findAsset(props.orderId))

/** The statutory group, including one assigned in this session. */
const effectiveTaxGroup = computed(() => {
  const a = asset.value
  if (!a) return null
  return a.taxGroup ?? assignedTaxGroup(a.id)
})

const figures = computed(() => (asset.value ? detailFigures(asset.value) : []))
const panes = computed(() => (asset.value ? detailPanes(asset.value) : []))
const history = computed(() => (asset.value ? assetHistory(asset.value) : []))
const schedule = computed(() => (asset.value ? schedulePreview(asset.value) : []))

// ── Tabs ────────────────────────────────────────────────────────────────────
type Tab = 'depreciation' | 'identity' | 'history'
const tab = ref<Tab>('depreciation')
const tabs: { key: Tab; label: string }[] = [
  { key: 'depreciation', label: 'Depreciation' },
  { key: 'identity', label: 'Identity and parameters' },
  { key: 'history', label: 'History' },
]

// ── Derivation ──────────────────────────────────────────────────────────────
// Opened from a charge, on the basis that charge belongs to, so the panel
// always answers the number the reader actually clicked.
const derivationOpen = ref(false)
const derivationBasis = ref<'accounting' | 'tax'>('accounting')
const derivationSteps = computed(() =>
  asset.value ? derivation(asset.value, derivationBasis.value) : [],
)
function explain(basis: 'accounting' | 'tax') {
  derivationBasis.value = basis
  derivationOpen.value = true
}

// ── Jump to another asset ───────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const rows = q
    ? fixedAssets.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    : fixedAssets
  return rows.slice(0, 40)
})
function jumpTo(id: string) {
  jumpSearch.value = ''
  router.push(`/assets/${id}`)
}

function goRegister() { router.push('/assets') }

function setTaxGroup(group: string) {
  if (!asset.value) return
  assignTaxGroupTo(asset.value.id, group)
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
      </div>

      <div class="ad__baractions">
        <MpPopover id="ad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="infoToast(t('Editing an asset is not part of this prototype.'))">{{ t('Edit asset') }}</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Disposal is not part of this prototype.'))">{{ t('Dispose') }}</MpPopoverListItem>
              <MpPopoverListItem @click="router.push('/impairment-tests')">{{ t('Record an impairment test') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="ad__body">
      <!-- The one thing that blocks every tax output, fixable from here. -->
      <div v-if="!effectiveTaxGroup" class="ad__blocked">
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

      <!-- ── Headline figures ── -->
      <div class="ad__figures">
        <div v-for="f in figures" :key="f.label" class="ad__figure">
          <div class="ad__figlabel">{{ t(f.label) }}</div>
          <div v-if="f.value === null" class="ad__figvalue ad__figvalue--absent">{{ t(f.absent ?? 'Not computed') }}</div>
          <div v-else class="ad__figvalue">{{ formatIDR(f.value) }}</div>
          <div class="ad__fignote">{{ f.note }}</div>
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
            <tr v-for="r in schedule" :key="r.period" class="ad__tr">
              <td class="ad__td">{{ r.period }}</td>
              <!-- Every charge is clickable. This is the differentiator: the
                   product shows its work rather than asserting a number. -->
              <td class="ad__td ad__td--num">
                <span class="ad__figurelink" @click="explain('accounting')">
                  {{ r.accounting === null ? t('Not amortised') : formatIDR(r.accounting) }}
                </span>
              </td>
              <td class="ad__td ad__td--num">
                <span class="ad__figurelink" @click="explain('tax')">
                  {{ r.tax === null ? t('Not computed') : formatIDR(r.tax) }}
                </span>
              </td>
              <td class="ad__td ad__td--num">
                {{ r.accounting !== null && r.tax !== null ? formatIDR(r.accounting - r.tax) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="ad__hint">{{ t('Select any charge to see how it was derived.') }}</p>
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

.ad__figures {
  display: flex; gap: var(--mp-spacing-6); flex-wrap: wrap;
  padding-bottom: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ad__figure { min-width: 160px; }
.ad__figlabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ad__figvalue {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
/* Never a zero where the figure does not exist. */
.ad__figvalue--absent { color: var(--mp-text-critical); }
.ad__fignote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.ad__tabs { display: flex; gap: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.ad__tab {
  border: 0; background: transparent; cursor: pointer;
  padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); border-bottom: 2px solid transparent;
}
.ad__tab--on { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-text-selected); }

.ad__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ad__table { width: 100%; border-collapse: collapse; }
.ad__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ad__th--num { text-align: right; }
.ad__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ad__td--num { text-align: right; font-variant-numeric: tabular-nums; }
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

.ad__missing { padding: var(--mp-spacing-10); text-align: center; }
.ad__missingtitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2); }
</style>
