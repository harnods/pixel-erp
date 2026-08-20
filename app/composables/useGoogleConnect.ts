/**
 * Real Google connections for Cowork (Calendar / Gmail / Contacts) via Google
 * Identity Services (GIS) OAuth 2.0 token flow — client-side, no client secret.
 *
 * Requires a Google OAuth **Client ID** (Web application) with this app's origin
 * added to "Authorised JavaScript origins" (e.g. http://localhost:4322 and the
 * deploy URL). Set it as NUXT_PUBLIC_GOOGLE_CLIENT_ID in .env — exposed to the
 * client via runtimeConfig.public.googleClientId.
 *
 * connect(scope) opens the Google consent popup and resolves with an access
 * token (kept in memory only). It also fetches a tiny sample so the UI can show
 * a real signal (e.g. the account email / upcoming event count).
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client'

let gisReady: Promise<void> | null = null
// scope → access token (in-memory only; never persisted).
const tokens = new Map<string, string>()

function loadGis(): Promise<void> {
  if (gisReady) return gisReady
  gisReady = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'))
    if ((window as any).google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisReady
}

export function useGoogleConnect() {
  const config = useRuntimeConfig()
  const clientId = computed(() => (config.public.googleClientId as string) || '')
  const isConfigured = computed(() => !!clientId.value)

  function requestToken(scope: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const google = (window as any).google
      if (!google?.accounts?.oauth2) return reject(new Error('GIS not loaded'))
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId.value,
        scope,
        callback: (resp: any) => {
          if (resp?.error) return reject(new Error(resp.error))
          tokens.set(scope, resp.access_token)
          resolve(resp.access_token)
        },
        error_callback: (err: any) => reject(new Error(err?.type || 'Consent failed')),
      })
      client.requestAccessToken({ prompt: '' })
    })
  }

  /** Connect a Google scope. Returns { token, sample } where sample is a short,
   *  human-readable proof the connection is live (best-effort). */
  async function connect(scope: string): Promise<{ token: string; sample?: string }> {
    if (!isConfigured.value) throw new Error('Google client ID not configured')
    await loadGis()
    const token = await requestToken(scope)
    let sample: string | undefined
    try {
      sample = await probe(scope, token)
    } catch { /* proof is best-effort */ }
    return { token, sample }
  }

  function disconnect(scope: string): void {
    const token = tokens.get(scope)
    const google = (window as any).google
    if (token && google?.accounts?.oauth2?.revoke) google.accounts.oauth2.revoke(token, () => {})
    tokens.delete(scope)
  }

  // A tiny read per scope to confirm the grant actually works.
  async function probe(scope: string, token: string): Promise<string | undefined> {
    const h = { Authorization: `Bearer ${token}` }
    if (scope.includes('calendar')) {
      const now = new Date().toISOString()
      const r = await $fetch<any>('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        params: { timeMin: now, maxResults: 5, singleEvents: true, orderBy: 'startTime' },
        headers: h,
      })
      return `${(r.items ?? []).length} upcoming events`
    }
    if (scope.includes('gmail')) {
      const r = await $fetch<any>('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: h })
      return r.emailAddress
    }
    if (scope.includes('contacts')) {
      const r = await $fetch<any>('https://people.googleapis.com/v1/people/me/connections', {
        params: { pageSize: 1, personFields: 'names' }, headers: h,
      })
      return `${r.totalPeople ?? r.totalItems ?? 0} contacts`
    }
    return undefined
  }

  return { isConfigured, clientId, connect, disconnect, tokens }
}
