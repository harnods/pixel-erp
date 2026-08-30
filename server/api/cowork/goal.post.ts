/**
 * Cowork goal planner — turns an outcome the user states in chat into a judged,
 * costed plan: is this goal even feasible, what does it need connected, which
 * agents should work it (including ones the user never assigned), and which
 * scheduled tasks actually deliver it.
 *
 * The lead agent is expected to PUSH BACK. Three distinct verdicts:
 *   needs-input  — not measurable yet (no baseline, no deadline, or no data source)
 *   unrealistic  — the arithmetic does not work; `counter` says what would
 *   ok           — plan attached, ready to approve
 *
 * As everywhere else in Cowork the Gemini key stays server-side, and a
 * deterministic planner produces the same shaped answer when the key is missing
 * or the call fails — so the demo always tells the full story.
 */

interface AgentLite { id: string; name: string; role: string; module: string; description?: string; skills?: string[] }
interface ConnectionLite { id: string; name: string; connected: boolean; detail?: string }
interface HistoryItem { role: string; text: string }

const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'needs-input', 'unrealistic'] },
    message: { type: 'string', description: "What the lead agent says in chat, first person, same language as the user. State the reasoning and the numbers. Do NOT restate the plan as prose — the plan renders as a card." },
    questions: { type: 'array', items: { type: 'string' }, description: 'Only when needs-input: the specific facts you need before you can plan.' },
    counter: { type: 'string', description: 'Only when unrealistic: the goal you propose instead, concrete and numeric.' },
    goal: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short outcome title, max 60 chars' },
        metricName: { type: 'string' },
        metricUnit: { type: 'string' },
        baseline: { type: 'number' },
        target: { type: 'number' },
        direction: { type: 'string', enum: ['up', 'down'] },
        deadline: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        leadAgentId: { type: 'string', description: 'Agent id from the roster that owns this goal' },
        agentIds: { type: 'array', items: { type: 'string' }, description: 'Every agent id on the goal, lead included' },
        recruitedAgentIds: { type: 'array', items: { type: 'string' }, description: 'Agent ids you are adding that the user did NOT assign' },
        modules: { type: 'array', items: { type: 'string' } },
        approach: { type: 'string', description: 'How you intend to reach the target, 2-3 sentences' },
        assumptions: { type: 'array', items: { type: 'string' } },
        measurement: { type: 'string', description: 'Exactly how progress is read, and how often' },
        risks: { type: 'array', items: { type: 'string' } },
        workstreams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' }, title: { type: 'string' },
              rationale: { type: 'string', description: 'Why this strand is needed to hit the number' },
              agentId: { type: 'string' },
            },
            required: ['id', 'title', 'rationale', 'agentId'],
          },
        },
        connections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              connectionId: { type: 'string', description: 'id from the connections catalog' },
              why: { type: 'string' },
              required: { type: 'boolean', description: 'true when the goal cannot run without it' },
            },
            required: ['connectionId', 'why', 'required'],
          },
        },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              prompt: { type: 'string', description: 'The instruction the agent will actually run' },
              agentId: { type: 'string' },
              workstreamId: { type: 'string' },
              module: { type: 'string', enum: ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production'] },
              cadence: { type: 'string', enum: ['Daily', 'Weekly', 'Monthly'] },
              time: { type: 'string', description: 'HH:MM' },
            },
            required: ['title', 'prompt', 'agentId', 'workstreamId', 'module', 'cadence', 'time'],
          },
        },
      },
      required: ['title', 'leadAgentId', 'agentIds', 'recruitedAgentIds', 'approach', 'assumptions', 'measurement', 'workstreams', 'connections', 'tasks'],
    },
  },
  required: ['verdict', 'message'],
}

