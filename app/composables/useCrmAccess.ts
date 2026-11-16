/**
 * useCrmAccess — the CRM (Qontak) access state for this tenant.
 *
 * Modelled as a STATUS, not a boolean, because the /crm paywall has two distinct
 * faces (see CrmPaywallPage.vue):
 *   • 'active'  — full access (a paid plan, or an ongoing trial). CRM renders.
 *   • 'none'    — never had access → the educational first-run paywall.
 *   • 'expired' — the trial has ended → the "trial ended" paywall (reassure that
 *                 data is kept + contact sales), NOT a re-education screen.
 *
 * A module-level ref makes it a shared singleton across the /crm router (which
 * swaps in the paywall when it's not 'active'), the layout (which drops the CRM
 * sidebar for a full-bleed paywall) and the scenario FAB (which flips it for the
 * demo). Default 'active' so the built workspace is reachable out of the box.
 *
 * Persisted to localStorage ('erp-crm-status') so the choice survives a refresh —
 * same shape as useLineManagerAccess. Migrates the old boolean key ('erp-crm-access')
 * written by the first version. "Reset demo data" (resetDb) does not touch these.
 */
// Explicit (not auto-imported) so this module can be unit-tested on its own — the
// state it holds decides which workspace a tenant sees, and it should be provable.
import { ref, computed } from "vue";

export type CrmStatus = "active" | "none" | "expired";

const STATUS_KEY = "erp-crm-status";
const LEGACY_BOOL_KEY = "erp-crm-access";

const crmStatus = ref<CrmStatus>("active");
// Module-level computed so every useCrmAccess() call shares ONE ref (the router,
// the layout and the FAB must agree by identity, not just value).
const hasCrmAccess = computed(() => crmStatus.value === "active");
let hydrated = false;

function hydrate() {
  if (hydrated || !import.meta.client) return;
  hydrated = true;
  const saved = localStorage.getItem(STATUS_KEY);
  if (saved === "active" || saved === "none" || saved === "expired") {
    crmStatus.value = saved;
    return;
  }
  // Migrate the old boolean flag: 'false' → no access, anything else → active.
  const legacy = localStorage.getItem(LEGACY_BOOL_KEY);
  if (legacy !== null) crmStatus.value = legacy === "false" ? "none" : "active";
}

export function useCrmAccess() {
  hydrate();

  // hasCrmAccess (module-level): CRM renders only while access is active; 'none' and
  // 'expired' both gate to the paywall. The router + layout read it; the paywall
  // reads crmStatus to pick a face.
  function setCrmStatus(status: CrmStatus) {
    crmStatus.value = status;
    if (import.meta.client) localStorage.setItem(STATUS_KEY, status);
  }

  // Back-compat boolean setter (the educational paywall's "Activate CRM" CTA):
  // true → active, false → never-had-access.
  function setCrmAccess(on: boolean) {
    setCrmStatus(on ? "active" : "none");
  }

  return { crmStatus, hasCrmAccess, setCrmStatus, setCrmAccess };
}
