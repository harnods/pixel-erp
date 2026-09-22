# Access gate — Google @mekari.com login

The prototype is not publicly reachable: a viewer must sign in with a Google
**@mekari.com** account before the app renders. This is **app-level** protection
suited to a demo (the SPA is a client bundle; assets are technically fetchable) —
not edge-enforced auth. It raises the bar significantly and keeps casual/public
access out.

## How it works

- **Client gate** — `app/components/AuthGate.vue` wraps the app in `app.vue`. On
  load it calls `/api/auth/me`; it renders a splash → `LoginScreen.vue` (anonymous)
  → the app (authed).
- **Sign-in** — `LoginScreen.vue` renders Google Identity Services' own
  "Sign in with Google" button (a deliberate deviation from `MpButton` — Google's
  brand guidelines require their button). GIS returns a `credential` (id_token JWT).
- **Server verify** — `POST /api/auth/google` verifies the token with Google
  (`oauth2.googleapis.com/tokeninfo`) and enforces: `aud` = our client ID,
  `email_verified`, and Workspace domain (`hd`) = `mekari.com`. On success it sets a
  signed **HttpOnly** session cookie (`server/utils/session.ts`, HMAC-SHA256).
- **Session** — `GET /api/auth/me` returns the session or 401.
  `POST /api/auth/logout` clears it (wired to the user menu's *Sign out*).

## Configuration (env)

| Var | Where | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | public | Google OAuth Web client ID |
| `NUXT_SESSION_SECRET` | server | HMAC key signing the session cookie; rotate to log everyone out |
| `NUXT_ALLOWED_EMAIL_DOMAIN` | server | Allowed Workspace domain (default `mekari.com`) |

**Fail-open when unconfigured.** If `NUXT_PUBLIC_GOOGLE_CLIENT_ID` **or**
`NUXT_SESSION_SECRET` is unset, the gate is **disabled and the app is open** (so
local dev works without Google setup, and `/api/auth/me` returns
`{ gateEnabled: false }`). **Protection only exists once both are set** — so they
**must** be set in the Vercel project (Production + Preview), or the deployment is
public.

### Google Cloud Console

Create an **OAuth 2.0 Client ID → Web application** and add every origin to
**Authorised JavaScript origins**: `http://localhost:4321`, `http://localhost:4322`,
and the Vercel URL(s). No client secret is needed (GIS id_token flow).

### Vercel

Set all three env vars on the project (Production + Preview) and redeploy.
