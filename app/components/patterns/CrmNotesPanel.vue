<script setup lang="ts">
/**
 * CrmNotesPanel — notes / comments for a CRM contact or company. Reads + writes
 * the unified `crmNotes` store via the data helpers. An author adds a note with a
 * textarea + "Add note"; existing notes list newest-first with author + timestamp
 * and a remove action. Reused on both the Contact and Company record pages.
 */
import { computed, ref } from 'vue'
import { MpTextarea, MpButton, MpIcon, MpAvatar } from '@mekari/pixel3'
import { notesFor, addCrmNote, deleteCrmNote, type CrmNoteEntity } from '~/data/crm'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{ entityType: CrmNoteEntity; entityId: string; author?: string }>()
const { t } = useLocale()

const author = computed(() => props.author ?? 'Rizal Candra')
const notes = computed(() => notesFor(props.entityType, props.entityId))
const draft = ref('')

function nowStamp(): string { return new Date().toISOString().slice(0, 19) }
function submit() {
  if (!draft.value.trim()) return
  addCrmNote(props.entityType, props.entityId, draft.value, author.value, nowStamp())
  draft.value = ''
}
function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}
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
        <MpAvatar :id="`na-${n.id}`" :name="n.author" size="md" variant-color="green" />
        <div class="note-body">
          <div class="note-head">
            <span class="note-author">{{ n.author }}</span>
            <span class="note-time">{{ formatDateTime(n.at) }}</span>
          </div>
          <p class="note-text">{{ n.text }}</p>
        </div>
        <MpButton class="note-remove" variant="ghost" is-rounded left-icon="delete" :aria-label="t('Delete note')" @click="deleteCrmNote(n.id)" />
      </li>
    </ul>
    <p v-else class="notes-empty">{{ t('No notes yet.') }}</p>
  </div>
</template>

<style scoped>
.notes { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.notes-compose { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.notes-compose-actions { display: flex; justify-content: flex-end; }

.notes-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.note { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.note-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.note-head { display: flex; align-items: baseline; gap: var(--mp-spacing-2); }
.note-author { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.note-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-wrap; overflow-wrap: anywhere; }
.note-remove { flex-shrink: 0; }
.note-remove :deep(svg) { color: var(--mp-text-secondary); }

.notes-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