function buildPrompt(
  goal: string, assigned: string[], roster: AgentLite[], connections: ConnectionLite[],
  today: string, history: HistoryItem[], force: boolean, erp: string,
): string {
  const rosterTxt = roster.map((a) => `- ${a.id} · ${a.name} (${a.role}, ${a.module})${a.description ? ' — ' + a.description : ''}${a.skills?.length ? ' | skills: ' + a.skills.join(', ') : ''}`).join('\n')
  const connTxt = connections.map((c) => `- ${c.id} · ${c.name}${c.detail ? ' — ' + c.detail : ''} [${c.connected ? 'CONNECTED' : 'not connected'}]`).join('\n')
  const histTxt = history.slice(-10).map((h) => `${h.role === 'user' ? 'User' : 'You'}: ${h.text}`).join('\n')

  return `You are the lead Cowork agent inside Mekari ERP. The user has given you a GOAL — an outcome, not a task. Your job is to judge it honestly, then plan it.

TODAY: ${today}
THE GOAL (user's own words): "${goal}"
AGENTS THE USER ASSIGNED: ${assigned.length ? assigned.join(', ') : '(none — you choose the lead yourself)'}
${force ? 'The user has ALREADY seen your objection and told you to proceed anyway (or accepted your counter-proposal). Do not object again — return verdict "ok" with the best plan you can build, and note in `message` what you are assuming because of it.' : ''}

AGENT ROSTER (you may recruit ANY of these, not only the assigned ones):
${rosterTxt}

CONNECTIONS CATALOG (this is the ONLY set of tools that exist; use these ids verbatim):
${connTxt}

${erp ? `ERP DATA SNAPSHOT (real figures — use them for any in-ERP baseline):\n${erp}\n` : ''}
${histTxt ? `CONVERSATION SO FAR:\n${histTxt}\n` : ''}

JUDGE THE GOAL FIRST. Be the colleague who says the difficult thing, not the one who says yes:

1. "needs-input" — you cannot plan yet because the goal is not measurable. Use this when there is NO baseline you can read (the metric lives in a tool that is not connected, or the user never said the starting number), or no deadline, or the outcome is too vague to measure. Put the exact facts you need in \`questions\`. If the blocker is a missing tool, ALSO fill goal.connections with it so the user can connect it right there — the connection card renders from that.

2. "unrealistic" — the goal is measurable but the arithmetic does not work. SHOW THE ARITHMETIC in \`message\`: the absolute delta implied, the days available, and the rate that would require versus what is normal. Then put a concrete, numeric alternative in \`counter\` (a longer deadline, a smaller target, or the extra input — budget, headcount — that would make the original possible). Still attach your best \`goal\` plan so the user can accept the counter in one click.

3. "ok" — it holds up. Attach the plan.

WHEN YOU PLAN:
- Recruit the agents the work actually needs. If the assigned agents cannot cover a strand, add the right agent from the roster and list it in recruitedAgentIds — the user WANTS you to staff the goal yourself.
- Every workstream must be a distinct lever on the number, with a rationale that says why it moves it. No filler strands.
- Every task must belong to a workstream, be owned by an agent on the goal, and carry a real cadence — these become scheduled tasks.
- Only request connections from the catalog above. Mark \`required: true\` only when the goal genuinely cannot run without it.
- Ground any in-ERP baseline in the snapshot figures. Never invent a number you could have read.

WRITE \`message\` in the SAME LANGUAGE the user used. Be direct and specific; lead with the judgement, not with pleasantries. Never pad.`
}

// ── Deterministic planner (no API key / call failed) ──────────────────────────
// It has to carry the whole story on its own, so it parses the goal, reads which
// tools are connected, and applies the same three-verdict judgement.

interface Domain {
  key: string
  match: RegExp
  metricName: string
  unit: string
  direction: 'up' | 'down'
  modules: string[]
  lead: string
  /** Connection ids the metric is READ from — missing means no baseline. */
  sources: { id: string; why: string; required: boolean }[]
  /** Realistic movement per 30 days, as a fraction, without extra spend. */
  organicRate: number
  workstreams: { title: string; rationale: string; agent: string; tasks: { title: string; prompt: string; cadence: string; time: string }[] }[]
}

