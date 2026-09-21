<script setup lang="ts">
/**
 * CRM Module builder — the "Manage" screen of Settings ▸ Modules settings.
 *
 * Route `/crm/settings/modules/:moduleId` binds `:orderId` = the module id
 * (e.g. 'deals'). PRD: "ERP - Customizable CRM Platform and Deals V1" (§7.1/§8.2).
 * A module = named fields laid out in sections + saved List/Kanban views. Stage
 * is just a Pick List field, edited here like any other options field.
 *
 * Full-bleed shell mirrors CrmSettingsPage / CrmCustomerDetailPage: `.detail-page`
 * > `.detail-bar` (72px, neutral-subtle, breadcrumb-above-title gap:0) +
 * `.detail-stage`. Two green MpTabs — Fields & layout · Views. All edits happen on
 * a local editable deep-clone `draft`; "Save changes" applies it to the real
 * module + persists. Every dropdown is `ErpFilterSelect`; every modal is `MpModal`.
 */
import { computed, reactive, ref, watch, onMounted } from 'vue'
import {
  MpButton, MpIcon, MpToggle, MpInput, MpInputGroup, MpInputLeftAddon, MpCheckbox, MpRadio, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import CrmPropertyDrawer from '~/components/patterns/CrmPropertyDrawer.vue'
import {
  getCrmModule, persistCrmModule, createCustomModule, crmModules, persistCrmModules,
  CRM_FIELD_TYPE_LABELS, CRM_MODULE_ICONS,
  moduleStores, isDealLikeModule, resetGenericModuleDraft, canEditModule,
  DEAL_PROPERTY_TYPE_ICON, isRelatedListType,
  genericPipelineFieldId, setGenericPipelineField, isPicklistType,
  deals, serviceDeals, genericRecordsFor, CRM_CURRENT_USER, notesFor,
  type ServiceDeal, type GenericModuleRecord,
  crmTeams, teamsForModule, setModuleTeams,
  publishCrmModule, unpublishCrmModule,
  type DealProperty, type DealPropertyType, type DealPropertyConfig, type Deal,
  type CrmModule, type CrmModuleField, type CrmFieldType,
  type CrmModuleView, type CrmModuleViewType, type CrmModuleViewVisibility,
  type DealPipeline, type DealPipelineStage,
  type DealPipelineDisplay, type DealModuleSetup, type DealDetailLayout,
  type CrmConversionTarget,
} from '~/data/crm'
import ContentList from '~/components/patterns/ContentList.vue'
import CrmDetailLayoutBuilder from '~/components/patterns/CrmDetailLayoutBuilder.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal, { type ActivityEntry, type ActivityDetail } from '~/components/patterns/ActivityLogModal.vue'
import { usePointerSortable } from '~/composables/usePointerSortable'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const AUTHOR = 'Rizal Candra'
function nowStamp(): string { return new Date().toISOString().slice(0, 19) }
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T }

// 'new' is a not-yet-created module: the builder opens live before any save, so a
// fresh scratch config is discarded on entry (any prior aborted creation attempt).
const isCreating = props.orderId === 'new'
if (isCreating) resetGenericModuleDraft('new')

const newModuleStub: CrmModule = reactive({
  id: 'new', name: '', system: false, accessLevel: 'company', status: 'draft',
  sections: [], fields: [], views: [], layoutDriver: undefined, conversionTarget: null,
  recordCount: 0, icon: 'pipeline', updatedAt: '', updatedBy: '',
})
const mod = computed<CrmModule | undefined>(() => isCreating ? newModuleStub : getCrmModule(props.orderId))
// Deals-style modules (Deals + Service deals) each read/write their OWN config stores.
const stores = computed(() => moduleStores(props.orderId))
// Eager-touch: forces ensureGenericModuleConfig('new') to run now, BEFORE
// isDealLikeModule()/tabs/activeTab (declared further below) are first evaluated —
// otherwise a brand-new id wouldn't yet be a registered generic module at that point
// and activeTab would wrongly default to the non-deal-like tab set.
void stores.value
// Only the admin (workspace owner) and the module's own creator can edit it.
// A new module has no creator yet, so creation is always allowed.
if (!isCreating) {
  const m = getCrmModule(props.orderId)
  if (m && !canEditModule(m)) {
    infoToast(t("You don't have permission to edit this module."))
    router.replace('/crm/settings/modules')
  }
}

// ── View vs Edit mode ───────────────────────────────────────────────────────
// Existing modules open in VIEW mode (read-only); click Edit to switch.
// New modules go straight to edit.
const viewMode = ref(!isCreating)
function enterEdit() { viewMode.value = false }
// Deals module cannot be deleted or unpublished.
const isDealSystem = computed(() => mod.value?.id === 'deals')
const deleteConfirmOpen = ref(false)
function deleteModule() {
  if (!mod.value || isDealSystem.value) return
  const idx = crmModules.findIndex((m) => m.id === mod.value!.id)
  if (idx !== -1) { crmModules.splice(idx, 1); persistCrmModules() }
  successToast(t('Module deleted'))
  router.push('/crm/settings/modules')
}

