/**
 * Exchange a Google Identity Services credential (id_token / JWT) for a signed
 * session cookie — the access gate for this prototype.
 *
 * Verifies the token with Google, then enforces the allow rules:
 *   • audience matches our OAuth client ID (token was minted for THIS app)
 *   • email is verified
 *   • account belongs to the allowed Workspace domain (hd), default mekari.com
 * Only then is a session issued. Any failure returns 403 with an inline-friendly
 * message — the client shows it below the Sign-in button.
 */
interface TokenInfo {
  aud?: string
  email?: string
  email_verified?: string | boolean
  hd?: string
  name?: string
  picture?: string
  exp?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const clientId = config.public.googleClientId as string
  const secret = config.sessionSecret as string
  const allowedDomain = (config.allowedEmailDomain as string) || 'mekari.com'

  if (!clientId || !secret) {
    throw createError({ statusCode: 500, statusMessage: 'Auth not configured on the server.' })
  }

  const { credential } = await readBody<{ credential?: string }>(event)
  if (!credential) {
    throw createError({ statusCode: 400, statusMessage: 'Missing credential.' })
  }

  let info: TokenInfo
  try {
    info = await $fetch<TokenInfo>('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: credential },
    })
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Login gagal diverifikasi. Coba lagi.' })
  }

  const emailVerified = info.email_verified === true || info.email_verified === 'true'
  const email = (info.email || '').toLowerCase()
  const domain = (info.hd || email.split('@')[1] || '').toLowerCase()

  if (info.aud !== clientId) {
    throw createError({ statusCode: 403, statusMessage: 'Login gagal diverifikasi. Coba lagi.' })
  }
  if (!email || !emailVerified) {
    throw createError({ statusCode: 403, statusMessage: 'Akun Google belum terverifikasi.' })
  }
  if (domain !== allowedDomain.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: `Gunakan akun Google @${allowedDomain} untuk masuk.`,
    })
  }

  setSessionCookie(
    event,
    { email, name: info.name || email, picture: info.picture || '' },
    secret,
  )

  return { email, name: info.name || email, picture: info.picture || '' }
})
