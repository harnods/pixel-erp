<script setup lang="ts">
/**
 * Settings › Users & roles → "Invite user" (also serves "Edit access" for an
 * existing user, at /users-and-roles/:id/edit).
 *
 * Benchmarked on Jurnal's Invite user page. ERP deviations from that mockup, all
 * driven by RULES.md (the rule beats the mockup — see the authority hierarchy):
 *  • Jurnal's native select element for Days / Start hour / End hour becomes an
 *    ErpFilterSelect (rule/select-erpfilterselect).
 *  • The Invite button is never disabled while preconditions are unmet — an
 *    unsatisfied requirement surfaces inline (rule/btn-no-disabled-validation,
 *    rule/form-errors-inline, rule/form-actions-always-present).
 *  • The "Terms for selecting roles" side card is a bordered surface, no shadow
 *    (rule/surface-border-no-shadow).
 *  • Existing/Custom is an in-stage detail tab → MpTabs (docs/patterns/tabs.md §2).
 *
 * CRM access & seats (PRD "CRM Access and CRM User Seats in ERP"):
 *  • CRM is one more row in the Existing role list, but it maps to user.crmRole
 *    (not systemRoleIds) and its state is kept outside the tabs, so it combines
 *    with Ultimate and any custom role (US-011). Shown only when the company has
 *    the CRM add-on (US-001); read-only once it expired.
 *  • Rendered like production's CRM row: caret + checkbox + plain description
 *    lines + a "Default crm authority" radio pair — CRM Basic (default, as in
 *    prod) / CRM Manager (the Administrator-capable tier; internal crmRole 'admin').
 *  • Seat usage lives in its own right-column card above "Selected roles", with a
 *    live "after saving" preview of the ERP / CRM counts (US-002). Both limits are checked
 *    on save, server-style; a block names WHICH limit and links Contact Sales.
 *  • A CRM-only user (CRM role, no ERP role) doesn't use an ERP seat (US-010).
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpCheckbox, MpRadio, MpBadge, MpTag,
  MpButton, MpIcon, MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import SeatContactSalesModal from '~/components/patterns/SeatContactSalesModal.vue'
import SeatUsageSummary from '~/components/patterns/SeatUsageSummary.vue'
import CrmSeatsScenarioFab from '~/components/patterns/CrmSeatsScenarioFab.vue'
import { successToast } from '~/utils/toasts'
import {
  ACCESS_DAY_OPTIONS, ACCESS_HOUR_OPTIONS, ACCESS_TIME_LIMIT_NOTE, ROLE_SELECTION_TERMS,
  SYSTEM_ROLES, customRoles, emptyAccessTimeLimit, getAccountUser,
  addAccountUser, updateAccountUser, deleteAccountUser, grantedFeatureCount, systemRolesFor,
  type AccessTimeLimit, type SystemRole,
} from '~/data/usersRoles'
import { SEAT_BLOCK_MESSAGES, isSeatLimitBlock, crmRoleLabel, type CrmRole } from '~/data/crmSubscription'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'

// id from the catch-all route: 'invite' → create, an existing user id → edit.
const props = defineProps<{ orderId?: string }>()
const isEdit = computed(() => !!props.orderId && props.orderId !== 'invite')

const router = useRouter()
const { t } = useLocale()

// Project Manager is a billing-component role — a tenant without Project
// Accounting never sees it in the picker (same gate as the matching authority
// feature and the Approval workflows "Applies to: Project Action" condition).
const { projectAccountingEnabled } = useApprovalWorkflowScenario()
const existingRoles = computed(() => systemRolesFor(projectAccountingEnabled.value))

const {
  mode: crmMode, crmVisible,
  state: crmState, checkSave, previewView, currentView,
} = useCrmSubscriptionScenario()

// ─── Form state ─────────────────────────────────────────────────────────────
const name = ref('')
const email = ref('')

const applyTimeLimit = ref(false)
const timeLimit = reactive<AccessTimeLimit>(emptyAccessTimeLimit())

const selectedSystemRoles = ref<string[]>([])
const selectedCustomRoles = ref<string[]>([])
/** roleId → picked authority-group option values (Sales / Purchasing). */
const roleAuthority = reactive<Record<string, string[]>>({})
/** roleId → access-limitation checkbox. */
const roleLimitation = reactive<Record<string, boolean>>({})
const isListManager = ref(false)

