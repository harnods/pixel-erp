/**
 * Session probe for the access gate. Returns:
 *   • { gateEnabled: false } — the gate is not configured on this deployment
 *     (no client ID / secret), so the app is open. Set both env vars to enforce.
 *   • { gateEnabled: true, user } — a valid @mekari.com session.
 *   • 401 — gate enabled but no valid session → the client shows the login screen.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const secret = config.sessionSecret as string
  const clientId = config.public.googleClientId as string
  const gateEnabled = !!(secret && clientId)

  if (!gateEnabled) return { gateEnabled: false, user: null }

  const user = decodeSession(getCookie(event, SESSION_COOKIE), secret)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in.' })
  }
  return { gateEnabled: true, user: { email: user.email, name: user.name, picture: user.picture } }
})
