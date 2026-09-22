/**
 * Cowork Knowledge Base (KB) — a file-manager-style store of reference documents
 * the AI co-worker can ground on. Mirrors the other mock tables: a localStorage
 * snapshot (`cowork-kb-v1`) that survives reloads and resets with resetDb().
 *
 * Model (world-class agentic KB):
 *   Folder (nested, folder-in-folder)  ← the file manager, for humans
 *     └─ Doc (pdf/docx/xlsx/csv/md/png/…)
 *          └─ Chunk[]                   ← the retrieval unit, for the model
 *   KbAttachment = a SCOPE reference (collection | folder | doc) attached to an
 *                  Agent or a Skill. Attaching a folder means "everything under
 *                  it, live" — not a copy — so edits to the folder flow through.
 *
 * Retrieval is relevance-injection by default (rank docs/chunks against the task
 * prompt, inject the top ones under a token budget) and is also exposed to the
 * model as an agentic `search_knowledge` tool (see server/api/cowork/chat).
 *
 * Storage split: the reactive snapshot keeps a capped `text` + `summary` +
 * `keywords` + `chunks` so grounding stays synchronous and within the ~5MB
 * localStorage budget. The full original text and the raw file bytes live in
 * IndexedDB (see app/utils/kbBlobStore.ts), referenced by `blobRef`.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Types ──────────────────────────────────────────────────────────────────────
export type KbNodeType = 'folder' | 'doc'
export type KbDocStatus = 'processing' | 'ready' | 'failed'
/** How a scope attaches to an agent/skill. */
export type KbScope = 'collection' | 'folder' | 'doc'

export interface KbFolder {
  id: string
  type: 'folder'
  parentId: string | null      // null = a top-level Collection (root)
  name: string
  description?: string
  icon?: string
  color?: string
  createdAt: string
  updatedAt: string
}

export interface KbChunk {
  id: string
  ord: number
  text: string
  tokens?: number              // rough token estimate (chars/4)
}

export interface KbDoc {
  id: string
  type: 'doc'
  parentId: string             // owning folder id
  name: string                 // display name (defaults to fileName)
  fileName: string
  ext: string                  // pdf | docx | xlsx | xls | csv | md | png | …
  mime: string
  sizeBytes: number
  status: KbDocStatus
  // ── ingestion output ──
  text?: string                // extracted text, normalised to markdown/plain (capped)
  summary?: string             // one-paragraph AI/derived summary (cards + cheap grounding)
  keywords?: string[]          // derived tags — powers keyword retrieval in the mock
  chunks?: KbChunk[]           // retrieval units (split from text)
  pageCount?: number
  warning?: string             // e.g. "scanned PDF — OCR best-effort"
  thumb?: boolean              // has a visual thumbnail (image itself, or PDF page 1) in IndexedDB
  blobRef?: string             // IndexedDB key for full text + raw bytes
  source: 'upload' | 'ai' | 'skill-ref'
  uploadedBy?: string          // who added it (display name)
  createdAt: string
  updatedAt: string
}

/** The current user — stamped on uploads as the "uploaded by" name. */
export const KB_USER = 'Rizal Candra'

export type KbNode = KbFolder | KbDoc

/** A scoped reference attached to an agent or skill (never a copy). */
export interface KbAttachment {
  scope: KbScope
  id: string                   // folderId (collection/folder) or docId
  recursive?: boolean          // include subfolders — default true for folders
}

// ── Seed ────────────────────────────────────────────────────────────────────────
// A small, coherent starter KB so grounding works out of the box and the file
// manager isn't empty. Docs carry pre-extracted text so retrieval works with no
// upload needed. `t0` keeps timestamps deterministic (no Date.now at module load).
const t0 = '2026-08-01T00:00:00.000Z'
function chunk(text: string, docId: string): KbChunk[] {
  const parts: KbChunk[] = []
  const size = 900
  let ord = 0
  for (let i = 0; i < text.length; i += size) {
    const slice = text.slice(i, i + size)
    parts.push({ id: `${docId}-c${ord}`, ord, text: slice, tokens: Math.ceil(slice.length / 4) })
    ord++
  }
  return parts.length ? parts : [{ id: `${docId}-c0`, ord: 0, text, tokens: Math.ceil(text.length / 4) }]
}
function seedDoc(d: Omit<KbDoc, 'type' | 'status' | 'source' | 'createdAt' | 'updatedAt' | 'chunks' | 'sizeBytes'> & { sizeBytes?: number }): KbDoc {
  const text = d.text ?? ''
  return {
    type: 'doc', status: 'ready', source: 'upload', uploadedBy: KB_USER, createdAt: t0, updatedAt: t0,
    sizeBytes: d.sizeBytes ?? text.length, chunks: chunk(text, d.id), ...d,
  }
}