// ─── CRM role (standalone — not an Existing/Custom role) ───────────────────
const crmOn = ref(false)
/** "Default crm authority" radio: true = CRM Manager (internal 'admin'), false = CRM Basic (default, as in prod). */
const crmSettings = ref(false)
/** The Owner always holds CRM Administrator; editing them can't change it. */
const isOwnerUser = ref(false)
/** The user's CRM role as saved — kept untouched while CRM is hidden (renewal restores it). */
const savedCrmRole = ref<CrmRole | null>(null)
const crmLocked = computed(() => isOwnerUser.value || crmMode.value === 'read-only')
/** The CRM row expands like the Existing roles above (open by default). */
const crmExpanded = ref(true)
/** CRM row description lines — verbatim from production (app.erp.mekari.com). */
const CRM_PERMISSIONS = [
  'View and create deals, contacts, and companies assigned to you.',
  'View and manage the pipeline for your own deals, including changing stage.',
  'View pages of customer contacts, products, and other lists.',
  'Edit and delete your own deals, contacts, and companies.',
  'CRM Manager extends these permissions to all CRM deals, contacts, and companies, allows managing the entire deal pipeline (including changing stage and owner), and adds access to CRM reports and settings.',
]

// ─── "Seat usage" card (right column, above Selected roles) ────────────────────
/** Counts AFTER saving this user with the roles ticked now — updates live. */
const seatPreview = computed(() => previewView(isEdit.value ? props.orderId! : null, {
  systemRoleIds: selectedSystemRoles.value,
  customRoleIds: selectedCustomRoles.value,
  crmRole: crmRoleToSave(),
}))
/** The preview differs from the saved counts → show the "(after saving)" hint. */
const seatPreviewChanged = computed(() => JSON.stringify(seatPreview.value) !== JSON.stringify(currentView.value))

// ─── "Selected roles" card (right column, as in production) ──────────────────
/** Existing chips: ticked system roles, then the CRM tier ("CRM Basic" / "CRM Manager"). */
const selectedExistingChips = computed(() => [
  ...existingRoles.value.filter((r) => isSystemRoleOn(r.id)).map((r) => t(r.name)),
  ...(crmVisible.value && crmRoleChoice.value ? [t(crmRoleLabel(crmRoleChoice.value))] : []),
])
const selectedCustomChips = computed(() =>
  customRoles.filter((r) => isCustomRoleOn(r.id)).map((r) => r.name))
const crmRoleChoice = computed<CrmRole | null>(() => (crmOn.value ? (crmSettings.value ? 'admin' : 'basic') : null))

/** Which role accordions are expanded — all open by default, as in Jurnal. */
const expanded = reactive<Record<string, boolean>>(
  Object.fromEntries(SYSTEM_ROLES.map((r) => [r.id, true])),
)
// Collapsed by default, as in production.
const termsOpen = ref(false)
const activeRoleTab = ref(0)

/** Edit route pointing at a user that no longer exists — a real reachable state. */
const notFound = ref(false)

onMounted(() => {
  if (!isEdit.value) return
  const user = getAccountUser(props.orderId!)
  if (!user) { notFound.value = true; return }
  name.value = user.name
  email.value = user.email
  selectedSystemRoles.value = [...user.systemRoleIds]
  selectedCustomRoles.value = [...user.customRoleIds]
  isListManager.value = user.isListManager
  isOwnerUser.value = user.isOwner
  savedCrmRole.value = user.crmRole
  crmOn.value = user.isOwner || !!user.crmRole
  crmSettings.value = user.isOwner || user.crmRole === 'admin'
  if (user.timeLimit) {
    applyTimeLimit.value = true
    Object.assign(timeLimit, user.timeLimit)
  }
  if (user.customRoleIds.length && !user.systemRoleIds.length) activeRoleTab.value = 1
})

// ─── Role selection ─────────────────────────────────────────────────────────
function toggleSystemRole(role: SystemRole, on: boolean) {
  selectedSystemRoles.value = on
    ? [...new Set([...selectedSystemRoles.value, role.id])]
    : selectedSystemRoles.value.filter((id) => id !== role.id)
  if (!on) { delete roleAuthority[role.id]; delete roleLimitation[role.id] }
  roleError.value = ''
  erpSeatError.value = ''
}
function isSystemRoleOn(id: string) { return selectedSystemRoles.value.includes(id) }

function toggleCustomRole(id: string, on: boolean) {
  selectedCustomRoles.value = on
    ? [...new Set([...selectedCustomRoles.value, id])]
    : selectedCustomRoles.value.filter((v) => v !== id)
  roleError.value = ''
  erpSeatError.value = ''
}

