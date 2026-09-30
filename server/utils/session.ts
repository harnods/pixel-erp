/**
 * Signed, HttpOnly session cookie for the access gate (Google @mekari.com login).
 *
 * App-level demo protection: the client can't read or forge this cookie — the
 * payload is HMAC-signed server-side with NUXT_SESSION_SECRET. It carries only a
 * small, non-sensitive snapshot of the signed-in Google account. Tokens verify
 * on every /api/auth/me call, so a tampered or expired cookie is rejected.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'erp_session'
const MAX_AGE_SECONDS = 12 * 60 * 60 // 12h

export interface SessionUser {
  email: string
  name: string
  picture: string
  /** Unix seconds when this session expires. */
  exp: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Serialize + sign a user into the cookie value `<payload>.<sig>`. */
export function encodeSession(user: SessionUser, secret: string): string {
  const payload = b64url(JSON.stringify(user))
  return `${payload}.${sign(payload, secret)}`
}

/** Verify + decode a cookie value. Returns null if malformed, tampered, or expired. */
export function decodeSession(value: string | undefined, secret: string): SessionUser | null {
  if (!value || !secret) return null
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return null

  const expected = sign(payload, secret)
  // Constant-time compare; length guard first (timingSafeEqual throws on mismatch).
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser
    if (!user?.email || !user.exp || user.exp * 1000 < Date.now()) return null
    return user
  } catch {
    return null
  }
}

/** Set the signed session cookie for the given user. */
export function setSessionCookie(event: H3Event, user: Omit<SessionUser, 'exp'>, secret: string): void {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  const value = encodeSession({ ...user, exp }, secret)
  setCookie(event, SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export function clearSessionCookie(event: H3Event): void {
  setCookie(event, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 0,
  })
}
