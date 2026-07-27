/**
 * useApprovalViewAs — demo toggle for the Warehouse Transfer approval flow: view the
 * "Awaiting approval" screens as the requesting **User** (no Approve action) or as the
 * **Manager** who can approve. A module-level ref makes it a shared singleton across
 * the index and detail pages, so switching on one page carries over to the other.
 * Persisted to localStorage (this is an SPA — ssr:false), same pattern as useScenario.
 */
export type ApprovalViewAs = "user" | "manager";

const STORAGE_KEY = "erp-approval-view-as";

const viewAs = ref<ApprovalViewAs>("manager");
let hydrated = false;

export function useApprovalViewAs() {
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY) as ApprovalViewAs | null;
    if (saved) viewAs.value = saved;
    hydrated = true;
  }

  function setViewAs(next: ApprovalViewAs) {
    viewAs.value = next;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next);
  }

  return { viewAs, setViewAs };
}