const DOMAINS: Domain[] = [
  {
    key: 'social',
    match: /(instagram|\big\b|follower|tiktok|sosmed|social|engagement|reels?|konten)/i,
    metricName: 'Instagram followers', unit: 'followers', direction: 'up',
    modules: ['CRM'], lead: 'marketing',
    sources: [
      { id: 'instagram', why: 'Read follower count, reach and post performance — this is where the number lives', required: true },
      { id: 'meta-business', why: 'Audience insights and paid reach, if we add budget', required: false },
    ],
    organicRate: 0.03,
    workstreams: [
      { title: 'Publish on a fixed cadence', agent: 'marketing', rationale: 'Follower growth tracks posting consistency more than any single post — an irregular feed cannot compound.',
        tasks: [
          { title: 'Plan the weekly content slate', prompt: 'Plan the coming week of Instagram content: 5 feed posts and 4 reels, each with a hook, format and the product or customer story behind it. Prioritise formats that earned the most reach in the last 30 days.', cadence: 'Weekly', time: '09:00' },
          { title: 'Publish and log daily posts', prompt: 'Publish the scheduled Instagram posts for today and log reach, saves and follows gained per post.', cadence: 'Daily', time: '07:30' },
        ] },
      { title: 'Turn existing customers into followers', agent: 'sales', rationale: 'The cheapest new followers are people who already buy — the customer base is an unworked audience.',
        tasks: [{ title: 'Invite customers to follow', prompt: 'Pull customers who ordered in the last 90 days and are not yet followers, and draft a short WhatsApp invite with a reason to follow (early access, restock alerts).', cadence: 'Weekly', time: '10:00' }] },
      { title: 'Reply to every comment and DM', agent: 'customer-support', rationale: 'Reply rate feeds distribution, and unanswered DMs quietly cost follows.',
        tasks: [{ title: 'Clear the comment and DM queue', prompt: 'Review all Instagram comments and DMs from the last 24 hours, draft replies, and flag anything that is a sales lead or a complaint.', cadence: 'Daily', time: '16:00' }] },
    ],
  },
  {
    key: 'receivables',
    match: /(piutang|receivable|overdue|jatuh tempo|collection|tagih|dso|cash ?flow)/i,
    metricName: 'Overdue receivables', unit: 'Rp', direction: 'down',
    modules: ['Finance', 'CRM'], lead: 'airene',
    sources: [
      { id: 'mekari-jurnal', why: 'Invoice status and outstanding balances', required: true },
      { id: 'mekari-qontak', why: 'Customer contacts and conversation history', required: false },
      { id: 'whatsapp', why: 'Reach customers on the channel they actually read', required: false },
    ],
    organicRate: 0.25,
    workstreams: [
      { title: 'Escalation ladder for silent accounts', agent: 'airene', rationale: 'Most of the balance is unresponsive rather than unwilling — a fixed ladder beats ad-hoc chasing.',
        tasks: [{ title: 'Run the weekly chase list', prompt: 'Rank every overdue invoice by value and days overdue, work out why each is unpaid, and draft the next escalation step for each account.', cadence: 'Weekly', time: '08:00' }] },
      { title: 'Clear disputed invoices at source', agent: 'sales', rationale: 'Disputed lines cannot be collected at all until Sales issues the credit note — chasing them wastes both sides.',
        tasks: [{ title: 'Resolve disputed lines', prompt: 'List overdue invoices flagged as disputed, identify the underlying delivery or pricing issue, and draft the credit note or correction needed to unblock payment.', cadence: 'Weekly', time: '09:00' }] },
      { title: 'Payment plans for cash-flow cases', agent: 'customer-support', rationale: 'Customers who intend to pay but cannot yet convert better with a plan than with more pressure.',
        tasks: [{ title: 'Offer instalment plans', prompt: 'Identify overdue accounts that have responded at least once and cite cash-flow, and draft a 3-instalment payment plan for each.', cadence: 'Weekly', time: '10:00' }] },
    ],
  },
  {
    key: 'stock',
    match: /(stok|stock|sku|inventor|gudang|warehouse|reorder|stockout|kehabisan)/i,
    metricName: 'Stockout incidents', unit: 'incidents', direction: 'down',
    modules: ['WMS', 'Sales'], lead: 'warehouse',
    sources: [{ id: 'mekari-jurnal', why: 'Purchase orders and supplier terms', required: true }],
    organicRate: 0.4,
    workstreams: [
      { title: 'Daily reorder-point sweep', agent: 'warehouse', rationale: 'Catches the drift a day before it becomes a stockout, which is the only time it is cheap to fix.',
        tasks: [{ title: 'Sweep SKUs below reorder point', prompt: 'List every SKU at or below its reorder point, weigh it against open purchase orders and supplier lead time, and raise the purchase requests needed.', cadence: 'Daily', time: '07:30' }] },
      { title: 'Protect at-risk outbound orders', agent: 'fulfillment', rationale: 'When a stockout is already baked in, the customer commitment still has to be re-planned.',
        tasks: [{ title: 'Re-plan at-risk orders', prompt: 'Find outbound orders that cannot be fulfilled in full from current stock and propose a split shipment or a new promise date for each.', cadence: 'Daily', time: '08:00' }] },
    ],
  },
  {
    key: 'pipeline',
    match: /(sales|penjualan|revenue|omzet|pipeline|deal|lead|closing|target jual)/i,
    metricName: 'Closed-won revenue', unit: 'Rp', direction: 'up',
    modules: ['CRM', 'Sales'], lead: 'sales',
    sources: [{ id: 'mekari-qontak', why: 'Pipeline, deal stages and activity history', required: true }],
    organicRate: 0.12,
    workstreams: [
      { title: 'Work the deals that can actually close', agent: 'sales', rationale: 'Late-stage deals convert at multiples of early-stage ones — the quarter is won there.',
        tasks: [{ title: 'Prioritise closeable deals', prompt: 'Rank open deals by value, stage and last activity, and draft the next concrete step for each of the top ten.', cadence: 'Weekly', time: '08:00' }] },
      { title: 'Revive stalled deals', agent: 'marketing', rationale: 'Stalled deals are already-paid-for demand; reviving them is cheaper than sourcing new leads.',
        tasks: [{ title: 'Re-engage stalled deals', prompt: 'Find deals with no activity for 14+ days and draft a re-engagement message tailored to why each stalled.', cadence: 'Weekly', time: '10:00' }] },
    ],
  },
  {
    key: 'hiring',
    match: /(hire|hiring|rekrut|recruit|karyawan|headcount|turnover|resign|attendance|absen)/i,
    metricName: 'Open roles filled', unit: 'roles', direction: 'up',
    modules: ['HR'], lead: 'recruitment',
    sources: [{ id: 'mekari-talenta', why: 'Headcount, contracts and attendance records', required: true }],
    organicRate: 0.3,
    workstreams: [
      { title: 'Move candidates through the pipeline', agent: 'recruitment', rationale: 'Time-to-hire is lost between stages, not inside them.',
        tasks: [{ title: 'Chase stalled candidates', prompt: 'List candidates who have sat in the same stage for more than 5 days and draft the next step for each.', cadence: 'Daily', time: '09:00' }] },
      { title: 'Keep the people we already have', agent: 'hr', rationale: 'A role that reopens costs more than one that never emptied.',
        tasks: [{ title: 'Flag retention risks', prompt: 'Review contracts expiring in 60 days and attendance patterns that signal disengagement, and flag who needs a conversation.', cadence: 'Weekly', time: '09:00' }] },
    ],
  },
]

