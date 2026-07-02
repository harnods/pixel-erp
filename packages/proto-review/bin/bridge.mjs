#!/usr/bin/env node
/**
 * proto-review bridge — a tiny LOCAL-ONLY HTTP server that lets the in-browser
 * "Fix with Claude" button spawn a headless Claude Code run against this repo.
 *
 * A browser page can't launch a CLI, so the Fix button POSTs the comment (plus
 * the element selector and page context the overlay already knows) here, and
 * this process runs `claude -p` in the project directory. The fix applies to
 * your working tree; your dev server hot-reloads it. No terminal window opens.
 *
 * Run it from your project root:  npx proto-review bridge
 * It only listens on localhost, so only your machine can reach it — which is
 * also why the Fix button only appears for whoever is running this.
 */
import { createServer } from 'node:http'
import { spawn, execSync } from 'node:child_process'

const PORT = Number(process.env.PROTO_REVIEW_BRIDGE_PORT) || 4319
const CWD = process.cwd()

const jobs = new Map() // id -> { state, result, changedFiles, error }
let seq = 0

function log(msg) {
  console.log(`[proto-review bridge] ${msg}`)
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Dev servers run on assorted localhost ports — allow any origin, but the
    // server itself only binds to loopback so this isn't a real exposure.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body == null ? '' : JSON.stringify(body))
}

function buildPrompt(d) {
  const replies = (d.replies ?? [])
    .map(r => `  - ${r.author}: ${r.body}`)
    .join('\n')
  return [
    `A reviewer left a comment on a UI prototype (Vue/Nuxt) and wants it fixed.`,
    ``,
    `Page: ${d.path || '(unknown)'}${d.title ? ` — ${d.title}` : ''}`,
    d.selector ? `Element commented on (CSS selector): ${d.selector}` : ``,
    d.contextText ? `Text near that element: "${d.contextText}"` : ``,
    ``,
    `Comment by ${d.author || 'a reviewer'}:`,
    `"${d.body}"`,
    replies ? `\nReplies:\n${replies}` : ``,
    ``,
    `Find the source responsible for that element/page and make the change the`,
    `comment asks for. Keep it minimal and focused on exactly what's requested.`,
  ]
    .filter(Boolean)
    .join('\n')
}

function runFix(id, prompt) {
  const job = jobs.get(id)
  // Hardening: comment text is untrusted (the Supabase table is public/no-auth),
  // so a malicious comment could try to smuggle instructions into this prompt.
  // We auto-approve *file edits* (acceptEdits) for a smooth prototype workflow,
  // but hard-disable Bash so an injected prompt can't run shell commands — the
  // worst case is an unwanted file edit, which shows up in `git diff` and can be
  // discarded. Review the diff before keeping a fix.
  const args = [
    '-p', prompt,
    '--permission-mode', 'acceptEdits',
    '--disallowedTools', 'Bash',
    '--output-format', 'json',
  ]
  let child
  try {
    child = spawn('claude', args, { cwd: CWD, shell: false })
  } catch (err) {
    job.state = 'error'
    job.error = String(err?.message || err)
    return
  }

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', d => { stdout += d })
  child.stderr.on('data', d => { stderr += d })

  child.on('error', err => {
    job.state = 'error'
    job.error =
      err?.code === 'ENOENT'
        ? 'The `claude` CLI was not found on PATH. Install Claude Code and try again.'
        : String(err?.message || err)
  })

  child.on('close', code => {
    if (job.state === 'error') return
    let summary = ''
    try {
      const parsed = JSON.parse(stdout)
      summary = parsed.result || parsed.text || ''
    } catch {
      summary = stdout.trim()
    }
    if (code !== 0 && !summary) {
      job.state = 'error'
      job.error = stderr.trim() || `claude exited with code ${code}`
      return
    }
    job.state = 'done'
    job.summary = summary.slice(0, 600)
    job.changedFiles = gitChangedFiles()
  })
}

function gitChangedFiles() {
  try {
    const out = execSync('git status --porcelain', { cwd: CWD }).toString()
    return out
      .split('\n')
      .map(l => l.slice(3).trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null)

  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, cwd: CWD })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
    const id = url.pathname.slice('/status/'.length)
    const job = jobs.get(id)
    if (!job) return send(res, 404, { error: 'unknown job' })
    return send(res, 200, job)
  }

  if (req.method === 'POST' && url.pathname === '/fix') {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      let data
      try {
        data = JSON.parse(raw || '{}')
      } catch {
        return send(res, 400, { error: 'invalid JSON' })
      }
      if (!data.body) return send(res, 400, { error: 'missing comment body' })

      const id = `job_${++seq}`
      jobs.set(id, { state: 'running', summary: '', changedFiles: [], error: null })
      log(`fixing: "${String(data.body).slice(0, 60)}"${data.path ? ` (${data.path})` : ''}`)
      runFix(id, buildPrompt(data))
      return send(res, 202, { jobId: id })
    })
    return
  }

  send(res, 404, { error: 'not found' })
})

// Bind to loopback only — never expose this to the network.
server.listen(PORT, '127.0.0.1', () => {
  log(`listening on http://localhost:${PORT}`)
  log(`project: ${CWD}`)
  log(`the "Fix with Claude" button in review mode will now work on this machine.`)
  log(`safety: Bash is disabled for fix runs; review "git diff" before keeping a fix.`)
})
