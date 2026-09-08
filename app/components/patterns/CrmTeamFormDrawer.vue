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
import { MpIcon, MpButton, MpToggle, MpFormControl, MpFormLabel, MpFormErrorMessage } from '@mekari/pixel3'
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
            <!-- Team name -->
            <MpFormControl :id="'ctf-name-fc'" :is-invalid="!!nameError">
              <MpFormLabel>{{ t('Team name') }}</MpFormLabel>
              <input
                v-model="draft.name"
                class="ctf-input"
                :class="{ 'ctf-input--invalid': !!nameError }"
                type="text"
                :placeholder="t('e.g. Sales')"
                @input="emit('clear-name-error')"
              >
              <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Description -->
            <div class="ctf-field">
              <span class="ctf-field-label">{{ t('Description') }}</span>
              <textarea
                v-model="draft.description"
                class="ctf-textarea"
                rows="3"
                :placeholder="t('What this team is responsible for')"
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

            <!-- Assign members -->
            <div class="ctf-field">
              <div class="ctf-members-head">
                <span class="ctf-field-label">{{ t('Members') }}</span>
                <button type="button" class="ctf-link" @click="emit('pick-members')">
                  {{ draft.memberIds.length ? t('Edit members') : t('Assign members') }}
                </button>
              </div>
              <div v-if="draft.memberIds.length" class="ctf-chips">
                <span v-for="(name, i) in memberNames" :key="draft.memberIds[i]" class="ctf-chip">
                  {{ name }}
                  <button type="button" class="ctf-chip-remove" :aria-label="`${t('Remove')} ${name}`" @click="removeMember(draft.memberIds[i]!)">
                    <MpIcon name="close" size="sm" />
                  </button>
                </span>
              </div>
              <button v-else type="button" class="ctf-members-empty" @click="emit('pick-members')">
                <MpIcon name="add" size="sm" />
                <span>{{ t('Assign members') }}</span>
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

/* Inputs — match the ERP form field (border-form, brand focus ring). */
.ctf-input, .ctf-textarea {
  width: 100%; box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  outline: none;
}
.ctf-input { height: var(--mp-sizes-10, 40px); }
.ctf-textarea { resize: vertical; min-height: 72px; line-height: var(--mp-line-heights-md); font-family: inherit; }
.ctf-input:focus, .ctf-textarea:focus { border-color: var(--mp-border-brand, #4b61dc); }
.ctf-input--invalid { border-color: var(--mp-border-danger, #e2483d); }
.ctf-input::placeholder, .ctf-textarea::placeholder { color: var(--mp-text-placeholder); }

/* Module toggles */
.ctf-toggle-list { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; display: flex; flex-direction: column; }
.ctf-toggle-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default);
}
.ctf-toggle-row:last-child { border-bottom: none; }
.ctf-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Members */
.ctf-members-head { display: flex; align-items: center; justify-content: space-between; }
.ctf-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.ctf-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.ctf-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }
.ctf-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap;
}
.ctf-chip-remove {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; padding: 0; cursor: pointer; color: var(--mp-text-subtle);
}
.ctf-chip-remove:hover { color: var(--mp-text-default); }
.ctf-members-empty {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); align-self: flex-start;
  margin-top: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px dashed var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md, 6px);
  background: transparent; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ctf-members-empty:hover { background: var(--mp-background-neutral-subtle); }

.ctf-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
