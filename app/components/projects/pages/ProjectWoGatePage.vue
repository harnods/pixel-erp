<script setup lang="ts">
/**
 * New work order on a project — the budget gate before the form (PRD §5, D7;
 * Stories 3, 18).
 *
 * Step 1: Project + Work package → Total budget production (the Cost of
 * production line), Committed, Available. Total − Committed = Available holds
 * on screen, and the gate uses the same Available it displays. "Budget for
 * this work order" is required before step 2. Over Available → red verdict,
 * difference stated, forward action withheld — phase 1 lets the PM continue
 * only with a reason (held for Finance above the threshold), or deep-link into
 * Budget setup and come back.
 *
 * Step 2: header shows Budget set aside and Allocated to lines. A Budget
 * column on components and on Labor / Overhead / Other, suggested from the
 * estimate, editable, with the difference shown beneath. Line budgets may not
 * exceed the set-aside. What's committed is the set-aside, not the estimate.
 */
import {
  MpButton, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpTextarea, MpProgress, MpTextlink,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { projects, getProject, projectWorkPackages, getWorkPackage } from '~/data/projects'
import { getBudget } from '~/data/projectBudgets'
import { woGate, effectiveThreshold, type ProjectWoLine } from '~/data/projectTransactions'
import { getCustomBom, currentVersion } from '~/data/projectBoms'
import { engineeringChanges } from '~/data/projectChanges'
import { suggestWoLines, createProjectWo, fitLineBudgets } from '~/data/projectActions'
import { rp, rpSigned, pct, parseAmount, num } from '~/utils/projectFormat'

const props = defineProps<{ projectId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()
const step1Action = useProjectAction()
const saveAction = useProjectAction()

const projectSel = ref(props.projectId)
const project = computed(() => getProject(projectSel.value))
const productionProjects = computed(() => projects.filter(p => p.isProduction && p.status !== 'closed'))
const wpOptions = computed(() => (project.value ? projectWorkPackages(project.value.id).filter(w => w.type === 'production') : []))
const projectOptions = computed(() => productionProjects.value.map(p => ({ value: p.id, label: `${p.code} · ${p.name}` })))
const wpSelectOptions = computed(() => wpOptions.value.map(w => ({ value: w.id, label: `${w.code} ${w.name}` })))
function setProject(v: string) { if (v) projectSel.value = v }
const wpSel = ref(typeof route.query.wp === 'string' ? route.query.wp : '')
watch(projectSel, () => { wpSel.value = '' })
const wp = computed(() => (wpSel.value ? getWorkPackage(wpSel.value) : undefined))
const bom = computed(() => getCustomBom(wp.value?.customBomId))
// OQ21 (provisional): "new work orders only" means created after ECO approval — warn when an ECO is still pending.
const pendingEco = computed(() => (bom.value ? engineeringChanges.find(e => e.customBomId === bom.value!.id && e.status === 'pending') : undefined))

const gate = computed(() => (wp.value ? woGate(wp.value.id) : undefined))
const setAsideStr = ref('')
const setAside = computed(() => parseAmount(setAsideStr.value))
const remainingUnits = computed(() => Math.max((wp.value?.plannedUnits ?? 0) - (wp.value?.confirmedUnits ?? 0), 0))
const qtyStr = ref('')
watch(wp, w => { qtyStr.value = w ? String(Math.max((w.plannedUnits ?? 0) - (w.confirmedUnits ?? 0), 0) || '') : '' }, { immediate: true })
const qty = computed(() => parseAmount(qtyStr.value))

const over = computed(() => (gate.value?.available === undefined ? 0 : Math.max(setAside.value - gate.value.available, 0)))
const overPct = computed(() => (gate.value?.total ? (over.value / gate.value.total) * 100 : 0))
const threshold = computed(() => (project.value ? effectiveThreshold(project.value.id) : 20))
const willHold = computed(() => over.value > 0 && overPct.value > threshold.value)
const overrideReason = ref('')

const step1Block = computed(() => {
  if (!project.value) return t('Pick a project.')
  if (!wp.value) return t('Pick a work package.')
  if (!getBudget(project.value.id) || gate.value?.total === undefined) return t('This work package has no Cost of production budget. Set it in Budget setup first.')
  if (!qty.value) return t('Enter the quantity to produce.')
  if (!setAside.value) return t('Enter the budget for this work order to continue.')
  if (over.value && !overrideReason.value.trim()) return t('Over available — enter a reason to continue, or add budget first.')
  return ''
})

const step = ref(1)
const lines = ref<(ProjectWoLine & { budgetStr: string })[]>([])
function toStep2() {
  if (step1Block.value) { step1Action.fail(step1Block.value); return }
  step1Action.clear()
  // Suggested line budgets never exceed the set-aside (Story 18) — same rule the ECO approval applies.
  lines.value = fitLineBudgets(suggestWoLines(wp.value!.customBomId, qty.value), setAside.value)
    .map(l => ({ ...l, budgetStr: l.budget.toLocaleString('id-ID') }))
  step.value = 2
}
function lineBudget(l: { budgetStr: string }) { return parseAmount(l.budgetStr) }
const allocated = computed(() => lines.value.reduce((s, l) => s + lineBudget(l), 0))
const estimateTotal = computed(() => lines.value.reduce((s, l) => s + l.estimate, 0))
const excess = computed(() => Math.max(allocated.value - setAside.value, 0))
const groups = computed(() => [
  { key: 'material', title: t('Product components'), rows: lines.value.filter(l => l.kind === 'material') },
  { key: 'labor', title: t('Labor'), rows: lines.value.filter(l => l.kind === 'labor') },
  { key: 'overhead', title: t('Overhead'), rows: lines.value.filter(l => l.kind === 'overhead') },
  { key: 'other', title: t('Other production cost'), rows: lines.value.filter(l => l.kind === 'other') },
].filter(g => g.rows.length))

const saveTried = ref(false)
function save() {
  saveTried.value = true
  if (excess.value) { saveAction.fail(`${t('Line budgets total')} ${rp(allocated.value)} — ${rp(excess.value)} ${t('over the budget set aside. Reduce line budgets to save.')}`); return }
  const res = createProjectWo({
    wpId: wp.value!.id, qty: qty.value, budgetSetAside: setAside.value,
    lines: lines.value.map(({ budgetStr, ...l }) => ({ ...l, budget: parseAmount(budgetStr) })),
    overrideReason: over.value ? overrideReason.value : undefined,
  }, asActor.value)
  if (saveAction.run(res)) router.push(`/projects/${project.value!.id}?tab=budget`)
}

function budgetSetupLink() {
  const back = encodeURIComponent(route.fullPath)
  return `/budget-setup/${project.value!.id}?returnTo=${back}&wp=${wp.value!.id}&need=${over.value}&doc=${encodeURIComponent(t('New work order'))}`
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('New work order')" :breadcrumb="{ label: project ? `${project.code} · ${project.name}` : t('Projects'), to: project ? `/projects/${project.id}?tab=budget` : '/projects' }" />
    <div class="pm-stage">
      <div class="pm-medium">
        <div class="pm-steps">
          <div class="pm-step" :class="{ 'pm-step--active': step === 1 }"><span class="pm-step-num">1</span>{{ t('Budget check') }}</div>
          <span class="pm-step-line" />
          <div class="pm-step" :class="{ 'pm-step--active': step === 2 }"><span class="pm-step-num">2</span>{{ t('Work order details') }}</div>
        </div>

        <!-- ── Step 1 ── -->
        <div v-if="step === 1" class="pm-stack pm-gap-5">
          <div class="pm-grid-3">
            <MpFormControl id="wg-p-fc" is-required>
              <MpFormLabel>{{ t('Project') }}</MpFormLabel>
              <ErpFilterSelect id="wg-p" :model-value="projectSel" :placeholder="t('Select project')" :options="projectOptions" width="100%" :is-clearable="false" @update:model-value="setProject" />
            </MpFormControl>
            <MpFormControl id="wg-wp-fc" is-required>
              <MpFormLabel>{{ t('Work package') }}</MpFormLabel>
              <ErpFilterSelect id="wg-wp" v-model="wpSel" :placeholder="t('Select work package')" :options="wpSelectOptions" width="100%" :is-clearable="false" />
              <MpFormHelpText v-if="wp">{{ bom ? `${bom.name} v${currentVersion(bom).version}` : t('No BOM — lines will be empty') }} · {{ wp.confirmedUnits ?? 0 }}/{{ wp.plannedUnits ?? 0 }} {{ wp.unit }} {{ t('confirmed') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="wg-q-fc" is-required>
              <MpFormLabel>{{ t('Quantity to produce') }}</MpFormLabel>
              <MpInputGroup id="wg-q-group">
                <MpInput id="wg-q" v-model="qtyStr" inputmode="numeric" />
                <MpInputRightAddon has-background>{{ wp?.unit ?? t('Unit') }}</MpInputRightAddon>
              </MpInputGroup>
              <MpFormHelpText v-if="wp">{{ remainingUnits }} {{ t('remaining') }}</MpFormHelpText>
            </MpFormControl>
          </div>

          <MpBanner v-if="pendingEco" id="wg-pending-eco" variant="warning">
            <MpBannerIcon /><MpBannerDescription>{{ pendingEco.no }} {{ t('is pending on this BOM. If it’s approved for new work orders only, this work order won’t get the change — it was created before approval.') }}</MpBannerDescription>
          </MpBanner>
          <MpBanner v-if="project?.status === 'draft'" id="wg-draft" variant="info">
            <MpBannerIcon /><MpBannerDescription>{{ t('This project is still Draft — the work order is saved as Draft and commits nothing until the project is approved.') }}</MpBannerDescription>
          </MpBanner>

          <div v-if="wp && gate" class="pm-card">
            <MpBanner v-if="gate.total === undefined" id="wg-no-budget" variant="warning">
              <MpBannerIcon />
              <MpBannerDescription>
                {{ t('Cost of production budget is not set on this work package.') }}
                <MpTextlink id="wg-set-budget" as="a" @click.prevent="router.push(`/budget-setup/${project!.id}?returnTo=${encodeURIComponent(route.fullPath)}&wp=${wp.id}`)">{{ t('Set it in Budget setup') }}</MpTextlink>
              </MpBannerDescription>
            </MpBanner>
            <template v-else>
              <div class="pm-row pm-row--nowrap pm-gap-1">
                <div class="pm-grow">
                  <div class="pm-stat-label">{{ t('Total budget production') }}</div>
                  <div class="pm-stat-value">{{ rp(gate.total) }}</div>
                  <div class="pm-stat-note">{{ t('Cost of production line') }}</div>
                </div>
                <div class="pm-stat-op">−</div>
                <div class="pm-grow">
                  <div class="pm-stat-label">{{ t('Committed') }}</div>
                  <div class="pm-stat-value">{{ rp(gate.committed) }}</div>
                  <div class="pm-stat-note">{{ t('Open work-order set-asides + consumed') }}</div>
                </div>
                <div class="pm-stat-op">=</div>
                <div class="pm-grow">
                  <div class="pm-stat-label">{{ t('Available') }}</div>
                  <div class="pm-stat-value" :class="{ 'pm-neg': (gate.available ?? 0) < 0 }">{{ rp(gate.available) }}</div>
                  <div class="pm-stat-note">{{ t('What this gate checks against') }}</div>
                </div>
              </div>

              <MpFormControl id="wg-b-fc" is-required class="pm-maxw-field pm-mt-5">
                <MpFormLabel>{{ t('Budget for this work order') }}</MpFormLabel>
                <MpInputGroup id="wg-b-group">
                  <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                  <MpInput id="wg-b" v-model="setAsideStr" inputmode="numeric" @blur="setAsideStr = setAside ? setAside.toLocaleString('id-ID') : ''" />
                </MpInputGroup>
                <MpFormHelpText>{{ t('This amount is set aside on Cost of production — it’s what’s committed, and the work order’s baseline.') }}</MpFormHelpText>
              </MpFormControl>

              <MpBanner v-if="setAside && !over" id="wg-within" variant="info" class="pm-mt-3">
                <MpBannerIcon /><MpBannerDescription>{{ t('Within available.') }} {{ rp((gate.available ?? 0) - setAside) }} {{ t('left after this work order.') }}</MpBannerDescription>
              </MpBanner>
              <div v-else-if="over" class="pm-stack pm-mt-3">
                <MpBanner id="wg-over" variant="danger">
                  <MpBannerIcon />
                  <MpBannerTitle>{{ t('Over available by') }} {{ rp(over) }} ({{ pct(overPct) }} {{ t('of the budget') }})</MpBannerTitle>
                  <MpBannerDescription>
                    <template v-if="willHold">{{ t('Above the') }} {{ pct(threshold) }} {{ t('threshold — if you continue, the work order is held for Finance sign-off and shows in the Approvals inbox.') }}</template>
                    <template v-else>{{ t('Within the') }} {{ pct(threshold) }} {{ t('threshold — you can continue with a reason. The override is recorded.') }}</template>
                    <MpTextlink id="wg-add-budget" as="a" @click.prevent="router.push(budgetSetupLink())">{{ t('Add budget in Budget setup instead') }}</MpTextlink>
                  </MpBannerDescription>
                </MpBanner>
                <MpFormControl id="wg-r-fc" is-required>
                  <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
                  <MpTextarea id="wg-r" v-model="overrideReason" />
                </MpFormControl>
              </div>
            </template>
          </div>

          <PmActionError id="wg-step1-error" :error="step1Action.error.value" />
          <div class="pm-footer">
            <MpButton id="wg-cancel" variant="ghost" is-rounded @click="router.back()">{{ t('Cancel') }}</MpButton>
            <MpButton id="wg-next" variant="primary" is-rounded @click="toStep2">{{ t('Next') }}</MpButton>
          </div>
        </div>

        <!-- ── Step 2 ── -->
        <div v-else class="pm-stack pm-gap-4">
          <div class="pm-card pm-sticky">
            <div class="pm-row pm-gap-6">
              <div><div class="pm-stat-label">{{ t('Project') }} · {{ t('Work package') }}</div><div class="pm-strong">{{ project?.code }} · {{ wp?.code }} {{ wp?.name }}</div></div>
              <span class="pm-spacer" />
              <div><div class="pm-stat-label">{{ t('Budget set aside') }}</div><div class="pm-stat-value pm-stat-value--md">{{ rp(setAside) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Allocated to lines') }}</div><div class="pm-stat-value pm-stat-value--md" :class="excess ? 'pm-neg' : ''">{{ rp(allocated) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Estimate') }}</div><div class="pm-stat-value pm-stat-value--md pm-muted">{{ rp(estimateTotal) }}</div></div>
            </div>
            <MpProgress class="pm-mt-3" :value="String(Math.min(allocated / (setAside || 1) * 100, 100))" size="sm" :color="excess ? 'negative' : 'positive'" />
          </div>

          <MpBanner v-if="!lines.length" id="wg-no-lines" variant="warning">
            <MpBannerIcon /><MpBannerDescription>{{ t('This work package has no BOM, so there are no suggested lines. Attach a BOM on the Structure tab.') }}</MpBannerDescription>
          </MpBanner>

          <section v-for="g in groups" :key="g.key">
            <h3 class="pm-h3 pm-mb-2">{{ g.title }}</h3>
            <div class="pm-table-wrap">
              <table class="pm-table">
                <thead><tr><th>{{ t('Item') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th class="pm-num">{{ t('Estimate') }}</th><th class="pm-num pm-th-mid">{{ t('Budget') }}</th></tr></thead>
                <tbody>
                  <tr v-for="(l, i) in g.rows" :key="i">
                    <td>{{ l.name }}</td>
                    <td class="pm-num">{{ num(l.qty) }}</td>
                    <td>{{ l.unit }}</td>
                    <td class="pm-num">{{ rp(l.unitCost) }}</td>
                    <td class="pm-num">{{ rp(l.estimate) }}</td>
                    <td class="pm-num">
                      <MpInput :id="`wg-line-${g.key}-${i}`" v-model="l.budgetStr" class="pm-w-field" inputmode="numeric" :aria-label="`${t('Budget')} ${l.name}`" @blur="l.budgetStr = lineBudget(l).toLocaleString('id-ID')" />
                      <div class="pm-small" :class="l.estimate > lineBudget(l) ? 'pm-neg' : l.estimate < lineBudget(l) ? 'pm-pos' : 'pm-muted'">
                        {{ l.estimate === lineBudget(l) ? t('Matches estimate') : `${t('vs estimate')} ${rpSigned(lineBudget(l) - l.estimate)}` }}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <MpBanner v-if="over" id="wg-override-note" :variant="willHold ? 'warning' : 'info'">
            <MpBannerIcon /><MpBannerDescription>{{ willHold ? t('This work order will be held for Finance approval.') : t('Budget override recorded with your reason.') }} “{{ overrideReason }}”</MpBannerDescription>
          </MpBanner>

          <PmActionError id="wg-save-error" :error="saveAction.error.value" />
          <div class="pm-footer">
            <MpButton id="wg-back" variant="ghost" is-rounded @click="step = 1">{{ t('Back') }}</MpButton>
            <span class="pm-spacer" />
            <MpButton id="wg-cancel-2" variant="ghost" is-rounded @click="router.back()">{{ t('Cancel') }}</MpButton>
            <MpButton id="wg-save" variant="primary" is-rounded @click="save">{{ willHold ? t('Save and send for approval') : t('Save work order') }}</MpButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
