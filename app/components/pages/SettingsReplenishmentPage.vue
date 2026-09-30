<script setup lang="ts">
/**
 * Replenishment › Settings — the company-wide policy behind every recommendation
 * (PRD US-001, US-002, US-005, US-008, US-009).
 *
 * Built to the settings-page pattern (docs/patterns/settings-page.md):
 *   • its own 72px title bar — breadcrumb back to Replenishment, H1, and the one
 *     page action (Edit, or a "View only" badge) top-right;
 *   • sections (H2) of settings rows — label + caption on the left, the control on
 *     the right — that read the committed value in view mode and turn into inputs
 *     in edit mode, in the same place;
 *   • a sticky footer (MpButtonGroup.erp-action-footer) only while editing.
 *
 * Every reachable state is designed: view-only, pristine, invalid (inline field
 * errors, Save stays clickable), submitting (loading lock), save error (inline,
 * edits kept), success (toast) and unsaved changes (confirm before leaving).
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationRaw } from 'vue-router'
import {
  toast, css, MpBadge, MpButton, MpButtonGroup, MpInput, MpInputGroup, MpInputRightAddon,
  MpInputTag, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextlink, type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  getReplenishmentConfig, saveReplenishmentConfig,
  REPL_DEFAULTS, type ReplenishmentConfig,
} from '~/data/replenishmentConfig'
import { recalculateReplenishment, invalidateReplenishmentCaches } from '~/data/replenishment'
import { safetyDaysOverrideCount } from '~/data/replenishmentSettings'
import { productCategories } from '~/data/productCategories'

// Rendered through the shell's detailMatch, which passes an id it does not need.
defineProps<{ orderId?: string }>()

const router = useRouter()
const { t, tf } = useLocale()
const { activeScenario } = useScenario()

/** No RBAC plumbing in the prototype — the ERP scenario stands in for an admin.
 *  Everything else renders read-only (the permission state of the pattern). */
const canEdit = computed(() => activeScenario.value === 'ERP')

/** Deep copy that is safe on a reactive proxy — the config is plain JSON data. */
function cloneConfig(cfg: ReplenishmentConfig): ReplenishmentConfig {
  return JSON.parse(JSON.stringify(cfg)) as ReplenishmentConfig
}

const committed = ref<ReplenishmentConfig>(getReplenishmentConfig())
const draft = reactive<ReplenishmentConfig>(cloneConfig(getReplenishmentConfig()))
const isEditing = ref(false)
const saving = ref(false)
/** One-line pointer in the footer; the field-level message sits AT the field. */
const formError = ref('')
/** Per-field errors, keyed by row id (rule/form-errors-inline, rule/field-invalid-caption). */
const fieldErrors = reactive<Record<string, string>>({})
function clearFieldErrors() { for (const k of Object.keys(fieldErrors)) delete fieldErrors[k] }

// ── Product categories with their own defaults ───────────────────────────────
// A category is "listed" when it carries a value in any per-category map, or was
// added this session — and is NOT one removed this session. Anything not listed
// uses the "Other categories" row. (US-001 / D21.)
const extraCategories = reactive<string[]>([])
const removedCategories = reactive<Set<string>>(new Set())
const PER_CATEGORY_MAPS = [
  'safetyDaysByCategory', 'coverageDaysByCategory', 'leadTimeByCategory', 'leadTimeOutlierCapByCategory',
] as const

const categories = computed(() => {
  const src = isEditing.value ? draft : committed.value
  const set = new Set<string>()
  for (const key of PER_CATEGORY_MAPS) for (const k of Object.keys(src[key])) set.add(k)
  for (const c of extraCategories) set.add(c)
  for (const c of removedCategories) set.delete(c)
  return [...set].sort()
})

/** MpInputTag's shape (rule/select-multi-mpinputtag). */
const categoryTags = computed<DataInterface[]>(() =>
  categories.value.map((c) => ({ id: c, text: c, value: c, isInvalid: false, isReadOnly: false })),
)
/** Bumped after every change so the tag input re-reads the source of truth — a
 *  removal that is then cancelled in the confirm must put the tag back. */
const categoryTagsKey = ref(0)

function onCategoryTagsChange(data: DataInterface[]) {
  const next = new Set(data.map((d) => String(d.value ?? d.text)))
  for (const c of next) {
    if (categories.value.includes(c)) continue
    removedCategories.delete(c)
    if (!extraCategories.includes(c)) extraCategories.push(c)
  }
  for (const c of categories.value) if (!next.has(c)) requestRemove(c)
  categoryTagsKey.value++
}

/** Whether a category still carries any per-category default in the draft. */
function categoryHasDefaults(cat: string): boolean {
  return PER_CATEGORY_MAPS.some((key) => {
    const v = (draft[key] as Record<string, unknown>)[cat]
    return v !== undefined && v !== null && String(v) !== ''
  })
}

