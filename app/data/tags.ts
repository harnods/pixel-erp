/**
 * Settings → Tags (prod: /v3/tags). The master tag list and its categories.
 * Tag names are derived from the tags the sales-order, purchase-order and expense
 * fixtures already carry, so every chip in those tables exists here and each tag's
 * detail page lists the real records that use it.
 */
import { reactive } from 'vue'
import { salesOrders } from './salesOrders'
import { purchaseOrders } from './purchaseOrders'
import { bills } from './bills'

export interface TagCategory {
  id: string
  name: string
}

export interface Tag {
  id: string
  name: string
  /** null = Uncategorized. */
  categoryId: string | null
  archived: boolean
}

export interface TagTransaction {
  id: string
  date: string
  number: string
  contact: string
  link: string
}

export const TAG_NAME_MAX_LENGTH = 50

export const tagCategories = reactive<TagCategory[]>([
  { id: 'tc-1', name: 'Sales channel' },
  { id: 'tc-2', name: 'Product line' },
  { id: 'tc-3', name: 'Purchasing' },
  { id: 'tc-4', name: 'Finance' },
  { id: 'tc-5', name: 'Regional campaign tags for the Jabodetabek and West Java rollout' },
  { id: 'tc-6', name: 'Events' },
])

const CATEGORY_OF: Record<string, string> = {
  Wholesale: 'tc-1', Retail: 'tc-1', Subscription: 'tc-1', Sample: 'tc-1', Priority: 'tc-1',
  Beans: 'tc-2', Machines: 'tc-2',
  Import: 'tc-3', 'Raw material': 'tc-3', Packaging: 'tc-3', Equipment: 'tc-3', Logistics: 'tc-3', 'Office supply': 'tc-3', Utilities: 'tc-3',
  Recurring: 'tc-4', Rent: 'tc-4',
}

function usedTagNames(): string[] {
  const names = new Set<string>()
  for (const so of salesOrders) for (const t of so.tags ?? []) names.add(t)
  for (const po of purchaseOrders) for (const t of po.tags ?? []) names.add(t)
  for (const b of bills) for (const t of b.tags ?? []) names.add(t)
  return [...names]
}

const SEED: Tag[] = [
  ...usedTagNames().map((name, i) => ({ id: String(i + 1), name, categoryId: CATEGORY_OF[name] ?? null, archived: false })),
  { id: '90', name: 'Promo Ramadan 2025', categoryId: null, archived: true },
  { id: '91', name: 'Bandung pop-up store', categoryId: null, archived: false },
  { id: '92', name: 'Jakarta Coffee Week 2026 sponsor booth activation', categoryId: 'tc-5', archived: false },
]

export const tags = reactive<Tag[]>(SEED)

let seq = 100

export function tagCategoryName(id: string | null): string {
  if (!id) return 'Uncategorized'
  return tagCategories.find(c => c.id === id)?.name ?? 'Uncategorized'
}

export function addTag(name: string, categoryId: string | null): Tag {
  const tag: Tag = { id: String(++seq), name: name.trim(), categoryId, archived: false }
  tags.unshift(tag)
  return tag
}

export function updateTag(id: string, name: string, categoryId: string | null): void {
  const tag = tags.find(t => t.id === id)
  if (!tag) return
  tag.name = name.trim()
  tag.categoryId = categoryId
}

/** Archiving moves the tag to Uncategorized; unarchiving keeps it there. */
export function setTagArchived(id: string, archived: boolean): void {
  const tag = tags.find(t => t.id === id)
  if (!tag) return
  tag.archived = archived
  tag.categoryId = null
}

export function deleteTags(ids: string[]): void {
  for (const id of ids) {
    const i = tags.findIndex(t => t.id === id)
    if (i >= 0) tags.splice(i, 1)
  }
}

export function transferTags(ids: string[], categoryId: string | null): void {
  for (const t of tags) if (ids.includes(t.id)) t.categoryId = categoryId
}

export function addTagCategory(name: string): TagCategory {
  const c: TagCategory = { id: `tc-${++seq}`, name: name.trim() }
  tagCategories.unshift(c)
  return c
}

export function renameTagCategory(id: string, name: string): void {
  const c = tagCategories.find(x => x.id === id)
  if (c) c.name = name.trim()
}

/** Tags inside a deleted category move to Uncategorized. */
export function deleteTagCategory(id: string): void {
  const i = tagCategories.findIndex(c => c.id === id)
  if (i >= 0) tagCategories.splice(i, 1)
  for (const t of tags) if (t.categoryId === id) t.categoryId = null
}

export function tagNameTaken(name: string, excludeId?: string): boolean {
  const n = name.trim().toLowerCase()
  return tags.some(t => t.id !== excludeId && t.name.toLowerCase() === n)
}

export function tagCategoryNameTaken(name: string, excludeId?: string): boolean {
  const n = name.trim().toLowerCase()
  return tagCategories.some(c => c.id !== excludeId && c.name.toLowerCase() === n)
}

/** Every transaction carrying this tag, newest first. */
export function transactionsForTag(name: string): TagTransaction[] {
  const out: TagTransaction[] = []
  for (const so of salesOrders) {
    if (so.tags?.includes(name)) out.push({ id: `so-${so.id}`, date: so.date, number: `Sales Order #${so.number}`, contact: so.customer.name, link: `/sales-orders/${so.id}` })
  }
  for (const po of purchaseOrders) {
    if (po.tags?.includes(name)) out.push({ id: `po-${po.id}`, date: po.date, number: `Purchase Order #${po.number}`, contact: po.vendor.name, link: `/purchase-orders/${po.id}` })
  }
  for (const b of bills) {
    if (b.tags?.includes(name)) out.push({ id: `bill-${b.id}`, date: b.date, number: `Expense #${String(b.number).padStart(5, '0')}`, contact: b.beneficiary.name, link: `/expenses/${b.id}` })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export function isTagInUse(tag: Tag): boolean {
  return transactionsForTag(tag.name).length > 0
}
