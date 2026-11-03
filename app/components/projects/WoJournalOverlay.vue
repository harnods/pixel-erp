<script setup lang="ts">
/**
 * Project → work order → journal drill-down (PRD §2, Story 13), rendered with the
 * shared JournalEntryDrawer (rule/journal-entry-modal). WO journals carry no project
 * dimension — attribution is by document reference — so this path is the audit
 * answer to "show me the GL proof that Rp X landed on PS-…".
 */
import JournalEntryDrawer from '~/components/patterns/JournalEntryDrawer.vue'
import { projectWorkOrders, woJournal } from '~/data/projectTransactions'
import { getProject, getWorkPackage } from '~/data/projects'

const props = defineProps<{ woId?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const wo = computed(() => projectWorkOrders.find(w => w.id === props.woId))
const rows = computed(() => (wo.value ? woJournal(wo.value).map(r => ({ account: r.account, debit: r.debit || undefined, credit: r.credit || undefined })) : []))
const heading = computed(() => {
  const w = wo.value
  if (!w) return ''
  const wp = getWorkPackage(w.wpId)
  return `${w.number} · ${getProject(w.projectId)?.code} · ${wp?.code} ${wp?.name}`
})
const open = computed({ get: () => !!wo.value, set: v => { if (!v) emit('close') } })
</script>

<template>
  <JournalEntryDrawer v-model:is-open="open" :heading="heading" :rows="rows" />
</template>
