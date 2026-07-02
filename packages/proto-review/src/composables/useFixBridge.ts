import { ref } from 'vue'
import type { Annotation } from '../types'

/**
 * Talks to the local `proto-review bridge` process (npx proto-review bridge),
 * which spawns a headless `claude -p` run to fix what a comment describes.
 *
 * The bridge only listens on localhost, so `available` is only ever true on
 * the machine running it — which is exactly how the Fix button stays hidden
 * for PMs/engineers viewing a deployed prototype.
 */

const DEFAULT_BRIDGE_URL = 'http://localhost:4319'
let _bridgeUrl = DEFAULT_BRIDGE_URL

export function setBridgeUrl(url: string) {
  _bridgeUrl = url || DEFAULT_BRIDGE_URL
}

const available = ref(false)

export function useFixBridge() {
  // Probes on every popover open (not one-shot) so starting the bridge
  // mid-session makes the button appear on the next comment you open, no
  // reload needed. It's a cheap loopback request with an 800ms timeout.
  async function checkAvailability() {
    if (typeof window === 'undefined') return
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      available.value = false
      return
    }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 800)
      const r = await fetch(`${_bridgeUrl}/health`, { signal: ctrl.signal })
      clearTimeout(t)
      available.value = r.ok
    } catch {
      available.value = false
    }
  }

  /** Collects the DOM context around a comment so Claude gets a precise brief. */
  function gatherContext(ann: Annotation) {
    let contextText = ''
    if (ann.anchor_selector) {
      try {
        const el = document.querySelector(ann.anchor_selector)
        if (el) contextText = (el as HTMLElement).innerText?.slice(0, 200) ?? ''
      } catch {
        /* bad selector, skip */
      }
    }
    return {
      body: ann.body,
      author: ann.author,
      replies: ann.replies.map(r => ({ author: r.author, body: r.body })),
      path: ann.path || ann.route_key,
      title: document.title,
      selector: ann.anchor_selector,
      contextText,
    }
  }

  /** Kicks off a fix; returns a jobId to poll, or throws on transport error. */
  async function requestFix(ann: Annotation): Promise<string> {
    const r = await fetch(`${_bridgeUrl}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gatherContext(ann)),
    })
    if (!r.ok) throw new Error(`bridge returned ${r.status}`)
    const { jobId } = await r.json()
    return jobId
  }

  interface FixStatus {
    state: 'running' | 'done' | 'error'
    summary?: string
    changedFiles?: string[]
    error?: string | null
  }

  async function pollStatus(jobId: string): Promise<FixStatus> {
    const r = await fetch(`${_bridgeUrl}/status/${jobId}`)
    if (!r.ok) throw new Error(`status ${r.status}`)
    return r.json()
  }

  return { available, checkAvailability, requestFix, pollStatus }
}