// ── Activity log ────────────────────────────────────────────────────────────
function formatActivityDate(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date}, ${time}`
}
const activityLogOpen = ref(false)
const moduleActivityEntries = computed<ActivityEntry[]>(() => {
  if (!mod.value) return []
  const entries: ActivityEntry[] = []
  const m = mod.value
  if (m.updatedAt) {
    entries.push({
      date: m.updatedAt,
      user: m.updatedBy ?? 'System',
      activity: 'Updated module settings',
      details: [
        { label: 'Module name', value: m.name },
        { label: 'Status', value: m.status === 'published' ? 'Published' : 'Draft' },
      ],
    })
  }
  entries.push({
    date: '2026-08-01T10:00:00.000Z',
    user: m.createdBy ?? 'System',
    activity: 'Created module',
    details: [
      { label: 'Module name', value: m.name },
      { label: 'Status', value: 'Draft' },
    ],
  })
  return entries
})

// ── Local editable deep-clone ────────────────────────────────────────────────
const UNUSED = '__unused__'
const MODULE_NAME_MAX = 25
interface Draft {
  name: string
  icon: string
  sections: string[]
  fields: CrmModuleField[]
  views: CrmModuleView[]
  layoutDriver: string // '' = none
  detailLayout: DealDetailLayout // record detail-page layout (Deals only)
  accessLevel: 'company' | 'team'
  teamIds: string[] // team ids that can access this module — only meaningful when accessLevel === 'team'
}
const draft = reactive<Draft>({ name: '', icon: 'pipeline', sections: [], fields: [], views: [], layoutDriver: '', detailLayout: { tabs: [] }, accessLevel: 'company', teamIds: [] })
const activeTeams = computed(() => crmTeams.filter((tm) => tm.status === 'active'))
// Team picker — the same "pick many" drawer pattern as Add users, scoped to teams.
const teamDrawerOpen = ref(false)
const teamOptions = computed(() => activeTeams.value.map((tm) => ({ id: tm.id, name: tm.name, subtitle: tm.description })))
const selectedTeams = computed(() => activeTeams.value.filter((tm) => draft.teamIds.includes(tm.id)))
function onTeamsSaved(ids: string[]) { draft.teamIds = ids; teamDrawerOpen.value = false }
function removeDraftTeam(id: string) { draft.teamIds = draft.teamIds.filter((x) => x !== id) }

function loadDraft() {
  const m = mod.value
  if (!m) return
  draft.name = m.name
  draft.icon = m.icon ?? 'pipeline'
  draft.sections = clone(m.sections)
  draft.fields = clone(m.fields)
  draft.views = clone(m.views)
  draft.layoutDriver = m.layoutDriver ?? ''
  draft.detailLayout = clone(stores.value.detailLayout)
  draft.accessLevel = m.accessLevel
  draft.teamIds = teamsForModule(m.id).map((tm) => tm.id)
  draftConversionTarget.value = m.conversionTarget ?? null
}
// Icon picker (the Name-field prefix) — opens a small grid of module icons.
const iconMenuOpen = ref(false)
function pickIcon(icon: string) { draft.icon = icon; iconMenuOpen.value = false }

// ── ERP conversion target — set from the Layout tab's ERP transactions picker ──
const draftConversionTarget = ref<CrmConversionTarget>(mod.value?.conversionTarget ?? null)
function onErpTargetChange(target: CrmConversionTarget) { draftConversionTarget.value = target }

// ── Setup tab (Deals) — a local editable clone; Save changes applies it. ──
const setup = reactive<DealModuleSetup>(JSON.parse(JSON.stringify(stores.value.setup)))
function loadSetup() { Object.assign(setup, JSON.parse(JSON.stringify(stores.value.setup))) }
const CURRENCY_OPTIONS = [{ value: 'IDR', label: 'Indonesian Rupiah (Rp)' }]
const CLOSE_PERIOD_OPTIONS = [
  { value: 'this-month', label: t('This month') },
  { value: 'next-month', label: t('Next month') },
]
const CLOSE_UNIT_OPTIONS = [
  { value: 'days', label: t('Days') },
  { value: 'weeks', label: t('Weeks') },
  { value: 'months', label: t('Months') },
]
function publishModule() { if (mod.value) { publishCrmModule(mod.value.id); successToast(t('Module published')) } }
function unpublishModule() { if (mod.value) { unpublishCrmModule(mod.value.id); successToast(t('Module unpublished')) } }

// View-mode helpers
const viewCloseDateLabel = computed(() => {
  if (!setup.applyCloseDate) return t('Not set')
  if (setup.closeMode === 'period') {
    const opt = CLOSE_PERIOD_OPTIONS.find((o) => o.value === setup.closePeriod)
    return opt?.label ?? setup.closePeriod
  }
  const unitOpt = CLOSE_UNIT_OPTIONS.find((o) => o.value === setup.closeUnit)
  return `${setup.closeAmount} ${unitOpt?.label ?? setup.closeUnit} ${t('from creation')}`
})
const viewAccessLabel = computed(() => {
  if (mod.value?.accessLevel === 'team') {
    const teams = teamsForModule(mod.value.id)
    return teams.length ? teams.map((tm) => tm.name).join(', ') : t('Team (none selected)')
  }
  return t('Company')
})

onMounted(() => { loadDraft(); loadSetup(); loadProperties() })
watch(() => props.orderId, () => { loadDraft(); loadSetup(); loadProperties() })

// ── Header status badge ──────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { status: string; label: string }> = {
  published: { status: 'active', label: 'Published' },
  draft: { status: 'draft', label: 'Draft' },
}
const statusBadge = computed(() => STATUS_BADGE[mod.value?.status ?? 'draft'] ?? STATUS_BADGE.draft!)

// ── Tabs (v-model = index) ───────────────────────────────────────────────────
// Deals gets Pipeline + Layout; custom modules keep Fields & layout + Views.
const isDeals = computed(() => isDealLikeModule(mod.value?.id ?? ''))
const tabs = computed(() => isDeals.value
  ? [{ key: 'setup', label: 'Setup' }, { key: 'properties', label: 'Properties' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'layout', label: 'Layout' }]
  : [{ key: 'fields', label: 'Fields & layout' }, { key: 'views', label: 'Views' }])
const activeTab = ref<string>(isDealLikeModule(props.orderId) ? 'setup' : 'fields')
const isLayoutTab = computed(() => activeTab.value === 'fields' || activeTab.value === 'layout')

// ── Generic vs predefined module detection ──
const isGenericModule = computed(() => {
  const id = mod.value?.id ?? ''
  return id !== 'deals' && id !== 'services' && isDeals.value
})

// ── Pipeline field picker (generic modules only) ──
const pipelineFieldId = ref<string | null>(genericPipelineFieldId(props.orderId))
const picklistProperties = computed(() => propList.value.filter((p) => isPicklistType(p.type)))
const pipelineFieldOptions = computed(() =>
  picklistProperties.value.map((p) => ({ value: p.id, label: p.name })),
)
const selectedPipeFieldId = ref<string>(pipelineFieldId.value ?? '')
const assignedFieldLabel = computed(() => {
  if (!pipelineFieldId.value) return null
  return picklistProperties.value.find((p) => p.id === pipelineFieldId.value)?.name ?? null
})
const fieldDerivedStages = computed(() => {
  if (!pipelineFieldId.value) return []
  const prop = picklistProperties.value.find((p) => p.id === pipelineFieldId.value)
  return prop?.config?.options ?? []
})
const { dragIndex: gmLaneDragIndex, ghost: gmLaneGhost, start: gmLaneStart } = usePointerSortable({
  axis: 'x', itemSelector: '.pipe-lane',
  move: (from, to) => {
    const prop = picklistProperties.value.find((p) => p.id === pipelineFieldId.value)
    if (!prop?.config?.options) return
    const arr = [...prop.config.options]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m!); prop.config.options = arr
  },
})
const draggedGmStage = computed(() => (gmLaneDragIndex.value !== null ? fieldDerivedStages.value[gmLaneDragIndex.value] : null))
function applyPipelineField() {
  const val = selectedPipeFieldId.value || null
  pipelineFieldId.value = val
  const draftProp = val ? propList.value.find((p) => p.id === val) : undefined
  setGenericPipelineField(mod.value?.id ?? '', val, draftProp?.config?.options)
  pipeDraft.value = JSON.parse(JSON.stringify(stores.value.pipelines))
}

// ── Pipeline config (deals only) — a local editable clone; Save changes applies it. ──
const pipeDraft = ref<DealPipeline[]>(JSON.parse(JSON.stringify(stores.value.pipelines)))
const selectedPipeId = ref<string>(pipeDraft.value[0]?.id ?? 'default')
const currentPipe = computed<DealPipeline | undefined>(() => pipeDraft.value.find((p) => p.id === selectedPipeId.value) ?? pipeDraft.value[0])
const pipeOptions = computed(() => pipeDraft.value.map((p) => ({ value: p.id, label: p.name })))
// Every stage renders as a Kanban swimlane (open flow + Won + Lost alike).
const pipeStages = computed<DealPipelineStage[]>(() => currentPipe.value?.stages ?? [])
let stageSeq = 100
const newStageId = () => `s-new-${stageSeq++}`


// Inline rename — the pencil toggles a stage's name into an editable field.
const editingStageId = ref<string | null>(null)
function editStage(id: string) { editingStageId.value = id }
function commitStageName(s: DealPipelineStage) {
  if (!s.name.trim()) s.name = t('Untitled stage')
  editingStageId.value = null
}

// Drag-reorder the swimlanes — the ERP pointer sortable (floating ghost + dashed
// slot + FLIP), identical feel to the Layout builder. rule/dnd-live-sortable.
const { dragIndex: laneDragIndex, ghost: laneGhost, start: laneStart } = usePointerSortable({
  axis: 'x', itemSelector: '.pipe-lane',
  move: (from, to) => {
    const pipe = currentPipe.value; if (!pipe) return
    const arr = [...pipe.stages]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m!); pipe.stages = arr
  },
})
const draggedStage = computed(() => (laneDragIndex.value !== null ? pipeStages.value[laneDragIndex.value] : null))

function addStage() {
  const pipe = currentPipe.value; if (!pipe) return
  const id = newStageId()
  pipe.stages.push({ id, name: t('New stage'), kind: 'open' })
  editingStageId.value = id
}
// Inline "can't delete the last stage" note keyed by pipeline id.
const stageDeleteError = ref('')
function removeStage(id: string) {
  const pipe = currentPipe.value; if (!pipe) return
  if (pipe.stages.length <= 1) { stageDeleteError.value = t('A pipeline must keep at least one stage.'); return }
  stageDeleteError.value = ''
  pipe.stages = pipe.stages.filter((s) => s.id !== id)
}

// ── Board DISPLAY settings (right-hand panel) — a local editable clone; Save
//    changes applies it. Drives which fields show on cards + stage/column props. ──
// ── Board saved VIEWS — a view = a named record filter PLUS its own board
//    display config (stage + card properties). Custom views are deferred —
//    the builder shows only the module's single default display for now. ──
const disp = computed<DealPipelineDisplay>(() => stores.value.display)
const enabledCardFields = computed(() => disp.value.cardFields.filter((f) => f.on))
const ownerFieldOn = computed(() => disp.value.cardFields.some((f) => f.key === 'owner' && f.on))

// Stage visibility — the eye toggle on the lane header hides/shows stages on
// the board. Hidden lanes render dimmed in the builder (still editable).
const hiddenStageIds = ref<string[]>([...(stores.value.views?.[0]?.hiddenStageIds ?? [])])
function isStageVisible(id: string): boolean { return !hiddenStageIds.value.includes(id) }
function setStageVisible(id: string, show: boolean) {
  if (show) hiddenStageIds.value = hiddenStageIds.value.filter((x) => x !== id)
  else if (!hiddenStageIds.value.includes(id)) hiddenStageIds.value = [...hiddenStageIds.value, id]
}

// Drag-reorder the card-property rows (order = the order fields stack on a card) —
// same ERP pointer sortable, vertical axis. rule/dnd-live-sortable.
const { dragIndex: fieldDragIndex, ghost: fieldGhost, start: fieldStart } = usePointerSortable({
  axis: 'y', itemSelector: '.pipe-side-row--drag',
  move: (from, to) => {
    const arr = [...disp.value.cardFields]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m!); disp.value.cardFields = arr
  },
})
const draggedField = computed(() => (fieldDragIndex.value !== null ? disp.value.cardFields[fieldDragIndex.value] : null))

// ── "+ Add property" to the Kanban card (Pipeline ▸ Card properties) ──
// A two-pane drawer (same as Access "Select users"); adds picked deal properties
// as extra card fields. Built-in fields (company/dealName/…) are left untouched.
const cardPropsDrawerOpen = ref(false)
const BUILT_IN_CARD_FIELD_META: Record<string, { subtitle: string; icon: string; devchange?: string }> = {
  company: { subtitle: 'company_name', icon: 'company', devchange: 'crm-selected-card-property-metadata' },
  dealName: { subtitle: 'record_name', icon: 'text-editor-text' },
  contactPerson: { subtitle: 'contact_person', icon: 'profile' },
  dealValue: { subtitle: 'record_value', icon: 'number' },
  owner: { subtitle: 'deal_owner', icon: 'profile' },
  closeDate: { subtitle: 'close_date', icon: 'calendar' },
  memo: { subtitle: 'memo', icon: 'textarea' },
}
// Options = the card's current fields (shown selected, right pane) + deal properties
// not already on the card (left pane). Dedupe by name so a built-in field like
// "Deal value" doesn't also appear as its property twin.
const cardPropOptions = computed(() => {
  const byId = new Map<string, { id: string; name: string; subtitle?: string; icon?: string; devchange?: string }>()
  const labels = new Set(disp.value.cardFields.map((f) => t(f.label).toLowerCase()))
  for (const f of disp.value.cardFields) {
    const meta = BUILT_IN_CARD_FIELD_META[f.key]
    byId.set(f.key, { id: f.key, name: t(f.label), subtitle: meta?.subtitle, icon: meta?.icon, devchange: meta?.devchange })
  }
  for (const p of propList.value) {
    if (byId.has(p.id) || labels.has(p.name.toLowerCase())) continue
    byId.set(p.id, { id: p.id, name: p.name, subtitle: p.variableName, icon: DEAL_PROPERTY_TYPE_ICON[p.type] })
  }
  return [...byId.values()]
})
const cardPropSelected = computed(() => disp.value.cardFields.map((f) => f.key))
function onCardPropsSaved(ids: string[]) {
  const idSet = new Set(ids)
  // Keep still-selected fields (preserving order + on/off state); append new picks.
  const kept = disp.value.cardFields.filter((f) => idSet.has(f.key))
  const keptKeys = new Set(kept.map((f) => f.key))
  const added = ids.filter((id) => !keptKeys.has(id)).map((id) => {
    const p = propList.value.find((x) => x.id === id)
    return { key: id, label: p ? p.name : id, on: true }
  })
  disp.value.cardFields = [...kept, ...added]
  cardPropsDrawerOpen.value = false
}

// ── Field type options + labels ──────────────────────────────────────────────
const FIELD_TYPE_OPTIONS = (Object.entries(CRM_FIELD_TYPE_LABELS) as [CrmFieldType, string][])
  .map(([value, label]) => ({ value, label }))
function typeLabel(type: CrmFieldType): string { return CRM_FIELD_TYPE_LABELS[type] }
function hasOptions(type: CrmFieldType): boolean { return type === 'pick-list' || type === 'radio' }

// ── Properties tab — the module's property catalogue as a table (name · field
//    type · created by · fill rate · edit/delete). Local editable clone;
//    Save changes persists it. ──
// Fill rate = % of active (non-archived) deals whose corresponding field carries a
// value, computed from the real deals DB. Properties with no matching deal field
// Fill-rate matchers per module type — computed from actual records in the DB.
const DEAL_FILL: Record<string, (d: Deal) => boolean> = {
  'deal-value': (d) => d.value > 0,
  'currency': (d) => !!d.currency,
  'transaction-date': (d) => !!(d.transactionDate || d.createdAt),
  'due-date': (d) => !!d.expectedCloseDate,
  'transaction-no': (d) => !!d.id,
  'reference-no': (d) => !!d.referenceNumber,
  'company': (d) => !!d.customerId,
  'contact-person': (d) => !!d.picName,
  'contact-person-email': (d) => !!(d as any).picEmail,
  'contact-person-phone': (d) => !!(d as any).picPhone,
  'product-lines': (d) => !!(d.products && d.products.length),
  'payment-terms': (d) => !!d.paymentTerms,
  'message': (d) => !!d.description,
  'memo': (d) => !!d.notes,
  'requires-shipping': (d) => !!(d.shipTo || d.shipVia || d.trackingNo || d.shipDate),
  'shipping-fee': (d) => !!(d.shippingFee && d.shippingFee > 0),
  'shipping-address': (d) => !!d.shipTo,
  'billing-address': (d) => !!d.billingAddress,
  'shipping-date': (d) => !!d.shipDate,
  'delivery-date': (d) => !!(d as any).deliveryDate,
  'ship-via': (d) => !!d.shipVia,
  'tracking-no': (d) => !!d.trackingNo,
  'warehouse': (d) => !!d.warehouse,
  'attachment': (d) => !!(d.attachments && d.attachments.length),
  'discount': (d) => !!(d.orderDiscount && d.orderDiscount > 0),
  'tax': (d) => !!d.tax,
  'global-discount': (d) => !!(d.orderDiscount && d.orderDiscount > 0),
  'tax-inclusive': (d) => d.taxType === 'inclusive',
  'tax-after-discount': () => false,
  'close-date': (d) => !!d.expectedCloseDate,
  'deal-name': (d) => !!d.name,
  'owner': (d) => !!d.owner,
  'files': (d) => !!(d.attachments && d.attachments.length),
  'notes': (d) => notesFor('deal', d.id).length > 0,
  'activity-log': () => true,
  'sales-order-list': (d) => d.conversion === 'converted' && d.convertedTarget === 'Sales Order',
  'sales-quote-list': (d) => d.conversion === 'converted' && d.convertedTarget === 'Sales Quote',
  'closed-lost-reason': (d) => !!d.lostReason,
  'created-by-user-id': (d) => !!d.createdBy,
  'deal-stage': (d) => !!d.stage,
  'deal-type': () => false,
  'team': () => false,
  'last-activity-date': (d) => !!d.lastActivity,
  'owner-assigned-date': (d) => !!d.createdAt,
  'pipeline': () => true,
  'record-id': (d) => !!d.id,
  'record-source': (d) => !!d.conversion && d.conversion !== 'none',
  'record-source-detail-1': () => false,
  'record-source-detail-2': () => false,
  'record-source-detail-3': () => false,
  'updated-by-user-id': (d) => !!d.lastModifiedBy,
}
const SERVICE_FILL: Record<string, (d: ServiceDeal) => boolean> = {
  'deal-value': (d) => d.value > 0,
  'currency': (d) => !!d.currency,
  'transaction-date': (d) => !!d.transactionDate,
  'due-date': (d) => !!d.dueDate,
  'transaction-no': (d) => !!d.transactionNo,
  'reference-no': (d) => !!d.referenceNo,
  'company': (d) => !!d.company,
  'contact-person': (d) => !!d.contact,
  'product-lines': (d) => !!(d.products && d.products.length),
  'payment-terms': (d) => !!d.paymentTerms,
  'message': (d) => !!d.description,
  'memo': (d) => !!d.memo,
  'attachment': (d) => !!(d.files && d.files.length),
  'deal-name': (d) => !!d.name,
  'owner': (d) => !!d.owner,
  'close-date': (d) => !!d.dueDate,
  'files': (d) => !!(d.files && d.files.length),
  'notes': (d) => notesFor('service', d.id).length > 0,
  'activity-log': () => true,
  'sales-order-list': (d) => !!d.linkedTransaction && d.linkedTransaction.type === 'Sales Order',
  'sales-quote-list': (d) => !!d.linkedTransaction && d.linkedTransaction.type === 'Sales Quote',
}
const GENERIC_FILL: Record<string, (d: GenericModuleRecord) => boolean> = {
  'deal-name': (d) => !!d.name,
  'owner': (d) => !!d.owner,
  'company': (d) => !!d.values.customer,
  'contact-person': (d) => !!d.values.contactPerson,
  'deal-value': (d) => !!(d.values.dealValue && d.values.dealValue > 0),
  'currency': (d) => !!d.values.currency,
  'transaction-date': (d) => !!d.values.transactionDate,
  'due-date': (d) => !!d.values.dueDate,
  'payment-terms': (d) => !!d.values.paymentTerms,
  'reference-no': (d) => !!d.values.referenceNo,
  'message': (d) => !!d.values.description,
  'memo': (d) => !!d.values.memo,
  'files': () => false,
  'notes': () => false,
  'activity-log': () => true,
  'sales-order-list': () => false,
  'sales-quote-list': () => false,
}
function computeFillRate(id: string): number {
  const moduleId = props.orderId
  if (mod.value && mod.value.status !== 'published') return 0
  if (moduleId === 'deals') {
    const checker = DEAL_FILL[id]
    const active = deals.filter((d) => !d.archived)
    if (!checker || !active.length) return 0
    return Math.round((active.filter(checker).length / active.length) * 100)
  }
  if (moduleId === 'services') {
    const checker = SERVICE_FILL[id]
    const active = serviceDeals.filter((d) => !d.archived)
    if (!checker || !active.length) return 0
    return Math.round((active.filter(checker).length / active.length) * 100)
  }
  const checker = GENERIC_FILL[id]
  const records = genericRecordsFor(moduleId)
  if (!checker || !records.length) return 0
  return Math.round((records.filter(checker).length / records.length) * 100)
}
const propList = ref<DealProperty[]>([])
function loadProperties() {
  propList.value = JSON.parse(JSON.stringify(stores.value.properties))
  // Recompute fill rate from the live deals data (0% when the field isn't used).
  for (const p of propList.value) if (p.system) p.fillRate = computeFillRate(p.id)
}
const propTypeOptions = computed(() => {
  const seen = new Set<string>()
  return propList.value
    .filter((p) => (seen.has(p.type) ? false : (seen.add(p.type), true)))
    .map((p) => ({ value: p.type, label: p.type }))
})
function propCreatedByLabel(p: DealProperty): string {
  return (p.isDefault || p.system) ? 'System' : (p.createdBy || CRM_CURRENT_USER)
}
function canManageProperty(p: DealProperty): boolean {
  return propCreatedByLabel(p) !== 'System' && !isRelatedListType(p.type)
}
const propCreatedByFilter = ref('')
const propCreatedByOptions = computed(() => {
  const names = new Set(propList.value.map(propCreatedByLabel))
  return [...names].map((name) => ({ value: name, label: t(name) }))
})
const propFilteredByCreator = computed(() => {
  if (!propCreatedByFilter.value) return propList.value
  return propList.value.filter((p) => propCreatedByLabel(p) === propCreatedByFilter.value)
})
const {
  search: propSearch, statusFilter: propTypeFilter, paginated: propPaginated, total: propTotal,
  currentPage: propPage, perPage: propPerPage, sortKey: propSortKey, sortDir: propSortDir,
  setPage: propSetPage, setPerPage: propSetPerPage, toggleSort: propToggleSort, setSort: propSetSort,
} = useTableState<DealProperty>(propFilteredByCreator, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s)) && (!status || row.type === status),
  defaultSort: { key: 'name', dir: 'asc' },
})
watch(propCreatedByFilter, () => propSetPage(1))
const propHasFilter = computed(() => !!propSearch.value || !!propTypeFilter.value || !!propCreatedByFilter.value)
function clearPropFilters() { propSearch.value = ''; propTypeFilter.value = ''; propCreatedByFilter.value = '' }
const systemActionDevChangePropertyId = computed(() =>
  propPaginated.value.find((p) => propCreatedByLabel(p) === 'System' && !isRelatedListType(p.type))?.id ?? '',
)
const PROP_COLUMNS: TableColumn[] = [
  // Explicit 360px width for this table only (escape hatch) — property names run long.
  { key: 'name',      label: 'Name',       width: '360px', sortable: true, sortType: 'text' },
  { key: 'type',      label: 'Field type', kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'createdBy', label: 'Created by', kind: 'status' },
  { key: 'fillRate',  label: 'Fill rate',  kind: 'number', align: 'right', sortable: true, sortType: 'number' },
]

// New / edit property drawer
const propDrawerOpen = ref(false)
const propMode = ref<'add' | 'edit'>('add')
const editingProp = ref<DealProperty | null>(null)
function openAddProperty() { propMode.value = 'add'; editingProp.value = null; propDrawerOpen.value = true }
function openEditProperty(id: string) {
  const p = propList.value.find((x) => x.id === id); if (!p) return
  propMode.value = 'edit'; editingProp.value = p; propDrawerOpen.value = true
}
function onPropertySave(payload: { name: string; variableName: string; type: DealPropertyType; config: DealPropertyConfig }) {
  if (propMode.value === 'edit' && editingProp.value) {
    const p = propList.value.find((x) => x.id === editingProp.value!.id)
    if (p) { p.name = payload.name; p.variableName = payload.variableName; p.type = payload.type; p.config = payload.config }
  } else {
    propList.value = [...propList.value, {
      id: `p-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      name: payload.name, variableName: payload.variableName, type: payload.type, system: false, fillRate: 0,
      createdBy: CRM_CURRENT_USER, config: payload.config,
    }]
  }
  propDrawerOpen.value = false
}
// Create a property from the Layout ▸ Add-property drawer's "+ New property".
// Adds to the editable propList (persisted on Save changes); returns the new prop
// so the layout drawer can show it in the Add-property list.
function createDealProperty(payload: { name: string; variableName: string; type: DealPropertyType; config: DealPropertyConfig }): DealProperty {
  const np: DealProperty = {
    id: `p-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    name: payload.name, variableName: payload.variableName, type: payload.type, system: false, fillRate: 0,
    createdBy: CRM_CURRENT_USER, config: payload.config,
  }
  propList.value = [...propList.value, np]
  return np
}
function deleteProperty(id: string) {
  const p = propList.value.find((x) => x.id === id)
  if (!p || p.system) return
  propList.value = propList.value.filter((x) => x.id !== id)
}

// Single-choice fields feed the Layout driver + Kanban "Group by".
const choiceFieldOptions = computed(() =>
  draft.fields.filter((f) => hasOptions(f.type)).map((f) => ({ value: f.id, label: f.label })),
)
const layoutDriverOptions = computed(() => [{ value: '', label: t('None') }, ...choiceFieldOptions.value])
function fieldLabelOf(id?: string): string {
  if (!id) return ''
  return draft.fields.find((f) => f.id === id)?.label ?? id
}

// ── Fields grouped by section / column ───────────────────────────────────────
function sectionColumnFields(section: string, col: 1 | 2): CrmModuleField[] {
  return draft.fields.filter((f) => f.section === section && f.column === col)
}
const unusedFields = computed(() => draft.fields.filter((f) => !f.section))
// A protected field (system + required) can't leave the layout.
function isProtected(f: CrmModuleField): boolean { return f.system && f.required }

// Inline "can't remove" notes keyed by field id.
const removeErrors = reactive<Record<string, string>>({})
function removeFieldFromLayout(f: CrmModuleField) {
  if (isProtected(f)) {
    removeErrors[f.id] = t('This field is required by the system and must stay in the layout.')
    return
  }
  delete removeErrors[f.id]
  f.section = undefined
  f.column = undefined
}

// ── Field modal ──────────────────────────────────────────────────────────────
const fieldModalOpen = ref(false)
const fieldModalMode = ref<'add' | 'edit'>('add')
const editingFieldId = ref<string | null>(null)
interface FieldForm {
  label: string
  type: CrmFieldType
  required: boolean
  options: string[]
  section: string // section name or UNUSED
  column: string // '1' | '2'
  system: boolean
}
const fieldForm = reactive<FieldForm>({ label: '', type: 'text', required: false, options: [], section: UNUSED, column: '1', system: false })
const fieldLabelError = ref('')
const newOption = ref('')
const optionError = ref('')

const sectionSelectOptions = computed(() => [
  ...draft.sections.map((s) => ({ value: s, label: s })),
  { value: UNUSED, label: t('Unused') },
])
const COLUMN_OPTIONS = [
  { value: '1', label: t('Column 1') },
  { value: '2', label: t('Column 2') },
]
// Editing a system field's type is locked (keep control, show a note).
const typeLocked = computed(() => fieldModalMode.value === 'edit' && fieldForm.system)
const fieldModalTitle = computed(() => (fieldModalMode.value === 'edit' ? t('Edit field') : t('Add field')))

function openAddField(section?: string, column?: 1 | 2) {
  fieldModalMode.value = 'add'
  editingFieldId.value = null
  fieldLabelError.value = ''
  optionError.value = ''
  newOption.value = ''
  Object.assign(fieldForm, {
    label: '', type: 'text', required: false, options: [],
    section: section ?? UNUSED, column: String(column ?? 1), system: false,
  })
  fieldModalOpen.value = true
}
function openEditField(f: CrmModuleField) {
  fieldModalMode.value = 'edit'
  editingFieldId.value = f.id
  fieldLabelError.value = ''
  optionError.value = ''
  newOption.value = ''
  Object.assign(fieldForm, {
    label: f.label,
    type: f.type,
    required: f.required,
    options: f.options ? [...f.options] : [],
    section: f.section ?? UNUSED,
    column: String(f.column ?? 1),
    system: f.system,
  })
  fieldModalOpen.value = true
}
function onFieldTypeChange(v: string) {
  if (typeLocked.value) return // locked — ignore (note shown below)
  fieldForm.type = (v || 'text') as CrmFieldType
}
function addOption() {
  const v = newOption.value.trim()
  if (!v) { optionError.value = t('Enter an option name.'); return }
  if (fieldForm.options.includes(v)) { optionError.value = t('This option already exists.'); return }
  fieldForm.options.push(v)
  newOption.value = ''
  optionError.value = ''
}
function removeOption(i: number) { fieldForm.options.splice(i, 1) }

function saveField() {
  if (!fieldForm.label.trim()) { fieldLabelError.value = t('Enter a field label.'); return }
  const inLayout = fieldForm.section !== UNUSED
  const section = inLayout ? fieldForm.section : undefined
  const column = inLayout ? (Number(fieldForm.column) as 1 | 2) : undefined
  const options = hasOptions(fieldForm.type) ? [...fieldForm.options] : undefined

  if (fieldModalMode.value === 'edit' && editingFieldId.value) {
    const f = draft.fields.find((x) => x.id === editingFieldId.value)
    if (f) {
      f.label = fieldForm.label.trim()
      if (!f.system) f.type = fieldForm.type // system field type is locked
      f.required = fieldForm.required
      f.options = hasOptions(f.type) ? options : undefined
      f.section = section
      f.column = column
      if (section) delete removeErrors[f.id]
    }
  } else {
    draft.fields.push({
      id: `f-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      label: fieldForm.label.trim(),
      type: fieldForm.type,
      required: fieldForm.required,
      system: false,
      options,
      section,
      column,
    })
  }
  fieldModalOpen.value = false
}