// Removing a category clears its default from EVERY row at once, so it is confirmed
// when there is something to lose; an empty (just-added) category goes silently.
const removeTarget = ref<string | null>(null)
const removeConfirmOpen = ref(false)
function requestRemove(cat: string) {
  if (categoryHasDefaults(cat)) { removeTarget.value = cat; removeConfirmOpen.value = true }
  else removeCategory(cat)
}
function confirmRemove() {
  if (removeTarget.value) removeCategory(removeTarget.value)
  removeTarget.value = null
  categoryTagsKey.value++
}
function removeCategory(cat: string) {
  for (const key of PER_CATEGORY_MAPS) delete (draft[key] as Record<string, unknown>)[cat]
  const i = extraCategories.indexOf(cat)
  if (i !== -1) extraCategories.splice(i, 1)
  removedCategories.add(cat)
}

// ── Read-only renderings (whole sentences, never concatenated fragments) ─────
const days = (n: number | string) => tf('{n} days', { n })

/** A per-category value in view mode: its own number, or the inherited floor. */
function catDays(map: Record<string, number | null | undefined>, cat: string, floor: number | null): string {
  const v = map[cat]
  if (v != null) return days(v)
  return floor != null ? days(floor) : t('Not set')
}

// ── Lead-time floor "Not set" (D22) ──────────────────────────────────────────
function floorSetNotSet() { draft.fallbackLeadTimeDays = null }
function floorSetNumber() {
  draft.fallbackLeadTimeDays = committed.value.fallbackLeadTimeDays ?? REPL_DEFAULTS.fallbackLeadTimeDays ?? 14
}

/** How many SKU/warehouse rows override safety days — so editing the default and
 *  seeing nothing move is explained (the override wins, D14 / D16). */
const safetyOverrides = computed(() => {
  void committed.value
  return safetyDaysOverrideCount()
})

const BOUNDARY_OPTIONS = [
  { id: 'inclusive', name: 'Reorder at or below the reorder point' },
  { id: 'exclusive', name: 'Reorder only below the reorder point' },
]
const boundaryLabel = computed(() =>
  t(BOUNDARY_OPTIONS.find((o) => o.id === committed.value.reorderBoundary)?.name ?? committed.value.reorderBoundary),
)

const fsnBandsOk = computed(() => Number(draft.fsnFastPct) > Number(draft.fsnSlowPct))

// ── Edit lifecycle ───────────────────────────────────────────────────────────
function resetDraftTo(cfg: ReplenishmentConfig) {
  clearFieldErrors()
  Object.assign(draft, cloneConfig(cfg))
  removedCategories.clear()
  extraCategories.length = 0
  formError.value = ''
  categoryTagsKey.value++
}

function startEdit() {
  resetDraftTo(committed.value)
  isEditing.value = true
}

function cancel() {
  resetDraftTo(committed.value)
  isEditing.value = false
}

function resetToDefaults() {
  resetDraftTo(REPL_DEFAULTS)
}

/** Unsaved edits exist — drives the leave-page confirm. */
const isDirty = computed(() =>
  isEditing.value && (
    JSON.stringify(draft) !== JSON.stringify(committed.value)
    || extraCategories.length > 0 || removedCategories.size > 0
  ),
)