const GENERIC: Domain = {
  key: 'generic', match: /.*/, metricName: 'Goal metric', unit: '', direction: 'up',
  modules: ['Finance'], lead: 'airene',
  sources: [{ id: 'mekari-jurnal', why: 'Business figures to measure against', required: false }],
  organicRate: 0.1,
  workstreams: [
    { title: 'Establish the baseline and cadence', agent: 'airene', rationale: 'Nothing can be steered until it is measured on a fixed rhythm.',
      tasks: [{ title: 'Report progress against the goal', prompt: 'Measure the goal metric, compare it with the baseline and the target pace, and flag whether we are on track.', cadence: 'Weekly', time: '08:00' }] },
  ],
}

/** "12.400", "12,400", "12400", "1.2M", "10%" → number. Indonesian and English separators. */
function parseNumber(raw: string): number | null {
  const m = /(\d[\d.,]*)\s*(jt|juta|rb|ribu|k|m|b)?/i.exec(raw)
  if (!m) return null
  let n = Number(m[1]!.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
  if (Number.isNaN(n)) return null
  const suf = (m[2] ?? '').toLowerCase()
  if (suf === 'k' || suf === 'rb' || suf === 'ribu') n *= 1_000
  if (suf === 'jt' || suf === 'juta') n *= 1_000_000
  if (suf === 'm') n *= 1_000_000
  if (suf === 'b') n *= 1_000_000_000
  return n
}

function endOfMonth(today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
  return d.toISOString().slice(0, 10)
}
function endOfQuarter(today: Date): string {
  const q = Math.floor(today.getUTCMonth() / 3)
  const d = new Date(Date.UTC(today.getUTCFullYear(), q * 3 + 3, 0))
  return d.toISOString().slice(0, 10)
}

function parseDeadline(text: string, today: Date): string | null {
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text)
  if (iso) return iso[1]!
  if (/(end of month|akhir bulan|bulan ini|this month)/i.test(text)) return endOfMonth(today)
  if (/(end of quarter|akhir kuartal|kuartal ini|this quarter|q[1-4])/i.test(text)) return endOfQuarter(today)
  if (/(end of week|akhir minggu|minggu ini|this week)/i.test(text)) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()))
    return d.toISOString().slice(0, 10)
  }
  if (/(end of year|akhir tahun|this year|tahun ini)/i.test(text)) return `${today.getUTCFullYear()}-12-31`
  const months = /(\d+)\s*(bulan|month)/i.exec(text)
  if (months) { const d = new Date(today); d.setUTCMonth(d.getUTCMonth() + Number(months[1])); return d.toISOString().slice(0, 10) }
  const weeks = /(\d+)\s*(minggu|week)/i.exec(text)
  if (weeks) { const d = new Date(today); d.setUTCDate(d.getUTCDate() + Number(weeks[1]) * 7); return d.toISOString().slice(0, 10) }
  return null
}

