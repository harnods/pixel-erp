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
import { MpIcon, MpButton, MpInput, MpTextarea, MpToggle, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage } from '@mekari/pixel3'
import { CRM_TEAM_MODULES, type CrmTeamModule } from '~/data/crm'

export interface CrmTeamDraft {
  name: string
  description: string
  modules: CrmTeamModule[]
  memberIds: string[]
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  /** Reactive draft owned by the parent (mutated here + by the member picker). */
  draft: CrmTeamDraft
  /** Resolved names for the currently-selected members (parent computes). */
  memberNames: string[]
  /** Inline validation error for the name field (parent sets on failed Save). */
  nameError?: string
}>()
const emit = defineEmits<{
  cancel: []
  save: []
  'pick-members': []
  'clear-name-error': []
}>()

const { t } = useLocale()

// Character caps (rule/input-char-counter): show n/max + native maxlength.
const NAME_MAX = 25
const DESC_MAX = 60

function hasModule(key: CrmTeamModule) { return props.draft.modules.includes(key) }
function toggleModule(key: CrmTeamModule, on: boolean) {
  props.draft.modules = on
    ? [...props.draft.modules, key]
    : props.draft.modules.filter((m) => m !== key)
}
function removeMember(id: string) {
  props.draft.memberIds = props.draft.memberIds.filter((m) => m !== id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ctf">
      <div v-if="open" class="ctf-overlay">
        <div class="ctf-panel" role="dialog" :aria-label="mode === 'edit' ? t('Edit team') : t('New team')">
          <header class="ctf-header">
            <span class="ctf-title">{{ mode === 'edit' ? t('Edit team') : t('New team') }}</span>
            <MpButton class="ctf-close" :aria-label="t('Close')" @click="emit('cancel')">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="ctf-body">
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
                  <span class="ctf-toggle-label">{{ t(mod.label) }}</span>
                  <MpToggle
                    :id="`ctf-mod-${mod.key}`"
                    :is-checked="hasModule(mod.key)"
                    :aria-label="t(mod.label)"
                    @update:is-checked="(v: boolean) => toggleModule(mod.key, v)"
                  />
                </li>
              </ul>
            </div>

            <!-- Assign members — a secondary "+ Assign members" button that opens
                 the two-pane picker; assigned members list downward, each with a
                 (−) remove (always tooltip'd "Remove"). -->
            <div class="ctf-field">
              <span class="ctf-field-label">{{ t('Members') }}</span>
              <ul v-if="draft.memberIds.length" class="ctf-member-list">
                <li v-for="(name, i) in memberNames" :key="draft.memberIds[i]" class="ctf-member-row">
                  <span class="ctf-member-name">{{ name }}</span>
                  <MpTooltip :id="`ctf-rm-${draft.memberIds[i]}`" :label="t('Remove')" placement="top" use-portal>
                    <button type="button" class="ctf-member-remove" :aria-label="`${t('Remove')} ${name}`" @click="removeMember(draft.memberIds[i]!)">
                      <MpIcon name="minus-circular" size="md" />
                    </button>
                  </MpTooltip>
                </li>
              </ul>
              <button type="button" class="btn-enterprise btn-enterprise--secondary ctf-assign-btn" @click="emit('pick-members')">
                <MpIcon name="add" size="sm" />
                {{ t('Assign members') }}
              </button>
            </div>
          </div>

          <footer class="ctf-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="emit('save')">
              {{ mode === 'edit' ? t('Save changes') : t('Save') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ctf-enter-active, .ctf-leave-active { transition: background-color 250ms ease; }
.ctf-enter-from, .ctf-leave-to { background-color: transparent; }
.ctf-enter-active .ctf-panel { transition: transform 350ms ease-out; }
.ctf-leave-active .ctf-panel { transition: transform 250ms ease-in; }
.ctf-enter-from .ctf-panel, .ctf-leave-to .ctf-panel { transform: translateX(calc(100% + 12px)); }

.ctf-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.ctf-panel {
  margin: var(--mp-spacing-3);
  width: min(460px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.ctf-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ctf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctf-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.ctf-close:hover { background: var(--mp-background-neutral-hovered); }

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
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default);
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
  border-bottom: 1px solid var(--mp-border-default);
}
.ctf-member-row:last-child { border-bottom: none; }
.ctf-member-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctf-member-remove {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); padding: 0;
  border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary);
}
.ctf-member-remove:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #a8352d); }

.ctf-assign-btn { align-self: flex-start; margin-top: var(--mp-spacing-2); display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }

.ctf-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