function validate(): boolean {
  // Validate on click, never by disabling the button (rule/btn-no-disabled-validation).
  // Every rule of US-008 VR-01..04, each failure shown AT its row.
  clearFieldErrors()
  const isWhole = (v: unknown) => String(v) !== '' && Number.isInteger(Number(v))
  const need = (key: string, ok: boolean, msg: string) => { if (!ok && !fieldErrors[key]) fieldErrors[key] = msg }
  const MIN0 = t('Enter a whole number of 0 or more.')
  const MIN1 = t('Enter a whole number of 1 or more.')

  need('lookback', isWhole(draft.lookbackDays) && Number(draft.lookbackDays) >= 1, MIN1)
  need('volatility', String(draft.volatileCvThreshold) !== '' && Number(draft.volatileCvThreshold) > 0,
    t('Enter a number greater than 0.'))
  need('coldstart', isWhole(draft.coldStartMinDays) && Number(draft.coldStartMinDays) >= 1, MIN1)
  need('safety', isWhole(draft.safetyDaysGlobal) && Number(draft.safetyDaysGlobal) >= 0, MIN0)
  need('coverage', isWhole(draft.coverageDaysGlobal) && Number(draft.coverageDaysGlobal) >= 0, MIN0)
  // Category rows: blank = inherit Other categories; a value must be valid.
  for (const cat of categories.value) {
    const sd = draft.safetyDaysByCategory[cat]
    if (sd != null && String(sd) !== '') need('safety', isWhole(sd) && Number(sd) >= 0, MIN0)
    const cv = draft.coverageDaysByCategory[cat]
    if (cv != null && String(cv) !== '') need('coverage', isWhole(cv) && Number(cv) >= 0, MIN0)
    // A category lead time is a real lead time — never 0 or negative (D22).
    const lt = draft.leadTimeByCategory[cat]
    if (lt != null && String(lt) !== '') need('lead', isWhole(lt) && Number(lt) >= 1, MIN1)
    const cap = draft.leadTimeOutlierCapByCategory[cat]
    if (cap != null && String(cap) !== '') need('cap', isWhole(cap) && Number(cap) >= 1, MIN1)
  }
  if (draft.fallbackLeadTimeDays !== null) {
    need('lead', isWhole(draft.fallbackLeadTimeDays) && Number(draft.fallbackLeadTimeDays) >= 1,
      t('Enter a whole number of 1 or more, or choose Not set.'))
  }
  need('cap', isWhole(draft.leadTimeOutlierCapDays) && Number(draft.leadTimeOutlierCapDays) >= 1, MIN1)
  need('receipts', isWhole(draft.leadTimeMinSamples) && Number(draft.leadTimeMinSamples) >= 1
    && isWhole(draft.leadTimeSampleCount) && Number(draft.leadTimeSampleCount) >= 1, MIN1)
  need('receipts', Number(draft.leadTimeMinSamples) <= Number(draft.leadTimeSampleCount),
    t('The minimum cannot be more than the maximum.'))
  need('fsnWindow', isWhole(draft.fsnWindowDays) && Number(draft.fsnWindowDays) >= 1, MIN1)
  const pctOk = (v: unknown) => String(v) !== '' && Number(v) >= 0 && Number(v) <= 100
  need('fsnBands', pctOk(draft.fsnFastPct) && pctOk(draft.fsnSlowPct), t('Enter a percentage from 0 to 100.'))
  need('fsnBands', fsnBandsOk.value, t('Fast must be higher than Slow'))

  return Object.keys(fieldErrors).length === 0
}

function numericMap(map: Record<string, unknown>, floor: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(map)
      .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
      .map(([k, v]) => [k, Math.max(floor, Number(v))]),
  )
}

function save() {
  formError.value = ''
  if (!validate()) {
    formError.value = t('Fix the highlighted fields to save.')
    return
  }

  const next: ReplenishmentConfig = {
    ...draft,
    safetyDaysGlobal: Number(draft.safetyDaysGlobal),
    lookbackDays: Number(draft.lookbackDays),
    coverageDaysGlobal: Number(draft.coverageDaysGlobal),
    coldStartMinDays: Number(draft.coldStartMinDays),
    fsnWindowDays: Number(draft.fsnWindowDays),
    fsnFastPct: Number(draft.fsnFastPct),
    fsnSlowPct: Number(draft.fsnSlowPct),
    volatileCvThreshold: Number(draft.volatileCvThreshold),
    fallbackLeadTimeDays: draft.fallbackLeadTimeDays === null ? null : Number(draft.fallbackLeadTimeDays),
    leadTimeSampleCount: Number(draft.leadTimeSampleCount),
    leadTimeMinSamples: Number(draft.leadTimeMinSamples),
    leadTimeOutlierCapDays: Number(draft.leadTimeOutlierCapDays),
    safetyDaysByCategory: numericMap(draft.safetyDaysByCategory, 0),
    coverageDaysByCategory: numericMap(draft.coverageDaysByCategory, 0),
    leadTimeByCategory: numericMap(draft.leadTimeByCategory, 1),
    leadTimeOutlierCapByCategory: numericMap(draft.leadTimeOutlierCapByCategory, 1),
  }

  // Submitting: the one allowed lock (loading) while the worklist recalculates.
  saving.value = true
  setTimeout(() => {
    try {
      saveReplenishmentConfig(next)
      // Settings only bite on the next recalculation, so run one now rather than
      // leaving the worklist showing numbers from the old policy.
      invalidateReplenishmentCaches()
      recalculateReplenishment('all')
    } catch {
      // Save error: inline, and every edit stays in the form.
      saving.value = false
      formError.value = t('Settings could not be saved. Try again.')
      return
    }
    committed.value = next
    removedCategories.clear()
    extraCategories.length = 0
    clearFieldErrors()
    isEditing.value = false
    saving.value = false
    toast.notify({
      variant: 'success',
      title: t('Replenishment settings saved'),
      description: t('The worklist has been recalculated.'),
      maxWidth: 'max-content',
    })
  }, 300)
}

// ── Unsaved changes ──────────────────────────────────────────────────────────
// Every route under this app is the catch-all [...slug] page, so leaving for the
// worklist is a route UPDATE, not a leave — guard both.
const leaveConfirmOpen = ref(false)
let pendingRoute: RouteLocationRaw | null = null

function guard(to: { fullPath: string }) {
  if (!isDirty.value) return true
  pendingRoute = to.fullPath
  leaveConfirmOpen.value = true
  return false
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)