function toggleCrm(on: boolean) {
  crmOn.value = on
  if (on) crmSettings.value = false // ticking CRM starts as CRM Basic (production default)
  roleError.value = ''
  crmSeatError.value = ''
  erpSeatError.value = ''
}
function toggleCrmSettings(on: boolean) {
  crmSettings.value = on
  crmSeatError.value = ''
}
function isCustomRoleOn(id: string) { return selectedCustomRoles.value.includes(id) }

function toggleAuthorityOption(roleId: string, value: string, on: boolean) {
  const current = roleAuthority[roleId] ?? []
  roleAuthority[roleId] = on ? [...new Set([...current, value])] : current.filter((v) => v !== value)
}

/**
 * Access time limits can't apply to Owner, nor to Ultimate with List manager on
 * (they'd be able to lift their own limit). Surfaced as a note, not a silent
 * no-op — see ACCESS_TIME_LIMIT_NOTE.
 */
const timeLimitBlockedBy = computed(() => {
  if (isSystemRoleOn('ultimate') && isListManager.value) return t('Ultimate with List manager')
  return ''
})

// ─── Validation ─────────────────────────────────────────────────────────────
const nameError = ref('')
const emailError = ref('')
const roleError = ref('')
const timeError = ref('')
const isSaving = ref(false)
/** Seat-limit blocks — inline in the section whose choice hit the limit. */
const erpSeatError = ref('')
const crmSeatError = ref('')
const erpSeatErrorIsLimit = ref(false)
const crmSeatErrorIsLimit = ref(false)
const contactSalesOpen = ref(false)
const contactSalesTopic = ref<'seats' | 'erp-seats' | 'crm-seats'>('crm-seats')
function openContactSales(topic: 'seats' | 'erp-seats' | 'crm-seats') {
  contactSalesTopic.value = topic
  contactSalesOpen.value = true
}
/** Editing away every ERP role AND the CRM role → offer to remove the user instead (US-010 AC-06). */
const removeInsteadOpen = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(): boolean {
  nameError.value = name.value.trim() ? '' : t('You must fill in user name')
  if (!email.value.trim()) emailError.value = t('You must fill in email')
  else if (!EMAIL_RE.test(email.value.trim())) emailError.value = t('Enter a valid email address')
  else emailError.value = ''

  const hasErpRole = selectedSystemRoles.value.length > 0 || selectedCustomRoles.value.length > 0
  const hasCrm = crmVisible.value ? crmOn.value : !!savedCrmRole.value
  roleError.value = hasErpRole || hasCrm
    ? ''
    : crmVisible.value ? t('Select at least one ERP role or the CRM role') : t('You must select at least one role')

  timeError.value = applyTimeLimit.value && timeLimit.startHour >= timeLimit.endHour
    ? t('End hour must be later than start hour')
    : ''

  return !nameError.value && !emailError.value && !roleError.value && !timeError.value
}

/** The CRM role to save. While CRM is hidden (no add-on) the stored role is left as-is. */
function crmRoleToSave(): CrmRole | null {
  if (!crmVisible.value) return savedCrmRole.value
  return crmRoleChoice.value
}

async function save() {
  erpSeatError.value = ''
  crmSeatError.value = ''
  if (!validate()) {
    // An existing user stripped of every ERP role and CRM → remove them instead.
    if (isEdit.value && roleError.value && !nameError.value && !emailError.value) {
      roleError.value = ''
      removeInsteadOpen.value = true
    }
    return
  }

  const payload = {
    name: name.value.trim(),
    email: email.value.trim(),
    systemRoleIds: [...selectedSystemRoles.value],
    customRoleIds: [...selectedCustomRoles.value],
    crmRole: crmRoleToSave(),
    isListManager: isListManager.value,
    timeLimit: applyTimeLimit.value && !timeLimitBlockedBy.value ? { ...timeLimit } : null,
  }

  // Both limits are checked on every save, whichever screen the role comes from
  // (US-003 AC-06). Nothing is saved when either blocks.
  const seat = checkSave(isEdit.value ? props.orderId! : null, payload)
  if (seat.erp) {
    erpSeatError.value = t(SEAT_BLOCK_MESSAGES[seat.erp])
      + (crmVisible.value && crmMode.value === 'active' && !isEdit.value ? ` ${t('You can still invite this user with the CRM role only.')}` : '')
    erpSeatErrorIsLimit.value = isSeatLimitBlock(seat.erp)
  }
  if (seat.crm) {
    activeRoleTab.value = 0 // the CRM row (and its block message) lives in the Existing list
    crmSeatError.value = t(SEAT_BLOCK_MESSAGES[seat.crm])
    crmSeatErrorIsLimit.value = isSeatLimitBlock(seat.crm)
  }
  if (seat.erp || seat.crm) {
    // The CRM section sits below a long role list — bring the block into view.
    await nextTick()
    const el = document.querySelector('[data-test-id="inv-erp-seat-error"], [data-test-id="inv-crm-seat-error"]')
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    return
  }

  isSaving.value = true
  await new Promise((r) => setTimeout(r, 500))

  if (isEdit.value) {
    updateAccountUser(props.orderId!, payload)
    successToast(t('User access changes saved'))
  } else {
    addAccountUser(payload)
    successToast(t('Invitation sent'))
  }
  isSaving.value = false
  goBack()
}

