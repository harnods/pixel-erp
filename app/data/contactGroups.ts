import { reactive } from 'vue'
import { contacts, CONTACT_GROUP_OPTIONS } from './contacts'

/**
 * Contacts › <type> › Contact groups (non-core `ContactGroupListView`).
 *
 * A group is scoped to one contact type. Customer / vendor / other members are
 * counted live from the contact master (`contacts.ts` stores group names on the
 * contact); employees are not in that store, so their groups carry a seeded
 * member count.
 */

export type ContactGroupType = 'customer' | 'vendor' | 'employee' | 'other'

export interface ContactGroup {
  id: string
  name: string
  type: ContactGroupType
  /** Employee groups only — no employee master to count from. */
  seededCount?: number
}

/** URL `?type=` segment ↔ group type (prod uses the same plural segments). */
export const CONTACT_GROUP_SEGMENTS: Record<string, ContactGroupType> = {
  customers: 'customer',
  vendors: 'vendor',
  employees: 'employee',
  others: 'other',
}

/** Title of the contact list each type belongs to (prod's breadcrumb / empty-state entity). */
export const CONTACT_GROUP_ENTITY: Record<ContactGroupType, string> = {
  customer: 'Customers',
  vendor: 'Vendors',
  employee: 'Employees',
  other: 'Other contacts',
}

let n = 0
const id = () => `CG${String(++n).padStart(3, '0')}`

export const contactGroups = reactive<ContactGroup[]>([
  ...CONTACT_GROUP_OPTIONS.map((name) => ({ id: id(), name, type: 'customer' as const })),
  // Worst case: a long group name nobody has joined yet.
  { id: id(), name: 'Jabodetabek modern trade key accounts (2026 contract)', type: 'customer' },
  { id: id(), name: 'Distributor', type: 'vendor' },
  { id: id(), name: 'Green bean importers', type: 'vendor' },
  { id: id(), name: 'Packaging suppliers', type: 'vendor' },
  { id: id(), name: 'Head office', type: 'employee', seededCount: 14 },
  { id: id(), name: 'Roastery crew', type: 'employee', seededCount: 9 },
  { id: id(), name: 'Field sales', type: 'employee', seededCount: 0 },
  { id: id(), name: 'Office pantry', type: 'other' },
])

/** Live member count for a group (contacts of the group's type carrying its name). */
export function contactGroupCount(g: ContactGroup): number {
  if (g.type === 'employee') return g.seededCount ?? 0
  return contacts.filter((c) => c.types.includes(g.type as 'customer' | 'vendor' | 'other') && c.groups.includes(g.name)).length
}

export function addContactGroup(name: string, type: ContactGroupType): ContactGroup {
  const g: ContactGroup = { id: id(), name, type, ...(type === 'employee' ? { seededCount: 0 } : {}) }
  contactGroups.push(g)
  return g
}

/** Rename — also renames the group on every contact carrying it. */
export function renameContactGroup(groupId: string, name: string): void {
  const g = contactGroups.find((x) => x.id === groupId)
  if (!g) return
  const old = g.name
  g.name = name
  for (const c of contacts) {
    if (!c.types.includes(g.type as 'customer' | 'vendor' | 'other')) continue
    const i = c.groups.indexOf(old)
    if (i >= 0) c.groups.splice(i, 1, name)
  }
}

/** Delete — also removes the group from every contact carrying it. */
export function deleteContactGroup(groupId: string): void {
  const i = contactGroups.findIndex((x) => x.id === groupId)
  if (i < 0) return
  const g = contactGroups[i]!
  contactGroups.splice(i, 1)
  for (const c of contacts) {
    if (!c.types.includes(g.type as 'customer' | 'vendor' | 'other')) continue
    const j = c.groups.indexOf(g.name)
    if (j >= 0) c.groups.splice(j, 1)
  }
}
