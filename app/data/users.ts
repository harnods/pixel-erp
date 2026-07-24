/**
 * Master user directory — the single source of truth for "people" across the
 * mock DB. Warehouse team members (see warehouseTeam.ts) are picked from here
 * rather than typed as free text, matching how a real ERP scopes task
 * assignees to real user accounts. This is data only — there's no master-data
 * management UI (create/edit/deactivate users) in this prototype.
 */
/** System-wide role — determined by the user account, not per-warehouse. */
export type UserRole = 'manager' | 'operator';

export interface ErpUser {
  id: string;
  name: string;
  initials: string;
  hue: number;
  /** Inherent role from the user's account. Managers are warehouse PICs/admins;
   *  operators do hands-on floor work and are valid task assignees. */
  role: UserRole;
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
//
// Role split: the first 14 (Rizal Candra + all warehouse PICs) are managers;
// the remaining 12 (the OPERATOR_POOL in warehouseTeam.ts) are operators.
// This must stay in sync with both warehouses.ts PIC names and the OPERATOR_POOL.
const USER_RECORDS: { name: string; role: UserRole }[] = [
  { name: "Rizal Candra",     role: "manager"  }, // back-office admin
  { name: "Budi Santoso",     role: "manager"  }, // PIC: Gudang Jakarta Pusat
  { name: "Dewi Rahayu",      role: "manager"  }, // PIC: Gudang Surabaya Timur
  { name: "Rizki Pratama",    role: "manager"  }, // PIC: Gudang Surabaya Timur
  { name: "Sari Indah",       role: "manager"  }, // PIC: Gudang Bandung Selatan
  { name: "Hendra Wijaya",    role: "manager"  }, // PIC: Gudang Bandung Selatan
  { name: "Andi Kusuma",      role: "manager"  }, // PIC: Gudang Bandung Selatan
  { name: "Ratna Sari",       role: "manager"  }, // PIC: Gudang Medan Baru
  { name: "Farhan Nugroho",   role: "manager"  }, // PIC: Gudang Semarang Industrial
  { name: "Lestari Putri",    role: "manager"  }, // PIC: Gudang Semarang Industrial
  { name: "Agus Firmansyah",  role: "manager"  }, // PIC: Gudang Makassar Selatan / Utara
  { name: "Ni Made Ayu",      role: "manager"  }, // PIC: Gudang Bali Kuta
  { name: "Yusuf Hakim",      role: "manager"  }, // PIC: Gudang Palembang
  { name: "Bayu Pradana",     role: "manager"  }, // PIC: Gudang Jakarta Timur
  { name: "Rina Wulandari",   role: "operator" },
  { name: "Fajar Setiawan",   role: "operator" },
  { name: "Putri Anggraini",  role: "operator" },
  { name: "Doni Saputra",     role: "operator" },
  { name: "Maya Puspita",     role: "operator" },
  { name: "Eko Prasetyo",     role: "operator" },
  { name: "Wulan Sari",       role: "operator" },
  { name: "Taufik Hidayat",   role: "operator" },
  { name: "Indra Gunawan",    role: "operator" },
  { name: "Nadia Permata",    role: "operator" },
  { name: "Dimas Aditya",     role: "operator" },
  { name: "Ayu Lestari",      role: "operator" },
];

export const users: ErpUser[] = USER_RECORDS.map(({ name, role }, i) => ({
  id: `user-${i + 1}`,
  name,
  initials: initialsOf(name),
  hue: hueOf(name),
  role,
}));

export function getUserById(id: string): ErpUser | undefined {
  return users.find((u) => u.id === id);
}

export function findUserByName(name: string): ErpUser | undefined {
  return users.find((u) => u.name === name);
}
