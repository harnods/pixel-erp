#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CWD = process.cwd()

// Shared Supabase project used by all proto-review prototypes by default.
// Anyone can override supabaseUrl/supabaseKey in the generated plugin file
// if they want a dedicated Supabase project instead.
const DEFAULT_SUPABASE_URL = 'https://qrthwxfszucewlezpqoo.supabase.co'
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFydGh3eGZzenVjZXdsZXpwcW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDMyMzksImV4cCI6MjA5ODQ3OTIzOX0.NsoOjiwIRyRNHPjwSjF9A0Kcq7iWrntb-5RiUfLLUds'

function log(msg) {
  console.log(`[proto-review] ${msg}`)
}

function findFirst(paths) {
  return paths.find(p => existsSync(join(CWD, p)))
}

function inferProjectId() {
  try {
    const pkg = JSON.parse(readFileSync(join(CWD, 'package.json'), 'utf8'))
    return pkg.name || 'my-prototype'
  } catch {
    return 'my-prototype'
  }
}

function run() {
  if (process.argv[2] !== 'init') {
    console.log('Usage: npx proto-review init')
    process.exit(1)
  }

  // 1. Nuxt build.transpile
  const nuxtConfigPath = findFirst(['nuxt.config.ts', 'nuxt.config.js'])
  if (nuxtConfigPath) {
    const full = join(CWD, nuxtConfigPath)
    const src = readFileSync(full, 'utf8')
    if (src.includes('@ds/proto-review')) {
      log(`${nuxtConfigPath} already references @ds/proto-review — skipping.`)
    } else if (/build\s*:\s*\{\s*transpile\s*:\s*\[/.test(src)) {
      const patched = src.replace(
        /(build\s*:\s*\{\s*transpile\s*:\s*\[)/,
        `$1'@ds/proto-review', `
      )
      writeFileSync(full, patched)
      log(`Added '@ds/proto-review' to the existing build.transpile in ${nuxtConfigPath}.`)
    } else if (/export default defineNuxtConfig\(\{/.test(src)) {
      const patched = src.replace(
        /export default defineNuxtConfig\(\{/,
        `export default defineNuxtConfig({\n  build: { transpile: ['@ds/proto-review'] },`
      )
      writeFileSync(full, patched)
      log(`Added build.transpile to ${nuxtConfigPath}.`)
    } else {
      log(
        `Could not safely auto-patch ${nuxtConfigPath}. Add this manually:\n` +
        `  build: { transpile: ['@ds/proto-review'] }`
      )
    }
  } else {
    log('No nuxt.config.ts/js found — skipping (not a Nuxt project, or run this from the project root).')
  }

  // 2. Plugin file
  const pluginDir = existsSync(join(CWD, 'app/plugins')) ? 'app/plugins' : 'plugins'
  const pluginPath = join(CWD, pluginDir, 'proto-review.client.ts')
  if (existsSync(pluginPath)) {
    log(`${pluginDir}/proto-review.client.ts already exists — skipping.`)
  } else {
    mkdirSync(dirname(pluginPath), { recursive: true })
    const projectId = inferProjectId()
    writeFileSync(
      pluginPath,
      `import { createProtoReview } from '@ds/proto-review'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(
    createProtoReview({
      // Shared Supabase project used by all proto-review prototypes.
      // Override these if you want a dedicated Supabase project instead.
      supabaseUrl: '${DEFAULT_SUPABASE_URL}',
      supabaseKey: '${DEFAULT_SUPABASE_KEY}',
      projectId: '${projectId}', // TODO: confirm this is unique among your prototypes
    })
  )
})
`
    )
    log(`Created ${pluginDir}/proto-review.client.ts (projectId: "${projectId}").`)
  }

  // 3. Mount <ProtoReviewOverlay />
  const appVuePath = findFirst(['app/app.vue', 'App.vue', 'src/App.vue'])
  if (!appVuePath) {
    log('Could not find app.vue/App.vue — add <ProtoReviewOverlay /> to your root component manually.')
  } else {
    const full = join(CWD, appVuePath)
    const src = readFileSync(full, 'utf8')
    if (src.includes('ProtoReviewOverlay')) {
      log(`${appVuePath} already mounts <ProtoReviewOverlay /> — skipping.`)
    } else if (src.includes('</template>')) {
      const patched = src.replace('</template>', '  <ProtoReviewOverlay />\n</template>')
      writeFileSync(full, patched)
      log(`Added <ProtoReviewOverlay /> to ${appVuePath}.`)
    } else {
      log(`Could not find </template> in ${appVuePath} — add <ProtoReviewOverlay /> manually.`)
    }
  }

  log('Done. Start your dev server, then open any page with ?review, or wire useReviewMode() into your own menu.')
}

run()
