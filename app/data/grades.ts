/**
 * Grade List — the company's named, ordered set of grades a batch can be graded
 * with (PRD stories 3, 3a). One list per company for now; it's still its own entity
 * with an id so a later phase can add more lists without migrating batches, which
 * store the grade id, never the name (PM answers A1, A8).
 *
 * Every create/update/status/delete attempt is written to the grade activity log —
 * failed ones included (story 3a).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { SEED_GRADE_IDS, type DataError, type DataResult } from './batchAttributes'
import { countBatchesUsingGrade } from './batchStore'

export const GRADE_NAME_MAX = 50
export const GRADE_DESCRIPTION_MAX = 256
export const MAX_ACTIVE_GRADES = 10
export const MIN_ACTIVE_GRADES = 1

/** Stand-in for the signed-in user until the prototype has a session. */
const CURRENT_USER = 'Rizal Candra'

export interface GradeList {
  id: string
  name: string
}
export const GRADE_LIST: GradeList = { id: 'grade-list-1', name: 'Grade' }

export type GradeStatus = 'active' | 'inactive'

export interface Grade {
  id: string
  listId: string
  /** Unique within the list (case-insensitive), inactive grades included. */
  name: string
  /** 1 = highest quality. Assigned once at creation and never changed. */
  rank: number
  description: string
  status: GradeStatus
  /** Soft delete — only possible while no batch uses the grade. */
  deleted: boolean
  createdAt: string
  updatedAt: string
  updatedBy: string
}

export type GradeError = DataError<
  'not-found' | 'name-required' | 'name-too-long' | 'name-taken' | 'description-too-long'
  | 'max-active' | 'last-active' | 'in-use',
  'name' | 'description'
>

/** Same shape as ActivityLogModal's ActivityEntry, so the page can pass it straight in. */
export interface GradeActivity {
  date: string
  user: string
  activity: string
  details: { label: string; value: string }[]
}

const SEED_AT = '2026-01-05T09:00:00'
function seedGrade(id: string, name: string, rank: number): Grade {
  return {
    id, listId: GRADE_LIST.id, name, rank, description: '', status: 'active', deleted: false,
    createdAt: SEED_AT, updatedAt: SEED_AT, updatedBy: 'System',
  }
}
const SEED_GRADES: Grade[] = [
  seedGrade(SEED_GRADE_IDS.A, 'A', 1),
  seedGrade(SEED_GRADE_IDS.B, 'B', 2),
  seedGrade(SEED_GRADE_IDS.C, 'C', 3),
]

const GRADES_KEY = 'grades-v1'
const ACTIVITY_KEY = 'grade-activity-v1'
const store = reactive<Grade[]>(loadSnapshot<Grade>(GRADES_KEY) ?? SEED_GRADES.map((g) => ({ ...g })))
const activity = reactive<GradeActivity[]>(loadSnapshot<GradeActivity>(ACTIVITY_KEY) ?? [])
function persistGrades() { saveSnapshot(GRADES_KEY, store) }
function persistActivity() { saveSnapshot(ACTIVITY_KEY, activity) }

function now(): string { return new Date().toISOString() }

// ── Reads ─────────────────────────────────────────────────────────────────────────
/** Every grade that isn't deleted, best rank first. */
export function grades(): Grade[] {
  return store.filter((g) => !g.deleted).sort((a, b) => a.rank - b.rank)
}

/** Grades that can be picked on a batch. */
export function activeGrades(): Grade[] {
  return grades().filter((g) => g.status === 'active')
}

/** By id — deleted grades included, so a stored id always resolves to something. */
export function gradeById(id: string): Grade | undefined {
  return store.find((g) => g.id === id)
}

/** Case-insensitive name lookup across non-deleted grades, inactive included — so an
 *  importer can tell "no such grade" apart from "grade is inactive". */
export function gradeByName(name: string): Grade | undefined {
  const needle = name.trim().toLowerCase()
  return grades().find((g) => g.name.toLowerCase() === needle)
}

/** The rank a new grade gets: one past the highest ever assigned. Inactive and
 *  deleted grades count, so a rank is never handed out twice. */
export function nextGradeRank(): number {
  return store.reduce((max, g) => Math.max(max, g.rank), 0) + 1
}

/** Activity entries, newest first. */
export function gradeActivity(): GradeActivity[] {
  return [...activity].reverse()
}

// ── Writes ────────────────────────────────────────────────────────────────────────
const ERROR_TEXT: Record<GradeError['code'], string> = {
  'not-found': 'Grade not found',
  'name-required': 'Name is empty',
  'name-too-long': `Name is longer than ${GRADE_NAME_MAX} characters`,
  'name-taken': 'Name is already used',
  'description-too-long': `Description is longer than ${GRADE_DESCRIPTION_MAX} characters`,
  'max-active': `List already has ${MAX_ACTIVE_GRADES} active grades`,
  'last-active': 'At least one grade must stay active',
  'in-use': 'Grade is used by batches',
}

function log(
  activityText: string,
  details: { label: string; value: string }[],
  errors: GradeError[] = [],
  by = CURRENT_USER,
): void {
  const result = errors.length
    ? [{ label: 'Result', value: `Failed — ${errors.map((e) => ERROR_TEXT[e.code]).join('; ')}` }]
    : []
  activity.push({ date: now(), user: by, activity: activityText, details: [...details, ...result] })
  persistActivity()
}

function activeCount(): number {
  return activeGrades().length
}