function discardAndLeave() {
  cancel()
  const to = pendingRoute
  pendingRoute = null
  if (to) router.push(to)
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

function goToWorklist() { router.push('/replenishment') }
</script>

<template>
  <div class="rs-page">
    <!-- ── Title bar (docs/patterns/page-title-bar.md, settings variant) ── -->
    <div class="rs-titlebar">
      <div class="rs-titlebar-left">
        <MpTextlink id="rs-breadcrumb" as="a" class="rs-breadcrumb" @click.prevent="goToWorklist">{{ t('Replenishment') }}</MpTextlink>
        <h1 class="rs-title">{{ t('Replenishment settings') }}</h1>
      </div>
      <div class="rs-titlebar-right">
        <!-- Permission state: read-only, said once, next to the title. -->
        <MpBadge v-if="!canEdit" for="additionalInformation" type="announcement">{{ t('View only') }}</MpBadge>
        <MpButton v-else-if="!isEditing" variant="secondary" is-rounded @click="startEdit">{{ t('Edit') }}</MpButton>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="rs-stage">
      <div class="rs-content">
        <p v-if="!canEdit" class="rs-caption">{{ t('Only an admin can change replenishment settings.') }}</p>

        <!-- ── Product categories ── -->
        <section class="rs-section">
          <h2 class="rs-section-title">{{ t('Product categories') }}</h2>
          <MpFormControl id="rs-categories-fc" class="rs-row">
            <div class="rs-label">
              <MpFormLabel>{{ t('Categories with their own defaults') }}</MpFormLabel>
              <span class="rs-caption">{{ t('Anything not listed uses Other categories.') }}</span>
            </div>
            <div class="rs-control">
              <!-- rule/select-multi-mpinputtag — the list IS a multi-select. -->
              <MpInputTag
                v-if="isEditing"
                id="rs-categories"
                class="rs-field-wide"
                :key="categoryTagsKey"
                :data="categoryTags"
                :suggestions="productCategories"
                :is-show-suggestions="true"
                :is-enable-create-new-tag="false"
                :is-show-icon-chevron-down="true"
                @change="onCategoryTagsChange"
              />
              <span v-else class="rs-value">
                {{ categories.length ? categories.join(', ') : t('None — every category uses Other categories') }}
              </span>
            </div>
          </MpFormControl>
        </section>

        <!-- ── Demand ── -->
        <section class="rs-section">
          <h2 class="rs-section-title">{{ t('Demand') }}</h2>

          <MpFormControl id="rs-lookback-fc" class="rs-row" :is-invalid="!!fieldErrors.lookback">
            <div class="rs-label">
              <MpFormLabel>{{ t('Lookback window') }}</MpFormLabel>
              <span class="rs-caption">{{ t('How far back sales are averaged to get demand per day.') }}</span>
            </div>
            <div class="rs-control">
              <MpInputGroup v-if="isEditing" id="rs-lookback">
                <MpInput id="rs-lookback-input" v-model="draft.lookbackDays" type="number" :class="css({ width: '128px' })" />
                <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
              <span v-else class="rs-value">{{ days(committed.lookbackDays) }}</span>
              <MpFormErrorMessage v-if="fieldErrors.lookback">{{ fieldErrors.lookback }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <MpFormControl id="rs-cv-fc" class="rs-row" :is-invalid="!!fieldErrors.volatility">
            <div class="rs-label">
              <MpFormLabel>{{ t('Volatility threshold') }}</MpFormLabel>
              <span class="rs-caption">
                {{ t('When a product\'s day-to-day sales vary more than this (coefficient of variation), it is tagged "Volatile demand" in the worklist\'s Signals column and its spikes are damped in the average. Raise it to flag fewer products.') }}
              </span>
            </div>
            <div class="rs-control">
              <MpInput v-if="isEditing" id="rs-cv" v-model="draft.volatileCvThreshold" type="number" step="0.1" :class="css({ width: '128px' })" />
              <span v-else class="rs-value">{{ committed.volatileCvThreshold }}</span>
              <MpFormErrorMessage v-if="fieldErrors.volatility">{{ fieldErrors.volatility }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <MpFormControl id="rs-coldstart-fc" class="rs-row" :is-invalid="!!fieldErrors.coldstart">
            <div class="rs-label">
              <MpFormLabel>{{ t('Cold-start threshold') }}</MpFormLabel>
              <span class="rs-caption">
                {{ t('Days after a product\'s first sale during which it counts as a launch: it is tagged "Provisional" in the worklist and its order is held to the reorder point (no extra coverage). After this it graduates to the normal average automatically.') }}
              </span>
            </div>
            <div class="rs-control">
              <MpInputGroup v-if="isEditing" id="rs-coldstart">
                <MpInput id="rs-coldstart-input" v-model="draft.coldStartMinDays" type="number" :class="css({ width: '128px' })" />
                <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
              <span v-else class="rs-value">{{ days(committed.coldStartMinDays) }}</span>
              <MpFormErrorMessage v-if="fieldErrors.coldstart">{{ fieldErrors.coldstart }}</MpFormErrorMessage>
            </div>
          </MpFormControl>
        </section>

        <!-- ── Safety days ──
          One list per policy, with the company fallback ("Other categories") as its
          LAST row, so "what does anything not listed use?" answers itself. -->
        <section class="rs-section">
          <h2 class="rs-section-title">{{ t('Safety days') }}</h2>

          <MpFormControl id="rs-safety-fc" class="rs-row" :is-invalid="!!fieldErrors.safety">
            <div class="rs-label">
              <MpFormLabel>{{ t('Safety days default') }}</MpFormLabel>
              <span class="rs-caption">{{ t('Extra days of cover on top of the vendor lead time. Leave a category blank and it uses Other categories.') }}</span>
              <span v-if="safetyOverrides > 0" class="rs-caption rs-caption--warning">
                {{ tf('{n} warehouse or product overrides keep their own safety days when you change this.', { n: safetyOverrides }) }}
              </span>
            </div>
            <div class="rs-control">
              <div class="rs-cat-grid">
                <div v-for="cat in categories" :key="cat" class="rs-cat-row">
                  <span class="rs-cat-name">{{ cat }}</span>
                  <!-- Own MpFormControl so this input keeps a unique id (a row-level one would give every input in the row the same id). -->
                  <MpFormControl v-if="isEditing" :id="`rs-safety-cat-${cat}-fc`" class="rs-inline-fc" :is-invalid="!!fieldErrors.safety">
                    <MpInputGroup :id="`rs-safety-cat-${cat}`">
                      <MpInput :id="`rs-safety-cat-input-${cat}`" v-model="draft.safetyDaysByCategory[cat]" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ catDays(committed.safetyDaysByCategory, cat, committed.safetyDaysGlobal) }}</span>
                </div>
                <div class="rs-cat-row rs-cat-row--fallback">
                  <span class="rs-cat-name rs-cat-name--fallback">{{ t('Other categories') }}</span>
                  <MpFormControl v-if="isEditing" id="rs-safety-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.safety">
                    <MpInputGroup id="rs-safety">
                      <MpInput id="rs-safety-input" v-model="draft.safetyDaysGlobal" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ days(committed.safetyDaysGlobal) }}</span>
                </div>
              </div>
              <MpFormErrorMessage v-if="fieldErrors.safety">{{ fieldErrors.safety }}</MpFormErrorMessage>
            </div>
          </MpFormControl>
        </section>

        <!-- ── Reorder point & coverage ──
          There is deliberately NO "default min. stock" field (D16/D17): min stock is a
          derived OUTPUT — demand × (lead + safety) — never a typed-in default. -->
        <section class="rs-section">
          <h2 class="rs-section-title">{{ t('Reorder point & coverage') }}</h2>

          <MpFormControl id="rs-coverage-fc" class="rs-row" :is-invalid="!!fieldErrors.coverage">
            <div class="rs-label">
              <MpFormLabel>{{ t('Order coverage') }}</MpFormLabel>
              <span class="rs-caption">{{ t('How many days of demand each order should cover. Sizes the quantity — it never decides whether a product is due. Leave a category blank and it uses Other categories.') }}</span>
            </div>
            <div class="rs-control">
              <div class="rs-cat-grid">
                <div v-for="cat in categories" :key="cat" class="rs-cat-row">
                  <span class="rs-cat-name">{{ cat }}</span>
                  <MpFormControl v-if="isEditing" :id="`rs-coverage-cat-${cat}-fc`" class="rs-inline-fc" :is-invalid="!!fieldErrors.coverage">
                    <MpInputGroup :id="`rs-coverage-cat-${cat}`">
                      <MpInput :id="`rs-coverage-cat-input-${cat}`" v-model="draft.coverageDaysByCategory[cat]" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ catDays(committed.coverageDaysByCategory, cat, committed.coverageDaysGlobal) }}</span>
                </div>
                <div class="rs-cat-row rs-cat-row--fallback">
                  <span class="rs-cat-name rs-cat-name--fallback">{{ t('Other categories') }}</span>
                  <MpFormControl v-if="isEditing" id="rs-coverage-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.coverage">
                    <MpInputGroup id="rs-coverage">
                      <MpInput id="rs-coverage-input" v-model="draft.coverageDaysGlobal" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ days(committed.coverageDaysGlobal) }}</span>
                </div>
              </div>
              <MpFormErrorMessage v-if="fieldErrors.coverage">{{ fieldErrors.coverage }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <MpFormControl id="rs-boundary-fc" class="rs-row">
            <div class="rs-label">
              <MpFormLabel>{{ t('Reorder-point boundary') }}</MpFormLabel>
              <span class="rs-caption">{{ t('Whether a product sitting exactly at its reorder point appears in the worklist.') }}</span>
            </div>
            <div class="rs-control">
              <!-- Same fixed width as the categories tag input (docs/patterns/settings-page.md). -->
              <ErpFilterSelect
                v-if="isEditing"
                id="rs-boundary"
                :model-value="draft.reorderBoundary"
                :placeholder="t('Reorder-point boundary')"
                :options="BOUNDARY_OPTIONS.map((o) => ({ value: o.id, label: t(o.name) }))"
                width="var(--rs-field-width)"
                :is-clearable="false"
                @update:model-value="(v: string) => { draft.reorderBoundary = v as ReplenishmentConfig['reorderBoundary'] }"
              />
              <span v-else class="rs-value">{{ boundaryLabel }}</span>
            </div>
          </MpFormControl>
        </section>

        <!-- ── Lead time (US-001) ── -->
        <section id="lead-time" class="rs-section">
          <h2 class="rs-section-title">{{ t('Lead time') }}</h2>

          <MpFormControl id="rs-lead-fc" class="rs-row" :is-invalid="!!fieldErrors.lead">
            <div class="rs-label">
              <MpFormLabel>{{ t('Default lead time') }}</MpFormLabel>
              <span class="rs-caption">{{ t('Lead time is measured from each vendor\'s delivered purchase orders. This default applies only when there is not enough history to measure. Leave a category blank and it uses Other categories.') }}</span>
            </div>
            <div class="rs-control">
              <div class="rs-cat-grid">
                <div v-for="cat in categories" :key="cat" class="rs-cat-row">
                  <span class="rs-cat-name">{{ cat }}</span>
                  <MpFormControl v-if="isEditing" :id="`rs-lead-cat-${cat}-fc`" class="rs-inline-fc" :is-invalid="!!fieldErrors.lead">
                    <MpInputGroup :id="`rs-lead-cat-${cat}`">
                      <MpInput :id="`rs-lead-cat-input-${cat}`" v-model="draft.leadTimeByCategory[cat]" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ catDays(committed.leadTimeByCategory, cat, committed.fallbackLeadTimeDays) }}</span>
                </div>
                <div class="rs-cat-row rs-cat-row--fallback">
                  <span class="rs-cat-name rs-cat-name--fallback">{{ t('Other categories') }}</span>
                  <!-- The only floor that accepts "Not set" (D22): a number is an estimate;
                       "Not set" makes products with no measured lead time wait in Needs setup.
                       Rendered as a distinct empty state, never a typed 0. -->
                  <template v-if="isEditing">
                    <template v-if="draft.fallbackLeadTimeDays !== null">
                      <MpFormControl id="rs-fallback-lead-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.lead">
                        <MpInputGroup id="rs-fallback-lead">
                          <MpInput id="rs-fallback-lead-input" v-model="draft.fallbackLeadTimeDays" type="number" :class="css({ width: '128px' })" />
                          <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                        </MpInputGroup>
                      </MpFormControl>
                      <MpButton variant="ghost" is-rounded @click="floorSetNotSet">{{ t('Use Not set') }}</MpButton>
                    </template>
                    <template v-else>
                      <span class="rs-notset">{{ t('Not set') }}</span>
                      <MpButton variant="ghost" is-rounded @click="floorSetNumber">{{ t('Set a number') }}</MpButton>
                    </template>
                  </template>
                  <span v-else-if="committed.fallbackLeadTimeDays !== null" class="rs-value">{{ days(committed.fallbackLeadTimeDays) }}</span>
                  <span v-else class="rs-notset">{{ t('Not set') }}</span>
                </div>
              </div>
              <span v-if="(isEditing ? draft : committed).fallbackLeadTimeDays === null" class="rs-caption rs-notset-hint">
                {{ t('Not set: a product with no measured lead time and no preferred vendor waits in Needs setup instead of getting an estimate. It still raises a stockout alert if it runs low.') }}
              </span>
              <MpFormErrorMessage v-if="fieldErrors.lead">{{ fieldErrors.lead }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <!-- Two numbers, one range: a measured lead time averages the most recent
               receipts, and needs a minimum before it is trusted. -->
          <MpFormControl id="rs-receipts-fc" class="rs-row" :is-invalid="!!fieldErrors.receipts">
            <div class="rs-label">
              <MpFormLabel>{{ t('Receipts to average') }}</MpFormLabel>
              <span class="rs-caption">{{ t('A measured lead time averages a vendor product\'s most recent delivered orders — at most the maximum, and at least the minimum before it\'s trusted. Fewer than the minimum falls back to the default lead time above.') }}</span>
            </div>
            <div class="rs-control">
              <div v-if="isEditing" class="rs-cat-grid">
                <div class="rs-cat-row">
                  <span class="rs-cat-name">{{ t('Minimum') }}</span>
                  <MpFormControl id="rs-lead-min-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.receipts">
                    <MpInputGroup id="rs-lead-min">
                      <MpInput id="rs-lead-min-input" v-model="draft.leadTimeMinSamples" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('receipts') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                </div>
                <div class="rs-cat-row">
                  <span class="rs-cat-name">{{ t('Maximum') }}</span>
                  <MpFormControl id="rs-lead-samples-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.receipts">
                    <MpInputGroup id="rs-lead-samples">
                      <MpInput id="rs-lead-samples-input" v-model="draft.leadTimeSampleCount" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('receipts') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                </div>
              </div>
              <span v-else class="rs-value">
                {{ tf('The {min} to {max} most recent receipts', { min: committed.leadTimeMinSamples, max: committed.leadTimeSampleCount }) }}
              </span>
              <MpFormErrorMessage v-if="fieldErrors.receipts">{{ fieldErrors.receipts }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <MpFormControl id="rs-cap-fc" class="rs-row" :is-invalid="!!fieldErrors.cap">
            <div class="rs-label">
              <MpFormLabel>{{ t('Ignore gaps over') }}</MpFormLabel>
              <span class="rs-caption">{{ t('A gap between a purchase order and its receipt longer than this is dropped as an outlier, so one abnormal delivery cannot distort the average. Leave a category blank and it uses Other categories.') }}</span>
            </div>
            <div class="rs-control">
              <div class="rs-cat-grid">
                <div v-for="cat in categories" :key="cat" class="rs-cat-row">
                  <span class="rs-cat-name">{{ cat }}</span>
                  <MpFormControl v-if="isEditing" :id="`rs-cap-cat-${cat}-fc`" class="rs-inline-fc" :is-invalid="!!fieldErrors.cap">
                    <MpInputGroup :id="`rs-cap-cat-${cat}`">
                      <MpInput :id="`rs-cap-cat-input-${cat}`" v-model="draft.leadTimeOutlierCapByCategory[cat]" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ catDays(committed.leadTimeOutlierCapByCategory, cat, committed.leadTimeOutlierCapDays) }}</span>
                </div>
                <div class="rs-cat-row rs-cat-row--fallback">
                  <span class="rs-cat-name rs-cat-name--fallback">{{ t('Other categories') }}</span>
                  <MpFormControl v-if="isEditing" id="rs-cap-fallback-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.cap">
                    <MpInputGroup id="rs-cap-fallback">
                      <MpInput id="rs-cap-fallback-input" v-model="draft.leadTimeOutlierCapDays" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ days(committed.leadTimeOutlierCapDays) }}</span>
                </div>
              </div>
              <MpFormErrorMessage v-if="fieldErrors.cap">{{ fieldErrors.cap }}</MpFormErrorMessage>
            </div>
          </MpFormControl>
        </section>

        <!-- ── Movement classification (FSN) ── -->
        <section class="rs-section">
          <h2 class="rs-section-title">{{ t('Movement classification (FSN)') }}</h2>

          <MpFormControl id="rs-fsn-window-fc" class="rs-row" :is-invalid="!!fieldErrors.fsnWindow">
            <div class="rs-label">
              <MpFormLabel>{{ t('Classification window') }}</MpFormLabel>
              <span class="rs-caption">{{ t('How much history the classification looks at.') }}</span>
            </div>
            <div class="rs-control">
              <MpInputGroup v-if="isEditing" id="rs-fsn-window">
                <MpInput id="rs-fsn-window-input" v-model="draft.fsnWindowDays" type="number" :class="css({ width: '128px' })" />
                <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
              <span v-else class="rs-value">{{ days(committed.fsnWindowDays) }}</span>
              <MpFormErrorMessage v-if="fieldErrors.fsnWindow">{{ fieldErrors.fsnWindow }}</MpFormErrorMessage>
            </div>
          </MpFormControl>

          <MpFormControl id="rs-fsn-bands-fc" class="rs-row" :is-invalid="!!fieldErrors.fsnBands">
            <div class="rs-label">
              <MpFormLabel>{{ t('Class thresholds') }}</MpFormLabel>
              <span class="rs-caption">{{ t('Share of days with movement. Fast at or above the first, Slow at or above the second, Non-moving below it.') }}</span>
            </div>
            <div class="rs-control">
              <div class="rs-cat-grid">
                <div class="rs-cat-row">
                  <span class="rs-cat-name">{{ t('Fast') }}</span>
                  <MpFormControl v-if="isEditing" id="rs-fast-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.fsnBands">
                    <MpInputGroup id="rs-fast">
                      <MpInput id="rs-fast-input" v-model="draft.fsnFastPct" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ tf('{pct}% or more', { pct: committed.fsnFastPct }) }}</span>
                </div>
                <div class="rs-cat-row">
                  <span class="rs-cat-name">{{ t('Slow') }}</span>
                  <MpFormControl v-if="isEditing" id="rs-slow-fc" class="rs-inline-fc" :is-invalid="!!fieldErrors.fsnBands">
                    <MpInputGroup id="rs-slow">
                      <MpInput id="rs-slow-input" v-model="draft.fsnSlowPct" type="number" :class="css({ width: '128px' })" />
                      <MpInputRightAddon has-background>%</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>
                  <span v-else class="rs-value">{{ tf('{pct}% or more', { pct: committed.fsnSlowPct }) }}</span>
                </div>
              </div>
              <MpFormErrorMessage v-if="fieldErrors.fsnBands">{{ fieldErrors.fsnBands }}</MpFormErrorMessage>
            </div>
          </MpFormControl>
        </section>
      </div>

      <!-- ── Footer — only while editing (rule/btn-responsive-footer) ── -->
      <div v-if="isEditing" class="rs-footer">
        <p v-if="formError" class="rs-footer-error">{{ formError }}</p>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="resetToDefaults">{{ t('Reset to defaults') }}</MpButton>
          <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="saving" @click="save">{{ t('Save changes') }}</MpButton>
        </MpButtonGroup>
      </div>
    </div>

    <!-- Removing a category clears its defaults from EVERY row — confirm the loss. -->
    <ConfirmModal
      :is-open="removeConfirmOpen"
      :title="t('Remove category?')"
      :description="t('This clears its safety days, order coverage, lead time and gap-cap defaults. Products in this category will use Other categories. You can add it again later.')"
      :confirm-label="t('Remove category')"
      :cancel-label="t('Keep category')"
      @update:is-open="(v: boolean) => { removeConfirmOpen = v; if (!v) categoryTagsKey++ }"
      @confirm="confirmRemove"
    />

    <!-- Unsaved changes: leaving mid-edit never silently loses the draft. -->
    <ConfirmModal
      :is-open="leaveConfirmOpen"
      :title="t('Discard unsaved changes?')"
      :description="t('Your changes to the replenishment settings have not been saved.')"
      :confirm-label="t('Discard changes')"
      :cancel-label="t('Keep editing')"
      @update:is-open="(v: boolean) => { leaveConfirmOpen = v }"
      @confirm="discardAndLeave"
    />
  </div>
