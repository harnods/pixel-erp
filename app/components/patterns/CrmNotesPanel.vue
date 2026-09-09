<script setup lang="ts">
/**
 * CrmNotesPanel — notes for a CRM contact or company. Reads + writes the unified
 * `crmNotes` store. Compose a note with a textarea + a secondary "Add note".
 * Notes list newest-first with a lg avatar (stable per-user colour), author name
 * and timestamp. You can edit / delete your OWN notes via a [⋯] menu on the right
 * of the note; other people's notes are read-only. Reused on the Contact +
 * Company records.
 */
import { computed, ref } from 'vue'
import {
  MpTextarea, MpButton, MpAvatar, MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { notesFor, addCrmNote, updateCrmNote, deleteCrmNote, type CrmNoteEntity } from '~/data/crm'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{ entityType: CrmNoteEntity; entityId: string; author?: string }>()
const { t } = useLocale()

const currentUser = computed(() => props.author ?? 'Rizal Candra')
const notes = computed(() => notesFor(props.entityType, props.entityId))
const draft = ref('')

const editingId = ref('')
const editDraft = ref('')

// Stable avatar colour per author (same user → same colour, deterministic).
const AVATAR_COLORS = ['sky', 'teal', 'violet', 'amber', 'rose', 'stone', 'lime', 'pink'] as const
function avatarColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

function nowStamp(): string { return new Date().toISOString().slice(0, 19) }
function submit() {
  if (!draft.value.trim()) return
  addCrmNote(props.entityType, props.entityId, draft.value, currentUser.value, nowStamp())
  draft.value = ''
}
function startEdit(id: string, text: string) { editingId.value = id; editDraft.value = text }
function cancelEdit() { editingId.value = ''; editDraft.value = '' }
function saveEdit(id: string) {
  if (!editDraft.value.trim()) return
  updateCrmNote(id, editDraft.value)
  cancelEdit()
}
function isOwn(author: string): boolean { return author === currentUser.value }
</script>

<template>
  <div class="notes">
    <!-- Composer -->
    <div class="notes-compose">
      <MpTextarea id="crm-note-input" v-model="draft" :placeholder="t('Add a note…')" :rows="3" is-full-width />
      <div class="notes-compose-actions">
        <MpButton variant="secondary" is-rounded @click="submit">{{ t('Add note') }}</MpButton>
      </div>
    </div>

    <!-- List -->
    <ul v-if="notes.length" class="notes-list">
      <li v-for="n in notes" :key="n.id" class="note">
        <MpAvatar :id="`na-${n.id}`" :name="n.author" size="lg" :variant-color="avatarColor(n.author)" />
        <div class="note-body">
          <div class="note-head">
            <span class="note-author">{{ n.author }}</span>
            <span class="note-time">{{ formatDateTime(n.at) }}</span>
          </div>

          <!-- Inline edit (own note) -->
          <template v-if="editingId === n.id">
            <MpTextarea :id="`crm-note-edit-${n.id}`" v-model="editDraft" :rows="3" is-full-width />
            <div class="note-edit-actions">
              <MpButton variant="ghost" is-rounded @click="cancelEdit">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="saveEdit(n.id)">{{ t('Save') }}</MpButton>
            </div>
          </template>
          <p v-else class="note-text">{{ n.text }}</p>
        </div>

        <!-- Own note → [⋯] menu (Edit · Delete) on the right -->
        <MpPopover
          v-if="isOwn(n.author) && editingId !== n.id"
          :id="`note-menu-${n.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
        >
          <MpPopoverTrigger>
            <MpButton class="note-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="startEdit(n.id, n.text)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="deleteCrmNote(n.id)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </li>
    </ul>
    <p v-else class="notes-empty">{{ t('No notes yet.') }}</p>
  </div>
</template>

<style scoped>
/* Cap to the 6-col form width so notes don't stretch the full stage. */
.notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: 100%; max-width: 558px; }
.notes-compose { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 640px; }
.notes-compose-actions { display: flex; justify-content: flex-end; }

.notes-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.note { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.note-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.note-head { display: flex; align-items: baseline; gap: var(--mp-spacing-2); }
.note-author { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.note-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-wrap; overflow-wrap: anywhere; }
.note-edit-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }

.note-kebab {
  flex-shrink: 0;
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.note-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

.notes-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
