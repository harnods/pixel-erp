/**
 * useApprovalWorkflowScenario — whether this tenant has the Project Accounting
 * billing component installed, for previewing the Approval workflows feature
 * both ways.
 *
 * Narrower than useScenario (ERP/WMS Standalone/...) — this doesn't reshape the
 * nav or routing, only whether the "Applies to: Transaction / Project Action"
 * condition exists on the Create/Edit approval workflow form. A module-level
 * ref makes it a shared singleton across the list page (where the demo FAB
 * lives) and the create/edit form. Not persisted — same as the other page-local
 * demo-FAB toggles in this app (e.g. SettingsCompanyProfilePage's Klikpajak
 * account state), this is a "flip while testing" preview, not a durable setting.
 */
const projectAccountingEnabled = ref(true);

export function useApprovalWorkflowScenario() {
  function setProjectAccountingEnabled(enabled: boolean) {
    projectAccountingEnabled.value = enabled;
  }

  return { projectAccountingEnabled, setProjectAccountingEnabled };
}