function fmt(n: number, unit: string): string {
  if (unit === 'Rp') return 'Rp' + (n >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(2) + 'B' : n >= 1_000_000 ? Math.round(n / 1_000_000) + 'M' : n.toLocaleString('en-US'))
  return n.toLocaleString('en-US') + (unit ? ' ' + unit : '')
}

/** True when the user is writing Indonesian — the reply must match. */
function isIndonesian(text: string): boolean {
  return /\b(saya|kamu|mau|naik|turun|bulan|minggu|akhir|gimana|bagaimana|tolong|bikin|buat|jadi|dari|target|tujuan|belum|sudah)\b/i.test(text)
}

function fallbackGoal(
  goalText: string, assigned: string[], roster: AgentLite[], connections: ConnectionLite[],
  todayIso: string, history: HistoryItem[], force: boolean,
) {
  const today = new Date(todayIso + 'T00:00:00Z')
  const all = [goalText, ...history.filter((h) => h.role === 'user').map((h) => h.text)].join(' ')
  const id = isIndonesian(all)
  const domain = DOMAINS.find((d) => d.match.test(all)) ?? GENERIC
  const has = (cid: string) => connections.find((c) => c.id === cid)?.connected === true
  const known = new Set(roster.map((a) => a.id))
  const pick = (a: string) => (known.has(a) ? a : (roster[0]?.id ?? 'airene'))

  const deadline = parseDeadline(all, today)
  const days = deadline ? Math.max(0, Math.round((new Date(deadline + 'T00:00:00Z').getTime() - today.getTime()) / 86_400_000)) : null

  const pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(all)
  const growth = pct ? Number(pct[1]!.replace(',', '.')) / 100 : null

  // A baseline is either stated by the user or readable from a connected source.
  const sourceMissing = domain.sources.filter((s) => s.required && !has(s.id))
  const statedNumbers = [goalText, ...history.filter((h) => h.role === 'user').map((h) => h.text)]
    .flatMap((t) => t.split(/[\s,]+/)).map(parseNumber)
    .filter((n): n is number => n !== null && n > 50 && !(pct && n === Number(pct[1]!.replace(',', '.'))))
  const baseline = statedNumbers.length ? statedNumbers[statedNumbers.length - 1]! : null

  const connectionsOut = domain.sources.map((s) => ({ connectionId: s.id, why: s.why, required: s.required }))

  // ── 1. needs-input — not measurable yet ────────────────────────────────────
  if (!force && (sourceMissing.length || baseline === null || !deadline)) {
    const questions: string[] = []
    const names = sourceMissing.map((s) => connections.find((c) => c.id === s.id)?.name ?? s.id)
    if (sourceMissing.length) {
      questions.push(id
        ? `Connect ${names.join(' dan ')} supaya saya bisa baca angkanya sendiri`
        : `Connect ${names.join(' and ')} so I can read the number myself`)
    }
    if (baseline === null) {
      questions.push(id
        ? `${domain.metricName} sekarang di angka berapa? Tanpa baseline, "naik ${growth ? Math.round(growth * 100) + '%' : 'sekian persen'}" tidak bisa diukur`
        : `What is ${domain.metricName.toLowerCase()} right now? Without a baseline there is nothing to measure "${growth ? Math.round(growth * 100) + '%' : 'a lift'}" against`)
    }
    if (!deadline) questions.push(id ? 'Kapan deadline-nya?' : 'What is the deadline?')

    const msg = id
      ? `Sebelum saya bikin plan, ini belum bisa diukur.\n\n${sourceMissing.length ? `Saya belum punya akses ke ${names.join(' dan ')}, jadi saya tidak bisa baca ${domain.metricName.toLowerCase()} sendiri — dan tidak bisa tahu apakah kita berhasil atau tidak.` : ''}${baseline === null ? ` Saya juga belum tahu angka sekarang.` : ''}${!deadline ? ` Deadline-nya juga belum jelas.` : ''}\n\nKasih saya ini dulu, baru saya susun rencananya.`
      : `Before I plan this, it is not measurable yet.\n\n${sourceMissing.length ? `I have no access to ${names.join(' and ')}, so I cannot read ${domain.metricName.toLowerCase()} myself — which means I cannot tell you whether we hit the target.` : ''}${baseline === null ? ` I also do not know where it stands today.` : ''}${!deadline ? ` And there is no deadline.` : ''}\n\nGive me these and I will put a plan together.`

    return { verdict: 'needs-input' as const, message: msg, questions, goal: { connections: connectionsOut, leadAgentId: pick(domain.lead) } }
  }

  const base = baseline ?? 1000
  const target = growth !== null
    ? (domain.direction === 'up' ? Math.round(base * (1 + growth)) : Math.round(base * (1 - growth)))
    : (domain.direction === 'up' ? Math.round(base * 1.1) : Math.round(base * 0.9))
  const delta = Math.abs(target - base)
  const dl = deadline ?? endOfMonth(today)
  const dleft = days ?? Math.max(1, Math.round((new Date(dl + 'T00:00:00Z').getTime() - today.getTime()) / 86_400_000))

  // ── 2. unrealistic — the arithmetic does not work ──────────────────────────
  const requiredRate = (growth ?? 0.1) * (30 / Math.max(1, dleft))   // normalised to a 30-day rate
  if (!force && requiredRate > domain.organicRate * 1.6) {
    const realistic = domain.organicRate * (dleft / 30)
    const realisticTarget = domain.direction === 'up'
      ? Math.round(base * (1 + realistic)) : Math.round(base * (1 - realistic))
    const neededDays = Math.ceil(((growth ?? 0.1) / domain.organicRate) * 30)
    const extendedDl = new Date(today.getTime() + neededDays * 86_400_000).toISOString().slice(0, 10)

    const msg = id
      ? `Saya bilang apa adanya: ini tidak realistis dengan cara organik.\n\n${Math.round((growth ?? 0.1) * 100)}% dari ${fmt(base, domain.unit)} berarti ${domain.direction === 'up' ? '+' : '−'}${fmt(delta, domain.unit)} dalam ${dleft} hari. Itu setara ${Math.round(requiredRate * 100)}% per 30 hari, sementara yang wajar tanpa tambahan budget sekitar ${Math.round(domain.organicRate * 100)}%.\n\nSaya tetap bisa jalan, tapi jangan berharap angkanya kekejar dari konten organik saja.`
      : `I will be straight with you: this is not realistic organically.\n\n${Math.round((growth ?? 0.1) * 100)}% of ${fmt(base, domain.unit)} means ${domain.direction === 'up' ? '+' : '−'}${fmt(delta, domain.unit)} in ${dleft} days. That is a ${Math.round(requiredRate * 100)}% move per 30 days, against roughly ${Math.round(domain.organicRate * 100)}% that is normal without extra spend.\n\nI can still run it, but do not expect the number to land on organic work alone.`

    const counter = id
      ? `Pilih salah satu: (a) target ${fmt(realisticTarget, domain.unit)} di tanggal ${dl} — realistis organik, atau (b) tetap ${fmt(target, domain.unit)} tapi deadline geser ke ${extendedDl}, atau (c) tetap ${fmt(target, domain.unit)} di ${dl} dengan tambahan paid budget — bilang angkanya, saya masukkan ke plan.`
      : `Pick one: (a) target ${fmt(realisticTarget, domain.unit)} by ${dl} — realistic organically, or (b) keep ${fmt(target, domain.unit)} and move the deadline to ${extendedDl}, or (c) keep ${fmt(target, domain.unit)} by ${dl} with paid budget on top — tell me the number and I will plan around it.`

    return {
      verdict: 'unrealistic' as const, message: msg, counter,
      goal: buildPlan(domain, roster, assigned, base, realisticTarget, dl, connectionsOut, pick, goalText),
    }
  }

  // ── 3. ok — it holds up ────────────────────────────────────────────────────
  const plan = buildPlan(domain, roster, assigned, base, target, dl, connectionsOut, pick, goalText)
  const recruited = plan.recruitedAgentIds.map((a) => roster.find((r) => r.id === a)?.name ?? a)
  const msg = id
    ? `Oke, ini bisa diukur dan masuk akal. ${domain.metricName} ${fmt(base, domain.unit)} → ${fmt(target, domain.unit)} dalam ${dleft} hari.\n\n${recruited.length ? `Saya tarik ${recruited.join(' dan ')} juga — satu agent tidak cukup untuk semua jalurnya.` : ''} Rencananya di bawah; kalau setuju saya buatkan task-nya sekalian dengan jadwalnya.`
    : `This is measurable and it holds up. ${domain.metricName} ${fmt(base, domain.unit)} → ${fmt(target, domain.unit)} in ${dleft} days.\n\n${recruited.length ? `I am bringing in ${recruited.join(' and ')} as well — one agent cannot cover every strand.` : ''} The plan is below; approve it and I will create the tasks with their schedules.`

  return { verdict: 'ok' as const, message: msg, goal: plan }
}