// ── Section modal (add / rename) + delete ────────────────────────────────────
const sectionModalOpen = ref(false)
const sectionModalMode = ref<'add' | 'rename'>('add')
const sectionOriginal = ref('')
const sectionNameInput = ref('')
const sectionNameError = ref('')
const sectionDeleteError = reactive<Record<string, string>>({})

const sectionModalTitle = computed(() => (sectionModalMode.value === 'rename' ? t('Rename section') : t('Add section')))

function openAddSection() {
  sectionModalMode.value = 'add'
  sectionOriginal.value = ''
  sectionNameInput.value = ''
  sectionNameError.value = ''
  sectionModalOpen.value = true
}
function openRenameSection(section: string) {
  sectionModalMode.value = 'rename'
  sectionOriginal.value = section
  sectionNameInput.value = section
  sectionNameError.value = ''
  sectionModalOpen.value = true
}
function saveSection() {
  const name = sectionNameInput.value.trim()
  if (!name) { sectionNameError.value = t('Enter a section name.'); return }
  const clash = draft.sections.some((s) => s.toLowerCase() === name.toLowerCase() && s !== sectionOriginal.value)
  if (clash) { sectionNameError.value = t('A section with this name already exists.'); return }
  if (sectionModalMode.value === 'add') {
    draft.sections.push(name)
  } else {
    const i = draft.sections.indexOf(sectionOriginal.value)
    if (i !== -1) draft.sections.splice(i, 1, name)
    draft.fields.forEach((f) => { if (f.section === sectionOriginal.value) f.section = name })
  }
  sectionModalOpen.value = false
}
function deleteSection(section: string) {
  const blocked = draft.fields.some((f) => f.section === section && isProtected(f))
  if (blocked) {
    sectionDeleteError[section] = t('This section holds a system-required field and can’t be deleted.')
    return
  }
  delete sectionDeleteError[section]
  // Move its fields to Unused, then drop the section.
  draft.fields.forEach((f) => { if (f.section === section) { f.section = undefined; f.column = undefined } })
  const i = draft.sections.indexOf(section)
  if (i !== -1) draft.sections.splice(i, 1)
}

// ── View modal ───────────────────────────────────────────────────────────────
const VISIBILITY_LABELS: Record<CrmModuleViewVisibility, string> = { private: 'Private', team: 'Team', everyone: 'Everyone' }
const VIEW_TYPE_OPTIONS = [
  { value: 'list', label: t('List') },
  { value: 'kanban', label: t('Kanban') },
]
const VISIBILITY_OPTIONS = [
  { value: 'private', label: t('Private') },
  { value: 'team', label: t('Team') },
  { value: 'everyone', label: t('Everyone') },
]

