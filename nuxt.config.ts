// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: "app/",
  ssr: false,
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  devServer: { port: Number(process.env.PORT) || 4321 },

  // Server-only secret for the Cowork (AI) feature. Value comes from
  // NUXT_GEMINI_API_KEY in .env.local (gitignored) — never hardcoded/committed.
  // It's exposed ONLY to server routes (server/api/*), not the client bundle.
  runtimeConfig: {
    geminiApiKey: "",
    geminiModel: "gemini-flash-latest",
    public: {
      // Google OAuth (client-side, Google Identity Services) for the real Cowork
      // connections (Calendar / Gmail / Contacts). Public client ID — safe to
      // expose; set NUXT_PUBLIC_GOOGLE_CLIENT_ID in .env. Empty = not configured.
      googleClientId: "",
    },
  },

  app: {
    head: {
      title: "Mekari ERP",
      link: [{ rel: "icon", type: "image/svg+xml", href: "/mekari-brand.svg" }]
    }
  },

  build: {
    transpile: ['@ds/proto-review'],
  },

  css: [
    // pixel.css is the sole Panda root — PostCSS injects all generated CSS here,
    // starting with the @layer order declaration. erp.css comes after so every
    // override (unlayered and @layer pixel_reset) lands after the Panda rules.
    "@/assets/css/pixel.css",
    "@/assets/css/erp.css",
    // Shared chrome for the full-bleed CRM list pages (title bar/filter/table/tags).
    "@/assets/css/crm-page.css",
  ],
  postcss: {
    plugins: {
      "@mekari/pixel3-postcss": {}
    }
  },
  vite: {
    optimizeDeps: {
      // Pre-bundle everything up front. If Vite discovers a dep at RUNTIME instead
      // (e.g. @supabase/supabase-js pulled via proto-review, or the devtools client),
      // it re-optimizes mid-session — which swaps Pixel3's module identity and makes
      // its popover/tooltip directives read undefined state on unmount ("Cannot read
      // properties of undefined (reading 'show')" → 500). Listing them here avoids that.
      // jspdf / jspdf-autotable / bwip-js are heavy CJS libs pulled in lazily by the
      // PDF-export and barcode features. If they're NOT listed here, Vite discovers
      // them at runtime the first time such a feature loads, re-optimizes deps, and
      // triggers a full page reload — which races Panda's non-atomic pixel.css regen
      // and empties the stylesheet (the whole app renders unstyled). Pre-bundling them
      // up front means Vite never re-optimizes mid-session, so that race can't happen.
      include: [
        '@mekari/pixel3', '@vue/devtools-core', '@vue/devtools-kit', '@supabase/supabase-js',
        'jspdf', 'jspdf-autotable', 'bwip-js',
      ],
    },
    css: {
      devSourcemap: false,
    },
    plugins: [
      (() => {
        // Panda's regeneration of pixel.css isn't atomic — several source-file
        // saves in quick succession (e.g. a script reverting+restoring a file,
        // or a burst of edits) can fire this hook again before the previous
        // regeneration pass finished writing, so a full-reload can fire against
        // a half-written file and leave the browser looking broken until a full
        // dev-server restart. Debounce: only reload once no further pixel.css
        // write lands within the window, so we always reload against the
        // settled, complete file instead of a mid-write snapshot.
        let cssReloadTimer: ReturnType<typeof setTimeout> | undefined
        return {
          name: 'global-css-full-reload',
          handleHotUpdate({ file, server }: { file: string; server: any }) {
            // Global CSS changes → full reload to preserve @layer order
            if (file.includes('/assets/css/')) {
              if (cssReloadTimer) clearTimeout(cssReloadTimer)
              cssReloadTimer = setTimeout(() => {
                cssReloadTimer = undefined
                server.ws.send({ type: 'full-reload' })
              }, 300)
              return []
            }
          },
        }
      })(),
    ],
  }
});
