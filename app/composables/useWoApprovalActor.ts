/**
 * useWoApprovalActor — demo "view as" for Work order approval. The approval chain has
 * levels, so the two-way user/manager toggle (useApprovalViewAs) isn't enough: the
 * Awaiting approval queue must be checkable as the level 1 approver, a level 2 approver
 * and a requester. Shared singleton across the Work orders index, Awaiting approval tab
 * and Work order detail; persisted to localStorage like useApprovalViewAs.
 */
import { LEVEL_1, LEVEL_2, PPIC, LINE_LEADER } from '~/data/woApproval'

export interface WoApprovalActorOption { name: string; label: string }

export const WO_APPROVAL_ACTORS: WoApprovalActorOption[] = [
  { name: LEVEL_1,     label: `View as ${LEVEL_1} (approval level 1)` },
  { name: LEVEL_2[0]!, label: `View as ${LEVEL_2[0]} (approval level 2)` },
  { name: LINE_LEADER, label: `View as ${LINE_LEADER} (requester)` },
  { name: PPIC,        label: `View as ${PPIC} (requester)` },
]

const STORAGE_KEY = 'erp-wo-approval-actor'
const actor = ref<string>(LEVEL_1)
let hydrated = false

export function useWoApprovalActor() {
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && WO_APPROVAL_ACTORS.some(a => a.name === saved)) actor.value = saved
    hydrated = true
  }

  function setActor(next: string) {
    actor.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next)
  }

  return { actor, setActor }
}