function validateFields(
  input: { name?: string; description?: string },
  selfId?: string,
): GradeError[] {
  const errors: GradeError[] = []
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) errors.push({ code: 'name-required', field: 'name' })
    else if (name.length > GRADE_NAME_MAX) errors.push({ code: 'name-too-long', field: 'name', count: GRADE_NAME_MAX })
    else {
      const clash = gradeByName(name)
      if (clash && clash.id !== selfId) errors.push({ code: 'name-taken', field: 'name' })
    }
  }
  if (input.description !== undefined && input.description.length > GRADE_DESCRIPTION_MAX) {
    errors.push({ code: 'description-too-long', field: 'description', count: GRADE_DESCRIPTION_MAX })
  }
  return errors
}

/** Create a grade. Status is always Active and the rank is assigned by the system. */
export function createGrade(input: { name: string; description?: string }, by = CURRENT_USER): DataResult<Grade, GradeError> {
  const name = input.name.trim()
  const description = input.description ?? ''
  const errors = validateFields({ name, description })
  if (activeCount() >= MAX_ACTIVE_GRADES) errors.push({ code: 'max-active', count: MAX_ACTIVE_GRADES })
  const details = [{ label: 'Name', value: name }, { label: 'Description', value: description || '—' }]

  if (errors.length) {
    log('Failed to create grade', details, errors, by)
    return { ok: false, errors }
  }
  const at = now()
  const grade: Grade = {
    id: `grade-${Date.now().toString(36)}${store.length.toString(36)}`,
    listId: GRADE_LIST.id, name, rank: nextGradeRank(), description, status: 'active', deleted: false,
    createdAt: at, updatedAt: at, updatedBy: by,
  }
  store.push(grade)
  persistGrades()
  log('Created grade', [...details, { label: 'Rank', value: String(grade.rank) }, { label: 'Status', value: 'Active' }], [], by)
  return { ok: true, value: { ...grade } }
}

/** Update a grade's name and/or description. Rank has no setter — it can't change. */
export function updateGrade(
  id: string,
  patch: { name?: string; description?: string },
  by = CURRENT_USER,
): DataResult<Grade, GradeError> {
  const grade = gradeById(id)
  if (!grade || grade.deleted) {
    const errors: GradeError[] = [{ code: 'not-found' }]
    log('Failed to update grade', [{ label: 'Grade', value: id }], errors, by)
    return { ok: false, errors }
  }
  const errors = validateFields(patch, id)
  const details: { label: string; value: string }[] = [{ label: 'Grade', value: grade.name }]
  if (patch.name !== undefined) details.push({ label: 'Name', value: `${grade.name} → ${patch.name.trim()}` })
  if (patch.description !== undefined) details.push({ label: 'Description', value: `${grade.description || '—'} → ${patch.description || '—'}` })

  if (errors.length) {
    log('Failed to update grade', details, errors, by)
    return { ok: false, errors }
  }
  if (patch.name !== undefined) grade.name = patch.name.trim()
  if (patch.description !== undefined) grade.description = patch.description
  grade.updatedAt = now()
  grade.updatedBy = by
  persistGrades()
  log('Updated grade', details, [], by)
  return { ok: true, value: { ...grade } }
}

/** Activate or deactivate. The list must keep 1–10 active grades at all times. */
export function setGradeStatus(id: string, status: GradeStatus, by = CURRENT_USER): DataResult<Grade, GradeError> {
  const grade = gradeById(id)
  const verb = status === 'active' ? 'activate' : 'deactivate'
  if (!grade || grade.deleted) {
    const errors: GradeError[] = [{ code: 'not-found' }]
    log(`Failed to ${verb} grade`, [{ label: 'Grade', value: id }], errors, by)
    return { ok: false, errors }
  }
  if (grade.status === status) return { ok: true, value: { ...grade } }

  const errors: GradeError[] = []
  if (status === 'inactive' && activeCount() <= MIN_ACTIVE_GRADES) errors.push({ code: 'last-active' })
  if (status === 'active' && activeCount() >= MAX_ACTIVE_GRADES) errors.push({ code: 'max-active', count: MAX_ACTIVE_GRADES })
  const details = [{ label: 'Grade', value: grade.name }, { label: 'Status', value: status === 'active' ? 'Inactive → Active' : 'Active → Inactive' }]

  if (errors.length) {
    log(`Failed to ${verb} grade`, details, errors, by)
    return { ok: false, errors }
  }
  grade.status = status
  grade.updatedAt = now()
  grade.updatedBy = by
  persistGrades()
  log(status === 'active' ? 'Activated grade' : 'Deactivated grade', details, [], by)
  return { ok: true, value: { ...grade } }
}

/** Soft-delete a grade. Blocked while any batch uses it — the page then offers
 *  Deactivate instead (the `in-use` error carries the batch count) — and blocked for
 *  the last active grade. The list itself can't be deleted. */
export function deleteGrade(id: string, by = CURRENT_USER): DataResult<Grade, GradeError> {
  const grade = gradeById(id)
  if (!grade || grade.deleted) {
    const errors: GradeError[] = [{ code: 'not-found' }]
    log('Failed to delete grade', [{ label: 'Grade', value: id }], errors, by)
    return { ok: false, errors }
  }
  const errors: GradeError[] = []
  const usedBy = countBatchesUsingGrade(id)
  if (usedBy > 0) errors.push({ code: 'in-use', count: usedBy })
  if (grade.status === 'active' && activeCount() <= MIN_ACTIVE_GRADES) errors.push({ code: 'last-active' })
  const details = [{ label: 'Grade', value: grade.name }, { label: 'Rank', value: String(grade.rank) }]

  if (errors.length) {
    log('Failed to delete grade', details, errors, by)
    return { ok: false, errors }
  }
  grade.deleted = true
  grade.updatedAt = now()
  grade.updatedBy = by
  persistGrades()
  log('Deleted grade', details, [], by)
  return { ok: true, value: { ...grade } }
}
