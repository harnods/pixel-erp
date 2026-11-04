/**
 * Users and roles for the "Who can access this account?" pickers on the New
 * account form (/cash-management/new). Used by the Select users / Select roles
 * drawers. Each user carries their assigned roles, shown as a subtitle.
 *
 * Also backs the Project assignment section of the New project form
 * (/project-accounting/new): the Project manager picker is scoped to
 * PROJECT_LEAD_ROLES, the Team member drawer offers everyone.
 */

export interface AccessUser {
  id: string
  name: string
  /** Assigned roles, shown as the subtitle in the picker. */
  roles: string[]
}

export const accessUsers: AccessUser[] = [
  { id: 'U01', name: 'Agung Setiawarman',   roles: ['Owner', 'Ultimate'] },
  { id: 'U02', name: 'Alfian Ramadhan',     roles: ['Administrator', 'Ultimate'] },
  { id: 'U03', name: 'Ali Imran',           roles: ['Administrator', 'Accountant'] },
  { id: 'U04', name: 'Andi Pratama',        roles: ['Accountant'] },
  { id: 'U05', name: 'Bayu Ferdian',        roles: ['Accountant'] },
  { id: 'U06', name: 'Christin Purnama Sari', roles: ['Accountant'] },
  { id: 'U07', name: 'Cinta Ayu',           roles: ['Sales', 'Purchasing', 'Ultimate'] },
  { id: 'U08', name: 'Daud Dimas Prasetyo', roles: ['Sales', 'Purchasing'] },
  { id: 'U09', name: 'Eka Setiawan',        roles: ['Sales', 'Purchasing'] },
  { id: 'U10', name: 'Evelyn Bellinda',     roles: ['Cash management', 'Reports', 'Ultimate'] },
  { id: 'U11', name: 'Fajar Nugraha',       roles: ['Reports'] },
  { id: 'U12', name: 'Galih Prakoso',       roles: ['Reports'] },
  { id: 'U13', name: 'Indah Permata',       roles: ['Cash management'] },
  { id: 'U14', name: 'Jessie Tan',          roles: ['Stockist', 'Production', 'Ultimate'] },
  { id: 'U15', name: 'Joko',                roles: ['Stockist'] },
  // Project managers. The names match the PMs already on the seeded projects
  // in projectAccounting.ts, so picking one here lines up with the existing data.
  { id: 'U16', name: 'Rina Wulandari',      roles: ['Project manager'] },
  { id: 'U17', name: 'Yoga Prasetyo',       roles: ['Project manager'] },
  { id: 'U18', name: 'Made Ardika',         roles: ['Project manager', 'Accountant'] },
  { id: 'U19', name: 'Dewi Kusuma',         roles: ['Project manager'] },
]

export const accessRoles: string[] = [
  'Owner',
  'Ultimate',
  'Project manager',
  'Administrator',
  'Accountant',
  'Reports',
  'Cash management',
  'Purchasing',
  'Expenses',
  'Stockist',
  'Production',
]

/**
 * Roles entitled to lead a project. The Project manager picker on the New
 * project form lists only users holding one of these — a team member is
 * assigned separately and carries no such restriction.
 */
export const PROJECT_LEAD_ROLES = ['Owner', 'Ultimate', 'Project manager']

export function projectLeadUsers(): AccessUser[] {
  return accessUsers.filter((u) => u.roles.some((r) => PROJECT_LEAD_ROLES.includes(r)))
}