/** "Goal kamu: follower IG naik 10% by end of month" → "Follower IG naik 10% by
 *  end of month". The user's phrasing is kept verbatim on the goal's `outcome`;
 *  the title is the part that reads as a title. */
function cleanTitle(raw: string): string {
  let t = raw.trim()
    .replace(/^(goal|tujuan|target|objective)\s*(kamu|saya|kita|you|your)?\s*[:\-–]\s*/i, '')
    .replace(/^(saya\s+mau|saya\s+ingin|i\s+want|tolong)\s+/i, '')
    .trim()
  if (!t) t = raw.trim()
  t = t.charAt(0).toUpperCase() + t.slice(1)
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

function buildPlan(
  domain: Domain, roster: AgentLite[], assigned: string[],
  baseline: number, target: number, deadline: string,
  connectionsOut: { connectionId: string; why: string; required: boolean }[],
  pick: (a: string) => string, goalText: string,
) {
  const lead = pick(assigned[0] ?? domain.lead)
  const workstreams = domain.workstreams.map((w, i) => ({
    id: `ws-${i + 1}`, title: w.title, rationale: w.rationale, agentId: pick(w.agent),
  }))
  const agentIds = [...new Set([lead, ...assigned, ...workstreams.map((w) => w.agentId)])].filter((a) => a)
  const recruitedAgentIds = agentIds.filter((a) => a !== lead && !assigned.includes(a))
  const tasks = domain.workstreams.flatMap((w, i) =>
    w.tasks.map((t) => ({
      title: t.title, prompt: t.prompt, agentId: pick(w.agent), workstreamId: `ws-${i + 1}`,
      module: domain.modules[0]!, cadence: t.cadence, time: t.time,
    })))

  return {
    title: cleanTitle(goalText),
    metricName: domain.metricName, metricUnit: domain.unit,
    baseline, target, direction: domain.direction, deadline,
    leadAgentId: lead, agentIds, recruitedAgentIds, modules: domain.modules,
    approach: domain.workstreams.map((w) => w.title).join(' · ') + '. Each strand is a separate lever on the number, run on its own cadence so progress compounds rather than arriving in one push.',
    assumptions: [
      `The baseline of ${fmt(baseline, domain.unit)} is correct as of today`,
      'The connected tools stay authorised for the whole period',
      'No competing priority pulls the assigned agents off this goal',
    ],
    measurement: `${domain.metricName} read against the ${fmt(baseline, domain.unit)} baseline, checked on every scheduled run and rolled up weekly.`,
    risks: [
      'A single strand carrying the whole number if the others stall',
      'Deadline pressure pushing volume over quality near the end',
    ],
    workstreams, connections: connectionsOut, tasks,
  }
}

export default defineEventHandler(async (event) => {
  let goalText = ''
  let assigned: string[] = []
  let roster: AgentLite[] = []
  let connections: ConnectionLite[] = []
  let today = new Date().toISOString().slice(0, 10)
  let history: HistoryItem[] = []
  let force = false
  try {
    const body = await readBody<{
      goal?: string; assignedAgentIds?: string[]; roster?: AgentLite[]; connections?: ConnectionLite[]
      today?: string; history?: HistoryItem[]; force?: boolean; model?: string; context?: string
    }>(event)
    goalText = (body?.goal ?? '').trim()
    if (!goalText) { setResponseStatus(event, 400); return { error: 'Missing goal' } }
    assigned = body?.assignedAgentIds ?? []
    roster = body?.roster ?? []
    connections = body?.connections ?? []
    today = body?.today || today
    history = body?.history ?? []
    force = body?.force === true

    const config = useRuntimeConfig()
    const apiKey = config.geminiApiKey as string
    const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')
    if (!apiKey) return { ...fallbackGoal(goalText, assigned, roster, connections, today, history, force), source: 'fallback', reason: 'no-api-key' }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const payload = {
      contents: [{ parts: [{ text: buildPrompt(goalText, assigned, roster, connections, today, history, force, body?.context ?? '') }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.5 },
    }
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await $fetch<any>(url, { method: 'POST', body: payload, timeout: 45000 })
        const text: string | undefined = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
        if (!text) throw new Error('Empty model response')
        return { ...JSON.parse(text), source: 'gemini', model }
      } catch (err: any) {
        lastErr = err
        const status = err?.status ?? err?.statusCode ?? err?.response?.status
        const retryable = status === 429 || (typeof status === 'number' && status >= 500) || /overload|timeout|fetch failed/i.test(String(err?.message ?? ''))
        if (attempt < 2 && retryable) { await sleep(600 * (attempt + 1)); continue }
        break
      }
    }
    return { ...fallbackGoal(goalText, assigned, roster, connections, today, history, force), source: 'fallback', reason: String((lastErr as any)?.message ?? lastErr) }
  } catch (err: any) {
    return { ...fallbackGoal(goalText || 'Goal', assigned, roster, connections, today, history, force), source: 'fallback', reason: String(err?.message ?? err) }
  }
})
