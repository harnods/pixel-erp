/**
 * useMigrationScenario — which demo storyline the app is currently telling.
 *
 * A separate axis from useScenario (which swaps the product nav between ERP and
 * the various WMS views). This one picks the overall narrative:
 *   - "Default": the app exactly as it is today.
 *   - "WMS upgrade to ERP": the migration/cutover story we build on this branch,
 *     where a WMS-only customer upgrades into the full ERP.
 *
 * The header account menu ("Scenario") writes this; features read it to decide
 * whether to show migration-specific UI. A module-level ref makes it a shared
 * singleton across components. Persisted to localStorage so the choice survives a
 * refresh (this is an SPA — ssr:false).
 */
export type MigrationScenario = "Default" | "WMS upgrade to ERP";

const STORAGE_KEY = "erp-migration-scenario";

const migrationScenario = ref<MigrationScenario>("Default");
let hydrated = false;

export function useMigrationScenario() {
  // Restore the saved scenario once, on the client.
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY) as MigrationScenario | null;
    if (saved) migrationScenario.value = saved;
    hydrated = true;
  }

  function setMigrationScenario(scenario: MigrationScenario) {
    migrationScenario.value = scenario;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, scenario);
  }

  return { migrationScenario, setMigrationScenario };
}
