<script setup lang="ts">
/**
 * CrmNewModulePage — create a custom module as its own PAGE
 * (/crm/settings/modules/new), not a modal. Mirrors the ERP create-form shell
 * (crumb + title → fields → footer) per NewCrmServicePage.vue. Fields: Module
 * name (+ icon picker), Access level (Company / Team, multi-select when Team).
 * Footer: Cancel, Save as draft, Publish — creates the module + its builder
 * config (createCustomModule) and routes straight into its builder.
 */
import { computed, ref } from 'vue'
import {
  MpButton, MpButtonGroup, MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpRadio, MpCheckbox, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, css,
} from '@mekari/pixel3'
import { crmTeams, CRM_MODULE_ICONS, createCustomModule } from '~/data/crm'

const router = useRouter()
const { t } = useLocale()

const MODULE_NAME_MAX = 40
const name = ref('')
const nameError = ref('')
const icon = ref('pipeline')
const iconMenuOpen = ref(false)
function pickIcon(ic: string) { icon.value = ic; iconMenuOpen.value = false }

const accessLevel = ref<'company' | 'team'>('company')
const teamIds = ref<string[]>([])
const activeTeams = computed(() => crmTeams.filter((tm) => tm.status === 'active'))
function toggleTeam(id: string) {
  teamIds.value = teamIds.value.includes(id) ? teamIds.value.filter((x) => x !== id) : [...teamIds.value, id]
}
const teamError = ref('')

function onCancel() { router.push('/crm/settings/modules') }
function submit(status: 'draft' | 'published') {
  nameError.value = ''; teamError.value = ''
  if (!name.value.trim()) { nameError.value = t('Enter a module name.'); return }
  if (accessLevel.value === 'team' && !teamIds.value.length) { teamError.value = t('Select at least one team.'); return }
  const id = createCustomModule(name.value.trim(), icon.value, accessLevel.value, teamIds.value, status)
  router.push(`/crm/settings/modules/${id}`)
}
</script>

<template>
  <div class="crm">
    <header class="nmp-bar">
      <a class="nmp-crumb" @click="onCancel">{{ t('Modules') }}</a>
      <h1 class="nmp-h1">{{ t('New module') }}</h1>
    </header>

    <div class="nmp-stage">
      <MpFormControl id="nmp-name-fc" is-required :is-invalid="!!nameError">
        <MpFormLabel>{{ t('Module name') }}</MpFormLabel>
        <div class="nmp-name-row">
          <MpPopover id="nmp-icon-menu" :is-open="iconMenuOpen" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @close="iconMenuOpen = false">
            <MpPopoverTrigger>
              <button type="button" class="nmp-icon-trigger" :aria-label="t('Change icon')" @click="iconMenuOpen = !iconMenuOpen">
                <MpIcon :name="icon" size="md" />
                <MpIcon name="chevrons-down" size="sm" class="nmp-icon-caret" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ padding: 'var(--mp-spacing-2)', width: '240px' })">
              <div class="nmp-icon-grid">
                <button
                  v-for="ic in CRM_MODULE_ICONS" :key="ic" type="button"
                  class="nmp-icon-choice" :class="{ 'nmp-icon-choice--active': icon === ic }"
                  :aria-label="ic" @click="pickIcon(ic)"
                ><MpIcon :name="ic" size="md" /></button>
              </div>
            </MpPopoverContent>
          </MpPopover>
          <MpInput
            id="nmp-name" v-model="name" is-full-width :maxlength="MODULE_NAME_MAX"
            @update:model-value="nameError = ''"
          />
        </div>
        <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
      </MpFormControl>

      <MpFormControl id="nmp-access-fc" class="nmp-access-fc">
        <MpFormLabel>{{ t('Access level') }}</MpFormLabel>
        <span class="nmp-caption">{{ t('Choose whether this module is company-wide or limited to specific teams.') }}</span>
        <div class="nmp-radio-row">
          <MpRadio id="nmp-access-company" name="nmp-access" value="company" :is-checked="accessLevel === 'company'" @change="accessLevel = 'company'">{{ t('Company') }}</MpRadio>
          <MpRadio id="nmp-access-team" name="nmp-access" value="team" :is-checked="accessLevel === 'team'" @change="accessLevel = 'team'">{{ t('Team') }}</MpRadio>
        </div>
        <div v-if="accessLevel === 'team'" class="nmp-team-list">
          <MpCheckbox
            v-for="tm in activeTeams" :key="tm.id" :id="`nmp-team-${tm.id}`"
            :is-checked="teamIds.includes(tm.id)" @change="toggleTeam(tm.id)"
          >{{ tm.name }}</MpCheckbox>
          <p v-if="!activeTeams.length" class="nmp-team-empty">{{ t('No active teams yet.') }}</p>
        </div>
        <MpFormErrorMessage v-if="teamError">{{ teamError }}</MpFormErrorMessage>
      </MpFormControl>

      <MpButtonGroup class="erp-action-footer nmp-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--secondary" is-rounded @click="submit('draft')">{{ t('Save as draft') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="submit('published')">{{ t('Publish') }}</MpButton>
      </MpButtonGroup>
    </div>
  </div>
</template>

<style scoped>
.nmp-bar { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-4); }
.nmp-crumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.nmp-crumb:hover { text-decoration: underline; }
.nmp-h1 { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }

.nmp-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-6); background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-8); max-width: 520px; }

.nmp-name-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.nmp-icon-trigger { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; padding: var(--mp-spacing-2); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); cursor: pointer; color: var(--mp-text-default); }
.nmp-icon-trigger:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.nmp-icon-caret { color: var(--mp-icon-default, #536062); }
.nmp-icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-1); }
.nmp-icon-choice { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-sm); background: none; cursor: pointer; color: var(--mp-icon-default, #536062); }
.nmp-icon-choice:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.nmp-icon-choice--active { background: var(--mp-background-brand-subtle, #eafaf1); color: var(--mp-icon-brand, #0a6e4e); }

.nmp-access-fc { margin-top: var(--mp-spacing-2); }
.nmp-caption { display: block; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }
.nmp-radio-row { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.nmp-team-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; max-height: 220px; overflow-y: auto; }
.nmp-team-empty { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.nmp-footer { margin-top: var(--mp-spacing-4); }
</style>
