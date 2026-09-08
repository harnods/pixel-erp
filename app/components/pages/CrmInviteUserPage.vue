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
import { ref, reactive, computed } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage,
  MpInput, MpCheckbox, MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import CrmPermissionMatrix from '~/components/patterns/CrmPermissionMatrix.vue'
import { defaultPermMatrix } from '~/data/crm'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ── Form state ──
// CRM has NO roles — access is a per-module permission matrix set here.
const name = ref('')
const email = ref('')
const perms = reactive(defaultPermMatrix())
const setAccessTime = ref(false)
const accessDays = ref('Weekdays')
const accessHours = ref('08:00 – 17:00')
const DAY_OPTIONS = ['Weekdays', 'Weekend', 'Every day']
const HOUR_OPTIONS = ['08:00 – 17:00', 'All day']

// ── Validation (inline, never disable the button) ──
const submitted = ref(false)
const nameError = computed(() => (submitted.value && !name.value.trim() ? 'You must fill in a name' : ''))
const emailError = computed(() => {
  if (!submitted.value) return ''
  if (!email.value.trim()) return 'You must fill in an email address'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return 'Enter a valid email address'
  return ''
})
function goBack() { router.push('/crm/settings/users') }
function send() {
  submitted.value = true
  if (nameError.value || emailError.value) return
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
      <form class="iu-form" novalidate @submit.prevent="send">
        <!-- Name -->
        <MpFormControl id="iu-name" is-required :is-invalid="!!nameError">
          <MpFormLabel>{{ t('Name') }}</MpFormLabel>
          <MpInput id="iu-name-input" v-model="name" is-full-width />
          <MpFormErrorMessage v-if="nameError">{{ t(nameError) }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Email -->
        <MpFormControl id="iu-email" is-required :is-invalid="!!emailError">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInput id="iu-email-input" v-model="email" is-full-width />
          <MpFormErrorMessage v-if="emailError">{{ t(emailError) }}</MpFormErrorMessage>
          <MpFormHelpText v-else>{{ t('This email will be used to sign in.') }}</MpFormHelpText>
        </MpFormControl>

        <!-- Set access time — label lives inside MpCheckbox (built-in 12px gap; no extra) -->
        <div class="iu-accesstime">
          <MpCheckbox id="iu-set-access" class="iu-set-access" :is-checked="setAccessTime" @change="setAccessTime = !setAccessTime">
            <span class="iu-check-title">{{ t('Set access time') }}</span>
            <span class="iu-check-desc">{{ t('Limit user access by day and time.') }}</span>
          </MpCheckbox>
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

        <!-- Permissions — no roles; tick what this user can do per module -->
        <div class="iu-perms-block">
          <h2 class="iu-roles-title">{{ t('Permissions') }}</h2>
          <p class="iu-roles-lead">{{ t('Tick what this user can do in each module.') }}</p>
          <CrmPermissionMatrix :matrix="perms" />
        </div>

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
/* Two-line checkbox label sits INSIDE MpCheckbox (12px gap built in). Box top-aligns
   to the first line (rule/checkbox-multiline-top); no extra gap (rule/checkbox-gap-12). */
.iu-set-access :deep(.mp-checkbox__root) { align-items: flex-start; }
.iu-check-title { display: block; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-check-desc { display: block; margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-accesstime { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
/* Days + Hours split the row 50 / 50 — each select fills its half (no empty gap). */
.iu-accesstime-fields { display: flex; gap: var(--mp-spacing-4); padding-left: 32px; }
.iu-at-field { flex: 1 1 0; min-width: 0; }
.iu-at-field :deep(.efs) { display: block; width: 100%; }

/* Access role */
.iu-roles { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.iu-roles-title { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-roles-lead { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }

/* Data permissions toggles */
.iu-perm-toggles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); }
.iu-perm-toggle { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.iu-perm-toggle:last-child { border-bottom: none; }
.iu-perm-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.iu-perm-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-perm-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }

.iu-role-list { border: 1px solid var(--mp-colors-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.iu-role { border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); padding: var(--mp-spacing-4); }
.iu-role:last-child { border-bottom: none; }
.iu-role--selected { background: var(--mp-colors-background-neutral-subtle, #f8f9f9); }
/* Role name is the MpRadio label (built-in 12px gap; no extra) — just make it semibold. */
.iu-role-pick :deep(.mp-radio__label) { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }
.iu-role-body { padding: var(--mp-spacing-2) 0 0 32px; }
.iu-role-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-role-cap { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.iu-perms { list-style: disc outside; margin: 0 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.iu-perms li { display: list-item; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-default, #080d0e); line-height: var(--mp-line-heights-md, 20px); }

.iu-restriction { margin-top: var(--mp-spacing-3); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.iu-restriction-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); }

.iu-footer { margin-top: var(--mp-spacing-2); }
</style>
