/**
 * Settings → Tagging rules (prod: /v3/tagging_rules). A rule auto-applies tags to
 * a sales or purchase transaction based on who created it. Custom-tag rules pick
 * from the master tag list (./tags); user-scoped rules pick from the account users
 * (./usersRoles).
 */
import { reactive } from 'vue'
import { tags } from './tags'

function tagIdsByName(...names: string[]): string[] {
  return names.map(n => tags.find(t => t.name === n)?.id).filter((x): x is string => !!x)
}

export type TagType = 1 | 2 | 3
export const TAG_TYPE_EMAIL: TagType = 1
export const TAG_TYPE_FULL_NAME: TagType = 2
export const TAG_TYPE_CUSTOM: TagType = 3

export const TAG_TYPE_LABEL: Record<TagType, string> = {
  1: 'Email of each user',
  2: 'Full name of each user',
  3: 'Custom',
}

export interface TaggingTransactionType {
  id: number
  label: string
  group: 'Sales' | 'Purchase'
}

export const TAGGING_TRANSACTION_TYPES: TaggingTransactionType[] = [
  { id: 1, label: 'Sales invoice', group: 'Sales' },
  { id: 3, label: 'Sales order', group: 'Sales' },
  { id: 20, label: 'Sales quote', group: 'Sales' },
  { id: 9, label: 'Purchase invoice', group: 'Purchase' },
  { id: 16, label: 'Purchase order', group: 'Purchase' },
  { id: 19, label: 'Purchase quote', group: 'Purchase' },
]

export const TAGGING_RULE_MAX_SELECTED_USERS = 250

export interface TaggingRule {
  id: string
  name: string
  transactionTypeId: number
  tagType: TagType
  /** Tag ids from ./tags — only for the Custom tagging type. */
  tagIds: string[]
  /** Empty = all users. AccountUser ids from ./usersRoles. */
  userIds: string[]
}

export const taggingRules = reactive<TaggingRule[]>([
  { id: 'tr-1', name: 'Wholesale sales orders', transactionTypeId: 3, tagType: TAG_TYPE_CUSTOM, tagIds: tagIdsByName('Wholesale'), userIds: ['au-2', 'au-3'] },
  { id: 'tr-2', name: 'Invoice salesperson email', transactionTypeId: 1, tagType: TAG_TYPE_EMAIL, tagIds: [], userIds: [] },
  { id: 'tr-3', name: 'Quote owner', transactionTypeId: 20, tagType: TAG_TYPE_FULL_NAME, tagIds: [], userIds: ['au-2'] },
  { id: 'tr-4', name: 'Raw material purchasing', transactionTypeId: 16, tagType: TAG_TYPE_CUSTOM, tagIds: tagIdsByName('Raw material', 'Import'), userIds: [] },
  { id: 'tr-5', name: 'Purchase invoice preparer', transactionTypeId: 9, tagType: TAG_TYPE_FULL_NAME, tagIds: [], userIds: [] },
  { id: 'tr-6', name: 'Tag every purchase quote created by the Jabodetabek procurement team with their email address', transactionTypeId: 19, tagType: TAG_TYPE_EMAIL, tagIds: [], userIds: ['au-4', 'au-5'] },
])

let seq = 100

export function getTaggingRule(id: string): TaggingRule | undefined {
  return taggingRules.find(r => r.id === id)
}

export function saveTaggingRule(rule: Omit<TaggingRule, 'id'> & { id?: string }): TaggingRule {
  if (rule.id) {
    const existing = taggingRules.find(r => r.id === rule.id)
    if (existing) { Object.assign(existing, rule); return existing }
  }
  const created: TaggingRule = { ...rule, id: `tr-${++seq}` }
  taggingRules.unshift(created)
  return created
}

export function deleteTaggingRule(id: string): void {
  const i = taggingRules.findIndex(r => r.id === id)
  if (i >= 0) taggingRules.splice(i, 1)
}

export function taggingTransactionTypeLabel(id: number): string {
  return TAGGING_TRANSACTION_TYPES.find(t => t.id === id)?.label ?? '—'
}
