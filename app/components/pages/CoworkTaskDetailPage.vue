<script setup lang="ts">
/**
 * Cowork — task detail page. Owns its own title bar (breadcrumb → Tasks, Actions
 * dropdown, Run task) and a 2-column stage: left = task details + run history,
 * right = the selected run's result (artifacts). Reached at /cowork-tasks/:id.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  MpButton, MpIcon, MpProgress, MpSpinner,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { infoToast } from '~/utils/toasts'
import { useCoworkContext } from '~/composables/useCoworkContext'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { formatDateTime } from '~/utils/date'
import {
  getTask, taskRuns, addRun, deleteRun, deleteTask, unscheduleTask, nextRunId,
  type CoworkTask, type CoworkRun,
} from '~/data/cowork'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { build } = useCoworkContext()

const task = computed<CoworkTask | undefined>(() => getTask(props.orderId))

// ── Plan / artifacts ──────────────────────────────────────────────────────────
interface SummaryItem { title: string; detail: string; priority: 'High' | 'Medium' | 'Low' }
interface ActionItem { title: string; detail: string; owner: string; due: string; priority: 'High' | 'Medium' | 'Low' }
interface Plan {
  taskTitle: string; intro: string; metric: string
  sources: { name: string; detail: string }[]
  steps: { title: string; detail: string }[]
  artifacts: {
    briefing?: { summary: SummaryItem[]; findings: { title: string; detail: string }[] }
    actionItems?: ActionItem[]
    email?: { to: string; subject: string; body: string }
    spreadsheet?: { title: string; columns: string[]; rows: string[][] }
    pdf?: { title: string; sections: { heading: string; body: string }[] }
  }
}

// A task that's never actually executed shows a centered pre-run view (just its
// details + Run task), not the run-history / result layout.
const hasBeenRun = computed(() => !!(task.value && ((task.value.runs?.length ?? 0) > 0 || task.value.planJson)))
const runs = computed<CoworkRun[]>(() => (task.value ? taskRuns(task.value) : []))
const selectedRunId = ref<string | null>(null)
const selectedRun = computed(() => runs.value.find((r) => r.id === selectedRunId.value) ?? runs.value[0])
const plan = computed<Plan | null>(() => {
  const p = selectedRun.value?.planJson
  try { return p ? (JSON.parse(p) as Plan) : null } catch { return null }
})

// ── Run (manual) ──────────────────────────────────────────────────────────────
const running = ref(false)
const STEP_TITLES = ['Reading task context', 'Pulling ERP records', 'Cross-checking data', 'Producing deliverables']
const activeStep = ref(0)
let stepTimer: ReturnType<typeof setInterval> | null = null
const progress = computed(() => String(Math.min(100, Math.round((activeStep.value / STEP_TITLES.length) * 100))))

async function runTask() {
  if (!task.value || running.value) return
  running.value = true
  activeStep.value = 0
  stepTimer = setInterval(() => { if (activeStep.value < STEP_TITLES.length) activeStep.value += 1 }, 1200)
  try {
    const res = await $fetch<{ plan: Plan }>('/api/cowork/plan', {
      method: 'POST',
      body: { task: task.value.prompt, context: build(), model: task.value.model, sources: task.value.sources, outputs: task.value.outputs },
    })
    const run: CoworkRun = { id: nextRunId(), ranAt: new Date().toISOString(), status: 'completed', metric: res.plan.metric, planJson: JSON.stringify(res.plan) }
    addRun(task.value.id, run)
    selectedRunId.value = run.id
  } catch {
    addRun(task.value.id, { id: nextRunId(), ranAt: new Date().toISOString(), status: 'failed' })
  } finally {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null }
    running.value = false
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
function editTask() { infoToast('Edit task — coming soon') }
function setSchedule() { router.push({ path: '/cowork', query: { focus: '1' } }) }
function removeTask() {
  if (!task.value) return
  deleteTask(task.value.id)
  toast.notify({ variant: 'success', title: 'Task deleted' })
  router.push('/cowork-tasks')
}
function openRun(r: CoworkRun) { selectedRunId.value = r.id }
function removeRun(r: CoworkRun) {
  if (!task.value) return
  deleteRun(task.value.id, r.id)
  toast.notify({ variant: 'success', title: 'Run deleted' })
}

function statusProps(s: string) {
  if (s === 'running') return { status: 'in progress', label: 'Running' }
  if (s === 'completed') return { status: 'completed', label: 'Completed' }
  if (s === 'failed') return { status: 'failed', label: 'Failed' }
  return { status: 'draft', label: 'Scheduled' }
}

// ── Contextual action-item buttons (create real ERP records) ──────────────────
function actionButton(a: ActionItem): string {
  const t = `${a.title} ${a.detail}`.toLowerCase()
  if (/purchase|reorder|requisition|restock|procure|buy/.test(t)) return 'Create purchase request'
  if (/count|cycle/.test(t)) return 'Create stock count'
  if (/reminder|chase|collect|dunning|payment notice|overdue/.test(t)) return 'Create reminder'
  if (/contract|renew|offboard|resign/.test(t)) return 'Review contract'
  if (/reconcil|journal|close|bill|invoice/.test(t)) return 'Open in finance'
  if (/work order|production|bom/.test(t)) return 'Create work order'
  if (/deal|pipeline|follow.?up|prospect/.test(t)) return 'Open in CRM'
  return 'Create task'
}
function doAction(a: ActionItem) { toast.notify({ variant: 'success', title: `${actionButton(a)} created` }) }

// ── Downloads ─────────────────────────────────────────────────────────────────
function downloadBlob(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function downloadCsv() {
  const s = plan.value?.artifacts?.spreadsheet
  if (!s) return
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  downloadBlob(`${(s.title || 'cowork').replace(/\s+/g, '-').toLowerCase()}.csv`, 'text/csv', [s.columns, ...s.rows].map((r) => r.map(esc).join(',')).join('\n'))
}
async function downloadPdf() {
  const p = plan.value?.artifacts?.pdf
  if (!p) return
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ unit: 'pt', format: 'a4' }); const M = 48; let y = M
  doc.setFontSize(18); doc.text(p.title || 'Report', M, y); y += 28; doc.setFontSize(11)
  for (const sec of p.sections) {
    doc.setFont('helvetica', 'bold'); doc.text(sec.heading, M, y); y += 18; doc.setFont('helvetica', 'normal')
    for (const line of doc.splitTextToSize(sec.body, 500)) { if (y > 780) { doc.addPage(); y = M } doc.text(line, M, y); y += 15 }
    y += 12
  }
  doc.save(`${(p.title || 'cowork').replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

// ── Open chat about this result ───────────────────────────────────────────────
const airene = useAireneBridge()
function buildChatContext(): string {
  const p = plan.value
  if (!p || !task.value) return ''
  const lines: string[] = [`Task: ${task.value.title}`, `Result: ${p.metric}`, `Summary: ${p.intro}`]
  const a = p.artifacts
  if (a?.briefing) {
    lines.push('Executive summary:')
    for (const s of a.briefing.summary) lines.push(`- [${s.priority}] ${s.title}: ${s.detail}`)
    if (a.briefing.findings?.length) { lines.push('Key findings:'); for (const f of a.briefing.findings) lines.push(`- ${f.title}: ${f.detail}`) }
  }
  if (a?.actionItems?.length) { lines.push('Action items:'); for (const it of a.actionItems) lines.push(`- ${it.title} (owner ${it.owner}, due ${it.due}): ${it.detail}`) }
  if (a?.email) lines.push(`Email draft — to ${a.email.to}, subject "${a.email.subject}": ${a.email.body}`)
  if (a?.spreadsheet) lines.push(`Spreadsheet "${a.spreadsheet.title}" columns: ${a.spreadsheet.columns.join(', ')}; ${a.spreadsheet.rows.length} rows.`)
  // Attach the underlying ERP data for the modules this task touches, so the user
  // can drill into details the result only summarised — e.g. an employee's profile
  // or why a specific customer hasn't paid.
  const snap = build() as Record<string, any>
  const mods = (task.value.modules ?? [task.value.module]).map((m) => m.toLowerCase())
  const want = new Set<string>()
  for (const m of mods) {
    if (m === 'hr') want.add('hr')
    else if (m === 'finance') want.add('finance')
    else if (m === 'crm' || m === 'sales') { want.add('crm'); want.add('finance') }
    else if (m === 'wms') want.add('wms')
    else if (m === 'production') want.add('production')
  }
  const slice: Record<string, any> = {}
  for (const k of want) if (snap[k]) slice[k] = snap[k]
  if (Object.keys(slice).length) lines.push(`\nUnderlying ERP data (for follow-up questions):\n${JSON.stringify(slice)}`)
  return lines.join('\n')
}
// Follow-up prompts tailored to THIS result — reference the real entities the
// run surfaced (the top overdue customer, the escalated employee, the urgent SKU…).
function buildChatSuggestions(): string[] {
  const p = plan.value
  const t = task.value
  if (!p || !t) return []
  const brief = p.artifacts?.briefing
  // First token of a summary title, e.g. "PT Teknologi Nusantara — Rp44M" → the name.
  const entity = (i = 0) => brief?.summary?.[i]?.title?.split(/\s+[—–-]\s+/)[0]?.trim()
  const mod = (t.modules?.[0] ?? t.module)
  const title = t.title.toLowerCase()

  if (/receivable|overdue|chase|collection/.test(title) || (mod === 'Finance' && p.artifacts?.email)) {
    const top = entity(0)
    return [
      'Who should I chase first?',
      top ? `Why hasn't ${top} paid?` : 'Why are these invoices unpaid?',
      top ? `Draft a firmer reminder for ${top}` : 'Draft a firmer reminder',
      'Which accounts are highest risk?',
    ]
  }
  if (/attendance|absence|late|payroll pre/.test(title) || mod === 'HR') {
    const someone = entity(0)
    return [
      'Who needs escalation today?',
      someone ? `Tell me about ${someone}` : 'Tell me about the people flagged',
      someone ? `Why is ${someone} flagged?` : 'Why were they flagged?',
      'Draft a note to their manager',
    ]
  }
  if (/reorder|stock|sku|inventory/.test(title) || mod === 'WMS') {
    const sku = entity(0)
    return [
      'Which item is most urgent?',
      "What's out of stock?",
      sku ? `How much ${sku} should I order?` : 'How much should I reorder?',
      'Draft a purchase request',
    ]
  }
  if (/pipeline|deal|prospect|sales/.test(title) || mod === 'CRM' || mod === 'Sales') {
    return [
      'Which deals should I close first?',
      'Which deals are stalled?',
      'Draft a follow-up for a stalled deal',
      'Where is the biggest value?',
    ]
  }
  if (/month-end|close|reconcil/.test(title)) {
    return [
      "What's blocking the close?",
      "What's the biggest item to clear?",
      'What should I do first?',
      'Summarise the checklist',
    ]
  }
  if (/contract|expir|renew/.test(title)) {
    const someone = entity(0)
    return [
      'Who should I renew first?',
      someone ? `What are ${someone}'s options?` : 'What are the options for each?',
      'Draft a renewal message',
      'Who is at risk of leaving?',
    ]
  }
  // Sensible default that still references the result.
  return [
    'What should I do first?',
    'Summarise this in 3 bullet points',
    'What are the risks or blockers here?',
    'Draft a follow-up I can send',
  ]
}
function openChat() { airene.openWithContext(buildChatContext(), task.value?.title ?? 'Task result', buildChatSuggestions()) }

// Output chips reflect what was actually produced (the run's artifacts), so they
// always match the result; before any run, fall back to the task's chosen outputs.
const ARTIFACT_LABEL: Record<string, string> = { briefing: 'Briefing summary', actionItems: 'Action items', email: 'Email draft', spreadsheet: 'Spreadsheet', pdf: 'PDF report' }
const outputLabels = computed(() => {
  const a = plan.value?.artifacts as Record<string, unknown> | undefined
  if (a) {
    const keys = Object.keys(a).filter((k) => a[k])
    if (keys.length) return keys.map((k) => ARTIFACT_LABEL[k] ?? k)
  }
  return task.value?.outputs?.length ? task.value.outputs : ['Briefing summary']
})
// Sources: explicit sources, else the modules the task spans, else all.
const sourceLabels = computed(() =>
  task.value?.sources?.length ? task.value.sources
  : task.value?.modules?.length ? task.value.modules
  : ['All sources'],
)

onMounted(() => {
  selectedRunId.value = runs.value[0]?.id ?? null
  if (route.query.run === '1' && !task.value?.runs?.length) {
    router.replace({ path: `/cowork-tasks/${props.orderId}`, query: {} })
    runTask()
  }
})
onBeforeUnmount(() => { if (stepTimer) clearInterval(stepTimer) })
</script>

<template>
  <template v-if="task">
    <!-- Title bar -->
    <header class="ctd-bar">
      <div class="ctd-bar__left">
        <button class="ctd-crumb" type="button" @click="router.push('/cowork-tasks')">Tasks</button>
        <h1 class="ctd-title">{{ task.title }}</h1>
      </div>
      <div class="ctd-bar__actions">
        <MpPopover id="ctd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button">
              Actions
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="editTask">Edit task</MpPopoverListItem>
              <MpPopoverListItem v-if="!task.schedule" @click="setSchedule">Set schedule</MpPopoverListItem>
              <MpPopoverListItem v-else @click="unscheduleTask(task.id)">Remove schedule</MpPopoverListItem>
              <MpPopoverListItem @click="removeTask">Delete task</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton is-rounded variant="primary" :is-loading="running" @click="runTask">Run task</MpButton>
      </div>
    </header>

    <div class="ctd-stage">
      <!-- Pre-run: centered task details only (before the task is ever run) -->
      <div v-if="!hasBeenRun && !running" class="ctd-prerun">
        <section class="ctd-prerun__card">
          <h2 class="ctd-h2">Task details</h2>
          <p class="ctd-desc">{{ task.prompt }}</p>

          <p class="ctd-label">Sources</p>
          <p class="ctd-value">{{ sourceLabels.join(', ') }}</p>

          <p class="ctd-label">Output</p>
          <div class="ctd-chips">
            <span v-for="o in outputLabels" :key="o" class="ctd-chip">{{ o }}</span>
          </div>

          <template v-if="task.schedule">
            <p class="ctd-label">Frequency</p>
            <div class="ctd-freq">
              <div class="ctd-freq__row"><span class="ctd-freq__k">Repeat</span><span>{{ task.schedule.cadence }}</span></div>
              <div class="ctd-freq__row"><span class="ctd-freq__k">Time</span><span>{{ task.schedule.time }}</span></div>
              <div class="ctd-freq__row"><span class="ctd-freq__k">Next run</span><span>{{ task.schedule.nextRun ?? '—' }}</span></div>
            </div>
          </template>
        </section>
      </div>

      <div v-else class="ctd-grid">
        <!-- Left: task details + runs -->
        <section class="ctd-left">
          <h2 class="ctd-h2">Task details</h2>
          <p class="ctd-desc">{{ plan?.intro ?? task.prompt }}</p>

          <p class="ctd-label">Sources</p>
          <p class="ctd-value">{{ sourceLabels.join(', ') }}</p>

          <p class="ctd-label">Output</p>
          <div class="ctd-chips">
            <span v-for="o in outputLabels" :key="o" class="ctd-chip">{{ o }}</span>
          </div>

          <template v-if="task.schedule">
            <p class="ctd-label">Frequency</p>
            <div class="ctd-freq">
              <div class="ctd-freq__row"><span class="ctd-freq__k">Repeat</span><span>{{ task.schedule.cadence }}</span></div>
              <div class="ctd-freq__row"><span class="ctd-freq__k">Time</span><span>{{ task.schedule.time }}</span></div>
              <div class="ctd-freq__row"><span class="ctd-freq__k">Next run</span><span>{{ task.schedule.nextRun ?? '—' }}</span></div>
            </div>
          </template>

          <div class="ctd-runs">
            <table class="ctd-table">
              <thead><tr><th>Date</th><th>Status</th><th class="ctd-th-act" /></tr></thead>
              <tbody>
                <tr v-for="r in runs" :key="r.id" :class="{ 'is-selected': r.id === selectedRun?.id }">
                  <td><span class="ctd-cell-link" @click="openRun(r)">{{ formatDateTime(r.ranAt) }}</span></td>
                  <td><ErpStatusBadge v-bind="statusProps(r.status)" /></td>
                  <td class="ctd-td-act" @click.stop>
                    <MpPopover :id="`ctd-run-${r.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                      <MpPopoverTrigger>
                        <button class="ctd-kebab" type="button" aria-label="Run actions"><MpIcon name="menu-kebab" size="md" /></button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '150px' })">
                        <MpPopoverList>
                          <MpPopoverListItem @click="openRun(r)">View details</MpPopoverListItem>
                          <MpPopoverListItem @click="removeRun(r)">Delete run</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="ctd-runs__foot">Showing {{ runs.length }} of {{ runs.length }} run{{ runs.length === 1 ? '' : 's' }}</p>
          </div>
        </section>

        <!-- Right: selected run result -->
        <section class="ctd-card ctd-right">
          <!-- Running -->
          <div v-if="running" class="ctd-running">
            <div class="ctd-run-head"><MpSpinner size="sm" /> <span>Cowork is working…</span></div>
            <MpProgress :value="progress" size="sm" color="positive" :class="css({ marginTop: '12px' })" />
            <ul class="ctd-steps">
              <li v-for="(s, i) in STEP_TITLES" :key="s" :class="{ 'is-done': i < activeStep, 'is-active': i === activeStep }">{{ s }}</li>
            </ul>
          </div>

          <template v-else-if="plan">
            <div class="ctd-run-topbar">
              <p class="ctd-run-ts">{{ formatDateTime(selectedRun?.ranAt) }}</p>
              <button class="btn-enterprise btn-enterprise--secondary ctd-openchat" type="button" @click="openChat">
                <MpIcon name="airene-brand" size="sm" /> Open chat
              </button>
            </div>
            <h3 class="ctd-metric">{{ plan.metric }}</h3>
            <hr class="ctd-hr">

            <template v-if="plan.artifacts?.briefing">
              <p class="ctd-sec">Executive summary</p>
              <div v-for="(s, i) in plan.artifacts.briefing.summary" :key="s.title" class="ctd-item">
                <p class="ctd-item__title">{{ s.title }}</p>
                <p class="ctd-muted">{{ s.detail }}</p>
              </div>
              <template v-if="plan.artifacts.briefing.findings?.length">
                <p class="ctd-sec">Key findings</p>
                <div v-for="f in plan.artifacts.briefing.findings" :key="f.title" class="ctd-item">
                  <p class="ctd-item__title">{{ f.title }}</p>
                  <p class="ctd-muted">{{ f.detail }}</p>
                </div>
              </template>
            </template>

            <template v-if="plan.artifacts?.actionItems?.length">
              <p class="ctd-sec">Action items</p>
              <div v-for="(a, i) in plan.artifacts.actionItems" :key="a.title + i" class="ctd-item">
                <p class="ctd-item__title">{{ a.title }}</p>
                <p class="ctd-muted">{{ a.detail }}</p>
                <p class="ctd-muted ctd-item__meta">{{ a.owner }} · {{ a.due }}</p>
                <button class="btn-enterprise btn-enterprise--secondary ctd-actbtn" type="button" @click="doAction(a)">{{ actionButton(a) }}</button>
              </div>
            </template>

            <template v-if="plan.artifacts?.email">
              <p class="ctd-sec">Email draft</p>
              <div class="ctd-email">
                <p class="ctd-email__row"><span class="ctd-email__k">To</span> {{ plan.artifacts.email.to }}</p>
                <p class="ctd-email__row"><span class="ctd-email__k">Subject</span> {{ plan.artifacts.email.subject }}</p>
                <pre class="ctd-email__body">{{ plan.artifacts.email.body }}</pre>
              </div>
            </template>

            <template v-if="plan.artifacts?.spreadsheet">
              <p class="ctd-sec">{{ plan.artifacts.spreadsheet.title || 'Spreadsheet' }}</p>
              <div class="ctd-table-wrap">
                <table class="ctd-table">
                  <thead><tr><th v-for="c in plan.artifacts.spreadsheet.columns" :key="c">{{ c }}</th></tr></thead>
                  <tbody><tr v-for="(r, ri) in plan.artifacts.spreadsheet.rows" :key="ri"><td v-for="(cell, ci) in r" :key="ci">{{ cell }}</td></tr></tbody>
                </table>
              </div>
            </template>

            <!-- Downloads -->
            <div v-if="plan.artifacts?.pdf || plan.artifacts?.spreadsheet" class="ctd-downloads">
              <button v-if="plan.artifacts?.pdf" class="ctd-download" type="button" @click="downloadPdf"><MpIcon name="pdf" size="sm" /> Download PDF</button>
              <button v-if="plan.artifacts?.spreadsheet" class="ctd-download" type="button" @click="downloadCsv"><MpIcon name="download" size="sm" /> Download spreadsheet</button>
            </div>
          </template>

          <div v-else class="ctd-empty">
            <p class="ctd-muted">No result yet. Run this task to see the output.</p>
          </div>
        </section>
      </div>
    </div>
  </template>

  <div v-else class="ctd-stage"><p class="ctd-muted">Task not found.</p></div>
</template>

<style scoped>
/* Title bar */
.ctd-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.ctd-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.ctd-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.ctd-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ctd-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.ctd-bar__actions { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }

