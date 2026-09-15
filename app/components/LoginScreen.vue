<template>
  <!--
    Full-screen access gate. The prototype is not publicly reachable — a viewer
    must sign in with a Google @mekari.com account. The "Sign in with Google"
    control is Google Identity Services' own rendered button (a deliberate
    deviation from MpButton: Google's brand guidelines require their button for
    the sign-in action). Everything else uses Pixel tokens.

    Backdrop: on desktop a full-bleed product hero (login-bg.png) with the card
    pushed to the right so it never covers the laptop; on mobile/tablet a solid
    #07090A (no hero). Both hexes below are an explicit product/brand request
    (authority: user goal) — they intentionally override rule/token-no-hardcoded-color.

    States handled here: not-configured (no client ID) · idle · signing-in ·
    error/denied (wrong domain or verification failed) — inline, never a toast.
  -->
  <div class="login">
    <div class="login__card">
      <img
        class="login__logo"
        src="/login-mekari-erp.png"
        alt="Mekari ERP"
        width="208"
        height="30"
      />
      <p class="login__subtitle">{{ t('Sign in with your @mekari.com Google account to continue.') }}</p>

      <!-- Auth not configured on this deployment -->
      <div v-if="!isConfigured" class="login__notice">
        {{ t('Sign-in is not configured on this deployment.') }}
      </div>

      <template v-else>
        <!-- Google renders its official button into this element -->
        <div class="login__gbtn">
          <div ref="btnEl" />
          <div v-if="signingIn" class="login__signing">
            <MpSpinner size="sm" />
            <span>{{ t('Signing in…') }}</span>
          </div>
        </div>

        <p v-if="error" class="login__error" role="alert">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { MpSpinner } from '@mekari/pixel3'

const { t } = useLocale()
const { signInWithGoogle } = useAuth()
const config = useRuntimeConfig()

const clientId = (config.public.googleClientId as string) || ''
const isConfigured = computed(() => !!clientId)
const allowedDomain = 'mekari.com'

const btnEl = ref<HTMLElement | null>(null)
const error = ref('')
const signingIn = ref(false)

const GIS_SRC = 'https://accounts.google.com/gsi/client'

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
}

async function handleCredential(response: { credential?: string }) {
  if (!response?.credential) return
  error.value = ''
  signingIn.value = true
  try {
    await signInWithGoogle(response.credential)
    // Land in the app — a full reload guarantees every guard/composable re-reads
    // the now-authenticated session.
    window.location.reload()
  } catch (e: any) {
    error.value = e?.message || t('Login gagal. Coba lagi.')
    signingIn.value = false
  }
}

onMounted(async () => {
  if (!isConfigured.value) return
  try {
    await loadGis()
    const google = (window as any).google
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      // Soft hint to pre-select @mekari.com accounts; the server still enforces.
      hosted_domain: allowedDomain,
      auto_select: false,
      cancel_on_tap_outside: true,
    })
    if (btnEl.value) {
      google.accounts.id.renderButton(btnEl.value, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: 280,
      })
    }
  } catch {
    error.value = t('Tidak bisa memuat Google Sign-In. Periksa koneksi Anda.')
  }
})
</script>

<style scoped>
.login {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center; /* mobile/tablet: centered card */
  padding: var(--mp-spacing-6);
  /* Solid brand near-black on mobile/tablet (explicit brand request). */
  background: #07090a;
}

/* Desktop: product hero backdrop + card pushed right so it clears the laptop. */
@media (min-width: 1024px) {
  .login {
    justify-content: flex-end;
    padding-right: 9%;
    background: #07090a url('/login-bg.png') center / cover no-repeat;
  }
}

.login__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(400px, 100%);
  padding: var(--mp-spacing-8) var(--mp-spacing-8) var(--mp-spacing-6);
  background: var(--mp-colors-background-stage, #ffffff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-lg, 8px);
  text-align: center;
}

.login__logo {
  /* size comes from the img width/height attributes (asset dimensions) */
  margin-bottom: var(--mp-spacing-5);
}

.login__subtitle {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-colors-text-secondary, #3a4749);
  margin: 0 0 var(--mp-spacing-6);
}

.login__gbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-2);
  min-height: 44px;
}

.login__signing {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-colors-text-secondary, #3a4749);
}

.login__error {
  margin: var(--mp-spacing-4) 0 0;
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-colors-text-danger, #cf1f3c);
}

.login__notice {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-colors-text-secondary, #3a4749);
  background: var(--mp-colors-background-neutral, #f0f2f2);
  border-radius: var(--mp-radii-md, 6px);
}
</style>
