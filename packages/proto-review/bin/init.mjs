#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { createInterface } from 'node:readline'

const CWD = process.cwd()

// Shared Supabase project used by all proto-review prototypes by default.
// Anyone can override supabaseUrl/supabaseKey in the generated plugin file
// if they want a dedicated Supabase project instead.
const DEFAULT_SUPABASE_URL = 'https://qrthwxfszucewlezpqoo.supabase.co'
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFydGh3eGZzenVjZXdsZXpwcW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDMyMzksImV4cCI6MjA5ODQ3OTIzOX0.NsoOjiwIRyRNHPjwSjF9A0Kcq7iWrntb-5RiUfLLUds'

const IGNORE_DIRS = new Set(['node_modules', '.git', '.nuxt', '.output', 'dist', '.vercel'])
const MENU_HINT_RE = /sign[\s_.-]?out|logout|log[\s_.-]?out/i
const AVATAR_HINT_RE = /MpAvatar|MpPopover|UserMenu|AccountMenu|ProfileMenu/

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

/** Best-effort scan for a likely user/account menu component — a .vue file
 *  that mentions both a sign-out action and an avatar/popover/menu pattern.
 *  Capped so it can't run away on a huge repo. */
function findMenuCandidates() {
  const candidates = []
  let visited = 0

  function walk(dir) {
    if (candidates.length >= 5 || visited > 4000) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (candidates.length >= 5 || visited > 4000) return
      if (IGNORE_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      visited++
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.vue')) {
        try {
          const src = readFileSync(full, 'utf8')
          if (MENU_HINT_RE.test(src) && AVATAR_HINT_RE.test(src)) {
            candidates.push(relative(CWD, full))
          }
        } catch {
          /* unreadable file, skip */
        }
      }
    }
  }

  walk(CWD)
  return candidates
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function menuSnippet(filePath) {
  return `
Add the Review mode toggle to ${filePath}:

  1. Import and call the composable near your other setup code:

     import { useReviewMode } from '@ds/proto-review'
     const { isReviewMode, toggleReviewMode } = useReviewMode()

  2. Add a row/button next to your other menu items (e.g. next to Sign out):

     <button type="button" @click="toggleReviewMode">
       Review mode <span v-if="isReviewMode">On</span>
     </button>
`
}

async function resolveShowLauncher() {
  if (!process.stdin.isTTY) {
    log('Non-interactive shell — defaulting to the floating "Review" button (showLauncher: true).')
    log('Re-run `npx proto-review init` in a real terminal to be asked about wiring an existing user menu instead.')
    return true
  }

  const candidates = findMenuCandidates()
  if (candidates.length) {
    log('Found what looks like an existing user/account menu:')
    candidates.forEach(c => console.log(`  - ${c}`))
  }

  const defaultYes = candidates.length > 0
  const promptSuffix = defaultYes ? '(Y/n)' : '(y/N)'
  const answer = await ask(
    `[proto-review] Add the Review mode toggle to an existing user menu instead of a floating button? ${promptSuffix} `
  )
  const wantsMenu = answer === '' ? defaultYes : /^y/i.test(answer)

  if (!wantsMenu) {
    return true // showLauncher: true — floating button, no menu to wire into
  }

  const defaultPath = candidates[0] ?? ''
  const pathAnswer = await ask(
    `[proto-review] Path to that file${defaultPath ? ` [${defaultPath}]` : ''}: `
  )
  const chosenPath = pathAnswer || defaultPath

  if (!chosenPath || !existsSync(join(CWD, chosenPath))) {
    log(`Could not find "${chosenPath}" — falling back to the floating button. Run init again once you know the path.`)
    return true
  }

  console.log(menuSnippet(chosenPath))
  return false // showLauncher: false — user menu will host the toggle
}

async function run() {
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

  // 2. Plugin file — asks whether to wire into an existing user menu first,
  // since that decides the showLauncher value baked into the generated file.
  const pluginDir = existsSync(join(CWD, 'app/plugins')) ? 'app/plugins' : 'plugins'
  const pluginPath = join(CWD, pluginDir, 'proto-review.client.ts')
  if (existsSync(pluginPath)) {
    log(`${pluginDir}/proto-review.client.ts already exists — skipping.`)
  } else {
    const showLauncher = await resolveShowLauncher()
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
      showLauncher: ${showLauncher}, // ${showLauncher ? 'no user menu wired — floating button shows the toggle' : 'toggle lives in your user menu instead, see the snippet init printed above'}
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

  log('Done. Start your dev server, then open any page with ?review, or use the toggle you just wired up.')
}

run()
