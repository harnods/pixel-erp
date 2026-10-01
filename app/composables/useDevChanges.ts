/**
 * Shared state for the DevChangesOverlay (the engineer-facing "what changed & where"
 * layer). Lives in a composable so the overlay and the user-menu "Changes" toggle
 * drive one source of truth.
 *
 * Visibility is DERIVED, not a stored flag, so three rules fall out naturally:
 *   • ON by default whenever there is ≥1 unresolved, un-dismissed change — so a newly
 *     pushed change always re-surfaces the layer, even after a previous dismiss.
 *   • the user can dismiss ("turn off") from the menu → mutes every change known now.
 *   • once everything is resolved, nothing is left → the layer hides itself.
 *
 *     active = some change is neither resolved nor muted
 *
 * Both sets are per-user: in production each engineer signs in with their @mekari.com
 * account, so one person's resolves/dismisses never affect another's. Locally (gate
 * off) they fall back to a shared "local" bucket.
 */
import { ref, computed, watch } from 'vue'
import { DEV_CHANGES } from '~/data/devChanges'

const resolved = ref<Set<string>>(new Set())
const muted = ref<Set<string>>(new Set())
let currentEmail = 'local'
let wired = false

function keyFor(kind: 'resolved' | 'muted', email: string) { return `erp-devchanges-${kind}:${email}` }
function readSet(kind: 'resolved' | 'muted', email: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(keyFor(kind, email)) || '[]')) }
  catch { return new Set() }
}
function loadFor(email: string) {
  currentEmail = email
  resolved.value = readSet('resolved', email)
  muted.value = readSet('muted', email)
}
function saveResolved() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(keyFor('resolved', currentEmail), JSON.stringify([...resolved.value]))
}
function saveMuted() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(keyFor('muted', currentEmail), JSON.stringify([...muted.value]))
}

const allIds = () => DEV_CHANGES.map(c => c.id)
// The layer is on whenever any change is still worth showing to this user.
const active = computed(() => DEV_CHANGES.some(c => !resolved.value.has(c.id) && !muted.value.has(c.id)))

export function useDevChanges() {
  // Reload the per-user sets when the signed-in identity resolves (auth is async).
  if (!wired) {
    wired = true
    const { user } = useAuth()
    watch(() => user.value?.email || 'local', loadFor, { immediate: true })
  }

  /** Mark one change resolved — hides it for this user forever. */
  function resolveChange(id: string) { resolved.value = new Set(resolved.value).add(id); saveResolved() }
  /** Un-resolve a set of ids (used by the per-page "show resolved" affordance). */
  function unresolveIds(ids: string[]) {
    const s = new Set(resolved.value)
    ids.forEach(i => s.delete(i))
    resolved.value = s
    saveResolved()
  }
  /** Dismiss the whole layer: mute every change known right now (new ones re-show). */
  function mute() { muted.value = new Set(allIds()); saveMuted() }
  /** Re-enable: clear all dismissals (resolved changes stay resolved). */
  function unmute() { muted.value = new Set(); saveMuted() }
  function toggle() { if (active.value) mute(); else unmute() }

  return {
    active,
    isActive: active,
    resolved,
    resolveChange,
    unresolveIds,
    mute,
    unmute,
    toggle,
  }
}
