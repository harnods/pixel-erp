/**
 * useScenario — which product scenario the app is currently in.
 *
 * The header account menu ("Switch to WMS → Select scenario") writes this; the
 * sidebar reads it to swap its entire nav between the ERP menu and a WMS menu.
 * A module-level ref makes it a shared singleton across components. Persisted to
 * localStorage so the choice survives a refresh (this is an SPA — ssr:false).
 */
export type Scenario = "ERP" | "WMS Standalone" | "WMS Ops" | "WMS Ops 2" | "XPM";

const STORAGE_KEY = "erp-active-scenario";

const activeScenario = ref<Scenario>("ERP");
let hydrated = false;

export function useScenario() {
  // Restore the saved scenario once, on the client.
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY) as Scenario | null;
    if (saved) activeScenario.value = saved;
    hydrated = true;
  }

  function setScenario(scenario: Scenario) {
    activeScenario.value = scenario;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, scenario);
  }

  return { activeScenario, setScenario };
}