const HANDBOOK = `# Attendance & Leave Policy — PT Central Perk Indonesia

Working hours are 09:00–18:00, Monday to Friday. A 15-minute grace period applies to clock-in.
Lateness beyond the grace period three or more times in a calendar month triggers a written
reminder from the direct manager. A pattern across two consecutive months is escalated to HR.

Annual leave: 12 days per year, accrued monthly, requestable via Talenta with 3 working days'
notice. Sick leave requires a doctor's note from day two. Unpaid leave must be approved by the
department head and HR.

Contract renewals: fixed-term (PKWT) contracts are reviewed 60 days before expiry. The owner
decides renew / convert-to-permanent / offboard, and HR prepares the paperwork.`

const COLLECTIONS_SOP = `# Receivables Collections SOP — Finance

Goal: reduce overdue AR days and protect cash. Run the collections review every Monday.

1. Rank overdue invoices by amount and days overdue. Anything over 30 days or Rp50M is High risk.
2. First contact is a polite email reminder with the invoice attached. Log the contact and outcome.
3. No response in 5 working days → phone call, then a firmer email citing the payment terms.
4. Secure a promise-to-pay date and record it. Escalate to the account owner if broken twice.
5. Over 60 days overdue with no promise-to-pay → flag for the finance lead and pause new orders.

Tone: firm but relationship-preserving. Never threaten; always reference the agreed terms.`

const SALES_PLAYBOOK = `# Sales Follow-up Playbook — CRM

Prioritise open deals by value × momentum. A deal with no activity for 14 days is "stalled".

Follow-up cadence for top prospects:
- Day 0: personalised email referencing their stated need and last conversation.
- Day 3: short value-add (case study, ROI note) — no ask.
- Day 7: direct ask for a next step (call / pilot / quote).
Stalled deals: one re-engagement email, then move to nurture if still silent.

Always personalise the opening line. Never send a generic template to a named prospect.`

function buildSeed(): KbNode[] {
  const nodes: KbNode[] = []
  // Collections (root folders)
  const handbook: KbFolder = { id: 'kb-f-handbook', type: 'folder', parentId: null, name: 'Company Handbook', description: 'Policies, SOPs and internal references', icon: 'book', color: '#7C3AED', createdAt: t0, updatedAt: t0 }
  const hrFolder: KbFolder = { id: 'kb-f-hr', type: 'folder', parentId: handbook.id, name: 'HR', icon: 'profile', color: '#B54708', createdAt: t0, updatedAt: t0 }
  const finance: KbFolder = { id: 'kb-f-finance', type: 'folder', parentId: null, name: 'Finance', description: 'Finance SOPs and references', icon: 'billing', color: '#B54708', createdAt: t0, updatedAt: t0 }
  const sales: KbFolder = { id: 'kb-f-sales', type: 'folder', parentId: null, name: 'Sales & CRM', description: 'Playbooks and templates', icon: 'chart-line', color: '#165082', createdAt: t0, updatedAt: t0 }
  nodes.push(handbook, hrFolder, finance, sales)

  nodes.push(seedDoc({
    id: 'kb-d-attendance', parentId: hrFolder.id, name: 'Attendance & Leave Policy', fileName: 'attendance-leave-policy.md',
    ext: 'md', mime: 'text/markdown', text: HANDBOOK,
    summary: 'Working hours, 15-min grace period, lateness escalation (3×/month → reminder), annual/sick/unpaid leave rules, and 60-day contract renewal review.',
    keywords: ['attendance', 'lateness', 'grace period', 'leave', 'annual leave', 'sick leave', 'contract', 'renewal', 'pkwt', 'reminder', 'payroll'],
  }))
  nodes.push(seedDoc({
    id: 'kb-d-collections', parentId: finance.id, name: 'Receivables Collections SOP', fileName: 'collections-sop.md',
    ext: 'md', mime: 'text/markdown', text: COLLECTIONS_SOP,
    summary: 'Weekly collections review: rank overdue AR by amount/age, email → call → firmer email, secure promise-to-pay, escalate over 60 days and pause new orders.',
    keywords: ['collections', 'receivables', 'overdue', 'ar', 'invoice', 'payment reminder', 'promise to pay', 'escalate', 'risk', 'cash'],
  }))
  nodes.push(seedDoc({
    id: 'kb-d-sales-playbook', parentId: sales.id, name: 'Sales Follow-up Playbook', fileName: 'sales-followup-playbook.md',
    ext: 'md', mime: 'text/markdown', text: SALES_PLAYBOOK,
    summary: 'Prioritise deals by value × momentum; Day 0/3/7 follow-up cadence for top prospects; re-engage stalled deals (14 days idle) once then nurture. Always personalise.',
    keywords: ['sales', 'follow-up', 'pipeline', 'deal', 'stalled', 'prospect', 'cadence', 'crm', 'outreach', 'nurture'],
  }))
  return nodes
}

