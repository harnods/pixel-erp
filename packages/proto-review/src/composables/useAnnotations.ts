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

  async function updatePosition(annotationId: string, xPct: number, yPct: number) {
    const ann = annotations.value.find(a => a.id === annotationId)
    if (!ann) return
    const prevX = ann.x_pct
    const prevY = ann.y_pct
    ann.x_pct = xPct
    ann.y_pct = yPct

    const sb = getSupabase()
    const { error } = await sb
      .from('proto_review_annotations')
      .update({ x_pct: xPct, y_pct: yPct })
      .eq('id', annotationId)

    if (error) {
      ann.x_pct = prevX
      ann.y_pct = prevY
    }
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
