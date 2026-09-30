<script setup lang="ts">
/**
 * CrmTeamFormDrawer — New / Edit team drawer for CRM ▸ Settings ▸ Teams.
 *
 * Hand-rolled Teleport overlay (MpDrawer has no structural CSS in this Pixel3
 * build — see CLAUDE.md). It is a FORM, so an outside (overlay) click is
 * intentionally ignored; closing is only via ×, Cancel, or Save so in-progress
 * input is never lost by a stray click.
 *
 * The draft is owned by the PARENT (passed by reference) so the two-pane member
 * picker (SelectAccessDrawer) — which the parent opens on top when the user
 * clicks "Assign members" — mutates the SAME memberIds this form reads back. The
 * fields: Team name, Description, Accessible modules (Deals/Reports/Contacts
 * toggles) and Assign members.
 */
import { MpIcon, MpButton, MpCheckbox, MpInput, MpTextarea, MpToggle, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { CRM_TEAM_MODULES, type CrmTeamModule, type CrmTeamStatus } from '~/data/crm'

export interface CrmTeamDraft {
  name: string
  description: string
  modules: CrmTeamModule[]
  memberIds: string[]
  adminIds: string[]           // Team Admins — always a subset of memberIds
  status: CrmTeamStatus
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  /** Reactive draft owned by the parent (mutated here + by the member picker). */
  draft: CrmTeamDraft
  /** Resolved names for the currently-selected members (parent computes). */
  memberNames: string[]
  /** Full member option list (id → name) so a member can be marked Team Admin. */
  memberOptions: { id: string; name: string; subtitle?: string }[]
  /** Inline validation error for the name field (parent sets on failed Save). */
  nameError?: string
  /** General form error (e.g. missing Team Admin) shown above the footer. */
  formError?: string
}>()
const emit = defineEmits<{
  cancel: []
  save: []
  'pick-members': []
  'clear-name-error': []
  'clear-form-error': []
}>()

const { t } = useLocale()

// Character caps (rule/input-char-counter): show n/max + native maxlength.
// Limits follow the Teams PRD (name 1–100, description ≤500).
const NAME_MAX = 25
const DESC_MAX = 250

function hasModule(key: CrmTeamModule) { return props.draft.modules.includes(key) }
function toggleModule(key: CrmTeamModule, on: boolean) {
  props.draft.modules = on
    ? [...props.draft.modules, key]
    : props.draft.modules.filter((m) => m !== key)
}
function removeMember(id: string) {
  props.draft.memberIds = props.draft.memberIds.filter((m) => m !== id)
  props.draft.adminIds = props.draft.adminIds.filter((m) => m !== id)
}
function isAdmin(id: string) { return props.draft.adminIds.includes(id) }
function toggleAdmin(id: string, on: boolean) {
  props.draft.adminIds = on
    ? [...new Set([...props.draft.adminIds, id])]
    : props.draft.adminIds.filter((m) => m !== id)
  emit('clear-form-error')
}
</script>

<template>
  <ErpDrawer :is-open="open" :title="mode === 'edit' ? t('Edit team') : t('New team')" width="460px" @close="emit('cancel')">
    <template #body>
            <!-- Team name — char-counter variant (rule/input-char-counter): n/max
                 top-right of the label row, capped by native maxlength. -->
            <MpFormControl :id="'ctf-name-fc'" :is-invalid="!!nameError">
              <div class="ctf-label-row">
                <MpFormLabel>{{ t('Team name') }}</MpFormLabel>
                <span class="ctf-counter">{{ draft.name.length }} / {{ NAME_MAX }}</span>
              </div>
              <MpInput
                id="ctf-name-input"
                v-model="draft.name"
                :maxlength="NAME_MAX"
                is-full-width
                :is-invalid="!!nameError"
                @input="emit('clear-name-error')"
              />
              <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Description -->
            <div class="ctf-field">
              <div class="ctf-label-row">
                <span class="ctf-field-label">{{ t('Description') }}</span>
                <span class="ctf-counter">{{ draft.description.length }} / {{ DESC_MAX }}</span>
              </div>
              <MpTextarea
                id="ctf-desc-input"
                v-model="draft.description"
                :maxlength="DESC_MAX"
                :rows="3"
                is-full-width
              />
            </div>

            <!-- Accessible modules -->
            <div class="ctf-field">
              <span class="ctf-field-label">{{ t('Accessible modules') }}</span>
              <span class="ctf-field-help">{{ t('Choose which CRM modules this team can open.') }}</span>
              <ul class="ctf-toggle-list">
                <li v-for="mod in CRM_TEAM_MODULES" :key="mod.key" class="ctf-toggle-row">
                  <MpToggle
                    :id="`ctf-mod-${mod.key}`"
                    :is-checked="hasModule(mod.key)"
                    :aria-label="t(mod.label)"
                    @update:is-checked="(v: boolean) => toggleModule(mod.key, v)"
                  />
                  <span class="ctf-toggle-label">{{ t(mod.label) }}</span>
                </li>
              </ul>
            </div>

            <!-- Assign members — a secondary "Assign members" button that opens the
                 two-pane picker; assigned members list downward, each with a Team
                 Admin checkbox and a (−) remove (always tooltip'd "Remove"). -->
            <div class="ctf-field">
              <span class="ctf-field-label">{{ t('Members') }}</span>
              <span class="ctf-field-help">{{ t('Mark at least one member as Team Admin.') }}</span>
              <ul v-if="draft.memberIds.length" class="ctf-member-list">
                <li v-for="(name, i) in memberNames" :key="draft.memberIds[i]" class="ctf-member-row">
                  <span class="ctf-member-name">{{ name }}</span>
                  <div class="ctf-member-actions">
                    <MpCheckbox
                      :id="`ctf-admin-${draft.memberIds[i]}`"
                      :is-checked="isAdmin(draft.memberIds[i]!)"
                      @update:is-checked="(v: boolean) => toggleAdmin(draft.memberIds[i]!, v)"
                    >{{ t('Team Admin') }}</MpCheckbox>
                    <MpTooltip :id="`ctf-rm-${draft.memberIds[i]}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton type="button" class="ctf-member-remove" variant="ghost" :aria-label="`${t('Remove')} ${name}`" @click="removeMember(draft.memberIds[i]!)">
                        <MpIcon name="minus-circular" size="md" />
                      </MpButton>
                    </MpTooltip>
                  </div>
                </li>
              </ul>
              <MpButton type="button" class="btn-enterprise btn-enterprise--secondary ctf-assign-btn" variant="secondary" @click="emit('pick-members')">
                {{ t('Assign members') }}
              </MpButton>
            </div>

            <!-- Status — Active / Inactive (edit only; new teams start Active) -->
            <div v-if="mode === 'edit'" class="ctf-field">
              <span class="ctf-field-label">{{ t('Status') }}</span>
              <div class="ctf-toggle-row">
                <MpToggle
                  id="ctf-status"
                  :is-checked="draft.status === 'active'"
                  :aria-label="t('Active')"
                  @update:is-checked="(v: boolean) => (draft.status = v ? 'active' : 'inactive')"
                />
                <span class="ctf-toggle-label">{{ draft.status === 'active' ? t('Active') : t('Inactive') }}</span>
              </div>
            </div>

            <p v-if="formError" class="ctf-form-error">{{ formError }}</p>
    </template>
    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="emit('save')">
        {{ mode === 'edit' ? t('Save changes') : t('Save') }}
      </MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.ctf-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

.ctf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ctf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctf-field-help { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Inputs use Pixel MpInput / MpTextarea (correct bold focus border ships with the
   component — do not re-style, per rule/form-input-focus). */

/* Label row + char counter (rule/input-char-counter). */
.ctf-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.ctf-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Module toggles */
.ctf-toggle-list { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; display: flex; flex-direction: column; }
.ctf-toggle-row {
  display: flex; align-items: center; justify-content: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ctf-toggle-row:last-child { border-bottom: none; }
.ctf-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Members — a vertical list (name + a tooltip'd (−) remove per row), then a
   secondary "+ Assign members" button that opens the two-pane picker. */
.ctf-member-list {
  list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0;
}
.ctf-member-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ctf-member-row:last-child { border-bottom: none; }
.ctf-member-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctf-member-remove {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0;
  border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary);
}
.ctf-member-remove:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-danger, #a8352d); }

.ctf-member-actions { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-shrink: 0; }
.ctf-assign-btn { align-self: flex-start; margin-top: var(--mp-spacing-2); display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.ctf-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger, #a8352d); }

</style>
