import { reactive, watch } from "vue";
import { loadSnapshot, saveSnapshot } from "./persist";
import { warehouses } from "./warehouses";
import { users, getUserById, findUserByName, type ErpUser } from "./users";

/**
 * Per-warehouse roster: who's a Manager (oversees the warehouse) vs an Operator
 * (does the hands-on work). Every task assignee across inbound/outbound/stock
 * counts is picked from a warehouse's OPERATORS only — a manager isn't a valid
 * task assignee, matching how a real warehouse delegates floor work.
 *
 * Members are always real users from the master directory (users.ts) — a
 * warehouse's team is a scoped view over that directory, not a place to type
 * in arbitrary names.
 */
export type WarehouseRole = "manager" | "operator";

export interface WarehouseTeamMember {
  id: string;
  warehouseId: string;
  userId: string;
  name: string;
  role: WarehouseRole;
  initials: string;
  hue: number;
  /** ISO date this person was added to the warehouse's team. */
  addedAt: string;
  /** Who added them — a user's display name, or "System" for auto-provisioned entries. */
  addedBy: string;
}

function seedNum(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// Shared operator user pool — a deterministic subset is assigned per warehouse so
// the same warehouse always seeds the same operator roster (distinct from the
// managers, which come from the warehouse's own existing PIC list).
const OPERATOR_POOL = [
  "Rina Wulandari", "Fajar Setiawan", "Putri Anggraini", "Doni Saputra",
  "Maya Puspita", "Eko Prasetyo", "Wulan Sari", "Taufik Hidayat",
  "Indra Gunawan", "Nadia Permata", "Dimas Aditya", "Ayu Lestari",
].map((name) => findUserByName(name)!);

// Deterministic 3-5 operator subset from the shared pool for one warehouse.
function operatorUsersFor(warehouseId: string): ErpUser[] {
  const base = seedNum(warehouseId);
  const count = 3 + (base % 3);
  const used = new Set<number>();
  const out: ErpUser[] = [];
  for (let i = 0; i < count; i++) {
    let idx = (base * 7 + i * 13) % OPERATOR_POOL.length;
    while (used.has(idx)) idx = (idx + 1) % OPERATOR_POOL.length;
    used.add(idx);
    out.push(OPERATOR_POOL[idx]!);
  }
  return out;
}

function teamMemberOf(seq: number, warehouseId: string, user: ErpUser, role: WarehouseRole, addedAt: string): WarehouseTeamMember {
  return {
    id: `team-${seq}`,
    warehouseId,
    userId: user.id,
    name: user.name,
    role,
    initials: user.initials,
    hue: user.hue,
    addedAt,
    addedBy: "System",
  };
}

// ── Seed: managers from each warehouse's existing PIC list, plus 3-5 operators
// deterministically drawn from the shared pool. The default warehouse (no real
// operations) gets no team. ──
function seedTeam(): WarehouseTeamMember[] {
  const out: WarehouseTeamMember[] = [];
  let seq = 1;
  for (const wh of warehouses) {
    if (wh.isDefault) continue;
    for (const pic of wh.pics) {
      const user = findUserByName(pic.name);
      if (!user) continue;
      out.push(teamMemberOf(seq++, wh.id, user, "manager", wh.updatedAt));
    }
    for (const user of operatorUsersFor(wh.id)) {
      out.push(teamMemberOf(seq++, wh.id, user, "operator", wh.updatedAt));
    }
  }
  return out;
}

const TEAM_KEY = "warehouse-team-v1";
const snapshot = loadSnapshot<WarehouseTeamMember>(TEAM_KEY);
export const warehouseTeam = reactive<WarehouseTeamMember[]>(snapshot ?? seedTeam());

function persistTeam(): void {
  saveSnapshot(TEAM_KEY, warehouseTeam);
}

function freshId(): string {
  const used = warehouseTeam.map((m) => Number(m.id.replace(/\D/g, ""))).filter((n) => Number.isFinite(n));
  const next = Math.max(0, ...used) + 1;
  return `team-${next}`;
}

/** Every team member (manager + operator) for a warehouse. */
export function getWarehouseTeam(warehouseId: string): WarehouseTeamMember[] {
  return warehouseTeam.filter((m) => m.warehouseId === warehouseId);
}
export function getWarehouseManagers(warehouseId: string): WarehouseTeamMember[] {
  return getWarehouseTeam(warehouseId).filter((m) => m.role === "manager");
}
/** Task assignees can only ever be chosen from this list. */
export function getWarehouseOperators(warehouseId: string): WarehouseTeamMember[] {
  return getWarehouseTeam(warehouseId).filter((m) => m.role === "operator");
}

/** Users not already on a warehouse's team — the pool the Add team member picker offers. */
export function getAvailableUsersForWarehouse(warehouseId: string): ErpUser[] {
  const existingIds = new Set(getWarehouseTeam(warehouseId).map((m) => m.userId));
  return users.filter((u) => !existingIds.has(u.id));
}

export function addTeamMember(
  warehouseId: string,
  data: { userId: string; role: WarehouseRole; addedBy?: string },
): WarehouseTeamMember {
  const user = getUserById(data.userId);
  if (!user) throw new Error(`Unknown user: ${data.userId}`);
  const member: WarehouseTeamMember = {
    id: freshId(),
    warehouseId,
    userId: user.id,
    name: user.name,
    role: data.role,
    initials: user.initials,
    hue: user.hue,
    addedAt: new Date().toISOString(),
    addedBy: data.addedBy ?? "System",
  };
  warehouseTeam.push(member);
  persistTeam();
  return member;
}

// A brand-new warehouse (created after this module's initial load) starts with no
// team at all — seed it the same way as the initial seed does (managers from its
// PICs + a default operator roster) the moment it appears, so it's immediately
// usable for task assignment. Warehouses that already have a team are left alone —
// this never re-syncs an EXISTING warehouse's team when its PICs are edited later,
// only bootstraps a fresh one. Auto-provisioned entries record "System" as addedBy.
watch(warehouses, () => {
  for (const wh of warehouses) {
    if (wh.isDefault || getWarehouseTeam(wh.id).length > 0) continue;
    for (const pic of wh.pics) {
      const user = findUserByName(pic.name);
      if (user) addTeamMember(wh.id, { userId: user.id, role: "manager" });
    }
    for (const user of operatorUsersFor(wh.id)) addTeamMember(wh.id, { userId: user.id, role: "operator" });
  }
});

export function updateTeamMemberRole(id: string, role: WarehouseRole): void {
  const m = warehouseTeam.find((x) => x.id === id);
  if (!m) return;
  m.role = role;
  persistTeam();
}

export function removeTeamMember(id: string): void {
  const idx = warehouseTeam.findIndex((x) => x.id === id);
  if (idx === -1) return;
  warehouseTeam.splice(idx, 1);
  persistTeam();
}

/**
 * The operator responsible for a task in a warehouse — rotates deterministically
 * among that warehouse's operators so the same task always resolves to the same
 * person. Falls back to a shared back-office name when the warehouse has none
 * (e.g. the default warehouse, which carries no real team).
 */
export function operatorForWarehouse(warehouseId: string, seed = 0): string {
  const ops = getWarehouseOperators(warehouseId);
  if (!ops.length) return "Rizal Candra";
  return ops[Math.abs(seed) % ops.length]!.name;
}