function goBack() { router.push('/users-and-roles') }

function removeUserInstead() {
  if (!isEdit.value) return
  deleteAccountUser(props.orderId!)
  successToast(t('User deleted'))
  goBack()
}
</script>

<template>
  <div class="inv-page">
    <!-- ── Page title bar (breadcrumb directly above the title, gap 0) ── -->
    <div class="inv-titlebar">
      <div class="inv-titlebar-left">
        <MpButton variant="textLink" class="inv-breadcrumb" @click="goBack">{{ t('Users & roles') }}</MpButton>
        <h1 class="inv-title">{{ isEdit ? t('Edit user access') : t('Invite user') }}</h1>
      </div>
    </div>

    <div class="inv-stage">
      <!-- ── Not found / stale link — a real reachable state, not a crash ── -->
      <div v-if="notFound" class="inv-notfound">
        <p class="inv-notfound-title">{{ t('User not found') }}</p>
        <p class="inv-notfound-desc">{{ t('This user may have been deleted.') }}</p>
        <MpButton variant="secondary" is-rounded @click="goBack">{{ t('Back to users & roles') }}</MpButton>
      </div>

      <div v-else class="inv-layout">
        <div class="inv-main">
          <!-- ── User info ── -->
          <section class="inv-section">
            <h2 class="inv-section-title">{{ t('User info') }}</h2>

            <div class="inv-field-row">
              <MpFormControl id="inv-name" is-required :is-invalid="!!nameError">
                <MpFormLabel>{{ t('User name') }}</MpFormLabel>
                <MpInput
                  id="inv-name-input" v-model="name" is-full-width
                  :placeholder="t('Example: Sari Indah')"
                  @update:model-value="nameError = ''"
                />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="inv-email" is-required :is-invalid="!!emailError">
                <MpFormLabel>{{ t('Email') }}</MpFormLabel>
                <MpInput
                  id="inv-email-input" v-model="email" type="email" is-full-width
                  :placeholder="t('name@company.com')"
                  @update:model-value="emailError = ''"
                />
                <MpFormErrorMessage>{{ emailError }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <!-- ── Access time limits ── -->
            <div class="inv-checkbox-block">
              <MpCheckbox
                id="inv-time-limit"
                :is-checked="applyTimeLimit"
                @change="(on: boolean) => applyTimeLimit = on"
              >
                {{ t('Apply access time limits') }}
                <template #description>{{ t(ACCESS_TIME_LIMIT_NOTE) }}</template>
              </MpCheckbox>

              <div v-if="applyTimeLimit" class="inv-time">
                <p v-if="timeLimitBlockedBy" class="inv-time-blocked">
                  <MpIcon name="info" size="sm" />
                  {{ t('Time limits do not apply to') }} {{ timeLimitBlockedBy }}.
                </p>

                <div class="inv-time-fields">
                  <div class="inv-time-field">
                    <span class="inv-field-label">{{ t('Days') }}</span>
                    <ErpFilterSelect
                      id="inv-days"
                      v-model="timeLimit.days"
                      :placeholder="t('Select days')"
                      :options="ACCESS_DAY_OPTIONS"
                      :is-clearable="false"
                      width="200px"
                    />
                  </div>
                  <div class="inv-time-field">
                    <span class="inv-field-label">{{ t('Start hour') }}</span>
                    <ErpFilterSelect
                      id="inv-start-hour"
                      v-model="timeLimit.startHour"
                      :placeholder="t('Start')"
                      :options="ACCESS_HOUR_OPTIONS"
                      :is-clearable="false"
                      width="120px"
                    />
                  </div>
                  <span class="inv-time-dash">–</span>
                  <div class="inv-time-field">
                    <span class="inv-field-label">{{ t('End hour') }}</span>
                    <ErpFilterSelect
                      id="inv-end-hour"
                      v-model="timeLimit.endHour"
                      :placeholder="t('End')"
                      :options="ACCESS_HOUR_OPTIONS"
                      :is-clearable="false"
                      width="120px"
                    />
                  </div>
                </div>
                <p class="inv-time-note">{{ t('Time in GMT+7') }}</p>
                <p v-if="timeError" class="inv-inline-error">{{ timeError }}</p>
              </div>
            </div>
          </section>

          <div class="inv-divider" />

          <!-- ── Role ── -->
          <section class="inv-section">
            <div class="inv-section-head">
              <h2 class="inv-section-title">{{ t('Role') }}<span class="inv-required">*</span></h2>
            </div>

            <MpTabs id="inv-role-tabs" v-model="activeRoleTab" is-manual variant-color="green">
              <MpTabList>
                <MpTab value="existing">{{ t('Existing') }}</MpTab>
                <MpTab value="custom">
                  <span class="inv-tab-with-badge">
                    {{ t('Custom') }}
                    <MpBadge type="information" for="additionalInformation">{{ t('New') }}</MpBadge>
                  </span>
                </MpTab>
              </MpTabList>

              <MpTabPanels>
                <!-- ── Existing roles ── -->
                <MpTabPanel value="existing">
                  <ul class="inv-roles">
                    <li v-for="role in existingRoles" :key="role.id" class="inv-role">
                      <div class="inv-role-head">
                        <MpButton
                          variant="ghost"
                          class="inv-role-toggle"
                          :left-icon="expanded[role.id] ? 'caret-down' : 'caret-right'"
                          :aria-label="expanded[role.id] ? t('Collapse') : t('Expand')"
                          :aria-expanded="expanded[role.id]"
                          @click="expanded[role.id] = !expanded[role.id]"
                        />
                        <MpCheckbox
                          :id="`inv-role-${role.id}`"
                          :is-checked="isSystemRoleOn(role.id)"
                          @change="(on: boolean) => toggleSystemRole(role, on)"
                        >
                          <span class="inv-role-name">{{ t(role.name) }}</span>
                        </MpCheckbox>
                      </div>

                      <div v-if="expanded[role.id]" class="inv-role-body">
                        <!-- Plain description lines, no bullets — as in production. -->
                        <div class="inv-desc-lines">
                          <p v-for="p in role.permissions" :key="p">{{ t(p) }}</p>
                        </div>

                        <!-- Default sales / purchasing authority -->
                        <div v-if="role.authorityGroup" class="inv-subgroup">
                          <span class="inv-subgroup-label">{{ t(role.authorityGroup.label) }}</span>
                          <div class="inv-subgroup-options">
                            <MpCheckbox
                              v-for="opt in role.authorityGroup.options"
                              :key="opt.value"
                              :id="`inv-auth-${role.id}-${opt.value}`"
                              :is-checked="(roleAuthority[role.id] ?? []).includes(opt.value)"
                              :is-disabled="!isSystemRoleOn(role.id)"
                              @change="(on: boolean) => toggleAuthorityOption(role.id, opt.value, on)"
                            >{{ t(opt.label) }}</MpCheckbox>
                          </div>
                        </div>

                        <!-- Access limitation -->
                        <div v-if="role.accessLimitation" class="inv-subgroup">
                          <span class="inv-subgroup-label">{{ t('Access limitation') }}</span>
                          <MpCheckbox
                            :id="`inv-limit-${role.id}`"
                            :is-checked="!!roleLimitation[role.id]"
                            :is-disabled="!isSystemRoleOn(role.id)"
                            @change="(on: boolean) => roleLimitation[role.id] = on"
                          >{{ t(role.accessLimitation) }}</MpCheckbox>
                        </div>
                      </div>
                    </li>

                    <!-- CRM — one more row in the Existing list (where the old \`crm\` system
                         role sat), but it maps to user.crmRole, not systemRoleIds, so seats
                         count separately: CRM only → CRM seat, no ERP seat. Its state lives
                         outside the tabs, so it combines with Ultimate and custom roles. -->
                    <li v-if="crmVisible" class="inv-role" data-devchange="crm-user-seats-invite-crm-role" data-test-id="inv-crm-row">
                      <div class="inv-role-head">
                        <MpButton
                          variant="ghost"
                          class="inv-role-toggle"
                          :left-icon="crmExpanded ? 'caret-down' : 'caret-right'"
                          :aria-label="crmExpanded ? t('Collapse') : t('Expand')"
                          :aria-expanded="crmExpanded"
                          @click="crmExpanded = !crmExpanded"
                        />
                        <MpCheckbox
                          id="inv-crm"
                          data-test-id="inv-crm-checkbox"
                          :is-checked="crmOn"
                          :is-disabled="crmLocked"
                          @change="toggleCrm"
                        >
                          <span class="inv-role-name">{{ t('CRM') }}</span>
                        </MpCheckbox>
                      </div>

                      <div v-if="crmExpanded" class="inv-role-body">
                        <MpBanner v-if="crmMode === 'read-only'" id="inv-crm-expired" variant="warning">
                          <MpBannerIcon id="inv-crm-expired-icon" />
                          <MpBannerDescription>{{ t(SEAT_BLOCK_MESSAGES['crm-read-only']) }}</MpBannerDescription>
                        </MpBanner>

                        <div class="inv-desc-lines">
                          <p v-for="p in CRM_PERMISSIONS" :key="p">{{ t(p) }}</p>
                        </div>

                        <!-- "Default crm authority" — production's radio pair. CRM Basic is the
                             default; CRM Manager is the Administrator-capable tier (internal
                             crmRole 'admin'), checked against the CRM Manager seat limit. -->
                        <div class="inv-subgroup" data-test-id="inv-crm-authority">
                          <span class="inv-subgroup-label">{{ t('Default crm authority') }}</span>
                          <div class="inv-radio-stack">
                            <MpRadio
                              id="inv-crm-basic" name="inv-crm-authority" value="basic"
                              data-test-id="inv-crm-basic-radio"
                              :is-checked="crmOn && !crmSettings"
                              :is-disabled="!crmOn || crmLocked"
                              @change="toggleCrmSettings(false)"
                            >{{ t('CRM Basic') }}</MpRadio>
                            <MpRadio
                              id="inv-crm-manager" name="inv-crm-authority" value="admin"
                              data-test-id="inv-crm-manager-radio"
                              :is-checked="crmOn && crmSettings"
                              :is-disabled="!crmOn || crmLocked"
                              @change="toggleCrmSettings(true)"
                            >{{ t('CRM Manager') }}</MpRadio>
                          </div>
                        </div>

                        <p v-if="isOwnerUser" class="inv-crm-note">
                          {{ t('The Owner always has CRM Manager access and holds 1 included seat.') }}
                        </p>
                      </div>
                      <!-- Block message next to the row that caused it. -->
                      <p v-if="crmSeatError" class="inv-inline-error inv-crm-error" data-test-id="inv-crm-seat-error">
                        {{ crmSeatError }}
                        <a v-if="crmSeatErrorIsLimit" class="inv-link" @click="openContactSales('crm-seats')">{{ t('Contact Sales') }}</a>
                      </p>
                    </li>
                  </ul>
                </MpTabPanel>

                <!-- ── Custom roles ── -->
                <MpTabPanel value="custom">
                  <p v-if="crmVisible" class="inv-seat-line inv-custom-crm-hint" data-test-id="inv-custom-crm-hint">
                    {{ t('CRM access is set in Existing role.') }}
                    <template v-if="crmRoleChoice">{{ t('Selected') }}: {{ t(crmRoleLabel(crmRoleChoice)) }}.</template>
                  </p>
                  <ul v-if="customRoles.length" class="inv-roles">
                    <li v-for="role in customRoles" :key="role.id" class="inv-role">
                      <div class="inv-role-head">
                        <MpCheckbox
                          :id="`inv-custom-${role.id}`"
                          :is-checked="isCustomRoleOn(role.id)"
                          @change="(on: boolean) => toggleCustomRole(role.id, on)"
                        >
                          <span class="inv-role-name">{{ role.name }}</span>
                          <template #description>
                            {{ role.description || t('No description') }}
                          </template>
                        </MpCheckbox>
                      </div>
                      <p class="inv-custom-meta">
                        {{ grantedFeatureCount(role.grants) }}
                        {{ grantedFeatureCount(role.grants) === 1 ? t('feature') : t('features') }}
                      </p>
                    </li>
                  </ul>

                  <!-- Empty: no custom role has been created yet -->
                  <div v-else class="inv-custom-empty">
                    <p class="inv-custom-empty-title">{{ t('No custom roles') }}</p>
                    <p class="inv-custom-empty-desc">{{ t('Create a custom role to grant a precise set of authorities.') }}</p>
                    <MpButton variant="secondary" is-rounded left-icon="add" @click="router.push('/users-and-roles?tab=Custom%20role')">
                      {{ t('New custom role') }}
                    </MpButton>
                  </div>
                </MpTabPanel>
              </MpTabPanels>
            </MpTabs>

            <p v-if="roleError" class="inv-inline-error">{{ roleError }}</p>
            <p v-if="erpSeatError" class="inv-inline-error" data-test-id="inv-erp-seat-error">
              {{ erpSeatError }}
              <a v-if="erpSeatErrorIsLimit" class="inv-link" @click="openContactSales('erp-seats')">{{ t('Contact Sales') }}</a>
            </p>
          </section>

          <div class="inv-divider" />

          <!-- ── Additional authority ── -->
          <section class="inv-section">
            <h2 class="inv-section-title">{{ t('Additional authority') }}</h2>
            <MpCheckbox
              id="inv-list-manager"
              :is-checked="isListManager"
              @change="(on: boolean) => isListManager = on"
            >
              {{ t('List Manager (can edit and delete data)') }}
            </MpCheckbox>
          </section>

          <!-- ── Footer actions — always present, never disabled by validation ── -->
          <div class="inv-actions erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">
              {{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Invite')) }}
            </MpButton>
          </div>
        </div>

        <!-- ── Right column (sticky), as in production: "Selected roles" summary +
             collapsible "Terms for selecting roles". ── -->
        <aside class="inv-aside" data-devchange="crm-user-seats-invite-selected-roles">
          <!-- Seat usage — same card style as Selected roles, above it so the counts
               stay visible while picking roles. Live "after saving" preview. -->
          <div class="inv-card" data-devchange="crm-user-seats-invite-summary" data-test-id="inv-seat-card">
            <p class="inv-card-title">
              {{ t('Seat usage') }}
              <span v-if="seatPreviewChanged" class="inv-card-hint" data-test-id="inv-seat-after-saving">{{ t('(after saving)') }}</span>
            </p>
            <SeatUsageSummary :view="seatPreview" :billing-down="crmState.billing === 'down'" layout="stacked" />
            <p class="inv-seat-help">
              {{ t('Need more ERP or CRM seats?') }}
              <a class="inv-link" data-test-id="inv-seat-contact-sales" @click="openContactSales('seats')">{{ t('Contact Sales.') }}</a>
            </p>
          </div>

          <div class="inv-card" data-test-id="inv-selected-roles">
            <p class="inv-card-title">{{ t('Selected roles') }}</p>
            <div class="inv-selected-group">
              <p class="inv-selected-label">{{ t('Existing') }}</p>
              <div v-if="selectedExistingChips.length" class="inv-chips" data-test-id="inv-selected-existing">
                <MpTag v-for="c in selectedExistingChips" :key="c">{{ c }}</MpTag>
              </div>
              <p v-else class="inv-selected-empty">-</p>
            </div>
            <div class="inv-selected-group">
              <p class="inv-selected-label">{{ t('Custom') }}</p>
              <div v-if="selectedCustomChips.length" class="inv-chips" data-test-id="inv-selected-custom">
                <MpTag v-for="c in selectedCustomChips" :key="c">{{ c }}</MpTag>
              </div>
              <p v-else class="inv-selected-empty">-</p>
            </div>
          </div>

          <div class="inv-terms">
            <MpButton
              variant="ghost" class="inv-terms-head"
              :right-icon="termsOpen ? 'chevrons-up' : 'chevrons-down'"
              :aria-expanded="termsOpen"
              @click="termsOpen = !termsOpen"
            >
              <span class="inv-terms-title">{{ t('Terms for selecting roles') }}</span>
            </MpButton>
            <ul v-if="termsOpen" class="inv-terms-list">
              <li v-for="term in ROLE_SELECTION_TERMS" :key="term">{{ t(term) }}</li>
              <template v-if="crmVisible">
                <li>{{ t('CRM can be combined with Ultimate and any custom role. Ultimate does not include CRM.') }}</li>
                <li>{{ t('A user with only the CRM role uses a CRM seat, not an ERP seat. A user with ERP roles and CRM uses one of each.') }}</li>
                <li>{{ t('CRM Manager needs a CRM Manager seat; CRM Basic can use any CRM seat.') }}</li>
              </template>
            </ul>
          </div>
        </aside>
      </div>
    </div>

    <SeatContactSalesModal v-model:is-open="contactSalesOpen" id="inv-contact-sales" :topic="contactSalesTopic" />

    <!-- No ERP role and no CRM role left → remove the user instead (US-010 AC-06). -->
    <ConfirmModal
      v-model:is-open="removeInsteadOpen"
      :title="t('Delete this user instead?')"
      :description="t('A user needs at least one ERP role or the CRM role. To take away all of their access, delete them from the company. Their transactions stay in the account.')"
      :confirm-label="t('Delete user')"
      :cancel-label="t('Keep editing')"
      @confirm="removeUserInstead"
    />

    <!-- Demo: flip the CRM add-on state without leaving the form. -->
    <CrmSeatsScenarioFab />
  </div>
</template>

<style scoped>
/* ── Page shell ── */
.inv-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.inv-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.inv-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
/* Breadcrumb — a textLink MpButton stripped of Pixel's atomic button box so it
   sits flush above the title with gap 0 (rule/detail-breadcrumb-no-gap). */
.inv-breadcrumb {
  height: auto !important; min-width: 0 !important; padding: 0 !important;
  font-size: var(--mp-font-sizes-sm) !important;
  font-weight: var(--mp-font-weights-regular) !important;
  line-height: var(--mp-line-heights-md); color: var(--mp-text-link);
  white-space: nowrap;
}
.inv-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

.inv-stage {
  flex: 1;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

.inv-layout { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.inv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-6); max-width: 880px; }
.inv-aside { flex: 0 0 320px; position: sticky; top: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
/* Plain role-description lines (production has no bullets here). */
.inv-desc-lines { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.inv-desc-lines p { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
/* "Selected roles" card — bordered surface, no shadow (rule/surface-border-no-shadow). */
.inv-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px);
}
.inv-card-title {
  padding-bottom: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.inv-selected-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.inv-selected-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.inv-selected-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.inv-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.inv-card-hint { margin-left: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.inv-seat-help { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Sections ── */
.inv-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
.inv-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.inv-required { color: var(--mp-text-critical, var(--mp-text-danger)); }
.inv-divider { height: 1px; background: var(--mp-border-default, #e3e7e9); }

.inv-field-row { display: flex; gap: var(--mp-spacing-4); }
.inv-field-row > * { flex: 1; min-width: 0; }

/* ── Access time limits ── */
.inv-checkbox-block { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.inv-time {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding-left: var(--mp-spacing-6);
}
.inv-time-fields { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.inv-time-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.inv-field-label {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.inv-time-dash { padding-bottom: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.inv-time-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.inv-time-blocked {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.inv-inline-error {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, var(--mp-text-danger));
}

/* ── Role list ── */
.inv-tab-with-badge { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

.inv-roles { list-style: none; margin: 0; padding: 0; }
.inv-role { padding: var(--mp-spacing-4) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.inv-role:last-child { border-bottom: none; }
.inv-role-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.inv-role-toggle {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important; color: var(--mp-icon-default);
}
.inv-role-name { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.inv-role-body {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  margin-top: var(--mp-spacing-2); padding-left: var(--mp-spacing-11, 44px);
}
/* The global reset strips list-style, so bullets must be re-declared. */

.inv-subgroup { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.inv-subgroup-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.inv-subgroup-options { display: flex; align-items: center; gap: var(--mp-spacing-5, 20px); flex-wrap: wrap; }

/* ── Seat usage — one compact helper line per pool (no card, no bars) ── */
.inv-seat-line { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.inv-link { color: var(--mp-text-link); cursor: pointer; }
.inv-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── CRM role ── */
.inv-section-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
/* CRM row — Owner note (grey helper text). */
.inv-radio-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.inv-crm-error { margin-top: var(--mp-spacing-2); padding-left: var(--mp-spacing-7, 28px); }
.inv-custom-crm-hint { padding: var(--mp-spacing-3) 0 0; }
.inv-crm-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }

.inv-custom-meta {
  margin-top: var(--mp-spacing-1); padding-left: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.inv-custom-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-6) 0;
}
.inv-custom-empty-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.inv-custom-empty-desc { margin-bottom: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Side card ── */
.inv-terms {
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral, #ffffff);
}
.inv-terms-head {
  display: flex !important; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3);
  width: 100% !important; height: auto !important;
  padding: var(--mp-spacing-3) var(--mp-spacing-4) !important;
  text-align: left;
}
.inv-terms-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.inv-terms-list {
  list-style: disc outside; margin: 0;
  padding: 0 var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-8, 32px);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.inv-terms-list li {
  display: list-item;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* ── Actions — alignment + the ≤640px stacked/full-width behaviour come from the
   global .erp-action-footer (rule/btn-responsive-footer). ── */

/* ── Not found ── */
.inv-notfound { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.inv-notfound-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.inv-notfound-desc { margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Responsive ── */
@media (max-width: 1080px) {
  .inv-layout { flex-direction: column; }
  .inv-aside { flex: 1 1 auto; width: 100%; position: static; order: -1; }
}
@media (max-width: 640px) {
  .inv-field-row { flex-direction: column; }
}
</style>
