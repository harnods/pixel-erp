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
import PmTitleBar from '../PmTitleBar.vue'
import { projects, getProject, projectWorkPackages, getWorkPackage } from '~/data/projects'
import { getBudget } from '~/data/projectBudgets'
import { woGate, effectiveThreshold, type ProjectWoLine } from '~/data/projectTransactions'
import { getCustomBom, currentVersion } from '~/data/projectBoms'
import { suggestWoLines, createProjectWo } from '~/data/projectActions'
import { rp, rpSigned, pct, parseAmount, num } from '~/utils/projectFormat'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ projectId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()

const projectSel = ref(props.projectId)
const project = computed(() => getProject(projectSel.value))
const productionProjects = computed(() => projects.filter(p => p.isProduction && p.status !== 'closed'))
const wpOptions = computed(() => (project.value ? projectWorkPackages(project.value.id).filter(w => w.type === 'production') : []))
const wpSel = ref(typeof route.query.wp === 'string' ? route.query.wp : '')
watch(projectSel, () => { wpSel.value = '' })
const wp = computed(() => (wpSel.value ? getWorkPackage(wpSel.value) : undefined))
const bom = computed(() => getCustomBom(wp.value?.customBomId))

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
  if (step1Block.value) return
  lines.value = suggestWoLines(wp.value!.customBomId, qty.value).map(l => ({ ...l, budgetStr: l.budget.toLocaleString('id-ID') }))
  // Suggested line budgets never exceed the set-aside: scale down proportionally when the estimate is higher.
  const est = lines.value.reduce((s, l) => s + l.estimate, 0)
  if (est > setAside.value && est > 0) {
    const f = setAside.value / est
    let acc = 0
    lines.value.forEach((l, i) => {
      const b = i === lines.value.length - 1 ? setAside.value - acc : Math.floor(l.estimate * f)
      acc += b
      l.budget = b
      l.budgetStr = b.toLocaleString('id-ID')
    })
  }
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
  if (excess.value) return
  const res = createProjectWo({
    wpId: wp.value!.id, qty: qty.value, budgetSetAside: setAside.value,
    lines: lines.value.map(({ budgetStr, ...l }) => ({ ...l, budget: parseAmount(budgetStr) })),
    overrideReason: over.value ? overrideReason.value : undefined,
  }, asActor.value)
  if (notifyResult(res)) router.push(`/projects/${project.value!.id}?tab=budget`)
}

