/**
 * useLineManagerAccess — the line-manager (LM) grant, and who may hand a task to
 * someone else.
 *
 * Reassigning is a manager action, and it exists as an ESCAPE HATCH: a task can be
 * left held by someone who no longer has access to the company, and a warehouse
 * manager has to be able to clear it without waiting for that person to come back
 * (see isActiveUserName in data/users.ts, which is what makes those tasks read as
 * Unassigned). So a warehouse manager always has it.
 *
 * A warehouse operator does not — reassigning someone else's work isn't theirs to
 * do. LM access is the exception: an add-on grant on top of an operator account,
 * not a different role, which is why it's modelled as a separate axis rather than
 * a third UserRole. The account menu writes it; features read `canReassignTasks`.
 *
 * A module-level ref makes the grant a shared singleton, persisted to localStorage
 * so it survives a refresh (this is an SPA — ssr:false). Same shape as
 * useScenario / useMigrationScenario.
 */
// Explicit (not auto-imported) so this module can be unit-tested on its own —
// the gate it computes is a permission rule, and it should be provable.
import { ref, computed } from "vue";
import { useScenario } from "~/composables/useScenario";

const STORAGE_KEY = "erp-lm-access";

const hasLmAccess = ref(false);
let hydrated = false;

export function useLineManagerAccess() {
  if (!hydrated && import.meta.client) {
    hydrated = true;
    hasLmAccess.value = localStorage.getItem(STORAGE_KEY) === "true";
  }

  const { activeScenario } = useScenario();

  // The WMS Ops scenarios preview a warehouse operator; ERP and WMS Standalone are
  // run by the back-office/manager account.
  const isWarehouseOperator = computed(
    () => activeScenario.value === "WMS Ops" || activeScenario.value === "WMS Ops 2",
  );

  /** May the signed-in user reassign a task they don't hold? */
  const canReassignTasks = computed(() => !isWarehouseOperator.value || hasLmAccess.value);

  function setLmAccess(on: boolean) {
    hasLmAccess.value = on;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(on));
  }

  return { hasLmAccess, setLmAccess, isWarehouseOperator, canReassignTasks };
}

/**
 * Is this task still in a state where handing it over means anything?
 *
 * Only while it's Open or In Progress: once a task is completed, canceled, or has
 * moved past receiving into put-away, the work is done or gone and the assignee is
 * a record of who did it, not who owes it. Each task type spells its statuses
 * slightly differently ("partially picked", "pending put-away", …) — everything
 * outside these two is out of scope by design.
 */
export function isReassignableStatus(status: string | undefined | null): boolean {
  return status === "open" || status === "in progress";
}
