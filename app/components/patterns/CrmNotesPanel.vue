<script setup lang="ts">
/**
 * CrmNotesPanel — notes for a CRM contact or company. Reads + writes the unified
 * `crmNotes` store via the data helpers. Compose a note with a textarea +
 * "Add note"; existing notes list newest-first with a lg avatar, author name and
 * timestamp. You can edit / delete your OWN notes (author === current user);
 * other people's notes are read-only. Reused on the Contact + Company records.
 */
import { computed, ref } from 'vue'
import { MpTextarea, MpButton, MpAvatar } from '@mekari/pixel3'
import { notesFor, addCrmNote, updateCrmNote, deleteCrmNote, type CrmNoteEntity } from '~/data/crm'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{ entityType: CrmNoteEntity; entityId: string; author?: string }>()
const { t } = useLocale()

const currentUser = computed(() => props.author ?? 'Rizal Candra')
const notes = computed(() => notesFor(props.entityType, props.entityId))
const draft = ref('')

const editingId = ref('')
const editDraft = ref('')

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
        <MpButton variant="primary" is-rounded @click="submit">{{ t('Add note') }}</MpButton>
      </div>
    </div>

    <!-- List -->
    <ul v-if="notes.length" class="notes-list">
      <li v-for="n in notes" :key="n.id" class="note">
        <MpAvatar :id="`na-${n.id}`" :name="n.author" size="lg" variant-color="green" />
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

          <template v-else>
            <p class="note-text">{{ n.text }}</p>
            <div v-if="isOwn(n.author)" class="note-actions">
              <a class="note-action" role="button" tabindex="0" @click="startEdit(n.id, n.text)" @keydown.enter="startEdit(n.id, n.text)">{{ t('Edit') }}</a>
              <a class="note-action note-action--danger" role="button" tabindex="0" @click="deleteCrmNote(n.id)" @keydown.enter="deleteCrmNote(n.id)">{{ t('Delete') }}</a>
            </div>
          </template>
        </div>
      </li>
    </ul>
    <p v-else class="notes-empty">{{ t('No notes yet.') }}</p>
  </div>
</template>

<style scoped>
.notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.notes-compose { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 640px; }
.notes-compose-actions { display: flex; justify-content: flex-end; }

.notes-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.note { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.note-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.note-head { display: flex; align-items: baseline; gap: var(--mp-spacing-2); }
.note-author { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.note-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-wrap; overflow-wrap: anywhere; }

.note-actions { display: flex; align-items: center; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-1); }
.note-action { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.note-action:hover { text-decoration: underline; text-underline-offset: 2px; }
.note-action--danger { color: var(--mp-text-danger); }

.note-edit-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }

.notes-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