const viewsError = ref('')
function removeView(v: CrmModuleView) {
  if (draft.views.length <= 1) { viewsError.value = t('A module must keep at least one view.'); return }
  viewsError.value = ''
  const i = draft.views.findIndex((x) => x.id === v.id)
  if (i !== -1) draft.views.splice(i, 1)
}

const viewModalOpen = ref(false)
const viewModalMode = ref<'add' | 'edit'>('add')
const editingViewId = ref<string | null>(null)
interface ViewForm { name: string; type: CrmModuleViewType; categorizeBy: string; visibility: CrmModuleViewVisibility }
const viewForm = reactive<ViewForm>({ name: '', type: 'list', categorizeBy: '', visibility: 'private' })
const viewNameError = ref('')
const viewCatError = ref('')
const viewModalTitle = computed(() => (viewModalMode.value === 'edit' ? t('Edit view') : t('Add view')))

function openAddView() {
  viewModalMode.value = 'add'
  editingViewId.value = null
  viewNameError.value = ''
  viewCatError.value = ''
  Object.assign(viewForm, { name: '', type: 'list', categorizeBy: '', visibility: 'private' })
  viewModalOpen.value = true
}
function openEditView(v: CrmModuleView) {
  viewModalMode.value = 'edit'
  editingViewId.value = v.id
  viewNameError.value = ''
  viewCatError.value = ''
  Object.assign(viewForm, { name: v.name, type: v.type, categorizeBy: v.categorizeBy ?? '', visibility: v.visibility })
  viewModalOpen.value = true
}
function saveView() {
  if (!viewForm.name.trim()) { viewNameError.value = t('Enter a view name.'); return }
  if (viewForm.type === 'kanban' && !viewForm.categorizeBy) { viewCatError.value = t('Choose a field to categorize the board by.'); return }
  const categorizeBy = viewForm.type === 'kanban' ? viewForm.categorizeBy : undefined
  if (viewModalMode.value === 'edit' && editingViewId.value) {
    const v = draft.views.find((x) => x.id === editingViewId.value)
    if (v) { v.name = viewForm.name.trim(); v.type = viewForm.type; v.categorizeBy = categorizeBy; v.visibility = viewForm.visibility }
  } else {
    draft.views.push({
      id: `v-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      name: viewForm.name.trim(),
      type: viewForm.type,
      categorizeBy,
      visibility: viewForm.visibility,
    })
  }
  viewModalOpen.value = false
}

// ── Header actions ───────────────────────────────────────────────────────────
const nameError = ref('')
function saveChanges() {
  const m = mod.value
  if (!m) return
  nameError.value = ''
  if (!draft.name.trim()) { nameError.value = t('Enter a module name.'); return }
  // Deals: persist the pipeline config too.
  if (isDealLikeModule(m.id)) {
    const s = stores.value
    s.pipelines.splice(0, s.pipelines.length, ...JSON.parse(JSON.stringify(pipeDraft.value)))
    s.persistPipelines()
    s.persistDisplay()
    if (s.views?.[0]) { s.views[0].hiddenStageIds = [...hiddenStageIds.value] }
    s.persistViews()
    Object.assign(s.setup, JSON.parse(JSON.stringify(setup)))
    s.persistSetup()
    s.properties.splice(0, s.properties.length, ...JSON.parse(JSON.stringify(propList.value)))
    s.persistProperties()
    Object.assign(s.detailLayout, JSON.parse(JSON.stringify(draft.detailLayout)))
    s.persistDetailLayout()
  }
  Object.assign(m, {
    sections: [...draft.sections],
    fields: clone(draft.fields),
    views: clone(draft.views),
    layoutDriver: draft.layoutDriver || undefined,
    conversionTarget: draftConversionTarget.value,
  })
  // Renaming/re-iconing the module (incl. the Deals system module) also updates
  // its nav item.
  m.name = draft.name.trim() || m.name
  m.icon = draft.icon
  m.accessLevel = draft.accessLevel
  setModuleTeams(m.id, draft.accessLevel === 'team' ? draft.teamIds : [])
  persistCrmModule(m, AUTHOR, nowStamp())
  successToast(t(isDealLikeModule(m.id) ? 'Pipeline saved' : 'Module saved'))
  viewMode.value = true
}
// Every module (Deals system module included) is edited from the Modules index.
function cancel() {
  if (!isCreating && !viewMode.value) {
    viewMode.value = true
    loadDraft(); loadSetup(); loadProperties()
    return
  }
  router.push('/crm/settings/modules')
}

// ── Creation (orderId === 'new') ────────────────────────────────────────────
const teamError = ref('')
function saveNewModule(status: 'draft' | 'published') {
  nameError.value = ''
  teamError.value = ''
  if (!draft.name.trim()) { nameError.value = t('Enter a module name.'); return }
  if (draft.accessLevel === 'team' && draft.teamIds.length === 0) {
    teamError.value = t('Select at least one team.')
    return
  }
  const id = createCustomModule(draft.name.trim(), draft.icon, draft.accessLevel, draft.teamIds, status)
  // Commit whatever was configured in THIS creation session (Properties/Pipeline/
  // Layout/Setup) into the freshly-created module's real stores — overwriting the
  // auto-seeded generic defaults `createCustomModule` just wrote.
  const s = moduleStores(id)
  s.pipelines.splice(0, s.pipelines.length, ...JSON.parse(JSON.stringify(pipeDraft.value)))
  s.persistPipelines()
  Object.assign(s.display, JSON.parse(JSON.stringify(disp)))
  s.persistDisplay()
  Object.assign(s.setup, JSON.parse(JSON.stringify(setup)))
  s.persistSetup()
  s.properties.splice(0, s.properties.length, ...JSON.parse(JSON.stringify(propList.value)))
  s.persistProperties()
  Object.assign(s.detailLayout, JSON.parse(JSON.stringify(draft.detailLayout)))
  s.persistDetailLayout()
  const created = getCrmModule(id)
  if (created) { created.conversionTarget = draftConversionTarget.value; persistCrmModule(created, AUTHOR, nowStamp()) }
  resetGenericModuleDraft('new')
  successToast(t(status === 'published' ? 'Module published' : 'Module saved as draft'))
  router.push(`/crm/settings/modules/${id}`)
}
// Publish (from creation) needs confirmation — it goes straight into the CRM nav
// for anyone with access. Save as draft has no such consequence, so no confirm.
const publishNewConfirmOpen = ref(false)
function askPublishNew() {
  nameError.value = ''
  teamError.value = ''
  if (!draft.name.trim()) { nameError.value = t('Enter a module name.'); return }
  if (draft.accessLevel === 'team' && draft.teamIds.length === 0) {
    teamError.value = t('Select at least one team.')
    return
  }
  publishNewConfirmOpen.value = true
}
function confirmPublishNew() { publishNewConfirmOpen.value = false; saveNewModule('published') }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink v-if="mod" class="detail-breadcrumb" to="/crm/settings/modules">{{ t('Modules') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 v-if="viewMode || isCreating || !mod || isDeals" class="detail-title">{{ isCreating ? t('New module') : mod ? mod.name : t('Module not found') }}</h1>
          <MpInput v-else id="builder-title" v-model="draft.name" class="builder-title-input" :aria-label="t('Module name')" :is-invalid="!!nameError" />
          <ErpStatusBadge v-if="!isCreating && mod && !mod.system" :status="statusBadge.status" :label="t(statusBadge.label)" badge-for="additionalInformation" />
        </div>
      </div>
      <div v-if="viewMode && mod" class="cd-bar-actions" data-devchange="crm-module-view-mode">
        <MpButton v-if="!isDealSystem && mod.status === 'published'" variant="secondary" is-rounded @click="unpublishModule">{{ t('Unpublish') }}</MpButton>
        <MpPopover id="module-actions-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="caret-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="enterEdit">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="!isDealSystem" @click="deleteConfirmOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- Section tabs — OUTSIDE the white stage (rule/erp-tabs-pattern: section tabs
         sit on the neutral-subtle bar below the title, not as MpTabs in the stage). -->
    <div v-if="mod" class="page-tabs-bar">
      <button v-for="tab in tabs" :key="tab.key" type="button" class="page-tab" :class="{ 'page-tab--active': activeTab === tab.key }" @click="activeTab = tab.key">{{ t(tab.label) }}</button>
    </div>

    <div class="detail-stage">
      <!-- ── Module not found ── -->
      <div v-if="!mod" class="builder-empty">
        <MpIcon name="folder-close" size="xl" />
        <p class="builder-empty-title">{{ t('Module not found') }}</p>
        <p class="builder-empty-caption">{{ t('This module doesn’t exist or was removed.') }}</p>
        <MpButton variant="secondary" is-rounded @click="cancel">{{ t('Back to Modules') }}</MpButton>
      </div>

      <template v-else>
          <!-- ════════ SETUP (Deals) ════════ -->
          <div v-show="activeTab === 'setup'" class="builder-panel">
            <!-- VIEW mode: ContentList read-only -->
            <div v-if="viewMode" class="setup-view">
              <ContentList :label="t('Module name')">
                <span class="mod-name-inline"><MpIcon :name="mod!.icon ?? 'pipeline'" size="sm" /> {{ mod!.name }}</span>
              </ContentList>
              <ContentList :label="t('Base currency')" :value="setup.baseCurrency === 'IDR' ? 'Indonesian Rupiah (Rp)' : setup.baseCurrency" />
              <ContentList :label="t('Default close date')" :value="viewCloseDateLabel" />
              <ContentList :label="t('Access level')" :value="viewAccessLabel" />
              <div class="setup-activity-log" data-devchange="crm-module-activity-log">
                <a class="setup-activity-link" @click.prevent="activityLogOpen = true">
                  {{ t('Last updated by') }} {{ mod!.updatedBy ?? 'System' }} {{ t('on') }} {{ formatActivityDate(mod!.updatedAt) }}
                </a>
              </div>
            </div>
            <!-- EDIT mode: full form -->
            <div v-else class="setup-form">
              <!-- Module name — full-width (6-col) MpFormControl; icon-prefix picker + counter -->
              <MpFormControl id="setup-name-fc">
                <div class="setup-labelrow">
                  <MpFormLabel>{{ t('Module name') }}</MpFormLabel>
                  <span class="setup-counter">{{ draft.name.length }} / {{ MODULE_NAME_MAX }}</span>
                </div>
                <MpInputGroup id="setup-name-group" size="md">
                  <MpInputLeftAddon id="setup-name-addon" has-background>
                    <MpPopover id="module-icon-menu" :is-open="iconMenuOpen" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @close="iconMenuOpen = false">
                      <MpPopoverTrigger>
                        <button type="button" class="setup-icon-trigger" :aria-label="t('Change icon')" @click="iconMenuOpen = !iconMenuOpen">
                          <MpIcon :name="draft.icon" size="md" />
                          <MpIcon name="chevrons-down" size="sm" class="setup-icon-caret" />
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ padding: 'var(--mp-spacing-2)', width: '240px' })">
                        <div class="pipe-icon-grid">
                          <button
                            v-for="ic in CRM_MODULE_ICONS" :key="ic" type="button"
                            class="pipe-icon-choice" :class="{ 'pipe-icon-choice--active': draft.icon === ic }"
                            :aria-label="ic" @click="pickIcon(ic)"
                          ><MpIcon :name="ic" size="md" /></button>
                        </div>
                      </MpPopoverContent>
                    </MpPopover>
                  </MpInputLeftAddon>
                  <MpInput id="setup-module-name" v-model="draft.name" :maxlength="MODULE_NAME_MAX" is-full-width data-devchange="crm-module-name-mandatory" />
                </MpInputGroup>
                <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Base currency -->
              <MpFormControl id="setup-currency-fc">
                <MpFormLabel>{{ t('Base currency') }}</MpFormLabel>
                <ErpFilterSelect
                  id="setup-currency" :model-value="setup.baseCurrency" :options="CURRENCY_OPTIONS"
                  :is-clearable="false" width="280px"
                  @update:model-value="(v: string) => (setup.baseCurrency = v || 'IDR')"
                />
              </MpFormControl>

              <!-- Default close date — checkbox (title + #description caption, box top-aligned) -->
              <div class="setup-field" data-devchange="crm-module-close-date-record-copy">
                <MpCheckbox id="setup-closedate" :is-checked="setup.applyCloseDate" @change="setup.applyCloseDate = !setup.applyCloseDate">
                  {{ t('Apply default close date to new records') }}
                  <template #description>
                    {{ t('Select the default close date when creating a record.') }}
                  </template>
                </MpCheckbox>

                <div v-if="setup.applyCloseDate" class="setup-indent">
                  <MpRadio id="close-period" name="close-mode" value="period" :is-checked="setup.closeMode === 'period'" @change="setup.closeMode = 'period'">{{ t('End of a certain period') }}</MpRadio>
                  <div v-if="setup.closeMode === 'period'" class="setup-radio-detail">
                    <ErpFilterSelect
                      id="close-period-opt" :model-value="setup.closePeriod" :options="CLOSE_PERIOD_OPTIONS"
                      :is-clearable="false" width="224px"
                      @update:model-value="(v: string) => (setup.closePeriod = (v || 'this-month') as DealModuleSetup['closePeriod'])"
                    />
                  </div>

                  <MpRadio id="close-fromcreation" name="close-mode" value="fromCreation" :is-checked="setup.closeMode === 'fromCreation'" @change="setup.closeMode = 'fromCreation'">{{ t('Time from record creation') }}</MpRadio>
                  <div v-if="setup.closeMode === 'fromCreation'" class="setup-radio-detail setup-amount">
                    <MpInput id="close-amount" v-model.number="setup.closeAmount" type="number" class="setup-amount-input" :aria-label="t('Amount')" />
                    <ErpFilterSelect
                      id="close-unit" :model-value="setup.closeUnit" :options="CLOSE_UNIT_OPTIONS"
                      :is-clearable="false" width="104px"
                      @update:model-value="(v: string) => (setup.closeUnit = (v || 'days') as DealModuleSetup['closeUnit'])"
                    />
                  </div>
                </div>
              </div>

              <!-- Access level — Company (all CRM staff) or specific Team(s). Team
                   selection uses the same "pick many" drawer as Add users. -->
              <div class="setup-field">
                <div class="setup-labelgroup">
                  <span class="setup-fieldlabel">{{ t('Access level') }}</span>
                  <span class="setup-caption">{{ t('Choose whether this module is company-wide or limited to specific teams.') }}</span>
                </div>
                <div class="setup-radio-row">
                  <MpRadio id="setup-access-company" name="setup-access-level" value="company" :is-checked="draft.accessLevel === 'company'" @change="draft.accessLevel = 'company'">{{ t('Company') }}</MpRadio>
                  <MpRadio id="setup-access-team" name="setup-access-level" value="team" :is-checked="draft.accessLevel === 'team'" @change="draft.accessLevel = 'team'">{{ t('Team') }}</MpRadio>
                </div>
                <div v-if="draft.accessLevel === 'team'" class="setup-team-picked">
                  <template v-if="selectedTeams.length">
                    <h4 class="setup-teams-title">{{ t('Selected teams') }}</h4>
                    <ul class="setup-user-list">
                      <li v-for="tm in selectedTeams" :key="tm.id" class="setup-user-row">
                        <span class="setup-user-info">
                          <span class="setup-user-name">{{ tm.name }}</span>
                        </span>
                        <MpTooltip :id="`team-rm-${tm.id}`" :label="t('Remove')" placement="top" use-portal>
                          <MpButton class="setup-user-remove" is-rounded :aria-label="`${t('Remove')} ${tm.name}`" @click="removeDraftTeam(tm.id)">
                            <MpIcon name="minus-circular" size="md" />
                          </MpButton>
                        </MpTooltip>
                      </li>
                    </ul>
                  </template>
                  <p v-else class="setup-access-empty">{{ t('No team selected') }}</p>
                  <MpButton class="setup-access-btn" variant="secondary" is-rounded left-icon="add" @click="teamDrawerOpen = true">{{ t('Select team') }}</MpButton>
                </div>
                <MpFormErrorMessage v-if="teamError">{{ teamError }}</MpFormErrorMessage>
              </div>
            </div>
          </div>

          <!-- ════════ PROPERTIES (Deals) — the module's fields as a table ════════ -->
          <div v-show="activeTab === 'properties'" class="builder-panel builder-panel--table" data-devchange="crm-record-name-value-rename">
            <ErpTablePage
              :columns="PROP_COLUMNS"
              :rows="(propPaginated as unknown as Record<string, unknown>[])"
              :total="propTotal"
              :current-page="propPage"
              :per-page="propPerPage"
              :sort-key="propSortKey"
              :sort-dir="propSortDir"
              filter-empty-label="property"
              :search="propSearch"
              :has-active-filter="propHasFilter"
              @page-change="propSetPage"
              @per-page-change="propSetPerPage"
              @sort="propToggleSort"
              @sort-change="propSetSort"
              @clear-filters="clearPropFilters"
            >
              <template #filters>
                <div class="filter-left">
                  <ErpFilterSelect
                    id="prop-type-filter"
                    :model-value="propTypeFilter"
                    :placeholder="t('Field type')"
                    :options="propTypeOptions"
                    @update:model-value="(v: string) => (propTypeFilter = v)"
                  />
                  <ErpFilterSelect
                    id="prop-created-by-filter"
                    data-devchange="crm-property-created-by-filter"
                    :model-value="propCreatedByFilter"
                    :placeholder="t('Created by')"
                    :options="propCreatedByOptions"
                    @update:model-value="(v: string) => (propCreatedByFilter = v)"
                  />
                </div>
                <div class="filter-right">
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="propSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                    <button v-if="propSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="propSearch = ''"><MpIcon name="close" size="sm" /></button>
                  </div>
                  <MpButton v-if="!viewMode" variant="tertiary" is-rounded left-icon="add" @click="openAddProperty()">{{ t('New property') }}</MpButton>
                </div>
              </template>

              <template #cell-name="{ row }">
                <span
                  class="prop-namecell"
                  :data-devchange="(row as unknown as DealProperty).id === 'company' ? 'crm-company-property-label' : undefined"
                >
                  <span class="prop-name">{{ (row as unknown as DealProperty).name }}</span>
                  <span class="prop-varname">{{ (row as unknown as DealProperty).variableName }}</span>
                </span>
              </template>
              <template #cell-type="{ row }">
                <span class="prop-type"><MpIcon :name="DEAL_PROPERTY_TYPE_ICON[(row as unknown as DealProperty).type]" size="sm" class="prop-type-icon" />{{ (row as unknown as DealProperty).type }}</span>
              </template>
              <template #cell-createdBy="{ row }">{{ t(propCreatedByLabel(row as unknown as DealProperty)) }}</template>
              <template #cell-fillRate="{ row }">{{ (row as unknown as DealProperty).fillRate }}%</template>

              <!-- Default properties (from the master library) + related lists are non-editable. -->
              <template v-if="!viewMode" #actions="{ row }">
                <MpPopover v-if="canManageProperty(row as unknown as DealProperty)" :id="`prop-actions-${(row as unknown as DealProperty).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton class="builder-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openEditProperty((row as unknown as DealProperty).id)">{{ t('Edit') }}</MpPopoverListItem>
                      <MpPopoverListItem v-if="!(row as unknown as DealProperty).system" @click="deleteProperty((row as unknown as DealProperty).id)">{{ t('Delete') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
                <span
                  v-else-if="(row as unknown as DealProperty).id === systemActionDevChangePropertyId"
                  class="prop-action-devchange-anchor"
                  data-devchange="crm-system-property-actions-removed"
                  aria-hidden="true"
                />
              </template>
            </ErpTablePage>
          </div>

          <!-- ════════ PIPELINE (Deals) — swimlane editor + settings sidebar ════════ -->
          <div v-show="activeTab === 'pipeline'" class="builder-panel builder-panel--pipeline" :data-devchange="isGenericModule ? 'crm-field-driven-pipeline' : 'crm-pipeline-no-custom-views'">

            <!-- ── Generic module: field picker + derived Kanban ── -->
            <template v-if="isGenericModule">
              <div class="pipe-field-picker" data-devchange="crm-field-driven-pipeline">
                <h3 class="pipe-field-picker__title">{{ t('Group by') }}</h3>
                <p class="pipe-field-picker__desc">{{ t('Select a property to group records into Kanban columns.') }}</p>
                <div v-if="!viewMode" class="pipe-field-picker__row">
                  <ErpFilterSelect
                    id="pipe-field-select"
                    :model-value="selectedPipeFieldId"
                    :placeholder="t('Select a field…')"
                    :options="pipelineFieldOptions"
                    :is-clearable="false"
                    width="100%"
                    class="pipe-field-picker__select"
                    @update:model-value="(v: string) => (selectedPipeFieldId = v)"
                  />
                  <MpButton variant="primary" is-rounded @click="applyPipelineField">{{ t('Apply') }}</MpButton>
                </div>
                <p v-else-if="assignedFieldLabel" class="pipe-field-picker__value">{{ assignedFieldLabel }}</p>
                <p v-else class="pipe-field-picker__empty">{{ t('No field assigned') }}</p>
              </div>

              <!-- Empty state: no field assigned yet -->
              <div v-if="!pipelineFieldId" class="pipe-empty">
                <img src="/illustrations/empty-folder.png" alt="" class="pipe-empty__illustration" width="288" height="240" />
                <p class="pipe-empty__title">{{ t('No pipeline configured') }}</p>
                <p class="pipe-empty__desc">{{ t('Select a property above and click Apply to generate Kanban columns from its options.') }}</p>
              </div>

              <!-- Field-derived Kanban preview -->
              <div v-else-if="fieldDerivedStages.length" class="pipe-layout">
                <div class="pipe-board">
                  <TransitionGroup name="lane" tag="div" class="pipe-lanes">
                    <div
                      v-for="(opt, i) in fieldDerivedStages" :key="opt.value"
                      class="pipe-lane"
                      :class="{ 'is-dragging': gmLaneDragIndex === i, 'pipe-lane--hidden': !isStageVisible(opt.value), [`pipe-lane--${i < fieldDerivedStages.length - 1 ? 'open' : 'closed'}`]: disp.colorColumns }"
                    >
                      <div class="pipe-lane-head">
                        <span
                          v-if="!viewMode"
                          class="pipe-lane-drag" :aria-label="t('Drag to reorder')"
                          @pointerdown="gmLaneStart(i, $event)"
                        ><MpIcon name="drag" size="md" /></span>
                        <div class="pipe-lane-label"><span class="pipe-lane-name">{{ opt.label }}</span></div>
                        <MpTooltip v-if="!viewMode" :id="`gm-stage-vis-${opt.value}`" :label="isStageVisible(opt.value) ? t('Hide stage in this view') : t('Show stage in this view')" placement="top" use-portal>
                          <button
                            class="pipe-lane-vis" type="button"
                            :aria-label="isStageVisible(opt.value) ? t('Hide stage in this view') : t('Show stage in this view')"
                            @click="setStageVisible(opt.value, !isStageVisible(opt.value))"
                          ><MpIcon :name="isStageVisible(opt.value) ? 'show' : 'hide'" size="sm" /></button>
                        </MpTooltip>
                      </div>
                      <div class="pipe-lane-cards">
                        <template v-if="i === 0">
                          <div v-for="n in 2" :key="n" class="pipe-card">
                            <template v-for="f in enabledCardFields" :key="f.key">
                              <span v-if="f.key === 'company'" class="pipe-card-company">{{ t('Company') }}</span>
                              <span v-else-if="f.key === 'dealName'" class="pipe-card-deal">{{ t('Record name') }}</span>
                              <span v-else-if="f.key === 'contactPerson'" class="pipe-card-sub">{{ t('Contact person') }}</span>
                              <span v-else-if="f.key === 'dealValue'" class="pipe-card-value">{{ t('Value') }}</span>
                              <span v-else-if="f.key === 'owner'" class="pipe-card-owner">{{ t('Owner') }}</span>
                              <span v-else-if="f.key === 'closeDate'" class="pipe-card-sub">{{ t('Expected close date') }}</span>
                              <span v-else-if="f.key === 'memo'" class="pipe-card-sub">{{ t('Memo') }}</span>
                              <span v-else class="pipe-card-sub">{{ t(f.label) }}</span>
                            </template>
                            <div v-if="disp.showAging" class="pipe-card-foot pipe-card-foot--end">
                              <span class="pipe-card-aging">2d</span>
                            </div>
                          </div>
                        </template>
                      </div>
                      <div v-if="disp.stageTotal" class="pipe-lane-total">
                        <span class="pipe-lane-total-label">{{ t('Total value') }}</span>
                      </div>
                    </div>
                  </TransitionGroup>
                </div>

                <!-- Settings sidebar (same as Deals pipeline) -->
                <aside v-if="!viewMode" class="pipe-sidebar">
                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title">{{ t('Stage properties') }}</h3>
                    <div class="pipe-side-row">
                      <MpToggle id="gm-disp-total" :is-checked="disp.stageTotal" :aria-label="t('Total value')" @update:is-checked="(v: boolean) => (disp.stageTotal = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Total value') }}</span>
                    </div>
                    <div class="pipe-side-row">
                      <MpToggle id="gm-disp-color" :is-checked="disp.colorColumns" :aria-label="t('Color stage columns')" @update:is-checked="(v: boolean) => (disp.colorColumns = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Color stage columns') }}</span>
                    </div>
                  </section>

                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title">{{ t('Card properties') }}</h3>
                    <TransitionGroup name="row" tag="div" class="pipe-side-rows">
                      <div
                        v-for="(f, i) in disp.cardFields" :key="f.key"
                        class="pipe-side-row pipe-side-row--drag"
                        :class="{ 'is-dragging': fieldDragIndex === i }"
                      >
                        <MpToggle :id="`gm-disp-${f.key}`" :is-checked="f.on" :aria-label="t(f.label)" @update:is-checked="(v: boolean) => (f.on = v)" />
                        <span class="pipe-side-rowlabel">{{ t(f.label) }}</span>
                        <span
                          class="pipe-side-drag" :aria-label="t('Drag to reorder')"
                          @pointerdown="fieldStart(i, $event)"
                        ><MpIcon name="drag" size="md" /></span>
                      </div>
                    </TransitionGroup>
                    <div class="pipe-side-row pipe-side-row--sep">
                      <MpToggle id="gm-disp-aging" :is-checked="disp.showAging" :aria-label="t('Rotting in (days)')" @update:is-checked="(v: boolean) => (disp.showAging = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Rotting in (days)') }}</span>
                    </div>
                    <div class="pipe-side-addprop">
                      <MpButton variant="ghost" is-rounded left-icon="add" @click="cardPropsDrawerOpen = true">{{ t('Add property') }}</MpButton>
                    </div>
                  </section>
                </aside>
              </div>

              <!-- Field assigned but has no columns yet -->
              <div v-else class="pipe-empty">
                <img src="/illustrations/empty-folder.png" alt="" class="pipe-empty__illustration" width="288" height="240" />
                <p class="pipe-empty__title">{{ t('No options found') }}</p>
                <p class="pipe-empty__desc">{{ t('The selected field has no options yet. Add options to it in the Properties tab to create Kanban columns.') }}</p>
              </div>
            </template>

            <!-- ── Predefined module (Deals/Services): direct stage editing ── -->
            <template v-else-if="currentPipe">
              <div class="pipe-layout">
                <!-- Board: one Kanban lane per stage, cards = live deals in it -->
                <div class="pipe-board">
                  <p v-if="stageDeleteError" class="builder-inline-error pipe-board-error">{{ stageDeleteError }}</p>
                  <TransitionGroup name="lane" tag="div" class="pipe-lanes">
                  <div
                    v-for="(s, i) in pipeStages" :key="s.id"
                    class="pipe-lane"
                    :class="{ 'is-dragging': laneDragIndex === i, 'pipe-lane--hidden': !isStageVisible(s.id), [`pipe-lane--${s.kind}`]: disp.colorColumns }"
                  >
                    <div class="pipe-lane-head">
                      <span
                        v-if="!viewMode"
                        class="pipe-lane-drag" :aria-label="t('Drag to reorder')"
                        @pointerdown="laneStart(i, $event)"
                      ><MpIcon name="drag" size="md" /></span>
                      <div class="pipe-lane-label">
                        <MpInput
                          v-if="!viewMode && editingStageId === s.id" :id="`lane-${s.id}`" v-model="s.name" class="pipe-lane-input"
                          :aria-label="t('Stage name')" @blur="commitStageName(s)" @keydown.enter.prevent="commitStageName(s)"
                        />
                        <template v-else>
                          <span class="pipe-lane-name">{{ s.name }}</span>
                          <button v-if="!viewMode" class="pipe-lane-edit" type="button" :aria-label="t('Rename stage')" @click="editStage(s.id)"><MpIcon name="edit" size="sm" /></button><!-- pixel-police-allow — icon-only edit affordance, styled via .pipe-lane-edit -->
                        </template>
                      </div>
                      <MpTooltip v-if="!viewMode" :id="`stage-vis-${s.id}`" :label="isStageVisible(s.id) ? t('Hide stage in this view') : t('Show stage in this view')" placement="top" use-portal>
                        <button
                          class="pipe-lane-vis" type="button"
                          :aria-label="isStageVisible(s.id) ? t('Hide stage in this view') : t('Show stage in this view')"
                          @click="setStageVisible(s.id, !isStageVisible(s.id))"
                        ><MpIcon :name="isStageVisible(s.id) ? 'show' : 'hide'" size="sm" /></button>
                      </MpTooltip>
                    </div>

                    <!-- Preview cards — placeholder field labels (a layout preview,
                         not live data); populated on the first lane only, per Figma. -->
                    <div class="pipe-lane-cards">
                      <template v-if="i === 0">
                        <div v-for="n in 2" :key="n" class="pipe-card">
                          <template v-for="f in enabledCardFields" :key="f.key">
                            <span v-if="f.key === 'company'" class="pipe-card-company">{{ t('Company') }}</span>
                            <span v-else-if="f.key === 'dealName'" class="pipe-card-deal">{{ t('Deal name') }}</span>
                            <span v-else-if="f.key === 'contactPerson'" class="pipe-card-sub">{{ t('Contact person') }}</span>
                            <span v-else-if="f.key === 'dealValue'" class="pipe-card-value">{{ t('Value') }}</span>
                            <span v-else-if="f.key === 'owner'" class="pipe-card-owner">{{ t('Owner') }}</span>
                            <span v-else-if="f.key === 'closeDate'" class="pipe-card-sub">{{ t('Expected close date') }}</span>
                            <span v-else-if="f.key === 'memo'" class="pipe-card-sub">{{ t('Memo') }}</span>
                            <span v-else class="pipe-card-sub">{{ t(f.label) }}</span>
                          </template>
                          <div v-if="disp.showAging" class="pipe-card-foot pipe-card-foot--end" data-devchange="crm-aging-always-bottom-right">
                            <span class="pipe-card-aging">2d</span>
                          </div>
                        </div>
                      </template>
                    </div>

                    <div v-if="disp.stageTotal" class="pipe-lane-total">
                      <span class="pipe-lane-total-label">{{ t('Total deal value') }}</span>
                    </div>

                    <button v-if="!viewMode" class="pipe-lane-delete" type="button" @click="removeStage(s.id)"><!-- pixel-police-allow — styled delete affordance -->
                      <MpIcon name="delete" size="sm" /><span>{{ t('Delete stage') }}</span>
                    </button>
                  </div>
                  </TransitionGroup>

                  <!-- + New stage -->
                  <MpButton v-if="!viewMode" class="pipe-newstage" variant="ghost" is-rounded left-icon="add" @click="addStage">{{ t('New stage') }}</MpButton>
                </div>

                <!-- Settings — kept in the Pipeline right column (edit mode only) -->
                <aside v-if="!viewMode" class="pipe-sidebar">
                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title">{{ t('Stage properties') }}</h3>
                    <div class="pipe-side-row">
                      <MpToggle id="disp-total" :is-checked="disp.stageTotal" :aria-label="t('Total deal value')" @update:is-checked="(v: boolean) => (disp.stageTotal = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Total deal value') }}</span>
                    </div>
                    <div class="pipe-side-row">
                      <MpToggle id="disp-color" :is-checked="disp.colorColumns" :aria-label="t('Color stage columns')" @update:is-checked="(v: boolean) => (disp.colorColumns = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Color stage columns') }}</span>
                    </div>
                  </section>

                  <section class="pipe-side-section">
                    <h3 class="pipe-side-title" data-devchange="crm-pipeline-card-props">{{ t('Card properties') }}</h3>
                    <TransitionGroup name="row" tag="div" class="pipe-side-rows">
                      <div
                        v-for="(f, i) in disp.cardFields" :key="f.key"
                        class="pipe-side-row pipe-side-row--drag"
                        :class="{ 'is-dragging': fieldDragIndex === i }"
                      >
                        <MpToggle :id="`disp-${f.key}`" :is-checked="f.on" :aria-label="t(f.label)" @update:is-checked="(v: boolean) => (f.on = v)" />
                        <span class="pipe-side-rowlabel">{{ t(f.label) }}</span>
                        <span
                          class="pipe-side-drag" :aria-label="t('Drag to reorder')"
                          @pointerdown="fieldStart(i, $event)"
                        ><MpIcon name="drag" size="md" /></span>
                      </div>
                    </TransitionGroup>
                    <div class="pipe-side-row pipe-side-row--sep">
                      <MpToggle id="disp-aging" :is-checked="disp.showAging" :aria-label="t('Rotting in (days)')" @update:is-checked="(v: boolean) => (disp.showAging = v)" />
                      <span class="pipe-side-rowlabel">{{ t('Rotting in (days)') }}</span>
                    </div>
                    <div class="pipe-side-addprop">
                      <MpButton variant="ghost" is-rounded left-icon="add" @click="cardPropsDrawerOpen = true">{{ t('Add property') }}</MpButton>
                    </div>
                  </section>
                </aside>
              </div>

            </template>
          </div>

          <!-- ════════ LAYOUT (Deals) — one Edit-layout canvas; applies to the deal
               details page AND the creation/edit form ════════ -->
          <div v-if="activeTab === 'layout'" class="builder-panel builder-panel--layout">
            <CrmDetailLayoutBuilder :detail="draft.detailLayout" :properties="propList" :create-property="createDealProperty" :module-icon="draft.icon" :module-id="props.orderId" :readonly="viewMode" @update:erp-target="onErpTargetChange" />
          </div>

          <!-- ════════ FIELDS (form layout — custom modules only) ════════ -->
          <div v-show="activeTab === 'fields'" class="builder-panel">
            <!-- Layout driver -->
            <div class="builder-driver">
              <div class="builder-driver-text">
                <span class="builder-driver-label">{{ t('Layout driver') }}</span>
                <span class="builder-driver-caption">{{ t('A single-choice field whose value can drive conditional layout rules.') }}</span>
              </div>
              <ErpFilterSelect
                id="cmb-driver"
                :model-value="draft.layoutDriver"
                :placeholder="t('None')"
                :options="layoutDriverOptions"
                width="240px"
                @update:model-value="(v: string) => (draft.layoutDriver = v)"
              />
            </div>

            <!-- Sections -->
            <div v-for="section in draft.sections" :key="section" class="builder-section">
              <header class="builder-section-head">
                <span class="builder-section-name">{{ section }}</span>
                <MpPopover :id="`cmb-sec-${section}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton class="builder-kebab" :aria-label="t('Section actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openRenameSection(section)">{{ t('Rename section') }}</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteSection(section)">{{ t('Delete section') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </header>

              <p v-if="sectionDeleteError[section]" class="builder-inline-error">{{ sectionDeleteError[section] }}</p>

              <div class="builder-columns">
                <div v-for="col in ([1, 2] as (1 | 2)[])" :key="col" class="builder-column">
                  <div
                    v-for="f in sectionColumnFields(section, col)"
                    :key="f.id"
                    class="builder-field"
                  >
                    <div class="builder-field-main">
                      <div class="builder-field-labelrow">
                        <span class="builder-field-label">{{ f.label }}</span>
                        <MpIcon v-if="f.system" name="security" size="sm" class="builder-field-lock" :aria-label="t('System field')" />
                      </div>
                      <div class="builder-field-meta">
                        <span class="builder-chip">{{ t(typeLabel(f.type)) }}</span>
                        <span v-if="f.required" class="builder-field-required">{{ t('Required') }}</span>
                      </div>
                      <p v-if="removeErrors[f.id]" class="builder-inline-error">{{ removeErrors[f.id] }}</p>
                    </div>
                    <div class="builder-field-actions">
                      <MpButton variant="ghost" is-rounded @click="openEditField(f)">{{ t('Edit') }}</MpButton>
                      <MpButton variant="ghost" is-rounded @click="removeFieldFromLayout(f)">{{ t('Remove') }}</MpButton>
                    </div>
                  </div>
                </div>
              </div>

              <div class="builder-section-foot">
                <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddField(section, 1)">{{ t('Add field') }}</MpButton>
              </div>
            </div>

            <div class="builder-add-section">
              <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddSection">{{ t('Add section') }}</MpButton>
            </div>

            <!-- Unused fields -->
            <div v-if="unusedFields.length" class="builder-unused">
              <span class="builder-unused-title">{{ t('Unused fields') }}</span>
              <p class="builder-unused-caption">{{ t('Fields not placed in the layout. Add one to a section to show it on records.') }}</p>
              <ul class="builder-unused-list">
                <li v-for="f in unusedFields" :key="f.id" class="builder-unused-row">
                  <div class="builder-field-labelrow">
                    <span class="builder-field-label">{{ f.label }}</span>
                    <MpIcon v-if="f.system" name="security" size="sm" class="builder-field-lock" :aria-label="t('System field')" />
                  </div>
                  <span class="builder-chip">{{ t(typeLabel(f.type)) }}</span>
                  <div class="builder-unused-action">
                    <MpButton variant="secondary" is-rounded @click="openEditField(f)">{{ t('Add to layout') }}</MpButton>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- ════════ VIEWS ════════ -->
          <div v-show="activeTab === 'views'" class="builder-panel">
            <ul class="builder-viewlist">
              <li v-for="v in draft.views" :key="v.id" class="builder-viewrow">
                <div class="builder-view-main">
                  <div class="builder-field-labelrow">
                    <span class="builder-view-name">{{ v.name }}</span>
                    <span class="builder-chip">{{ v.type === 'kanban' ? t('Kanban') : t('List') }}</span>
                    <span class="builder-chip builder-chip--soft">{{ t(VISIBILITY_LABELS[v.visibility]) }}</span>
                  </div>
                  <span v-if="v.type === 'kanban'" class="builder-view-caption">{{ t('Categorized by') }} {{ fieldLabelOf(v.categorizeBy) }}</span>
                </div>
                <div class="builder-field-actions">
                  <MpButton variant="ghost" is-rounded @click="openEditView(v)">{{ t('Edit') }}</MpButton>
                  <MpButton variant="ghost" is-rounded @click="removeView(v)">{{ t('Remove') }}</MpButton>
                </div>
              </li>
            </ul>
            <p v-if="viewsError" class="builder-inline-error">{{ viewsError }}</p>
            <div class="builder-add-section">
              <MpButton variant="secondary" is-rounded left-icon="add" @click="openAddView">{{ t('Add view') }}</MpButton>
            </div>
          </div>
      </template>
    </div>

    <!-- Sticky action footer (rule/btn-responsive-footer) — fixed button
         positions regardless of draft/published state, so the layout never
         flips: ghost Cancel, secondary "Save changes", then the rightmost
         primary CTA. Publish/Unpublish is an action, not a page-title
         affordance, so it lives here, not next to the H1. Only that last
         button's label toggles Publish/Unpublish — its slot and variant
         (primary, rightmost) never move. A system module (Deals, no
         draft/publish lifecycle) just drops that last button. -->
    <footer v-if="mod && !isCreating && !viewMode" class="builder-footer">
      <MpButtonGroup class="erp-action-footer">
        <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
        <template v-if="mod.status === 'published'">
          <MpButton variant="primary" is-rounded @click="saveChanges">{{ t('Save changes') }}</MpButton>
        </template>
        <template v-else>
          <MpButton variant="secondary" is-rounded @click="saveChanges">{{ t('Save as draft') }}</MpButton>
          <MpButton v-if="!mod.system" variant="primary" is-rounded @click="publishModule">{{ t('Publish') }}</MpButton>
        </template>
      </MpButtonGroup>
    </footer>
    <!-- Creation footer: module isn't persisted until Save as draft/Publish here. -->
    <footer v-else-if="isCreating" class="builder-footer">
      <MpButtonGroup class="erp-action-footer">
        <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="secondary" is-rounded @click="saveNewModule('draft')">{{ t('Save as draft') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="askPublishNew">{{ t('Publish') }}</MpButton>
      </MpButtonGroup>
    </footer>

    <!-- ════════ Team drawer (Setup ▸ Access level ▸ Team) ════════ -->
    <SelectAccessDrawer
      :open="teamDrawerOpen"
      :title="t('Select teams')"
      :list-title="t('Teams')"
      :options="teamOptions"
      :model-value="draft.teamIds"
      :empty-title="t('No teams selected')"
      :empty-caption="t('Pick which team(s) can access this module.')"
      @update:open="teamDrawerOpen = $event"
      @save="onTeamsSaved($event)"
    />

    <!-- ════════ Add-card-property drawer (Pipeline ▸ Card properties) ════════ -->
    <SelectAccessDrawer
      :open="cardPropsDrawerOpen"
      :title="t('Add property')"
      :list-title="t('Properties')"
      :options="cardPropOptions"
      :model-value="cardPropSelected"
      :empty-title="t('No properties selected')"
      :empty-caption="t('Add properties from the left to show them on the card.')"
      @update:open="cardPropsDrawerOpen = $event"
      @save="onCardPropsSaved"
    />

    <!-- ════════ Property drawer (Properties ▸ New / Edit) ════════ -->
    <CrmPropertyDrawer :open="propDrawerOpen" :mode="propMode" :property="editingProp" @update:open="propDrawerOpen = $event" @save="onPropertySave" />

    <!-- ════════ Field modal ════════ -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="cmb-field-modal" :is-open="fieldModalOpen" size="md" :is-keep-alive="false" @close="fieldModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ fieldModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-field-label-fc" :is-invalid="!!fieldLabelError">
              <MpFormLabel>{{ t('Label') }}</MpFormLabel>
              <MpInput id="cmb-field-label" v-model="fieldForm.label" is-full-width @update:model-value="fieldLabelError = ''" />
              <MpFormErrorMessage v-if="fieldLabelError">{{ fieldLabelError }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Type') }}</span>
              <ErpFilterSelect
                id="cmb-field-type"
                :model-value="fieldForm.type"
                :placeholder="t('Type')"
                :options="FIELD_TYPE_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="onFieldTypeChange"
              />
              <span v-if="typeLocked" class="builder-form-note">{{ t('This is a system field — its type can’t be changed.') }}</span>
            </div>

            <div class="builder-form-field builder-form-field--toggle">
              <MpToggle
                id="cmb-field-required"
                :is-checked="fieldForm.required"
                :aria-label="t('Required')"
                @update:is-checked="(v: boolean) => (fieldForm.required = v)"
              />
              <span class="builder-form-label">{{ t('Required') }}</span>
            </div>

            <div v-if="hasOptions(fieldForm.type)" class="builder-form-field">
              <span class="builder-form-label">{{ t('Options') }}</span>
              <ul v-if="fieldForm.options.length" class="builder-option-list">
                <li v-for="(opt, i) in fieldForm.options" :key="`${opt}-${i}`" class="builder-option-row">
                  <span class="builder-option-name">{{ opt }}</span>
                  <MpButton class="builder-option-remove" variant="ghost" is-rounded left-icon="close" :aria-label="`${t('Remove')} ${opt}`" @click="removeOption(i)" />
                </li>
              </ul>
              <div class="builder-option-add">
                <MpInput id="cmb-new-option" v-model="newOption" is-full-width :aria-label="t('New option')" @update:model-value="optionError = ''" @keydown.enter.prevent="addOption" />
                <MpButton variant="secondary" is-rounded @click="addOption">{{ t('Add') }}</MpButton>
              </div>
              <span v-if="optionError" class="builder-inline-error">{{ optionError }}</span>
            </div>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Section') }}</span>
              <ErpFilterSelect
                id="cmb-field-section"
                :model-value="fieldForm.section"
                :placeholder="t('Section')"
                :options="sectionSelectOptions"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (fieldForm.section = v)"
              />
            </div>

            <div v-if="fieldForm.section !== UNUSED" class="builder-form-field">
              <span class="builder-form-label">{{ t('Column') }}</span>
              <ErpFilterSelect
                id="cmb-field-column"
                :model-value="fieldForm.column"
                :placeholder="t('Column')"
                :options="COLUMN_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (fieldForm.column = v)"
              />
            </div>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="fieldModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveField">{{ fieldModalMode === 'edit' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ════════ Section modal ════════ -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="cmb-section-modal" :is-open="sectionModalOpen" size="md" :is-keep-alive="false" @close="sectionModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ sectionModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-section-name-fc" :is-invalid="!!sectionNameError">
              <MpFormLabel>{{ t('Section name') }}</MpFormLabel>
              <MpInput id="cmb-section-name" v-model="sectionNameInput" is-full-width @update:model-value="sectionNameError = ''" @keydown.enter.prevent="saveSection" />
              <MpFormErrorMessage v-if="sectionNameError">{{ sectionNameError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="sectionModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveSection">{{ sectionModalMode === 'rename' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ════════ View modal ════════ -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="cmb-view-modal" :is-open="viewModalOpen" size="md" :is-keep-alive="false" @close="viewModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ viewModalTitle }}</MpModalHeader>
        <MpModalBody>
          <div class="builder-form">
            <MpFormControl id="cmb-view-name-fc" :is-invalid="!!viewNameError">
              <MpFormLabel>{{ t('Name') }}</MpFormLabel>
              <MpInput id="cmb-view-name" v-model="viewForm.name" is-full-width @update:model-value="viewNameError = ''" />
              <MpFormErrorMessage v-if="viewNameError">{{ viewNameError }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Type') }}</span>
              <ErpFilterSelect
                id="cmb-view-type"
                :model-value="viewForm.type"
                :placeholder="t('Type')"
                :options="VIEW_TYPE_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (viewForm.type = (v || 'list') as CrmModuleViewType)"
              />
            </div>

            <div v-if="viewForm.type === 'kanban'" class="builder-form-field">
              <span class="builder-form-label">{{ t('Group by') }}</span>
              <ErpFilterSelect
                id="cmb-view-categorize"
                :model-value="viewForm.categorizeBy"
                :placeholder="t('Choose a field')"
                :options="choiceFieldOptions"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => { viewForm.categorizeBy = v; viewCatError = '' }"
              />
              <span v-if="viewCatError" class="builder-inline-error">{{ viewCatError }}</span>
            </div>

            <div class="builder-form-field">
              <span class="builder-form-label">{{ t('Visibility') }}</span>
              <ErpFilterSelect
                id="cmb-view-visibility"
                :model-value="viewForm.visibility"
                :placeholder="t('Visibility')"
                :options="VISIBILITY_OPTIONS"
                :is-clearable="false"
                width="240px"
                @update:model-value="(v: string) => (viewForm.visibility = (v || 'private') as CrmModuleViewVisibility)"
              />
            </div>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="viewModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveView">{{ viewModalMode === 'edit' ? t('Save changes') : t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Floating drag ghosts (ERP pointer sortable): a lifted clone follows the
         cursor while a stage lane / card-property row is dragged. -->
    <Teleport to="body">
      <div v-if="laneGhost && draggedStage" class="dnd-ghost dnd-ghost--lane" :style="{ left: `${laneGhost.x}px`, top: `${laneGhost.y}px`, width: `${laneGhost.w}px` }">
        <MpIcon name="drag" size="md" />
        <span class="dnd-ghost-label">{{ draggedStage.name }}</span>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="gmLaneGhost && draggedGmStage" class="dnd-ghost dnd-ghost--lane" :style="{ left: `${gmLaneGhost.x}px`, top: `${gmLaneGhost.y}px`, width: `${gmLaneGhost.w}px` }">
        <MpIcon name="drag" size="md" />
        <span class="dnd-ghost-label">{{ draggedGmStage.label }}</span>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="fieldGhost && draggedField" class="dnd-ghost dnd-ghost--row" :style="{ left: `${fieldGhost.x}px`, top: `${fieldGhost.y}px`, width: `${fieldGhost.w}px` }">
        <span class="dnd-ghost-label">{{ t(draggedField.label) }}</span>
        <MpIcon name="drag" size="md" />
      </div>
    </Teleport>

    <!-- Publish (from creation) needs confirmation; Save as draft does not. -->
    <ConfirmModal
      v-model:is-open="publishNewConfirmOpen"
      :title="t('Publish this module?')"
      :description="t('Once published, this module appears in the CRM nav for anyone with access.')"
      :confirm-label="t('Publish')"
      :is-danger="false"
      @confirm="confirmPublishNew"
    />

    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      :title="t('Delete this module?')"
      :description="t('This module and all its data will be permanently removed. This action cannot be undone.')"
      :confirm-label="t('Delete')"
      :is-danger="true"
      @confirm="deleteModule"
    />

    <ActivityLogModal
      :is-open="activityLogOpen"
      :subject="mod?.name ?? 'Module'"
      :updated-by="mod?.updatedBy ?? 'System'"
      :updated-at="mod?.updatedAt ?? ''"
      :entries="moduleActivityEntries"
      @close="activityLogOpen = false"
    />
  </div>
</template>

<style scoped>
/* ── Shell (mirrors CrmSettingsPage / CrmCustomerDetailPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.builder-title-input {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
  border: 1px solid transparent; border-radius: var(--mp-radii-md); background: transparent;
  padding: 0 var(--mp-spacing-2); max-width: 420px;
}
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* Top spacing is padding (not a border) so the sidebar's left divider can extend
   into it and reach the very top of the stage without being clipped by overflow. */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* Section tabs — neutral-subtle bar below the title, OUTSIDE the white stage
   (rule/erp-tabs-pattern; mirrors the .page-tab pattern in [...slug].vue). */
.page-tabs-bar { display: flex; align-items: flex-end; gap: var(--mp-spacing-5); padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle, #f8f9f9); flex-shrink: 0; }
.page-tab { position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; }
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected, #0f6d4d); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-border-selected, #029861); }

/* Each tab panel stacks its rows with the standard 20px gap. */
.builder-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* ── Layout tab (Deals) — Details/Form page switcher ── */
.builder-panel--layout { gap: var(--mp-spacing-4); }

/* ── Pipeline tab — swimlane editor + right settings panel (Figma 4240-18081) ── */
/* The pipeline panel fills the stage so the sidebar can run full-height + sticky. */
.builder-panel--pipeline { flex: 1; min-height: 0; }
/* Properties tab — ErpTablePage manages its own scroll; fill the stage. */
.builder-panel--table { flex: 1; min-height: 0; }
.prop-namecell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.prop-name { color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prop-varname { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); font-family: var(--mp-fonts-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prop-type { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-colors-text-default, #080d0e); }
.prop-type-icon { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.prop-action-devchange-anchor { display: inline-flex; width: var(--mp-sizes-8); height: var(--mp-sizes-8); pointer-events: none; }
/* Properties filter bar (mirrors the standard ErpFilterBar layout). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
/* ── Field-driven pipeline picker (generic modules) ── */
.pipe-field-picker { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); margin-bottom: var(--mp-spacing-4); }
.pipe-field-picker__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pipe-field-picker__desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pipe-field-picker__row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pipe-field-picker__select { flex: 1; max-width: 320px; }
.pipe-field-picker__value { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.pipe-field-picker__empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); font-style: italic; }
.pipe-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; text-align: center; }
.pipe-empty__illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.pipe-empty__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pipe-empty__desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); max-width: 400px; }

.pipe-layout { display: flex; align-items: stretch; gap: 0; flex: 1; min-height: 0; }
.builder-panel--pipeline .pipe-board { flex: 1; min-height: 0; }

/* The board: horizontal Kanban lanes; scrolls sideways if they overflow. */
.pipe-board { flex: 1; min-width: 0; display: flex; align-items: stretch; gap: var(--mp-spacing-2); overflow-x: auto; padding-bottom: var(--mp-spacing-2); }
.pipe-board-error { flex: 0 0 100%; }
/* The TransitionGroup wrapper lays out transparently so lanes stay direct flex
   items of the board; .lane-move FLIP-animates them sliding aside on reorder. */
.pipe-lanes { display: contents; }
.lane-move { transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.pipe-lane {
  flex: 0 0 250px; width: 250px;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-colors-background-neutral-subtle, #f8f9f9);
  transition: opacity 0.12s ease, border-color 0.12s ease;
}
/* Drag placeholder: the lane's slot becomes a dashed drop target (content hidden,
   size kept) while the lifted clone (.dnd-ghost) follows the cursor. */
.pipe-lane.is-dragging { border-style: dashed !important; border-color: var(--mp-colors-border-selected, #029861) !important; background: var(--mp-colors-background-brand-subtle, #eafaf1) !important; }
.pipe-lane.is-dragging > * { visibility: hidden; }
/* Color stage columns (toggle): tint the lane by outcome. */
.pipe-lane--won  { background: var(--mp-colors-background-brand-subtle, #eafaf1); border-color: var(--mp-colors-border-selected, #029861); }
.pipe-lane--lost { background: var(--mp-colors-background-critical-subtle, #fdeceb); border-color: var(--mp-colors-border-danger, #dc2626); }
.pipe-lane--open { background: var(--mp-colors-background-information-subtle, #eaf1fb); border-color: var(--mp-colors-border-information, #2f6fd0); }

.pipe-lane-head { display: flex; align-items: center; gap: var(--mp-spacing-3); min-height: 36px; }
.pipe-lane-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-subtle, #97a0af); cursor: grab; flex-shrink: 0; }
.mod-name-inline { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.pipe-lane-label { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; flex: 1; }
.pipe-lane-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-lane-input { flex: 1; min-width: 0; }
.pipe-lane-edit {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-colors-icon-subtle, #97a0af);
  opacity: 0; transition: opacity 0.12s ease;
}
/* The rename pencil only reveals on swimlane hover (or keyboard focus). */
.pipe-lane:hover .pipe-lane-edit, .pipe-lane-edit:focus-visible { opacity: 1; }
.pipe-lane-edit:hover { color: var(--mp-colors-text-default, #080d0e); }
/* Per-view show/hide eye, top-right of the lane header. */
.pipe-lane-vis {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); padding: 0;
  border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm, 4px);
  color: var(--mp-colors-icon-subtle, #97a0af);
}
.pipe-lane-vis:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }
/* Hidden-in-this-view lane: dimmed so it reads as excluded, still editable here. */
.pipe-lane--hidden { opacity: 0.5; }
.pipe-lane--hidden .pipe-lane-vis { opacity: 1; color: var(--mp-colors-text-default, #080d0e); }

/* Card list grows to fill the lane so the total + delete pin to the bottom. */
.pipe-lane-cards { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pipe-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 8px); background: var(--mp-colors-background-stage, #fff);
}
.pipe-card-head { display: flex; flex-direction: column; min-width: 0; }
.pipe-card-company { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-deal { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-card-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.pipe-card-owner { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-card-note { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pipe-card-foot--end { justify-content: flex-end; }
.pipe-card-aging {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 var(--mp-spacing-1); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-placeholder, #8690a2);
  font-size: var(--mp-font-sizes-xs, 10px); line-height: 1;
}

.pipe-lane-total { display: flex; flex-direction: column; gap: 2px; }
.pipe-lane-total-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #3a4749); }
.pipe-lane-total-value { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); }

.pipe-lane-delete {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start;
  padding: 0 var(--mp-spacing-0\.5, 2px); border: none; background: none; cursor: pointer;
  color: var(--mp-colors-text-secondary, #3a4749); font-size: var(--mp-font-sizes-md);
}
.pipe-lane-delete:hover { color: var(--mp-colors-text-danger, #a8352d); }

.pipe-newstage { flex-shrink: 0; align-self: flex-start; }

/* ── Settings panel — sticky at the far right ── */
.pipe-sidebar {
  flex: 0 0 304px; width: 304px; align-self: stretch;
  box-sizing: border-box;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  /* Pull the divider into the stage's top/bottom padding so the line runs the
     full height (top → bottom); padding keeps the content itself aligned. */
  margin: calc(-1 * var(--mp-spacing-6)) 0;
  padding: var(--mp-spacing-6) 0 var(--mp-spacing-6) var(--mp-spacing-4);
  border-left: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.pipe-side-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pipe-side-labelrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.pipe-side-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); font-variant-numeric: tabular-nums; }

/* Name field = clickable icon prefix + borderless text input, one bordered pill. */
.pipe-name-field { display: flex; align-items: stretch; border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); background: var(--mp-colors-background-neutral, #fff); overflow: hidden; }
.pipe-name-field:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.pipe-name-prefix { display: inline-flex; align-items: center; gap: var(--mp-spacing-0\.5, 2px); flex-shrink: 0; padding: 0 var(--mp-spacing-2); border: none; border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); background: var(--mp-colors-background-neutral-subtle, #f8f9f9); cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.pipe-name-prefix:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-name-prefix-caret { color: var(--mp-colors-icon-subtle, #97a0af); }
.pipe-name-input-el { flex: 1; min-width: 0; border: none; outline: none; background: transparent; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }

.pipe-icon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--mp-spacing-1); max-height: 264px; overflow-y: auto; }
.pipe-icon-choice { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid transparent; border-radius: var(--mp-radii-md, 6px); background: none; cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.pipe-icon-choice:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-icon-choice--active { border-color: var(--mp-colors-border-selected, #029861); color: var(--mp-colors-text-selected, #0f6d4d); background: var(--mp-colors-background-brand-subtle, #eafaf1); }

/* ── Setup tab form (6-col form: 558px max, 20px row gap — rule/form-field-stacking) ── */
.setup-view { display: flex; flex-direction: column; gap: var(--mp-spacing-1); max-width: 558px; }
.setup-activity-log { margin-top: var(--mp-spacing-4); }
.setup-activity-link { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.setup-activity-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.setup-activity-meta { color: var(--mp-text-secondary); }
.setup-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); max-width: 558px; }
.setup-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.setup-labelrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.setup-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); font-variant-numeric: tabular-nums; }
.setup-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.setup-labelgroup { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.setup-fieldlabel { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
/* Module-name icon prefix (inside MpInputLeftAddon) */
.setup-icon-trigger { display: inline-flex; align-items: center; gap: var(--mp-spacing-0\.5, 2px); padding: 0 var(--mp-spacing-1, 4px); border: none; background: none; cursor: pointer; color: var(--mp-colors-text-default, #080d0e); }
.setup-icon-caret { color: var(--mp-colors-icon-default, #536062); }
/* Default close-date — indented radios; the box top-aligns natively via #description slot */
.setup-indent { display: flex; flex-direction: column; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); margin-left: var(--mp-spacing-7, 28px); }
.setup-radio-detail { margin-left: var(--mp-spacing-7, 28px); }
/* "Time from record creation" input + unit = 3 grid cols (~279px) */
.setup-amount { display: flex; flex-direction: row; align-items: center; gap: var(--mp-spacing-2); max-width: 224px; }
.setup-amount-input { flex: 1; min-width: 0; }
/* Access level ▸ Team — selected teams list (mirrors the old Access ▸ Add users
   list: name + (−) remove + "Remove" tooltip), not a chip/pill grid. */
.setup-access-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }
.setup-radio-row { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.setup-team-picked { display: flex; flex-direction: column; margin-top: var(--mp-spacing-2); }
.setup-teams-title { margin: 0 0 4px; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.setup-user-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.setup-user-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); min-width: 0; padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.setup-user-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.setup-user-name { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setup-user-remove {
  display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-colors-text-secondary, #3a4749);
}
.setup-user-remove:hover { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); color: var(--mp-colors-text-danger, #a8352d); }
.setup-access-btn { align-self: flex-start; margin-top: var(--mp-spacing-2); }
.pipe-side-section { display: flex; flex-direction: column; }
.pipe-side-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-row { position: relative; display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2); border-radius: var(--mp-radii-sm); transition: opacity 0.12s ease, background 0.12s ease; }
.pipe-side-row--drag:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
.pipe-side-rowlabel { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }
.pipe-side-drag { display: inline-flex; align-items: center; color: var(--mp-colors-icon-subtle, #97a0af); cursor: grab; flex-shrink: 0; }
.pipe-side-drag:active { cursor: grabbing; }
/* Drag placeholder: the row's slot becomes a dashed drop target (content hidden,
   size kept via outline so no layout shift) while the .dnd-ghost follows the cursor. */
.pipe-side-row.is-dragging { outline: 1px dashed var(--mp-colors-border-selected, #029861); outline-offset: -1px; border-radius: var(--mp-radii-sm); background: var(--mp-colors-background-brand-subtle, #eafaf1); }
.pipe-side-row.is-dragging > * { visibility: hidden; }

/* ── Floating drag ghost (ERP pointer sortable, shared by lanes + rows) ──
   Shadow deviates from rule/surface-border-no-shadow ON PURPOSE: transient drag
   affordance (only while grabbed), not a resting surface elevation. */
.dnd-ghost {
  position: fixed; z-index: 1000; pointer-events: none;
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  background: var(--mp-colors-background-neutral, #fff);
  border: 1px solid var(--mp-colors-border-bold, #8c9596); border-radius: var(--mp-radii-md, 8px);
  box-shadow: 0 12px 28px rgba(8, 13, 14, 0.18), 0 2px 6px rgba(8, 13, 14, 0.12);
  transform: rotate(-1.5deg) scale(1.02); transform-origin: center; cursor: grabbing;
}
.dnd-ghost--lane { padding: var(--mp-spacing-3); }
.dnd-ghost--row { padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2); }
.dnd-ghost-label { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dnd-ghost :deep(svg) { color: var(--mp-colors-icon-subtle, #97a0af); flex-shrink: 0; }
.pipe-side-row--sep { border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); margin-top: var(--mp-spacing-1); }
/* Live reorder — rows slide to make room (FLIP), same feel as the swimlanes. */
.pipe-side-rows { display: contents; }
.pipe-side-addprop { margin-top: var(--mp-spacing-2); }
.row-move { transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1); }

/* Sticky action footer — Cancel + Save changes, right-aligned, always visible. */
.builder-footer { flex-shrink: 0; padding: var(--mp-spacing-3) var(--mp-spacing-6); background: var(--mp-colors-background-stage, #fff); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }

/* ── Module not found ── */
.builder-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.builder-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Layout driver ── */
.builder-driver { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-driver-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.builder-driver-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-driver-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Section card ── */
.builder-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.builder-section-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.builder-column { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.builder-field { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-field-main { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.builder-field-labelrow { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.builder-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-field-lock { color: var(--mp-text-subtle); flex-shrink: 0; }
.builder-field-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.builder-field-required { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-field-actions { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.builder-section-foot { display: flex; }

.builder-chip { display: inline-flex; align-items: center; background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-secondary); border: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm); padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-sm); white-space: nowrap; }
.builder-chip--soft { background: var(--mp-background-neutral-subtle, #f8f9f9); border: none; }

.builder-add-section { display: flex; }

/* ── Unused fields ── */
.builder-unused { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #ffffff); }
.builder-unused-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-unused-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-unused-list { list-style: none; margin: var(--mp-spacing-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-unused-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-unused-action { margin-left: auto; }

/* ── Views ── */
.builder-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.builder-viewrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.builder-viewrow:last-child { border-bottom: none; }
.builder-view-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.builder-view-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-view-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Kebab ── */
.builder-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.builder-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }
.builder-item--danger :deep(*), .builder-item--danger { color: var(--mp-colors-text-danger, #a8352d); }

/* ── Inline errors ── */
.builder-inline-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger, #a8352d); }

/* ── Modals ── */
.builder-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.builder-form-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-form-field--toggle { flex-direction: row; align-items: center; gap: 12px; }
.builder-form-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.builder-form-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.builder-option-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.builder-option-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.builder-option-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.builder-option-add { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.builder-option-add :deep([data-pixel-component="MpInput"]) { flex: 1; }
</style>