// ── Store ───────────────────────────────────────────────────────────────────────
const KB_KEY = 'cowork-kb-v1'
export const coworkKb = reactive<KbNode[]>(loadSnapshot<KbNode>(KB_KEY) ?? buildSeed())
function persist() { saveSnapshot(KB_KEY, coworkKb) }

let seq = 1
function uid(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${seq++}` }
function nowIso(): string { return new Date().toISOString() }

export function isFolder(n: KbNode): n is KbFolder { return n.type === 'folder' }
export function isDoc(n: KbNode): n is KbDoc { return n.type === 'doc' }
export function getNode(id: string): KbNode | undefined { return coworkKb.find((n) => n.id === id) }
export function getFolder(id: string): KbFolder | undefined { const n = getNode(id); return n && isFolder(n) ? n : undefined }
export function getDoc(id: string): KbDoc | undefined { const n = getNode(id); return n && isDoc(n) ? n : undefined }

/** Immediate children of a folder (null = root/collections), folders first then docs, each A→Z. */
export function childrenOf(parentId: string | null): KbNode[] {
  return coworkKb
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/** Root → … → node path (breadcrumb). Includes the node itself. */
export function breadcrumbOf(id: string | null): KbFolder[] {
  const trail: KbFolder[] = []
  let cur = id ? getFolder(id) : undefined
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    trail.unshift(cur)
    cur = cur.parentId ? getFolder(cur.parentId) : undefined
  }
  return trail
}

/** All descendant folder ids of a folder (not including itself). */
export function descendantFolderIds(folderId: string): string[] {
  const out: string[] = []
  const stack = [folderId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const n of coworkKb) {
      if (isFolder(n) && n.parentId === cur) { out.push(n.id); stack.push(n.id) }
    }
  }
  return out
}

/** Every doc under a folder subtree (recursive by default). */
export function descendantDocs(folderId: string, recursive = true): KbDoc[] {
  const scope = new Set<string>([folderId, ...(recursive ? descendantFolderIds(folderId) : [])])
  return coworkKb.filter((n): n is KbDoc => isDoc(n) && scope.has(n.parentId))
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function addFolder(parentId: string | null, name: string, extra: Partial<KbFolder> = {}): KbFolder {
  const f: KbFolder = { id: uid('kb-f'), type: 'folder', parentId, name: name.trim() || 'Untitled folder', createdAt: nowIso(), updatedAt: nowIso(), ...extra }
  coworkKb.push(f)
  persist()
  return f
}

export function addDoc(parentId: string, d: Omit<KbDoc, 'id' | 'type' | 'parentId' | 'createdAt' | 'updatedAt'> & { id?: string }): KbDoc {
  const id = d.id ?? uid('kb-d')
  const doc: KbDoc = { id, type: 'doc', parentId, uploadedBy: KB_USER, createdAt: nowIso(), updatedAt: nowIso(), ...d }
  if (doc.text && !doc.chunks?.length) doc.chunks = chunk(doc.text, id)
  coworkKb.push(doc)
  persist()
  return doc
}

export function updateNode(id: string, patch: Partial<KbFolder> | Partial<KbDoc>): void {
  const n = getNode(id)
  if (!n) return
  Object.assign(n, patch, { updatedAt: nowIso() })
  if (isDoc(n) && (patch as Partial<KbDoc>).text !== undefined) n.chunks = chunk(n.text ?? '', n.id)
  persist()
}

export function renameNode(id: string, name: string): void {
  const n = getNode(id)
  if (n) { n.name = name.trim() || n.name; n.updatedAt = nowIso(); persist() }
}

/** Move a node to a new parent, refusing to drop a folder inside its own subtree. */
export function moveNode(id: string, newParentId: string | null): boolean {
  const n = getNode(id)
  if (!n) return false
  if (isFolder(n) && newParentId) {
    if (newParentId === id || descendantFolderIds(id).includes(newParentId)) return false
  }
  n.parentId = newParentId as any
  n.updatedAt = nowIso()
  persist()
  return true
}

/** Delete a node; folders delete their whole subtree. Returns deleted ids. */
export function deleteNode(id: string): string[] {
  const n = getNode(id)
  if (!n) return []
  const ids = new Set<string>([id])
  if (isFolder(n)) {
    for (const fid of descendantFolderIds(id)) ids.add(fid)
    for (const node of coworkKb) if (ids.has(node.parentId as string)) ids.add(node.id)
  }
  for (let i = coworkKb.length - 1; i >= 0; i--) if (ids.has(coworkKb[i]!.id)) coworkKb.splice(i, 1)
  persist()
  return [...ids]
}

// ── Attachment resolution + retrieval ───────────────────────────────────────────
/** Resolve a set of attachments to the concrete, de-duplicated docs they cover. */
export function resolveAttachments(attachments?: KbAttachment[]): KbDoc[] {
  if (!attachments?.length) return []
  const seen = new Map<string, KbDoc>()
  for (const a of attachments) {
    if (a.scope === 'doc') {
      const d = getDoc(a.id)
      if (d) seen.set(d.id, d)
    } else {
      // 'collection' and 'folder' both mean a folder subtree.
      for (const d of descendantDocs(a.id, a.recursive ?? true)) seen.set(d.id, d)
    }
  }
  return [...seen.values()].filter((d) => d.status === 'ready')
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'our', 'you', 'your', 'all', 'any', 'per', 'has', 'have', 'into', 'over', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'by', 'or', 'be'])
function terms(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w))
}

export interface KbHit { docId: string; docName: string; folder: string; chunk: KbChunk; score: number }

/**
 * Rank chunks across the given docs against a query using keyword overlap
 * (name + keywords + chunk text). No embeddings — deterministic and good enough
 * for the mock. Returns the top `limit` chunks above zero score.
 */
export function rankChunks(docs: KbDoc[], query: string, limit = 8): KbHit[] {
  const qs = terms(query)
  if (!qs.length || !docs.length) return []
  const hits: KbHit[] = []
  for (const d of docs) {
    const folder = getFolder(d.parentId)?.name ?? ''
    const nameHay = `${d.name} ${d.keywords?.join(' ') ?? ''} ${d.summary ?? ''}`.toLowerCase()
    for (const c of d.chunks ?? []) {
      const hay = c.text.toLowerCase()
      let score = 0
      for (const q of qs) {
        if (nameHay.includes(q)) score += 2
        const m = hay.split(q).length - 1
        if (m > 0) score += 1 + Math.min(m, 4) * 0.5
      }
      if (score > 0) hits.push({ docId: d.id, docName: d.name, folder, chunk: c, score })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Build the knowledge grounding block for a run: rank the attached docs' chunks
 * against the query and return the top ones under a rough token budget. Shape is
 * plain data so it can be JSON.stringified straight into the model context.
 */
export function buildKnowledgeContext(
  attachments: KbAttachment[] | undefined,
  query: string,
  opts: { maxChunks?: number; tokenBudget?: number } = {},
): { name: string; folder: string; snippet: string }[] {
  const docs = resolveAttachments(attachments)
  if (!docs.length) return []
  const maxChunks = opts.maxChunks ?? 8
  const budget = opts.tokenBudget ?? 3000
  const ranked = rankChunks(docs, query, maxChunks)
  // If nothing matched (e.g. a broad prompt), fall back to each doc's summary so
  // the model still knows what reference material exists.
  const picked = ranked.length
    ? ranked
    : docs.slice(0, 4).map((d) => ({ docId: d.id, docName: d.name, folder: getFolder(d.parentId)?.name ?? '', chunk: { id: `${d.id}-s`, ord: 0, text: d.summary ?? d.text?.slice(0, 400) ?? '' }, score: 0 }))
  const out: { name: string; folder: string; snippet: string }[] = []
  let spent = 0
  for (const h of picked) {
    const tok = Math.ceil(h.chunk.text.length / 4)
    if (spent + tok > budget && out.length) break
    spent += tok
    out.push({ name: h.docName, folder: h.folder, snippet: h.chunk.text.trim() })
  }
  return out
}

/**
 * Compact searchable corpus for the agentic `search_knowledge` tool — the docs
 * an agent/skill has attached, reduced to id/name/folder/summary + their chunks.
 * Small in the mock (docs are short) so it can ride along in the chat request and
 * be searched server-side inside the function-calling loop.
 */
export interface KbCorpusDoc { id: string; name: string; folder: string; summary?: string; chunks: string[] }
export function knowledgeCorpus(attachments?: KbAttachment[], opts: { maxDocs?: number; maxChunksPerDoc?: number } = {}): KbCorpusDoc[] {
  const docs = resolveAttachments(attachments).slice(0, opts.maxDocs ?? 40)
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    folder: getFolder(d.parentId)?.name ?? '',
    summary: d.summary,
    chunks: (d.chunks ?? []).slice(0, opts.maxChunksPerDoc ?? 12).map((c) => c.text),
  }))
}

// ── Misc ────────────────────────────────────────────────────────────────────────
export const KB_ACCEPT = '.md,.markdown,.txt,.csv,.tsv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif'

/** Cap on the extracted text kept in the reactive/localStorage snapshot (chars). */
export const KB_TEXT_CAP = 12_000

export function extLabel(ext: string): string { return ext.replace(/^\./, '').toUpperCase() }