/* Stage */
.ctd-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.ctd-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--mp-spacing-6); align-items: start; }
@media (max-width: 1024px) { .ctd-grid { grid-template-columns: 1fr; } }

/* Pre-run: task details centered in the stage, ~6 of 12 columns wide. */
.ctd-prerun { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); }
.ctd-prerun__card { grid-column: 4 / 10; }
@media (max-width: 1024px) { .ctd-prerun__card { grid-column: 1 / -1; } }

.ctd-muted { margin: 0; color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); }
.ctd-h2 { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctd-desc { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.ctd-label { margin: var(--mp-spacing-4) 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctd-value { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ctd-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.ctd-chip { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-full, 999px); padding: 3px 10px; }
.ctd-freq { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ctd-freq__row { display: flex; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ctd-freq__k { min-width: 72px; color: var(--mp-text-secondary); }

/* Runs table (left) */
.ctd-runs { margin-top: var(--mp-spacing-6); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.ctd-table { width: 100%; border-collapse: collapse; }
.ctd-table thead th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); white-space: nowrap; }
.ctd-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; }
.ctd-runs .ctd-table tbody td { background: var(--mp-background-neutral, #fff); }
.ctd-runs .ctd-table tbody tr.is-selected td:first-child { box-shadow: inset 2px 0 0 var(--mp-text-selected, #0f6d4d); }
.ctd-th-act, .ctd-td-act { width: 44px; text-align: right; }
.ctd-cell-link { color: var(--mp-text-link, #165082); cursor: pointer; }
.ctd-cell-link:hover { text-decoration: underline; }
.ctd-runs__foot { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ctd-kebab { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-md); color: var(--mp-text-secondary); cursor: pointer; }
.ctd-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }

/* Right card */
.ctd-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff); padding: var(--mp-spacing-5); }
.ctd-run-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.ctd-run-ts { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ctd-openchat { flex-shrink: 0; display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 4px); }
.ctd-metric { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: 28px; color: var(--mp-text-default); }
.ctd-hr { border: none; border-top: 1px solid var(--mp-border-default); margin: var(--mp-spacing-4) 0; }
.ctd-sec { margin: var(--mp-spacing-5) 0 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.4px; text-transform: uppercase; color: var(--mp-text-secondary); }
.ctd-sec:first-child { margin-top: 0; }
.ctd-item { padding: var(--mp-spacing-1, 4px) 0; }
.ctd-actbtn { padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); margin-top: var(--mp-spacing-2); }
.ctd-item__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctd-item__meta { margin-top: 2px; }
.ctd-email { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 8px); padding: var(--mp-spacing-4); }
.ctd-email__row { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ctd-email__k { display: inline-block; min-width: 56px; color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-semi-bold); }
.ctd-email__body { margin: var(--mp-spacing-3) 0 0; padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); font-family: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); white-space: pre-wrap; }
.ctd-table-wrap { overflow-x: auto; }
.ctd-downloads { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-5); padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ctd-download { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }
.ctd-download:hover { text-decoration: underline; text-underline-offset: 2px; }
.ctd-running { padding: var(--mp-spacing-2) 0; }
.ctd-run-head { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ctd-steps { list-style: none; margin: var(--mp-spacing-4) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ctd-steps li { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); opacity: .5; }
.ctd-steps li.is-done, .ctd-steps li.is-active { opacity: 1; color: var(--mp-text-default); }
.ctd-empty { padding: var(--mp-spacing-8); text-align: center; }
</style>
