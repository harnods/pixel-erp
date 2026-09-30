/** Clear the session cookie. The client reloads to the login screen after. */
export default defineEventHandler((event) => {
  clearSessionCookie(event)
  return { ok: true }
})
