import type { App } from 'vue'
import type { ProtoReviewConfig } from './types'
import { initSupabase } from './lib/supabase'
import { initAnnotations } from './composables/useAnnotations'
import { setShowLauncher, setCornerPosition } from './lib/launcherConfig'
import { setBridgeUrl } from './composables/useFixBridge'
import ProtoReviewOverlay from './components/ProtoReviewOverlay.vue'

export { ProtoReviewOverlay }
export { useReviewMode } from './composables/useReviewMode'
export { useAnnotations, clearDynamicAnnotations } from './composables/useAnnotations'
export type { Annotation, Reply, ProtoReviewConfig } from './types'

export function createProtoReview(config: ProtoReviewConfig) {
  return {
    install(app: App) {
      initSupabase(config.supabaseUrl, config.supabaseKey)
      initAnnotations(config.projectId)
      setShowLauncher(config.showLauncher ?? true)
      setCornerPosition(config.corner ?? 'bottom-right')
      if (config.fixBridgeUrl) setBridgeUrl(config.fixBridgeUrl)
      app.component('ProtoReviewOverlay', ProtoReviewOverlay)
    },
  }
}
