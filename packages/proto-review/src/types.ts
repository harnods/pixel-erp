export interface Reply {
  id: string
  annotation_id: string
  author: string
  body: string
  created_at: string
}

export interface Annotation {
  id: string
  project_id: string
  route_key: string
  /** The concrete URL path at the moment the comment was created (e.g. /warehouses/wh-001). */
  path: string | null
  x_pct: number
  y_pct: number
  author: string
  body: string
  resolved: boolean
  created_at: string
  replies: Reply[]
}

export interface PendingPin {
  x: number
  y: number
}

export interface ProtoReviewConfig {
  supabaseUrl: string
  supabaseKey: string
  projectId: string
  /**
   * Show the package's own floating "Review" launcher button when review mode
   * is off (default true). Set to false if the host project wires its own
   * toggle (e.g. into an existing user menu) via useReviewMode().toggleReviewMode.
   */
  showLauncher?: boolean
}
