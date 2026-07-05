import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getSupabase } from '../lib/supabase'
import type { Annotation, Reply } from '../types'

let _projectId = ''

export function initAnnotations(projectId: string) {
  _projectId = projectId
}

/** Fetches every annotation for this project across all pages — for the "All comments" panel. */
export async function fetchAllAnnotations(): Promise<Annotation[]> {
  if (!_projectId) return []
  const sb = getSupabase()
  const { data, error } = await sb
    .from('proto_review_annotations')
    .select('*, replies:proto_review_replies(*)')
    .eq('project_id', _projectId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data.map(a => ({
    ...a,
    replies: ((a.replies ?? []) as Reply[]).sort(
      (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
    ),
  }))
}

/**
 * Deletes every annotation (and its replies, via cascade) anchored to a
 * per-instance dynamic route — e.g. /warehouses/:id — for this project.
 * Comments on static pages (no :id segment) are left alone.
 *
 * Call this alongside resetting your app's own demo/seed data: once a
 * dynamically-created record (a receipt, a task, anything with a generated
 * id) is wiped, any comment still pointing at its detail page is orphaned —
 * the pin would show up on a now-empty page. Design feedback left on static
 * pages isn't tied to that data, so it survives a reset.
 */
export async function clearDynamicAnnotations(): Promise<void> {
  if (!_projectId) return
  const sb = getSupabase()
  await sb
    .from('proto_review_annotations')
    .delete()
    .eq('project_id', _projectId)
    .like('route_key', '%:id%')
}

export function useAnnotations(routeKey: Ref<string>) {
  const annotations = ref<Annotation[]>([])
  const loading = ref(false)

  async function fetchAnnotations() {
    if (!_projectId) return
    loading.value = true
    const sb = getSupabase()
    const { data, error } = await sb
      .from('proto_review_annotations')
      .select('*, replies:proto_review_replies(*)')
      .eq('project_id', _projectId)
      .eq('route_key', routeKey.value)
      .order('created_at', { ascending: true })

    if (!error && data) {
      annotations.value = data.map(a => ({
        ...a,
        replies: ((a.replies ?? []) as Reply[]).sort(
          (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
        ),
      }))
    }
    loading.value = false
  }

  async function addAnnotation(params: {
    xPct: number
    yPct: number
    author: string
    body: string
    path: string
    anchorSelector?: string | null
    anchorXPct?: number | null
    anchorYPct?: number | null
  }): Promise<Annotation | null> {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('proto_review_annotations')
      .insert({
        project_id: _projectId,
        route_key: routeKey.value,
        path: params.path,
        x_pct: params.xPct,
        y_pct: params.yPct,
        anchor_selector: params.anchorSelector ?? null,
        anchor_x_pct: params.anchorXPct ?? null,
        anchor_y_pct: params.anchorYPct ?? null,
        author: params.author,
        body: params.body,
      })
      .select()
      .single()

    if (!error && data) {
      const ann: Annotation = { ...data, replies: [] }
      annotations.value.push(ann)
      return ann
    }
    return null
  }

  async function addReply(annotationId: string, author: string, body: string) {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('proto_review_replies')
      .insert({ annotation_id: annotationId, author, body })
      .select()
      .single()

    if (!error && data) {
      const ann = annotations.value.find(a => a.id === annotationId)
      if (ann) ann.replies = [...ann.replies, data as Reply]
    }
  }

  async function updatePosition(
    annotationId: string,
    pos: {
      xPct: number
      yPct: number
      anchorSelector?: string | null
      anchorXPct?: number | null
      anchorYPct?: number | null
    },
  ) {
    const ann = annotations.value.find(a => a.id === annotationId)
    if (!ann) return
    const prev = {
      x_pct: ann.x_pct,
      y_pct: ann.y_pct,
      anchor_selector: ann.anchor_selector,
      anchor_x_pct: ann.anchor_x_pct,
      anchor_y_pct: ann.anchor_y_pct,
    }
    const next = {
      x_pct: pos.xPct,
      y_pct: pos.yPct,
      anchor_selector: pos.anchorSelector ?? null,
      anchor_x_pct: pos.anchorXPct ?? null,
      anchor_y_pct: pos.anchorYPct ?? null,
    }
    Object.assign(ann, next)

    const sb = getSupabase()
    const { error } = await sb
      .from('proto_review_annotations')
      .update(next)
      .eq('id', annotationId)

    if (error) Object.assign(ann, prev)
  }

  async function toggleResolved(annotationId: string) {
    const ann = annotations.value.find(a => a.id === annotationId)
    if (!ann) return
    const newVal = !ann.resolved
    const sb = getSupabase()
    const { error } = await sb
      .from('proto_review_annotations')
      .update({ resolved: newVal })
      .eq('id', annotationId)

    if (!error) ann.resolved = newVal
  }

  async function deleteAnnotation(annotationId: string) {
    const sb = getSupabase()
    const { error } = await sb
      .from('proto_review_annotations')
      .delete()
      .eq('id', annotationId)

    if (!error) {
      annotations.value = annotations.value.filter(a => a.id !== annotationId)
    }
  }

  watch(routeKey, fetchAnnotations, { immediate: true })

  return {
    annotations,
    loading,
    fetchAnnotations,
    addAnnotation,
    addReply,
    updatePosition,
    toggleResolved,
    deleteAnnotation,
  }
}
