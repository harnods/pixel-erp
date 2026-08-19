/**
 * Users and roles for the "Who can access this account?" pickers on the New
 * account form (/cash-management/new). Used by the Select users / Select roles
 * drawers. Each user carries their assigned roles, shown as a subtitle.
 */

export interface AccessUser {
  id: string
  name: string
  /** Assigned roles, shown as the subtitle in the picker. */
  roles: string[]
}

export const accessUsers: AccessUser[] = [
  { id: 'U01', name: 'Agung Setiawarman',   roles: ['Ultimate'] },
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
]

export const accessRoles: string[] = [
  'Ultimate',
  'Administrator',
  'Accountant',
  'Reports',
  'Cash management',
  'Purchasing',
  'Expenses',
  'Stockist',
  'Production',
]
