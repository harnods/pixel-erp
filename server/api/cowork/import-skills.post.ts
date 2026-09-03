/**
 * Cowork — import skills from a public Git repository (real fetch).
 *
 * We read the repo's whole file tree (GitHub Trees API, recursive) and pick out
 * Markdown skill files by convention, most-specific first:
 *   1) any `**​/SKILL.md`  (the Agent Skills convention — skill per folder)
 *   2) `.md` files under `skills/` or `.claude/skills/`
 *   3) top-level `.md` files (excluding README/LICENSE/etc.)
 * Each file is fetched raw and parsed into { name, description, module, markdown }.
 * Frontmatter (--- name/description/module ---) wins; otherwise the first `#`
 * heading (or the folder name for SKILL.md) and the first prose line. Nothing is
 * enabled — the caller previews the result and picks what to import.
 */
const MODULES = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production']
const SKIP_ROOT = /^(readme|license|licence|contributing|code_of_conduct|changelog|security)\.mdx?$/i

interface TreeItem { path: string; type: string }
interface ParsedSkill { name: string; description: string; module?: string; markdown: string; path: string }

function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = (input || '').trim().replace(/\.git$/, '').replace(/\/$/, '')
  const m = s.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i)
  return m ? { owner: m[1]!, repo: m[2]! } : null
}

function parseFrontmatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!m) return { fm: {}, body: md }
  const fm: Record<string, string> = {}
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) fm[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return { fm, body: md.slice(m[0]!.length) }
}

function titleFromPath(path: string): string {
  const parts = path.split('/')
  const file = parts[parts.length - 1]!
  const base = /^skill\.mdx?$/i.test(file) ? (parts[parts.length - 2] || file) : file
  return base.replace(/\.mdx?$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function toSkill(path: string, md: string): ParsedSkill {
  const { fm, body } = parseFrontmatter(md)
  const heading = body.split('\n').find((l) => l.startsWith('# '))?.replace(/^#\s*/, '').trim()
  const name = fm.name || heading || titleFromPath(path)
  const firstProse = body.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))?.trim()
  const description = (fm.description || firstProse || 'Imported skill').slice(0, 200)
  const moduleRaw = (fm.module || fm.category || '').trim()
  const module = MODULES.find((m) => m.toLowerCase() === moduleRaw.toLowerCase())
  return { name, description, module, markdown: md, path }
}

function pickSkillPaths(tree: TreeItem[]): string[] {
  const md = tree.filter((t) => t.type === 'blob' && /\.mdx?$/i.test(t.path))
  const skillMd = md.filter((t) => /(^|\/)skill\.mdx?$/i.test(t.path)).map((t) => t.path)
  if (skillMd.length) return skillMd
  const underSkills = md.filter((t) => /(^|\/)(\.claude\/)?skills\//i.test(t.path)).map((t) => t.path)
  if (underSkills.length) return underSkills
  return md.filter((t) => !t.path.includes('/') && !SKIP_ROOT.test(t.path)).map((t) => t.path)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ repo?: string }>(event)
  const parsed = parseRepo(body?.repo ?? '')
  if (!parsed) {
    setResponseStatus(event, 400)
    return { error: 'Enter a repository like https://github.com/owner/repo' }
  }
  const { owner, repo } = parsed
  // Optional token lifts the 60/hr unauthenticated GitHub limit to 5000/hr.
  const token = process.env.NUXT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ''
  const gh: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'mekari-cowork' }
  if (token) gh.Authorization = `Bearer ${token}`

  let branch = 'main'
  try {
    const info = await $fetch<{ default_branch?: string }>(`https://api.github.com/repos/${owner}/${repo}`, { headers: gh })
    if (info?.default_branch) branch = info.default_branch
  } catch (e: any) {
    const status = e?.response?.status || e?.statusCode
    if (status === 403) {
      setResponseStatus(event, 429)
      return { error: 'GitHub rate limit reached. Set a GITHUB_TOKEN on the server, or try again in a few minutes.' }
    }
    setResponseStatus(event, 404)
    return { error: `Repository ${owner}/${repo} not found or not public.` }
  }

  let tree: TreeItem[] = []
  try {
    const res = await $fetch<{ tree: TreeItem[]; truncated: boolean }>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: gh })
    tree = res.tree ?? []
  } catch {
    setResponseStatus(event, 502)
    return { error: 'Could not read the repository tree. Try again in a minute (GitHub rate limit).' }
  }

  const paths = pickSkillPaths(tree)
  if (!paths.length) {
    setResponseStatus(event, 404)
    return { error: `No Markdown skill files found in ${owner}/${repo} (looked for SKILL.md, skills/, .claude/skills/).` }
  }

  const CAP = 40
  const chosen = paths.slice(0, CAP)
  const skills: ParsedSkill[] = []
  for (const path of chosen) {
    try {
      const raw = await $fetch<string>(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`,
        { headers: { 'User-Agent': 'mekari-cowork' }, responseType: 'text' })
      skills.push(toSkill(path, raw))
    } catch { /* skip unreadable file */ }
  }
  if (!skills.length) {
    setResponseStatus(event, 502)
    return { error: 'Found skill files but could not read them. Check the repo is public.' }
  }
  return { repo: `${owner}/${repo}`, branch, count: skills.length, truncated: paths.length > CAP, skills }
})
