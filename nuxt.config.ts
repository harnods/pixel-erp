// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: "app/",
  ssr: false,
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  devServer: { port: 4321 },

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
  ],
  postcss: {
    plugins: {
      "@mekari/pixel3-postcss": {}
    }
  },
  vite: {
    optimizeDeps: {
      include: ['@mekari/pixel3'],
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
