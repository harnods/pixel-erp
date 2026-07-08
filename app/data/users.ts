/**
 * Master user directory — the single source of truth for "people" across the
 * mock DB. Warehouse team members (see warehouseTeam.ts) are picked from here
 * rather than typed as free text, matching how a real ERP scopes task
 * assignees to real user accounts. This is data only — there's no master-data
 * management UI (create/edit/deactivate users) in this prototype.
 */
export interface ErpUser {
  id: string;
  name: string;
  initials: string;
  hue: number;
}

function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

// Deterministic hue per name so the same person always gets the same avatar color.
function hueOf(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

// Every name already in use across the mock DB: warehouse PICs (warehouses.ts),
// the shared operator pool (warehouseTeam.ts), and the back-office default user
// (ErpUserMenu.vue's fallback "currentUser").
const USER_NAMES = [
  "Rizal Candra",
  "Budi Santoso", "Dewi Rahayu", "Rizki Pratama", "Sari Indah", "Hendra Wijaya",
  "Andi Kusuma", "Ratna Sari", "Farhan Nugroho", "Lestari Putri", "Agus Firmansyah",
  "Ni Made Ayu", "Yusuf Hakim", "Bayu Pradana",
  "Rina Wulandari", "Fajar Setiawan", "Putri Anggraini", "Doni Saputra",
  "Maya Puspita", "Eko Prasetyo", "Wulan Sari", "Taufik Hidayat",
  "Indra Gunawan", "Nadia Permata", "Dimas Aditya", "Ayu Lestari",
];

export const users: ErpUser[] = USER_NAMES.map((name, i) => ({
  id: `user-${i + 1}`,
  name,
  initials: initialsOf(name),
  hue: hueOf(name),
}));

export function getUserById(id: string): ErpUser | undefined {
  return users.find((u) => u.id === id);
}

export function findUserByName(name: string): ErpUser | undefined {
  return users.find((u) => u.name === name);
}
