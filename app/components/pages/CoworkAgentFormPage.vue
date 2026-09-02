<script setup lang="ts">
/**
 * Cowork — Create / Edit agent wizard. Reached at /cowork-agents/new and
 * /cowork-agents/:id/edit. A full-page 5-step stepper (Module 01 AG-10):
 * Persona · Knowledge · Skills · Visibility · Review & publish.
 *
 * Everything is stored on the agent (coworkAgents) and reflected on the detail
 * page. New agents autosave as a `draft` (AG-11); publishing captures a version
 * (AG-04). Skills carry a per-binding approval mode (SK-30); visibility can be
 * Everyone / Roles / People with a live audience count (AG-16).
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import {
  MpButton, MpInput, MpToggle, MpIcon, MpSpinner,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpCheckbox, MpAvatar, MpRadio, MpSelect,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip, css,
  toast,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import KbAttachPicker from '~/components/patterns/KbAttachPicker.vue'
import CoworkChatPanel from '~/components/patterns/CoworkChatPanel.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ApprovalModeIcon from '~/components/patterns/ApprovalModeIcon.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
type CoworkChatMsg = { role: 'user' | 'assistant'; text: string }
import { infoToast } from '~/utils/toasts'
import { employees } from '~/data/employees'
import {
  getAgent, addAgent, updateAgent, publishAgentVersion, deleteAgentSafe,
  COWORK_SKILLS, COWORK_COMPANY, APP_MODULES, coworkConnections, coworkAgents,
  COWORK_ROLES, employeesForRole, roleMemberCount, visibilityAudienceCount,
  SKILL_RISK_META, autoModeAvailable, COWORK_CURRENT_USER_ID,
  type CoworkAgent, type CoworkModule, type CoworkSkill, type CoworkSkillBinding,
  type CoworkApprovalMode, type CoworkAutoConditions,
} from '~/data/cowork'
import { coworkKb, addFolder, resolveAttachments, isFolder, getNode, extLabel, type KbAttachment } from '~/data/coworkKb'
import { useKbIngest } from '~/composables/useKbIngest'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const existing = computed<CoworkAgent | undefined>(() => isEdit.value ? getAgent(props.orderId!) : undefined)

const MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
]
const LANGS: { id: 'mirror' | 'id' | 'en'; label: string }[] = [
  { id: 'mirror', label: 'Auto (match the user)' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'en', label: 'English' },
]
// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'persona', label: 'Persona' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'skills', label: 'Skills' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'review', label: 'Review & publish' },
]
const stepKeys = STEPS.map((s) => s.key)
const current = ref('persona')
const done = ref<string[]>([])
const currentIndex = computed(() => stepKeys.indexOf(current.value))
const isLast = computed(() => currentIndex.value === STEPS.length - 1)

// ── Form state ──────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const instruction = ref('')
const model = ref(MODELS[0].id)
const language = ref<'mirror' | 'id' | 'en'>('mirror')
// Avatar is fixed to the default Mekari Airene avatar for new agents (no picker);
// editing keeps whatever the agent already has.
const DEFAULT_AVATAR = '/agents/airene.png'
const headAvatar = computed(() => existing.value?.avatar || DEFAULT_AVATAR)
const modelLabel = computed(() => MODELS.find((m) => m.id === model.value)?.label ?? MODELS[0].label)
const menuClass = css({ minWidth: '220px', width: 'max-content' })
// Track open state so the select trigger shows the bold active border while open
// (the popover pattern prevents native focus, so :focus-within alone won't fire).
const modelMenuOpen = ref(false)
const langMenuOpen = ref(false)
const allWorkspace = ref(false)
// Knowledge data sources = the connected apps. Each app covers one or more modules.
const connectedApps = computed(() => coworkConnections.filter((c) => c.connected))
const appOn = reactive<Record<string, boolean>>({})
// True when the agent has nothing grounding it — no KB docs, no "all apps", no app picked.
const hasNoKnowledge = computed(() => !knowledge.value.length && !allWorkspace.value && !connectedApps.value.some((c) => appOn[c.id]))
const connLogoFailed = reactive<Record<string, boolean>>({})
function connMonogram(nm: string): string {
  return nm.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('').slice(0, 2)
}
// ── Knowledge Base attachments (live scope references) ──
const knowledge = ref<KbAttachment[]>([])
const kbPickerOpen = ref(false)
const kbUploading = ref(false)
const { ingestFiles } = useKbIngest()

// ── Skills state (per-skill enable + approval mode + auto conditions) ──
interface SkillState { enabled: boolean; approvalMode: CoworkApprovalMode; autoConditions?: CoworkAutoConditions; notifyOnAuto?: 'always' | 'daily_digest' | 'never' }
const skillState = reactive<Record<string, SkillState>>({})
COWORK_SKILLS.forEach((s) => { skillState[s.id] = { enabled: false, approvalMode: 'manual' } })
const skillSearch = ref('')
const filteredSkills = computed(() => {
  const q = skillSearch.value.trim().toLowerCase()
  return COWORK_SKILLS.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
})
// Skills grouped by category (module); module-less skills fall under "General".
const SKILL_GROUP_ORDER = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production', 'General']
const skillGroups = computed(() => {
  const map = new Map<string, CoworkSkill[]>()
  for (const s of filteredSkills.value) {
    const k = s.module ?? 'General'
    ;(map.get(k) ?? map.set(k, []).get(k)!).push(s)
  }
  return SKILL_GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ category: k, skills: map.get(k)! }))
})
function connObj(id: string) { return coworkConnections.find((c) => c.id === id) }
function connName(id: string): string { return connObj(id)?.name ?? id }
function connConnected(id: string): boolean { return !!connObj(id)?.connected }
function riskMeta(s: CoworkSkill) { return SKILL_RISK_META[s.riskClass ?? 'write_internal'] }

// ── Visibility ──
const visibilityMode = ref<'everyone' | 'roles' | 'people'>('everyone')
const selectedRoleIds = ref<string[]>([])
const selectedEmployeeIds = ref<string[]>([])
const audienceCount = computed(() => visibilityAudienceCount({
  visibilityEveryone: visibilityMode.value === 'everyone',
  visibilityRoles: visibilityMode.value === 'roles' ? selectedRoleIds.value : [],
  visibilityEmployees: visibilityMode.value === 'people' ? selectedEmployeeIds.value : [],
}))
const rolesByProduct = computed(() => {
  const groups: Record<string, typeof COWORK_ROLES> = {}
  for (const r of COWORK_ROLES) (groups[r.product] ??= []).push(r)
  return Object.entries(groups)
})
function toggleRole(id: string, on: boolean) {
  if (on) { if (!selectedRoleIds.value.includes(id)) selectedRoleIds.value.push(id) }
  else selectedRoleIds.value = selectedRoleIds.value.filter((x) => x !== id)
}

onMounted(() => {
  const a = existing.value
  if (!a) { current.value = 'persona'; return }
  name.value = a.name
  description.value = a.description ?? ''
  instruction.value = a.instruction || a.persona || ''
  model.value = a.model ?? MODELS[0].id
  language.value = a.languageBehaviour ?? 'mirror'
  allWorkspace.value = !!a.allWorkspace
  ;(a.knowledgeApps ?? []).forEach((id) => { appOn[id] = true })
  knowledge.value = [...(a.knowledge ?? [])]
  ;(a.skillBindings ?? []).forEach((b) => {
    skillState[b.skillId] = { enabled: true, approvalMode: b.approvalMode, autoConditions: b.autoConditions, notifyOnAuto: b.notifyOnAuto }
  })
  visibilityMode.value = a.visibilityEveryone ? 'everyone' : (a.visibilityRoles?.length ? 'roles' : (a.visibilityEmployees?.length ? 'people' : 'everyone'))
  selectedRoleIds.value = [...(a.visibilityRoles ?? [])]
  selectedEmployeeIds.value = [...(a.visibilityEmployees ?? [])]
})

// ── AI "Optimize" (diff + Apply — never silent overwrite, AG-12) ──
const optimizing = ref<'' | 'description' | 'instruction'>('')
const optimizeDiff = ref<{ kind: 'description' | 'instruction'; before: string; after: string } | null>(null)
async function optimize(kind: 'description' | 'instruction') {
  const text = (kind === 'description' ? description.value : instruction.value).trim()
  if (!text || optimizing.value) return
  optimizing.value = kind
  optimizeDiff.value = null
  try {
    const res = await $fetch<{ text: string }>('/api/cowork/optimize', { method: 'POST', body: { text, kind, model: model.value } })
    if (res?.text) optimizeDiff.value = { kind, before: text, after: res.text }
  } catch { infoToast('Could not optimize right now — please try again') }
  finally { optimizing.value = '' }
}
function applyOptimize() {
  const d = optimizeDiff.value
  if (!d) return
  if (d.kind === 'description') { description.value = d.after; descError.value = '' }
  else { instruction.value = d.after; instrError.value = '' }
  optimizeDiff.value = null
}
// Coverage detection — the instruction badges light up (grey → green) as the text
// reads as each section. Keyword/pattern heuristics, evaluated live as you type.
const instrCoverage = computed(() => {
  const raw = instruction.value
  const t = ' ' + raw.toLowerCase() + ' '
  return {
    role: /\brole\s*:/.test(t) || /\byou(?:'re| are)\b|\bact as\b|\bacts as\b|\bas an? [a-z]+/.test(t),
    scope: /\bscope\s*:/.test(t) || /\bonly (act|work|handle|use|answer)\b|\bdo not (touch|access|go)\b|\bout[- ]of[- ]scope\b|\bstay within\b|\blimit(?:ed)? to\b|\bnever access\b|\bwithin [a-z]/.test(t),
    tone: /\btone\s*:/.test(t) || /\b(concise|warm|professional|friendly|formal|polite|empathetic|neutral|casual|reassuring|brief)\b/.test(t),
    rules: /\brules?\s*:/.test(t) || /\b(must|always|never|should|avoid|ensure)\b/.test(t) || /(^|\n)\s*[-*•]\s+/.test(raw),
  }
})

// ── Knowledge Base attach / upload ──
const attachedDocs = computed(() => resolveAttachments(knowledge.value))
function attachmentLabel(a: KbAttachment): string { const n = getNode(a.id); return n ? n.name : 'Removed item' }
function attachmentSub(a: KbAttachment): string {
  if (a.scope === 'doc') { const n = getNode(a.id); return n && !isFolder(n) ? extLabel((n as any).ext) : 'Document' }
  return `${resolveAttachments([a]).length} docs`
}
function removeAttachment(i: number) { knowledge.value.splice(i, 1) }
function ensureAgentUploadsFolder(): string {
  const existingF = coworkKb.find((n) => isFolder(n) && n.parentId === null && n.name === 'Agent uploads')
  if (existingF) return existingF.id
  return addFolder(null, 'Agent uploads', { description: 'Files uploaded while configuring agents', icon: 'magic', color: '#7C3AED' }).id
}
async function onKbUpload(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  kbUploading.value = true
  try {
    const folder = ensureAgentUploadsFolder()
    const docs = await ingestFiles(folder, files)
    for (const d of docs) if (!knowledge.value.some((a) => a.scope === 'doc' && a.id === d.id)) knowledge.value.push({ scope: 'doc', id: d.id })
    toast.notify({ variant: 'success', title: 'Knowledge added', description: `${docs.length} document${docs.length > 1 ? 's' : ''} attached.` })
  } finally { kbUploading.value = false }
}
const kbUploadInput = ref<HTMLInputElement | null>(null)

// ── User picker (shared SelectAccessDrawer) ──
const pickerOpen = ref(false)
const activeEmployees = computed(() => employees.filter((e) => e.status !== 'resigned'))
// Options for the two-column select drawer: name + "role · department" subtitle.
const employeeOptions = computed(() => activeEmployees.value.map((e) => ({
  id: e.id, name: e.fullName, subtitle: [e.jobPosition, e.department].filter(Boolean).join(' · '),
})))
const selectedEmployees = computed(() => selectedEmployeeIds.value.map((id) => employees.find((e) => e.id === id)).filter(Boolean))
function removeEmployee(id: string) { selectedEmployeeIds.value = selectedEmployeeIds.value.filter((x) => x !== id) }

// ── Approval-mode confirmation sheet (SK-33) ──
const autoSheet = reactive<{ open: boolean; skill?: CoworkSkill; maxPerRun: string; maxPerDay: string; ceiling: string; scope: string; notify: 'always' | 'daily_digest' | 'never' }>({
  open: false, skill: undefined, maxPerRun: '10', maxPerDay: '20', ceiling: '50000000', scope: '', notify: 'always',
})
function openAutoSheet(s: CoworkSkill) {
  const st = skillState[s.id]!
  autoSheet.skill = s
  // Sensible defaults so the admin doesn't have to invent numbers.
  autoSheet.maxPerRun = st.autoConditions?.maxPerRun?.toString() ?? '10'
  autoSheet.maxPerDay = st.autoConditions?.maxPerDay?.toString() ?? '20'
  autoSheet.ceiling = st.autoConditions?.valueCeiling?.toString() ?? '50000000'
  autoSheet.scope = st.autoConditions?.scope ?? ''
  autoSheet.notify = st.notifyOnAuto ?? 'always'
  autoSheet.open = true
}
// Value ceiling shown with "." thousand separators (Indonesian), stored as raw digits.
const ceilingDisplay = computed({
  get: () => (autoSheet.ceiling ? 'Rp ' + Number(autoSheet.ceiling).toLocaleString('id-ID') : ''),
  set: (v: string | number) => { autoSheet.ceiling = String(v ?? '').replace(/\D/g, '') },
})
const autoSheetValid = computed(() => {
  if (!autoSheet.skill) return false
  // write_external requires at least one guard-rail (SK-31)
  if (autoSheet.skill.riskClass === 'write_external' && !autoSheet.maxPerDay && !autoSheet.ceiling) return false
  return true
})
function confirmAutoSheet() {
  const s = autoSheet.skill
  if (!s || !autoSheetValid.value) return
  const cond: CoworkAutoConditions = {}
  if (autoSheet.maxPerRun) cond.maxPerRun = Number(autoSheet.maxPerRun)
  if (autoSheet.maxPerDay) cond.maxPerDay = Number(autoSheet.maxPerDay)
  if (autoSheet.ceiling) cond.valueCeiling = Number(autoSheet.ceiling)
  if (autoSheet.scope.trim()) cond.scope = autoSheet.scope.trim()
  skillState[s.id] = { enabled: true, approvalMode: 'auto', autoConditions: cond, notifyOnAuto: autoSheet.notify }
  autoSheet.open = false
}
function setApproval(s: CoworkSkill, mode: CoworkApprovalMode) {
  if (mode === 'auto') { openAutoSheet(s); return }
  skillState[s.id] = { ...skillState[s.id]!, approvalMode: 'manual', autoConditions: undefined }
}
function modeChip(s: CoworkSkill): string {
  const st = skillState[s.id]!
  if (st.approvalMode !== 'auto') return 'Ask first'
  const cap = st.autoConditions?.maxPerDay
  return cap ? `Auto · ≤ ${cap}/day` : 'Auto'
}

// ── Review summary ──
const enabledSkills = computed(() => COWORK_SKILLS.filter((s) => skillState[s.id]?.enabled))
const autoSkills = computed(() => enabledSkills.value.filter((s) => skillState[s.id]?.approvalMode === 'auto'))
const knowledgeSummary = computed(() => {
  const parts: string[] = []
  if (attachedDocs.value.length) parts.push(`${attachedDocs.value.length} document${attachedDocs.value.length === 1 ? '' : 's'} from Knowledge Base`)
  if (allWorkspace.value) parts.push('All connected apps')
  else { const apps = connectedApps.value.filter((c) => appOn[c.id]); if (apps.length) parts.push(apps.map((a) => a.name).join(', ')) }
  return parts.length ? parts.join(' · ') : 'No knowledge sources yet'
})
const visibilitySummary = computed(() => {
  if (visibilityMode.value === 'everyone') return `Everyone at ${COWORK_COMPANY}`
  if (visibilityMode.value === 'roles') return `${selectedRoleIds.value.map((r) => COWORK_ROLES.find((x) => x.id === r)?.name).filter(Boolean).join(', ') || 'No roles selected'} · ${audienceCount.value} people`
  return `${selectedEmployeeIds.value.length} people`
})

// ── Live test chat (Review step, right column) — dry-run, runs as you ──
const testLog = ref<CoworkChatMsg[]>([])
const testSuggestions = computed(() => {
  const out = ['Summarise what you can help with.']
  if (enabledSkills.value.length) out.push(`How would you use "${enabledSkills.value[0]!.name}"?`)
  if (autoSkills.value.length) out.push('What will you do automatically?')
  else out.push('Walk me through a task you handle.')
  return out
})
function sendTest(q: string) {
  const t = (q || '').trim()
  if (!t) return
  testLog.value.push({ role: 'user', text: t })
  const acted = autoSkills.value.length
    ? ` If this needed an action, "${autoSkills.value[0]!.name}" would run automatically (dry-run here, nothing is sent).`
    : ' Any action would pause for your confirmation.'
  testLog.value.push({ role: 'assistant', text: `Based on your instruction and ${enabledSkills.value.length} skill${enabledSkills.value.length === 1 ? '' : 's'}, I'd ground this in ${knowledgeSummary.value.toLowerCase()}.${acted}` })
}

// ── Navigation & validation (AG-18: inline per field) ──
const nameError = ref('')
const descError = ref('')
const instrError = ref('')
function nameTaken(): boolean {
  const n = name.value.trim().toLowerCase()
  return coworkAgents.some((a) => a.name.trim().toLowerCase() === n && a.id !== props.orderId && a.id !== draftId.value)
}
function validatePersona(): boolean {
  const n = name.value.trim()
  if (!n) nameError.value = 'You must fill in agent name'
  else if (n.length > 60) nameError.value = 'Keep the name under 60 characters'
  else if (nameTaken()) nameError.value = `An agent named "${n}" already exists. Try "${n} — Jakarta".`
  else nameError.value = ''
  descError.value = description.value.trim() ? '' : 'You must fill in a description'
  instrError.value = instruction.value.trim() ? '' : 'You must fill in an instruction'
  return !nameError.value && !descError.value && !instrError.value
}
function validateStep(key: string): boolean {
  if (key === 'persona') return validatePersona()
  return true
}
// Show the "no knowledge" warning only after the admin tries to Continue past
// the Knowledge step with nothing attached — then let them proceed on the next click.
const knowledgeWarnShown = ref(false)
function next() {
  if (!validateStep(current.value)) return
  if (current.value === 'knowledge' && hasNoKnowledge.value && !knowledgeWarnShown.value) {
    knowledgeWarnShown.value = true
    return
  }
  if (!done.value.includes(current.value)) done.value.push(current.value)
  if (!isLast.value) current.value = stepKeys[currentIndex.value + 1]!
}
function back() { if (currentIndex.value > 0) current.value = stepKeys[currentIndex.value - 1]! }
function goToStep(key: string) { current.value = key }
function cancel() { router.push('/cowork-agents') }
// Cancel = discard: confirm first (like the receiving-task cancel), then drop the
// autosaved draft so nothing is kept, and leave.
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  cancelOpen.value = false
  if (!isEdit.value && draftId.value) deleteAgentSafe(draftId.value)
  router.push('/cowork-agents')
}

// ── Build patch from form state ──
function buildBindings(): CoworkSkillBinding[] {
  return COWORK_SKILLS.filter((s) => skillState[s.id]?.enabled).map((s) => {
    const st = skillState[s.id]!
    const b: CoworkSkillBinding = { skillId: s.id, approvalMode: st.approvalMode, setAt: new Date().toISOString().slice(0, 10) }
    if (st.approvalMode === 'auto') { b.autoConditions = st.autoConditions; b.notifyOnAuto = st.notifyOnAuto }
    return b
  })
}
function buildPatch(): Partial<CoworkAgent> {
  const apps = connectedApps.value.filter((c) => appOn[c.id]).map((c) => c.id)
  const areas = [...new Set(apps.flatMap((id) => APP_MODULES[id] ?? []))] as CoworkModule[]
  return {
    name: name.value.trim(),
    description: description.value.trim(),
    instruction: instruction.value.trim(),
    persona: instruction.value.trim() || existing.value?.persona || '',
    model: model.value,
    languageBehaviour: language.value,
    avatar: existing.value?.avatar || DEFAULT_AVATAR,
    allWorkspace: allWorkspace.value,
    knowledgeAreas: areas,
    knowledgeApps: apps,
    knowledge: [...knowledge.value],
    skillBindings: buildBindings(),
    visibilityEveryone: visibilityMode.value === 'everyone',
    visibilityRoles: visibilityMode.value === 'roles' ? [...selectedRoleIds.value] : [],
    visibilityEmployees: visibilityMode.value === 'people' ? [...selectedEmployeeIds.value] : [],
  }
}

// ── Draft autosave (AG-11) — new agents persist as a draft as soon as they have a name ──
const draftId = ref<string | undefined>(isEdit.value ? props.orderId : undefined)
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleAutosave() {
  if (isEdit.value) return
  if (!name.value.trim()) return
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    const patch = buildPatch()
    if (!draftId.value) {
      const created = addAgent({
        ...(patch as CoworkAgent), role: 'Custom agent', module: patch.knowledgeAreas?.[0] ?? 'Finance',
        owned: true, color: '#6941C6', status: 'draft', type: 'custom',
      })
      draftId.value = created.id
    } else {
      updateAgent(draftId.value, { ...patch, status: 'draft' })
    }
  }, 700)
}
watch([name, description, instruction, model, language, allWorkspace, knowledge, visibilityMode, selectedRoleIds, selectedEmployeeIds, () => JSON.stringify(skillState), () => JSON.stringify(appOn)], scheduleAutosave, { deep: true })

// ── Publish ──
const saving = ref(false)
function publish() {
  if (!validatePersona()) { current.value = 'persona'; return }
  saving.value = true
  const patch = { ...buildPatch(), status: 'published' as const }
  let id = draftId.value ?? props.orderId!
  if (isEdit.value && existing.value) {
    updateAgent(existing.value.id, patch)
    publishAgentVersion(existing.value.id, 'Edited via wizard')
    toast.notify({ variant: 'success', title: 'Agent saved', description: 'Start a chat' })
  } else if (draftId.value) {
    updateAgent(draftId.value, patch)
    publishAgentVersion(draftId.value, 'Published')
    toast.notify({ variant: 'success', title: `${patch.name} published`, description: 'Start a chat' })
  } else {
    const created = addAgent({
      ...(patch as CoworkAgent), role: 'Custom agent', module: patch.knowledgeAreas?.[0] ?? 'Finance',
      owned: true, color: '#6941C6', type: 'custom',
    })
    id = created.id
    toast.notify({ variant: 'success', title: `${patch.name} published`, description: 'Start a chat' })
  }
  saving.value = false
  router.push(`/cowork-agents/${id}`)
}
function idr(n: number): string { return 'Rp ' + n.toLocaleString('id-ID') }
</script>

<template>
  <!-- Title bar -->
  <header class="caf-bar">
    <div class="caf-bar__left">
      <button class="caf-crumb" type="button" @click="cancel">Agents</button>
      <h1 class="caf-title">{{ isEdit ? 'Edit agent' : 'New agent' }}</h1>
    </div>
    <span v-if="!isEdit && draftId" class="caf-draft-note"><MpIcon name="check" size="sm" /> Draft saved</span>
  </header>

  <div class="caf-stage">
    <div class="caf-scroll">
    <div class="caf-inner">
      <div class="caf-stepper-wrap"><ErpStepper :steps="STEPS" :current="current" :done="done" @select="goToStep" /></div>

      <div v-if="current !== 'review'" class="caf-form">
        <!-- ── Persona ── -->
        <template v-if="current === 'persona'">
          <MpFormControl id="caf-name" class="caf-field" is-required :is-invalid="!!nameError">
            <MpFormLabel>Agent name</MpFormLabel>
            <MpInput id="caf-name-input" v-model="name" is-full-width @input="nameError = ''" />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="caf-desc" class="caf-field" is-required :is-invalid="!!descError">
            <MpFormLabel>Description</MpFormLabel>
            <div class="caf-ta" :class="{ 'is-busy': optimizing === 'description', 'is-error': !!descError }">
              <textarea v-model="description" class="caf-ta__input" rows="3" @input="descError = ''"></textarea>
              <div class="caf-ta__foot">
                <button type="button" class="btn-enterprise btn-enterprise--ghost caf-optimize" :disabled="optimizing === 'description'" @click="optimize('description')">
                  <MpSpinner v-if="optimizing === 'description'" size="sm" />
                  <MpIcon v-else name="airene-brand" size="sm" /> Optimize
                </button>
              </div>
            </div>
            <!-- Optimize diff (Apply / Discard) -->
            <div v-if="optimizeDiff?.kind === 'description'" class="caf-diff">
              <p class="caf-diff__label">Suggested rewrite</p>
              <p class="caf-diff__before">{{ optimizeDiff.before }}</p>
              <p class="caf-diff__after">{{ optimizeDiff.after }}</p>
              <div class="caf-diff__actions">
                <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="optimizeDiff = null">Discard</button>
                <button type="button" class="btn-enterprise btn-enterprise--primary" @click="applyOptimize">Apply</button>
              </div>
            </div>
            <MpFormErrorMessage>{{ descError }}</MpFormErrorMessage>
            <p v-if="!descError && optimizeDiff?.kind !== 'description'" class="caf-hint">Describe what this agent will help your team with.</p>
          </MpFormControl>

          <MpFormControl id="caf-instr" class="caf-field" is-required :is-invalid="!!instrError">
            <MpFormLabel>Instruction</MpFormLabel>
            <div class="caf-ta" :class="{ 'is-busy': optimizing === 'instruction', 'is-error': !!instrError }">
              <textarea v-model="instruction" class="caf-ta__input" rows="8" @input="instrError = ''"></textarea>
              <div class="caf-ta__foot">
                <!-- Coverage badges: grey until the text reads as that section, then green -->
                <div class="caf-cov">
                  <span class="caf-cov-badge" :class="{ 'is-on': instrCoverage.role }">Role</span>
                  <span class="caf-cov-badge" :class="{ 'is-on': instrCoverage.scope }">Scope</span>
                  <span class="caf-cov-badge" :class="{ 'is-on': instrCoverage.tone }">Tone</span>
                  <span class="caf-cov-badge" :class="{ 'is-on': instrCoverage.rules }">Rules</span>
                </div>
                <button type="button" class="btn-enterprise btn-enterprise--ghost caf-optimize" :disabled="optimizing === 'instruction' || !instruction.trim()" @click="optimize('instruction')">
                  <MpSpinner v-if="optimizing === 'instruction'" size="sm" />
                  <MpIcon v-else name="airene-brand" size="sm" /> Optimize
                </button>
              </div>
            </div>
            <div v-if="optimizeDiff?.kind === 'instruction'" class="caf-diff">
              <p class="caf-diff__label">Suggested rewrite</p>
              <p class="caf-diff__before">{{ optimizeDiff.before }}</p>
              <p class="caf-diff__after">{{ optimizeDiff.after }}</p>
              <div class="caf-diff__actions">
                <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="optimizeDiff = null">Discard</button>
                <button type="button" class="btn-enterprise btn-enterprise--primary" @click="applyOptimize">Apply</button>
              </div>
            </div>
            <MpFormErrorMessage>{{ instrError }}</MpFormErrorMessage>
            <p v-if="!instrError && optimizeDiff?.kind !== 'instruction'" class="caf-hint">Control your agent's behaviour. Use the Role · Scope · Tone · Rules · Refuse-when structure.</p>
          </MpFormControl>

          <MpFormControl id="caf-model" class="caf-field caf-field--half">
            <MpFormLabel>Model</MpFormLabel>
            <MpPopover id="caf-model-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @open="modelMenuOpen = true" @close="modelMenuOpen = false">
              <MpPopoverTrigger>
                <MpSelect id="caf-model-sel" :model-value="model" :class="modelMenuOpen ? 'caf-sel--open' : ''" @mousedown.prevent>
                  <option :value="model">{{ modelLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="menuClass">
                <MpPopoverList>
                  <MpPopoverListItem v-for="m in MODELS" :key="m.id" :is-active="model === m.id" @click="model = m.id">{{ m.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </MpFormControl>

          <MpFormControl id="caf-lang" class="caf-field caf-field--half">
            <MpFormLabel>Language</MpFormLabel>
            <MpPopover id="caf-lang-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @open="langMenuOpen = true" @close="langMenuOpen = false">
              <MpPopoverTrigger>
                <MpSelect id="caf-lang-sel" :model-value="language" :class="langMenuOpen ? 'caf-sel--open' : ''" @mousedown.prevent>
                  <option :value="language">{{ LANGS.find((l) => l.id === language)?.label }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="menuClass">
                <MpPopoverList>
                  <MpPopoverListItem v-for="l in LANGS" :key="l.id" :is-active="language === l.id" @click="language = l.id">{{ l.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </MpFormControl>
        </template>

        <!-- ── Knowledge ── -->
        <template v-else-if="current === 'knowledge'">
          <div v-if="hasNoKnowledge && knowledgeWarnShown" class="caf-field">
            <MpBanner id="caf-noknow-banner" variant="warning">
              <MpBannerIcon id="caf-noknow-banner-icon" />
              <MpBannerTitle id="caf-noknow-banner-title">This agent has no knowledge yet</MpBannerTitle>
              <MpBannerDescription id="caf-noknow-banner-desc">
                Without documents or a connected app, it answers from the model's general knowledge — not your company's data. That's fine for a general assistant, but attach a document or turn on an app to ground it in your own information. You can still continue.
              </MpBannerDescription>
            </MpBanner>
          </div>
          <MpFormControl id="caf-kb" class="caf-field">
            <MpFormLabel>Knowledge base</MpFormLabel>
            <p class="caf-hint caf-hint--tight">Attach documents from the Knowledge Base, or upload new ones. The agent retrieves the most relevant passages when it runs.</p>
            <div class="caf-kb-actions">
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="kbPickerOpen = true">Attach from Knowledge Base</button>
              <button type="button" class="btn-enterprise btn-enterprise--secondary" :disabled="kbUploading" @click="kbUploadInput?.click()">{{ kbUploading ? 'Uploading…' : 'Upload file' }}</button>
              <input ref="kbUploadInput" type="file" multiple class="caf-hidden-file"
                accept=".md,.markdown,.txt,.csv,.tsv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif" @change="onKbUpload" />
            </div>
            <ul v-if="knowledge.length" class="caf-kb-list">
              <li v-for="(a, i) in knowledge" :key="a.scope + a.id" class="caf-kb-chip">
                <MpIcon :name="a.scope === 'doc' ? 'doc' : 'folder-close'" size="sm" :class="a.scope === 'doc' ? '' : 'caf-kb-chip__folder'" />
                <span class="caf-kb-chip__name">{{ attachmentLabel(a) }}</span>
                <span class="caf-kb-chip__sub">{{ attachmentSub(a) }}</span>
                <button class="caf-kb-chip__x" type="button" aria-label="Remove" @click="removeAttachment(i)"><MpIcon name="minus-circular" size="sm" /></button>
              </li>
            </ul>
            <p v-if="knowledge.length" class="caf-hint caf-hint--tight">{{ attachedDocs.length }} document{{ attachedDocs.length === 1 ? '' : 's' }} in scope.</p>
          </MpFormControl>

          <MpFormControl id="caf-ws" class="caf-field caf-field--gap32">
            <div class="caf-ws-head">
              <div>
                <MpFormLabel>Use all connected apps</MpFormLabel>
                <p class="caf-hint caf-hint--tight">Let the agent draw on every app you've connected. Narrowing to the ones it needs keeps answers more accurate.</p>
              </div>
              <MpToggle :is-checked="allWorkspace" aria-label="Use all connected apps" @update:is-checked="(v: boolean) => allWorkspace = v" />
            </div>
            <div v-if="!allWorkspace" class="caf-areas">
              <p class="caf-areas__label">Or pick the connected apps this agent should use (live data):</p>
              <div v-for="app in connectedApps" :key="app.id" class="caf-area-row">
                <span class="caf-area-app">
                  <img v-if="!connLogoFailed[app.id]" class="caf-area-logo caf-area-logo--img" :src="app.logo || `/connectors/${app.id}.png`" :alt="app.name" loading="lazy" @error="connLogoFailed[app.id] = true" />
                  <span v-else class="caf-area-logo" :style="{ background: app.color || '#3a4749' }">{{ connMonogram(app.name) }}</span>
                  {{ app.name }}
                </span>
                <MpToggle :is-checked="appOn[app.id]" :aria-label="`Toggle ${app.name}`" @update:is-checked="(v: boolean) => appOn[app.id] = v" />
              </div>
            </div>
          </MpFormControl>

          <div class="caf-field">
            <MpBanner id="caf-perm-banner" variant="info">
              <MpBannerIcon id="caf-perm-banner-icon" />
              <MpBannerTitle id="caf-perm-banner-title">Permissions stay as they are</MpBannerTitle>
              <MpBannerDescription id="caf-perm-banner-desc">Files and integrations keep their original permissions. Only people with existing access will retrieve them here.</MpBannerDescription>
              <MpBannerLink id="caf-perm-banner-link"><a href="#" @click.prevent="infoToast('Read more — coming soon')">Read more</a></MpBannerLink>
            </MpBanner>
          </div>
        </template>

        <!-- ── Skills ── -->
        <template v-else-if="current === 'skills'">
          <p class="caf-step-caption">Turn on the skills this agent can use, and decide whether each one must ask you first or may act automatically.</p>
          <MpInput id="caf-skill-search" v-model="skillSearch" is-full-width placeholder="Search skills" class="caf-skill-search" />
          <div class="caf-skill-groups">
           <section v-for="g in skillGroups" :key="g.category" class="caf-skill-group">
            <h3 class="caf-skill-group__title">{{ g.category }}</h3>
            <div class="caf-skills">
            <div v-for="s in g.skills" :key="s.id" class="caf-skill">
              <div class="caf-skill__main">
                <p class="caf-skill__name">
                  {{ s.name }}
                  <span class="caf-risk" :class="`caf-risk--${riskMeta(s).tone}`">{{ riskMeta(s).label }}</span>
                </p>
                <p class="caf-skill__desc">{{ s.description }}</p>
                <div v-if="s.requiresConnections?.length" class="caf-skill__needs">
                  <span v-for="cid in s.requiresConnections" :key="cid" class="caf-need-chip">
                    <img v-if="!connLogoFailed[cid]" class="caf-need-logo" :src="connObj(cid)?.logo || `/connectors/${cid}.png`" :alt="connName(cid)" loading="lazy" @error="connLogoFailed[cid] = true" />
                    <span v-else class="caf-need-logo caf-need-logo--mono" :style="{ background: connObj(cid)?.color || '#3a4749' }">{{ connMonogram(connName(cid)) }}</span>
                    {{ connConnected(cid) ? connName(cid) : `Needs ${connName(cid)}` }}
                  </span>
                </div>
                <!-- Approval-mode control (only when enabled) -->
                <div v-if="skillState[s.id]?.enabled" class="caf-approval">
                  <span class="caf-approval__chip" :class="skillState[s.id]!.approvalMode === 'auto' ? 'caf-approval__chip--auto' : ''">
                    <ApprovalModeIcon :mode="skillState[s.id]!.approvalMode" :size="14" /> {{ modeChip(s) }}
                  </span>
                  <MpPopover :id="`caf-appr-${s.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                    <MpPopoverTrigger>
                      <button type="button" class="caf-approval__btn">Change<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '280px' })">
                      <MpPopoverList>
                        <MpPopoverListItem :is-active="skillState[s.id]!.approvalMode === 'manual'" @click="setApproval(s, 'manual')">
                          <div class="caf-appr-opt"><span class="caf-appr-opt__t"><ApprovalModeIcon mode="manual" :size="16" /> Manually approve</span><span class="caf-appr-opt__d">The agent asks you before acting</span></div>
                        </MpPopoverListItem>
                        <MpPopoverListItem :is-disabled="!autoModeAvailable(s).allowed" @click="autoModeAvailable(s).allowed && setApproval(s, 'auto')">
                          <div class="caf-appr-opt"><span class="caf-appr-opt__t"><ApprovalModeIcon mode="auto" :size="16" /> Automatically approve</span><span class="caf-appr-opt__d">{{ autoModeAvailable(s).allowed ? 'The agent acts and notifies you' : autoModeAvailable(s).reason }}</span></div>
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </div>
              </div>
              <MpToggle :is-checked="skillState[s.id]?.enabled" :aria-label="`Toggle ${s.name}`"
                @update:is-checked="(v: boolean) => skillState[s.id] = { ...skillState[s.id]!, enabled: v, approvalMode: v ? skillState[s.id]!.approvalMode : 'manual' }" />
            </div>
            </div>
           </section>
           <p v-if="!skillGroups.length" class="caf-hint">No skills match “{{ skillSearch }}”.</p>
          </div>
        </template>

        <!-- ── Visibility ── -->
        <template v-else-if="current === 'visibility'">
          <p class="caf-step-caption">Choose who can start a chat with or assign a task to this agent.</p>
          <div class="caf-vis-opts">
            <MpRadio id="caf-vis-everyone" name="caf-vis" value="everyone" :is-checked="visibilityMode === 'everyone'" @change="visibilityMode = 'everyone'">Everyone at {{ COWORK_COMPANY }}</MpRadio>
            <MpRadio id="caf-vis-roles" name="caf-vis" value="roles" :is-checked="visibilityMode === 'roles'" @change="visibilityMode = 'roles'">Specific roles</MpRadio>
            <MpRadio id="caf-vis-people" name="caf-vis" value="people" :is-checked="visibilityMode === 'people'" @change="visibilityMode = 'people'">Specific users</MpRadio>
          </div>

          <div v-if="visibilityMode === 'roles'" class="caf-roles">
            <div v-for="[product, roles] in rolesByProduct" :key="product" class="caf-role-group">
              <p class="caf-role-group__title">{{ product }}</p>
              <label v-for="r in roles" :key="r.id" class="caf-role">
                <MpCheckbox :is-checked="selectedRoleIds.includes(r.id)" @update:is-checked="(v: boolean) => toggleRole(r.id, v)" />
                <span class="caf-role__name">{{ r.name }}</span>
                <span class="caf-role__count">{{ roleMemberCount(r.id) }} people</span>
              </label>
            </div>
          </div>

          <div v-if="visibilityMode === 'people'" class="caf-people">
            <div class="caf-people__head">
              <span class="caf-plain-label">Users with access</span>
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="pickerOpen = true"><MpIcon name="add" size="md" /> Select users</button>
            </div>
            <p v-if="!selectedEmployees.length" class="caf-hint">No one added yet. Only you will have access.</p>
            <div v-for="e in selectedEmployees" :key="e!.id" class="caf-person">
              <MpAvatar :src="e!.photo" :name="e!.fullName" size="sm" />
              <div class="caf-person__info"><span class="caf-person__name">{{ e!.fullName }}</span><span class="caf-person__role">{{ e!.jobPosition }}</span></div>
              <MpTooltip :id="`caf-rm-${e!.id}`" label="Remove" placement="top" use-portal>
                <button type="button" class="caf-person__x" aria-label="Remove" @click="removeEmployee(e!.id)"><MpIcon name="minus-circular" size="md" /></button>
              </MpTooltip>
            </div>
          </div>

          <p class="caf-audience"><MpIcon name="profile" size="sm" /> {{ audienceCount }} {{ audienceCount === 1 ? 'person' : 'people' }} will see this agent</p>
        </template>

      </div>

      <!-- ── Review & publish: summary (left 6) + New-chat test panel (right 6) ── -->
      <div v-else class="caf-review-2col">
        <div class="caf-review-col">
          <div class="caf-review-head">
            <img class="caf-review-avatar" :src="headAvatar" :alt="name">
            <div>
              <p class="caf-review-name">{{ name || 'Untitled agent' }}</p>
              <p class="caf-review-desc">{{ description || 'No description' }}</p>
            </div>
          </div>

          <section class="caf-review-sec">
            <div class="caf-review-sechead"><h3>Persona</h3><button type="button" class="btn-enterprise btn-enterprise--secondary caf-review-edit" @click="goToStep('persona')">Edit</button></div>
            <ContentList label="Instruction" :value="instruction || '—'" />
            <ContentList label="Model" :value="modelLabel" />
            <ContentList label="Language" :value="LANGS.find((l) => l.id === language)?.label" />
          </section>
          <section class="caf-review-sec">
            <div class="caf-review-sechead"><h3>Knowledge</h3><button type="button" class="btn-enterprise btn-enterprise--secondary caf-review-edit" @click="goToStep('knowledge')">Edit</button></div>
            <ContentList label="Sources" :value="knowledgeSummary" />
          </section>
          <section class="caf-review-sec">
            <div class="caf-review-sechead"><h3>Skills</h3><button type="button" class="btn-enterprise btn-enterprise--secondary caf-review-edit" @click="goToStep('skills')">Edit</button></div>
            <ContentList label="Enabled" :value="enabledSkills.length ? enabledSkills.map((s) => s.name).join(', ') : 'None'" />
          </section>
          <section v-if="autoSkills.length" class="caf-review-sec caf-review-sec--warn">
            <div class="caf-review-sechead"><h3><MpIcon name="magic" size="sm" /> Will act without asking</h3></div>
            <div v-for="s in autoSkills" :key="s.id" class="caf-willact">
              <span class="caf-willact__name">{{ s.name }}</span>
              <span class="caf-willact__cond">{{ modeChip(s) }}<template v-if="skillState[s.id]!.autoConditions?.valueCeiling"> · ≤ {{ idr(skillState[s.id]!.autoConditions!.valueCeiling!) }}</template><template v-if="skillState[s.id]!.autoConditions?.scope"> · {{ skillState[s.id]!.autoConditions!.scope }}</template></span>
            </div>
          </section>
          <section class="caf-review-sec">
            <div class="caf-review-sechead"><h3>Visibility</h3><button type="button" class="btn-enterprise btn-enterprise--secondary caf-review-edit" @click="goToStep('visibility')">Edit</button></div>
            <ContentList label="Who">
              <template v-if="visibilityMode === 'everyone'">Everyone at {{ COWORK_COMPANY }} · {{ audienceCount }} people</template>
              <template v-else-if="visibilityMode === 'roles'">
                <span v-for="r in selectedRoleIds" :key="r" class="content-list__line">{{ COWORK_ROLES.find((x) => x.id === r)?.name }}<span class="caf-review-vsub"> · {{ roleMemberCount(r) }} people</span></span>
                <span v-if="!selectedRoleIds.length" class="content-list__line">No roles selected</span>
              </template>
              <template v-else>
                <span v-for="e in selectedEmployees" :key="e!.id" class="content-list__line">{{ e!.fullName }}<span class="caf-review-vsub"> · {{ e!.jobPosition }}</span></span>
                <span v-if="!selectedEmployees.length" class="content-list__line">Only you</span>
              </template>
            </ContentList>
          </section>
        </div>

        <!-- Right: the shared "New chat" panel (same format as Chats), dry-run -->
        <div class="caf-chat">
          <CoworkChatPanel
            :messages="testLog"
            :agent-name="name || 'your agent'"
            :agent-avatar="headAvatar"
            user-name="Rizal Candra"
            :greeting="description || 'Ask me anything to see how I’ll respond.'"
            :suggestions="testSuggestions"
            :models="MODELS"
            :model-id="model"
            hide-header
            hide-add
            :agent-switchable="false"
            :max-turns="3"
            @update:model-id="(v: string) => model = v"
            @send="sendTest"
          />
        </div>
      </div>

    </div>
    </div>

    <!-- Full-width sticky footer: Back · Cancel · Continue/Save -->
    <footer class="caf-footbar">
      <MpButton v-if="currentIndex > 0" is-rounded variant="ghost" @click="back">Back</MpButton>
      <MpButton is-rounded variant="ghost" @click="askCancel">Cancel</MpButton>
      <MpButton v-if="!isLast" is-rounded variant="primary" @click="next">Continue</MpButton>
      <MpButton v-else is-rounded variant="primary" :is-loading="saving" @click="publish">{{ isEdit ? 'Save changes' : 'Publish agent' }}</MpButton>
    </footer>
  </div>

  <!-- User picker — the shared two-column ERP select drawer (add ⊕ / remove ⊖ + Save) -->
  <SelectAccessDrawer
    :open="pickerOpen"
    title="Select users"
    list-title="Users"
    :options="employeeOptions"
    :model-value="selectedEmployeeIds"
    empty-title="No users selected"
    empty-caption="Add users from the list to give them access to this agent."
    @update:open="pickerOpen = $event"
    @save="(ids: string[]) => selectedEmployeeIds = ids"
  />

  <!-- Approval-mode confirmation modal (switching a skill to auto) -->
  <MpModal
    id="caf-auto-sheet"
    :is-open="autoSheet.open"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="autoSheet.open = false"
  >
    <MpModalContent>
      <MpModalHeader>
        Let {{ name || 'this agent' }} run “{{ autoSheet.skill?.name }}” automatically?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <span v-if="autoSheet.skill" class="caf-risk" :class="`caf-risk--${riskMeta(autoSheet.skill).tone}`">{{ riskMeta(autoSheet.skill).label }}</span>
        <p class="caf-sheet__desc">The agent will act and tell you afterwards — within the limits below. It never bypasses your permissions.</p>
        <div class="caf-sheet__grid">
          <label class="caf-sheet__f">
            <span class="caf-sheet__flabel">Max per run</span>
            <span class="caf-sheet__fhint">The most actions it may take in one run.</span>
            <MpInput id="caf-c-run" v-model="autoSheet.maxPerRun" type="number" />
          </label>
          <label class="caf-sheet__f">
            <span class="caf-sheet__flabel">Max per day</span>
            <span class="caf-sheet__fhint">The daily cap across all runs.</span>
            <MpInput id="caf-c-day" v-model="autoSheet.maxPerDay" type="number" />
          </label>
          <label class="caf-sheet__f">
            <span class="caf-sheet__flabel">Value ceiling</span>
            <span class="caf-sheet__fhint">The rupiah amount of one action — e.g. a purchase request total. Anything above this still asks you first. (Not API/token cost.)</span>
            <MpInput id="caf-c-ceil" v-model="ceilingDisplay" inputmode="numeric" />
          </label>
          <label class="caf-sheet__f">
            <span class="caf-sheet__flabel">Scope <span class="caf-sheet__opt">(optional)</span></span>
            <span class="caf-sheet__fhint">Limit to one area/location; leave blank for all.</span>
            <MpInput id="caf-c-scope" v-model="autoSheet.scope" />
          </label>
        </div>
        <div class="caf-sheet__notify">
          <span class="caf-sheet__flabel caf-sheet__flabel--notify">Notify me</span>
          <MpRadio id="caf-notify-always" name="caf-notify" value="always" :is-checked="autoSheet.notify === 'always'" @change="autoSheet.notify = 'always'">Every action</MpRadio>
          <MpRadio id="caf-notify-digest" name="caf-notify" value="daily_digest" :is-checked="autoSheet.notify === 'daily_digest'" @change="autoSheet.notify = 'daily_digest'">Daily digest</MpRadio>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="autoSheet.open = false">Cancel</MpButton>
          <MpButton variant="primary" is-rounded :is-disabled="!autoSheetValid" @click="confirmAutoSheet">Turn on automatic approval</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <KbAttachPicker v-model:is-open="kbPickerOpen" v-model="knowledge" />

  <!-- Cancel = discard confirmation (same behaviour as the receiving-task cancel) -->
  <ConfirmModal
    v-model:is-open="cancelOpen"
    :title="isEdit ? 'Discard changes?' : 'Discard this agent?'"
    description="Your changes won't be saved."
    confirm-label="Discard"
    cancel-label="Keep editing"
    :is-danger="true"
    @confirm="confirmCancel"
  />
</template>

<style scoped>
.caf-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; }
.caf-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.caf-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.caf-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.caf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.caf-draft-note { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--mp-text-secondary); }

.caf-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; }
.caf-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6); }
/* Sticky full-width footer — mirrors ReceiveItemsPage .detail-footer */
.caf-footbar { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
/* Wide enough that the Review step can put the 680px summary column and the chat
   panel side by side; the stepper is capped narrower via its own wrapper. */
.caf-inner { max-width: 1400px; }
.caf-stepper-wrap { max-width: 1040px; }
.caf-form { margin-top: var(--mp-spacing-6, 24px); display: grid; grid-template-columns: repeat(6, 1fr); column-gap: var(--mp-spacing-6, 24px); row-gap: var(--mp-spacing-5, 20px); max-width: 680px; align-items: start; }
.caf-form > * { grid-column: 1 / 7; min-width: 0; }
.caf-field--half { grid-column: 1 / 4; }
/* MpSelect (popover pattern): show the bold neutral border while the dropdown is open */
:deep(.mp-select__control.caf-sel--open) { border-color: #8c9596 !important; box-shadow: 0 0 0 1px #8c9596 !important; }
@media (max-width: 640px) { .caf-field--half { grid-column: 1 / 7; } }
.caf-hint { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.caf-hint--tight { margin-top: 2px; max-width: 460px; }
.caf-hidden-file { display: none; }
.caf-step-caption { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.caf-plain-label { display: block; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }

/* Avatar */
.caf-avatar-row { display: flex; gap: var(--mp-spacing-4, 16px); align-items: flex-start; }
.caf-avatar-preview { width: 72px; height: 72px; flex: 0 0 auto; border-radius: var(--mp-radii-lg, 12px); object-fit: contain; background: #e6ddf7; }
.caf-avatar-choices { flex: 1; min-width: 0; }
.caf-avatar-grid { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); margin-top: var(--mp-spacing-2); }
.caf-avatar-opt { width: 44px; height: 44px; padding: 0; border: 2px solid transparent; border-radius: var(--mp-radii-md, 8px); background: #f1f3f4; cursor: pointer; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; color: var(--mp-icon-default); }
.caf-avatar-opt img { width: 100%; height: 100%; object-fit: contain; }
.caf-avatar-opt.is-active { border-color: var(--mp-border-selected, #029861); }
.caf-avatar-upload { background: var(--mp-background-neutral-subtle); }

/* Textarea + optimize */
.caf-ta { border: 1px solid var(--mp-border-form, #d0d5dd); border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-neutral, #fff); overflow: hidden; }
.caf-ta:focus-within { border-color: var(--mp-border-bold, #8c9596); box-shadow: 0 0 0 1px var(--mp-border-bold, #8c9596); }
.caf-ta.is-error { border-color: var(--mp-border-danger, #d1362f); }
.caf-ta.is-error:focus-within { box-shadow: 0 0 0 1px var(--mp-border-danger, #d1362f); }
.caf-ta__input { display: block; width: 100%; box-sizing: border-box; min-height: 240px; border: none; outline: none; resize: vertical; padding: var(--mp-spacing-3, 12px); font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); background: none; }
.caf-ta__foot { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2, 8px); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.caf-optimize { margin-left: auto; display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 6px); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-3, 12px); font-size: var(--mp-font-sizes-sm, 12px); }
/* Coverage badges inside the instruction box — grey (disabled) until detected, then green */
.caf-cov { display: inline-flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); }
.caf-cov-badge { font-size: var(--mp-font-sizes-sm, 12px); font-weight: 600; line-height: var(--mp-line-heights-md, 20px); border-radius: var(--mp-radii-full, 999px); padding: 4px 12px; color: var(--mp-text-disabled, #97a0af); background: var(--mp-background-neutral-subtle, #f1f3f4); transition: color .12s ease, background .12s ease; }
.caf-cov-badge.is-on { color: #0a6e4e; background: #e7f5ef; }
.caf-optimize:disabled { opacity: 0.7; cursor: default; }
.caf-diff { margin-top: var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 8px); padding: var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); }
.caf-diff__label { margin: 0 0 var(--mp-spacing-1); font-size: 11px; font-weight: 600; color: var(--mp-text-secondary); text-transform: uppercase; letter-spacing: .04em; }
.caf-diff__before { margin: 0 0 var(--mp-spacing-2); font-size: 13px; color: var(--mp-text-secondary); text-decoration: line-through; }
.caf-diff__after { margin: 0; font-size: 13px; color: var(--mp-text-default); }
.caf-diff__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }

.caf-kb-actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.caf-field--gap32 { margin-top: var(--mp-spacing-3, 12px); }
.caf-kb-list { list-style: none; margin: var(--mp-spacing-3) 0 0; padding: 0; display: flex; flex-direction: column; }
.caf-kb-chip { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.caf-kb-chip :deep(svg) { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.caf-kb-chip__folder { color: var(--mp-icon-brand, #0a6e4e) !important; }
.caf-kb-chip__name { font-size: 13px; font-weight: 500; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.caf-kb-chip__sub { flex: 0 0 auto; font-size: 11px; color: var(--mp-text-secondary); }
.caf-kb-chip__x { margin-left: auto; flex: 0 0 auto; display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 2px; border-radius: 4px; }
.caf-kb-chip__x:hover { background: var(--mp-background-neutral, #eceef0); color: var(--mp-icon-default, #536062); }

.caf-ws-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.caf-areas { margin-top: var(--mp-spacing-3); }
.caf-areas__label { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-area-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-area-app { display: inline-flex; align-items: center; gap: var(--mp-spacing-3, 12px); min-width: 0; }
.caf-area-logo { width: 24px; height: 24px; flex-shrink: 0; border-radius: var(--mp-radii-md, 6px); }
.caf-area-logo--img { object-fit: contain; }
span.caf-area-logo:not(.caf-area-logo--img) { display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: var(--mp-font-weights-bold, 700); color: #fff; line-height: 1; }


/* Skills */
.caf-skill-search { margin-top: var(--mp-spacing-3); }
/* Skills grouped by category — 32px between groups, an H3 header bar per group */
.caf-skill-groups { display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px); margin-top: var(--mp-spacing-4); }
.caf-skill-group__title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.caf-skills { display: flex; flex-direction: column; }
.caf-skill { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4, 16px) 0; border-bottom: 1px solid var(--mp-border-default); }
.caf-skill__main { min-width: 0; }
.caf-skill__name { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.caf-skill__mod { font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full, 999px); padding: 1px 8px; }
/* Risk badges — fixed label + Pixel semantic tone (never colour alone) */
.caf-risk { font-size: 11px; font-weight: 600; border-radius: var(--mp-radii-full, 999px); padding: 2px 8px; line-height: 1.5; white-space: nowrap; }
.caf-risk--neutral { color: var(--mp-text-secondary, #536062); background: var(--mp-background-neutral-subtle, #f1f3f4); }
.caf-risk--info { color: #165082; background: #e7f0f7; }
.caf-risk--warning { color: #b54708; background: #fdf1e6; }
.caf-risk--danger { color: #b42318; background: #fbeceb; }
.caf-skill__desc { margin: 4px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-skill__needs { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
/* "Needs Gmail" — plain secondary text (not a badge, never danger colour) */
.caf-need-chip { display: inline-flex; align-items: center; gap: 5px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.caf-need-logo { width: 16px; height: 16px; flex: 0 0 auto; border-radius: 4px; object-fit: contain; }
.caf-need-logo--mono { display: inline-flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #fff; line-height: 1; }
.caf-approval { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.caf-approval__chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full, 999px); padding: 3px 10px; }
.caf-approval__chip--auto { color: #6941C6; background: #f4f0fb; }
.caf-approval__btn { display: inline-flex; align-items: center; gap: 2px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: 12px; color: var(--mp-text-link); padding: 2px 4px; }
.caf-appr-opt { display: flex; flex-direction: column; gap: 2px; }
.caf-appr-opt__t { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.caf-appr-opt__d { font-size: 12px; color: var(--mp-text-secondary); }

/* Visibility */
.caf-vis-opts { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.caf-vis-opt { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.caf-roles { display: flex; flex-direction: column; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-2); }
.caf-role-group__title { margin: 0 0 var(--mp-spacing-1); font-size: 12px; font-weight: 600; color: var(--mp-text-secondary); }
.caf-role { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); cursor: pointer; }
.caf-role__name { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-role__count { font-size: 12px; color: var(--mp-text-secondary); }
.caf-people { margin-top: var(--mp-spacing-3); }
.caf-people__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-3, 12px); }
.caf-person { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); }
.caf-person__info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.caf-person__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-person__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.caf-person__x { border: none; background: none; cursor: pointer; color: var(--mp-icon-default); display: inline-flex; }
.caf-audience { display: inline-flex; align-items: center; gap: 6px; margin-top: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Review */
/* Step-5 summary — all content is 14px; key/value rows use the ContentList pattern */
.caf-review-head { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.caf-review-avatar { width: 56px; height: 56px; border-radius: var(--mp-radii-lg, 12px); object-fit: contain; background: transparent; }
.caf-review-head > div { flex: 1; min-width: 0; }
.caf-review-name { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-text-default); }
.caf-review-desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }
.caf-review-sec { padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default); }
.caf-review-sechead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); min-height: 36px; }
.caf-review-sechead h3 { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: 600; color: var(--mp-text-default); display: inline-flex; align-items: center; gap: 6px; }
/* "Will act without asking" is a lighter sub-heading: 14px semibold, black (not purple). */
.caf-review-sec--warn h3 { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.caf-review-vsub { color: var(--mp-text-secondary); }
/* Edit button — hidden until the section is hovered/focused; secondary style */
.caf-review-edit { opacity: 0; pointer-events: none; transition: opacity .12s ease; }
.caf-review-sec:hover .caf-review-edit,
.caf-review-sec:focus-within .caf-review-edit { opacity: 1; pointer-events: auto; }
/* Name on top, the auto conditions as a caption underneath (not a right-aligned column). */
.caf-willact { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; }
.caf-willact__name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); font-weight: 500; }
.caf-willact__cond { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

:deep(.mp-button--variant_ghost:hover), :deep(.mp-button--variant_ghost:focus-visible) { border-color: transparent !important; box-shadow: none !important; }

.caf-emplist { margin-top: var(--mp-spacing-3); }
.caf-emp { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default); cursor: pointer; }
.caf-emp__info { display: flex; flex-direction: column; }
.caf-emp__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-emp__role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Review — the summary keeps the exact 680px form width from earlier steps; the
   chat panel sits after it, filling the remaining stage width. */
.caf-review-2col { margin-top: var(--mp-spacing-6, 24px); display: grid; grid-template-columns: 680px minmax(0, 1fr); gap: var(--mp-spacing-8, 32px); align-items: start; }
@media (max-width: 1080px) { .caf-review-2col { grid-template-columns: 1fr; } }
.caf-review-col { min-width: 0; }
/* Chat wrapper — a drawer-like bordered surface holding the shared panel */
.caf-chat { position: sticky; top: 0; height: 620px; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-xl, 16px); background: var(--mp-background-neutral, #fff); overflow: hidden; }

/* Approval-mode confirmation sheet (top-aligned, like ConfirmModal) */
.caf-sheet__desc { margin: var(--mp-spacing-2) 0 var(--mp-spacing-4); font-size: 13px; color: var(--mp-text-secondary); }
.caf-sheet__grid { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.caf-sheet__f { display: flex; flex-direction: column; gap: 2px; }
.caf-sheet__flabel { font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-text-default); }
.caf-sheet__opt { font-weight: 400; color: var(--mp-text-secondary); }
.caf-sheet__fhint { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); margin-bottom: 4px; line-height: var(--mp-line-heights-sm, 16px); }
.caf-sheet__notify { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-4); flex-wrap: wrap; }
.caf-sheet__flabel--notify { font-size: var(--mp-font-sizes-md, 14px); }
</style>
