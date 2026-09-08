<script setup lang="ts">
/**
 * CRM — Invite user (full-page form). Same FORMAT as the ERP Settings › Invite
 * user page (Figma node 4387-40157): Name → Email → "Set access time" → Access
 * role (a selectable list of roles, each with its permissions) → footer.
 *
 * CRM adaptation: there are NO custom roles, so the Default/Custom tabs are
 * dropped — the CRM roles are listed directly, each explaining what it grants.
 * The ERP-only "List Manager authority" (master-data lists) is also dropped.
 */
import { ref, computed } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage,
  MpInput, MpCheckbox, MpRadio, MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ── CRM roles — grounded in the CRM modules (Deals · Contacts · Companies ·
// Reports · Teams · Settings). One role per user, radio-selected. ──
interface CrmRole {
  key: string
  name: string
  desc: string
  permissions: string[]
  /** Optional "own records only" restriction (like the ERP access-restriction row). */
  restriction?: string
}
const CRM_ROLES: CrmRole[] = [
  {
    key: 'admin',
    name: 'Admin',
    desc: 'Full access to every CRM module plus workspace settings.',
    permissions: [
      'Invite and manage users, roles, and teams',
      'Configure pipelines, custom fields, and integrations',
      'View, create, and edit all deals, contacts, and companies',
      'Access every report',
    ],
  },
  {
    key: 'sales',
    name: 'Sales',
    desc: 'Works the deal pipeline and owns customer relationships.',
    permissions: [
      'Create and move deals across the pipeline',
      'Add and edit contacts and companies',
      'Log activities, notes, and tasks',
      'View sales reports',
    ],
    restriction: 'Restrict to deals and records assigned to this user',
  },
  {
    key: 'marketing',
    name: 'Marketing',
    desc: 'Manages leads and nurtures contacts into the pipeline.',
    permissions: [
      'View and manage contacts and companies',
      'View the deal pipeline (read-only)',
      'Track lead sources and campaign activity',
      'View marketing and pipeline reports',
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    desc: 'View-only access to CRM data — cannot make changes.',
    permissions: [
      'View deals, contacts, and companies',
      'View reports',
      'No create, edit, or delete',
    ],
  },
]

// ── Form state ──
const name = ref('')
const email = ref('')
const selectedRole = ref('')
const salesRestrict = ref(false)
const setAccessTime = ref(false)
const accessDays = ref('Weekdays')
const accessHours = ref('08:00 – 17:00')
const DAY_OPTIONS = ['Weekdays', 'Weekend', 'Every day']
const HOUR_OPTIONS = ['08:00 – 17:00', 'All day']

// ── Validation (inline, never disable the button) ──
const submitted = ref(false)
const nameError = computed(() => (submitted.value && !name.value.trim() ? 'Enter the invitee’s name' : ''))
const emailError = computed(() => {
  if (!submitted.value) return ''
  if (!email.value.trim()) return 'Enter an email address'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return 'Enter a valid email address'
  return ''
})
const roleError = computed(() => (submitted.value && !selectedRole.value ? 'Select a role for this user' : ''))

function goBack() { router.push('/crm/settings/users') }
function send() {
  submitted.value = true
  if (nameError.value || emailError.value || roleError.value) return
  successToast(`Invitation sent to ${email.value.trim()}`)
  goBack()
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <a class="detail-breadcrumb" role="link" tabindex="0" @click="goBack" @keydown.enter="goBack">{{ t('User & roles') }}</a>
        <h1 class="detail-title">{{ t('Invite user') }}</h1>
      </div>
    </header>

    <div class="detail-stage">
      <form class="iu-form" @submit.prevent="send">
        <!-- Name -->
        <MpFormControl id="iu-name" is-required :is-invalid="!!nameError">
          <MpFormLabel>{{ t('Name') }}</MpFormLabel>
          <MpInput id="iu-name-input" v-model="name" is-full-width :placeholder="t('Full name')" />
          <MpFormErrorMessage v-if="nameError">{{ t(nameError) }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Email -->
        <MpFormControl id="iu-email" is-required :is-invalid="!!emailError">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInput id="iu-email-input" v-model="email" is-full-width placeholder="name@company.com" />
          <MpFormErrorMessage v-if="emailError">{{ t(emailError) }}</MpFormErrorMessage>
          <MpFormHelpText v-else>{{ t('This email will be used to sign in.') }}</MpFormHelpText>
        </MpFormControl>

        <!-- Set access time -->
        <div class="iu-accesstime">
          <label class="iu-check">
            <MpCheckbox id="iu-set-access" :is-checked="setAccessTime" @change="setAccessTime = !setAccessTime" />
            <span class="iu-check-text">
              <span class="iu-check-title">{{ t('Set access time') }}</span>
              <span class="iu-check-desc">{{ t('Limit user access by day and time.') }}</span>
            </span>
          </label>
          <div v-if="setAccessTime" class="iu-accesstime-fields">
            <MpFormControl id="iu-access-days" class="iu-at-field">
              <MpFormLabel>{{ t('Days') }}</MpFormLabel>
              <ErpFilterSelect id="iu-days" :model-value="accessDays" placeholder="Days" :options="DAY_OPTIONS" width="100%" @update:model-value="(v: string) => (accessDays = v)" />
            </MpFormControl>
            <MpFormControl id="iu-access-hours" class="iu-at-field">
              <MpFormLabel>{{ t('Hours') }}</MpFormLabel>
              <ErpFilterSelect id="iu-hours" :model-value="accessHours" placeholder="Hours" :options="HOUR_OPTIONS" width="100%" @update:model-value="(v: string) => (accessHours = v)" />
            </MpFormControl>
          </div>
        </div>

        <!-- Access role -->
        <MpFormControl id="iu-role" class="iu-roles" :is-invalid="!!roleError">
          <h2 class="iu-roles-title">{{ t('Access role') }}</h2>
          <p class="iu-roles-lead">{{ t('Assign a role to define what this user can access.') }}</p>

          <div class="iu-role-list">
            <div v-for="role in CRM_ROLES" :key="role.key" class="iu-role" :class="{ 'iu-role--selected': selectedRole === role.key }">
              <label class="iu-role-pick">
                <MpRadio :id="`iu-role-${role.key}`" :is-checked="selectedRole === role.key" @change="selectedRole = role.key" />
                <span class="iu-role-name">{{ role.name }}</span>
              </label>
              <div class="iu-role-body">
                <p class="iu-role-desc">{{ role.desc }}</p>
                <p class="iu-role-cap">{{ t('This role can:') }}</p>
                <ul class="iu-perms">
                  <li v-for="p in role.permissions" :key="p">{{ p }}</li>
                </ul>
                <div v-if="role.restriction && selectedRole === role.key" class="iu-restriction">
                  <span class="iu-restriction-label">{{ t('Access restriction') }}</span>
                  <label class="iu-check iu-check--sm">
                    <MpCheckbox id="iu-sales-restrict" :is-checked="salesRestrict" @change="salesRestrict = !salesRestrict" />
                    <span class="iu-check-text"><span class="iu-check-desc">{{ t(role.restriction) }}</span></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <MpFormErrorMessage>{{ t(roleError) }}</MpFormErrorMessage>
        </MpFormControl>

        <footer class="iu-footer">
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded type="submit">{{ t('Send invitation') }}</MpButton>
          </MpButtonGroup>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* Shell mirrors the other CRM full-bleed pages. */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-colors-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-link, #165082); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-colors-text-default, #080d0e); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-colors-background-stage, #fff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }

/* Single-column form, capped width (matches the Figma). */
.iu-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); max-width: 560px; }

/* Set access time */
.iu-check { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer; }
.iu-check-text { display: flex; flex-direction: column; gap: 2px; }
.iu-check-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-check-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-accesstime { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
/* Days + Hours split the row 50 / 50 — each select fills its half (no empty gap). */
.iu-accesstime-fields { display: flex; gap: var(--mp-spacing-4); padding-left: 32px; }
.iu-at-field { flex: 1 1 0; min-width: 0; }
.iu-at-field :deep(.efs) { display: block; width: 100%; }

/* Access role */
.iu-roles { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.iu-roles-title { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-roles-lead { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }

.iu-role-list { border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.iu-role { border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); padding: var(--mp-spacing-4); }
.iu-role:last-child { border-bottom: none; }
.iu-role--selected { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); }
.iu-role-pick { display: flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; }
.iu-role-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-role-body { padding: var(--mp-spacing-2) 0 0 32px; }
.iu-role-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-role-cap { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-perms { list-style: disc outside; margin: 0 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.iu-perms li { display: list-item; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); line-height: var(--mp-line-heights-md, 20px); }

.iu-restriction { margin-top: var(--mp-spacing-3); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.iu-restriction-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-check--sm .iu-check-desc { color: var(--mp-colors-text-default, #080d0e); }

.iu-footer { margin-top: var(--mp-spacing-2); }
</style>
