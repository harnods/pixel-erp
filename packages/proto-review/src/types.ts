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
  /** Viewport-percentage coordinates — fallback when the element anchor can't resolve. */
  x_pct: number
  y_pct: number
  /** CSS selector of the DOM element the pin is attached to (null on legacy rows). */
  anchor_selector: string | null
  /** Offset within the anchored element, as % of its box. */
  anchor_x_pct: number | null
  anchor_y_pct: number | null
  author: string
  body: string
  resolved: boolean
  created_at: string
  replies: Reply[]
}

export interface PendingPin {
  /** Viewport pixels of the click, used as fallback/display position. */
  x: number
  y: number
  /** Element the click landed on, when one could be resolved. */
  anchor: { selector: string; xPct: number; yPct: number } | null
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
  /**
   * Which corner the floating launcher and the review toolbar dock to
   * (default 'bottom-right'). Change this if your host app already puts
   * something there — e.g. a scenario/environment switcher.
   */
  corner?: 'bottom-right' | 'bottom-left'
  /**
   * URL of the local `proto-review bridge` (default http://localhost:4319).
   * The "Fix with Claude" button POSTs comments here to run a headless
   * `claude -p` fix. Only reachable on the machine running the bridge, so
   * the button auto-hides for everyone else.
   */
  fixBridgeUrl?: string
}