</template>

<style scoped>
/* Owns its layout (detailMatch): title bar + scrolling stage, as
   ConfigureWarehousePage — docs/patterns/settings-page.md. */
.rs-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.rs-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.rs-titlebar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.rs-titlebar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.rs-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.rs-breadcrumb:hover { text-decoration: underline; text-underline-offset: var(--mp-spacing-0\.5, 2px); }
.rs-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

.rs-stage {
  flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
}
.rs-content {
  flex: 1; width: 100%; max-width: var(--rs-content-max, 900px);
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}

/* Sections: H2 (rule/type-scale — xl/20, semibold), separated by a divider. */
.rs-section { display: flex; flex-direction: column; }
.rs-section + .rs-section { padding-top: var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.rs-section-title {
  margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px);
  color: var(--mp-text-default);
}

/* Settings row: label + caption | control. */
.rs-row {
  display: grid !important; grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: var(--mp-spacing-6); padding: var(--mp-spacing-3) 0; align-items: start;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rs-section .rs-row:last-child { border-bottom: none; }
.rs-label { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.rs-label :deep(label) { margin: 0; }
.rs-page { --rs-field-width: 320px; }
.rs-field-wide { width: var(--rs-field-width) !important; max-width: 100%; }
.rs-control { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.rs-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rs-caption--warning { color: var(--mp-colors-text-warning); }
.rs-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Per-category grid: one row per listed category, "Other categories" last. */
.rs-cat-grid { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rs-cat-row { display: flex; align-items: center; gap: var(--mp-spacing-2); min-height: var(--mp-sizes-9, 36px); }
.rs-cat-row--fallback { margin-top: var(--mp-spacing-1); padding-top: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.rs-cat-name { flex: 0 0 var(--mp-sizes-40, 160px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rs-cat-name--fallback { color: var(--mp-text-secondary); }

/* Lead-time floor "Not set" (D22) — a distinct empty state, never a typed 0. */
.rs-notset {
  display: inline-flex; align-items: center; height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3); border-radius: var(--mp-radii-md);
  border: 1px dashed var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.rs-notset-hint { max-width: var(--mp-sizes-100, 420px); }

/* Sticky footer while editing — no divider above it (Form.md › Action group).
   Its own stacking layer: input addons create stacking contexts and would
   otherwise paint over the footer as the rows scroll beneath it. */
.rs-footer {
  position: sticky; bottom: 0; z-index: 2; flex-shrink: 0; isolation: isolate;
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #ffffff);
}
.rs-footer-error { flex: 1; margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
.rs-inline-fc { width: auto !important; }
/* An input group hugs its input so the unit suffix sits right beside it, and the
   suffix gets real breathing room instead of hugging its text. */
.rs-control :deep(.mp-input-group__root) { width: fit-content; }
.rs-control :deep(.mp-input-addon__root) { padding: 0 var(--mp-spacing-3); }
</style>
