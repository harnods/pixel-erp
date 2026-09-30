/**
 * Access-gate auth state (Google @mekari.com login). App-level protection: the
 * app shell renders only once `me()` confirms a valid session cookie. The cookie
 * itself is HttpOnly + signed server-side, so this composable never handles the
 * token — it only drives the login/loading/authed UI.
 *
 * Shared singleton state (module-level refs) so the gate and the user menu see
 * the same session.
 */
import { ref, computed } from 'vue'

export interface AuthUser {
  email: string
  name: string
  picture: string
}

type Status = 'loading' | 'anonymous' | 'authed'

const status = ref<Status>('loading')
const user = ref<AuthUser | null>(null)

export function useAuth() {
  /** Resolve the current session from the server. Called once by the gate on load.
   *  If the gate isn't configured on this deployment, the app is open (authed). */
  async function refresh(): Promise<void> {
    try {
      const res = await $fetch<{ gateEnabled: boolean; user: AuthUser | null }>('/api/auth/me')
      user.value = res.user
      status.value = 'authed' // gate off → open; gate on + valid session → authed
    } catch {
      user.value = null
      status.value = 'anonymous'
    }
  }

  /** Exchange a Google credential (id_token) for a session. Throws on rejection
   *  with a human message (e.g. wrong domain) for the login screen to display. */
  async function signInWithGoogle(credential: string): Promise<void> {
    try {
      user.value = await $fetch<AuthUser>('/api/auth/google', {
        method: 'POST',
        body: { credential },
      })
      status.value = 'authed'
    } catch (e: any) {
      const msg = e?.data?.statusMessage || e?.statusMessage || 'Login gagal. Coba lagi.'
      throw new Error(msg)
    }
  }

  async function signOut(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    user.value = null
    status.value = 'anonymous'
  }

  return {
    status: computed(() => status.value),
    user: computed(() => user.value),
    isAuthed: computed(() => status.value === 'authed'),
    refresh,
    signInWithGoogle,
    signOut,
  }
}