function budgetSetupLink() {
  const back = encodeURIComponent(route.fullPath)
  return `/budget-setup/${project.value!.id}?returnTo=${back}&wp=${wp.value!.id}&need=${over.value}&doc=${encodeURIComponent(t('New work order'))}`
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Work order')" :breadcrumb="{ label: project ? `${project.code} · ${project.name}` : t('Projects'), to: project ? `/projects/${project.id}?tab=budget` : '/projects' }" />
    <div class="pm-stage">
      <div style="max-width: 1080px">
        <div class="pm-steps">
          <div class="pm-step" :class="{ 'pm-step--active': step === 1, 'pm-step--done': step > 1 }"><span class="pm-step-num">{{ step > 1 ? '✓' : 1 }}</span>{{ t('Budget check') }}</div>
          <span class="pm-step-line" />
          <div class="pm-step" :class="{ 'pm-step--active': step === 2 }"><span class="pm-step-num">2</span>{{ t('Work order details') }}</div>
        </div>

        <!-- ── Step 1 ── -->
        <div v-if="step === 1" class="pm-stack" style="gap: 18px">
          <div class="pm-grid-3">
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="wg-p">{{ t('Project') }}</label>
              <select id="wg-p" v-model="projectSel" class="pm-select">
                <option v-for="p in productionProjects" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option>
              </select>
            </div>
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="wg-wp">{{ t('Work package') }}</label>
              <select id="wg-wp" v-model="wpSel" class="pm-select">
                <option value="" disabled>{{ t('Select work package') }}</option>
                <option v-for="w in wpOptions" :key="w.id" :value="w.id">{{ w.code }} {{ w.name }}</option>
              </select>
              <span v-if="wp" class="pm-help">{{ bom ? `${bom.name} v${currentVersion(bom).version}` : t('No BOM — lines will be empty') }} · {{ wp.confirmedUnits ?? 0 }}/{{ wp.plannedUnits ?? 0 }} {{ wp.unit }} {{ t('confirmed') }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label pm-label-req" for="wg-q">{{ t('Quantity to produce') }}</label>
              <div class="pm-input-group"><input id="wg-q" v-model="qtyStr" class="pm-input pm-input--num" inputmode="numeric" /><span class="pm-addon">{{ wp?.unit ?? t('Unit') }}</span></div>
              <span v-if="wp" class="pm-help">{{ remainingUnits }} {{ t('remaining') }}</span>
            </div>
          </div>

          <div v-if="project?.status === 'draft'" class="pm-banner pm-banner--info"><div class="pm-banner-body">{{ t('This project is still Draft — the work order is saved as Draft and commits nothing until the project is approved.') }}</div></div>

          <div v-if="wp && gate" class="pm-card">
            <template v-if="gate.total === undefined">
              <div class="pm-banner pm-banner--warn">
                <div class="pm-banner-body">{{ t('Cost of production budget is not set on this work package.') }} <button class="pm-link" type="button" @click="router.push(`/budget-setup/${project!.id}?returnTo=${encodeURIComponent(route.fullPath)}&wp=${wp.id}`)">{{ t('Set it in Budget setup') }}</button></div>
              </div>
            </template>
            <template v-else>
              <div class="pm-row" style="gap: 0; align-items: stretch; flex-wrap: nowrap">
                <div style="flex: 1">
                  <div class="pm-stat-label">{{ t('Total budget production') }}</div>
                  <div class="pm-stat-value">{{ rp(gate.total) }}</div>
                  <div class="pm-stat-note">{{ t('Cost of production line') }}</div>
                </div>
                <div style="display: flex; align-items: center; padding: 0 16px; font-size: 22px; color: var(--mp-text-secondary)">−</div>
                <div style="flex: 1">
                  <div class="pm-stat-label">{{ t('Committed') }}</div>
                  <div class="pm-stat-value">{{ rp(gate.committed) }}</div>
                  <div class="pm-stat-note">{{ t('Open work-order set-asides + consumed') }}</div>
                </div>
                <div style="display: flex; align-items: center; padding: 0 16px; font-size: 22px; color: var(--mp-text-secondary)">=</div>
                <div style="flex: 1">
                  <div class="pm-stat-label">{{ t('Available') }}</div>
                  <div class="pm-stat-value" :class="{ 'pm-neg': (gate.available ?? 0) < 0 }">{{ rp(gate.available) }}</div>
                  <div class="pm-stat-note">{{ t('What this gate checks against') }}</div>
                </div>
              </div>

              <div class="pm-field" style="margin-top: 18px; max-width: 360px">
                <label class="pm-label pm-label-req" for="wg-b">{{ t('Budget for this work order') }}</label>
                <div class="pm-input-group"><span class="pm-addon">Rp</span><input id="wg-b" v-model="setAsideStr" class="pm-input pm-input--num" inputmode="numeric" :aria-invalid="over > 0" @blur="setAsideStr = setAside ? setAside.toLocaleString('id-ID') : ''" /></div>
                <span class="pm-help">{{ t('This amount is set aside on Cost of production — it’s what’s committed, and the work order’s baseline.') }}</span>
              </div>

              <div v-if="setAside && !over" class="pm-banner pm-banner--success" style="margin-top: 12px">
                <div class="pm-banner-body">{{ t('Within available.') }} {{ rp((gate.available ?? 0) - setAside) }} {{ t('left after this work order.') }}</div>
              </div>
              <div v-else-if="over" class="pm-banner pm-banner--error" style="margin-top: 12px">
                <div class="pm-banner-body">
                  <div class="pm-banner-title">{{ t('Over available by') }} {{ rp(over) }} ({{ pct(overPct) }} {{ t('of the budget') }})</div>
                  <template v-if="willHold">{{ t('Above the') }} {{ pct(threshold) }} {{ t('threshold — if you continue, the work order is held for Finance sign-off and shows in the Approvals inbox.') }}</template>
                  <template v-else>{{ t('Within the') }} {{ pct(threshold) }} {{ t('threshold — you can continue with a reason. The override is recorded.') }}</template>
                  <div class="pm-field" style="margin-top: 10px">
                    <label class="pm-label pm-label-req" for="wg-r">{{ t('Reason') }}</label>
                    <textarea id="wg-r" v-model="overrideReason" class="pm-textarea" style="min-height: 60px" />
                  </div>
                  <div style="margin-top: 8px">
                    <button class="pm-link" type="button" @click="router.push(budgetSetupLink())">{{ t('Add budget in Budget setup instead') }} →</button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="pm-form-footer" style="border-top: 1px solid var(--mp-border-default)">
            <span v-if="step1Block" class="pm-muted pm-small" style="margin-right: auto; align-self: center">{{ step1Block }}</span>
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="router.back()">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!!step1Block" @click="toStep2">{{ t('Next') }}</button>
          </div>
        </div>

        <!-- ── Step 2 ── -->
        <div v-else class="pm-stack" style="gap: 16px">
          <div class="pm-card" style="position: sticky; top: 0; z-index: 2">
            <div class="pm-row" style="gap: 24px">
              <div><div class="pm-stat-label">{{ t('Project') }} · {{ t('Work package') }}</div><div class="pm-strong">{{ project?.code }} · {{ wp?.code }} {{ wp?.name }}</div></div>
              <span class="pm-spacer" />
              <div><div class="pm-stat-label">{{ t('Budget set aside') }}</div><div class="pm-stat-value" style="font-size: 18px">{{ rp(setAside) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Allocated to lines') }}</div><div class="pm-stat-value" style="font-size: 18px" :class="excess ? 'pm-neg' : ''">{{ rp(allocated) }}</div></div>
              <div><div class="pm-stat-label">{{ t('Estimate') }}</div><div class="pm-stat-value" style="font-size: 18px; color: var(--mp-text-secondary)">{{ rp(estimateTotal) }}</div></div>
            </div>
            <div class="pm-bar-track" style="margin-top: 10px"><div class="pm-bar-fill" :class="{ 'pm-bar-fill--red': excess }" :style="{ width: Math.min(allocated / (setAside || 1) * 100, 100) + '%' }" /></div>
          </div>

          <div v-if="!lines.length" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('This work package has no BOM, so there are no suggested lines. Attach a BOM on the Structure tab.') }}</div></div>

          <section v-for="g in groups" :key="g.key">
            <h3 class="pm-h3" style="margin-bottom: 8px">{{ g.title }}</h3>
            <div class="pm-table-wrap">
              <table class="pm-table">
                <thead><tr><th>{{ t('Item') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Unit') }}</th><th class="pm-num">{{ t('Standard cost') }}</th><th class="pm-num">{{ t('Estimate') }}</th><th class="pm-num" style="width: 190px">{{ t('Budget') }}</th></tr></thead>
                <tbody>
                  <tr v-for="(l, i) in g.rows" :key="i">
                    <td>{{ l.name }}</td>
                    <td class="pm-num">{{ num(l.qty) }}</td>
                    <td>{{ l.unit }}</td>
                    <td class="pm-num">{{ rp(l.unitCost) }}</td>
                    <td class="pm-num">{{ rp(l.estimate) }}</td>
                    <td class="pm-num">
                      <input v-model="l.budgetStr" class="pm-input pm-input--sm pm-input--num" style="width: 160px" inputmode="numeric" :aria-label="`${t('Budget')} ${l.name}`" @blur="l.budgetStr = lineBudget(l).toLocaleString('id-ID')" />
                      <div class="pm-small" :class="l.estimate > lineBudget(l) ? 'pm-neg' : l.estimate < lineBudget(l) ? 'pm-pos' : 'pm-muted'">
                        {{ l.estimate === lineBudget(l) ? t('Matches estimate') : `${t('vs estimate')} ${rpSigned(lineBudget(l) - l.estimate)}` }}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div v-if="excess" class="pm-banner pm-banner--error">
            <div class="pm-banner-body">{{ t('Line budgets total') }} {{ rp(allocated) }} — {{ rp(excess) }} {{ t('over the budget set aside. Reduce line budgets to save.') }}</div>
          </div>
          <div v-if="over" class="pm-banner" :class="willHold ? 'pm-banner--warn' : 'pm-banner--neutral'">
            <div class="pm-banner-body">{{ willHold ? t('This work order will be held for Finance approval.') : t('Budget override recorded with your reason.') }} “{{ overrideReason }}”</div>
          </div>

          <div class="pm-form-footer" style="border-top: 1px solid var(--mp-border-default)">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" style="margin-right: auto" @click="step = 1">{{ t('Back') }}</button>
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="router.back()">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!!excess" @click="save">{{ willHold ? t('Save and send for approval') : t('Save work order') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
