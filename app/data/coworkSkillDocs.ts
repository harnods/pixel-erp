/**
 * Rich SKILL.md content for the built-in Cowork skills — authored exactly like a
 * Claude skill: a folder with SKILL.md + references/ + scripts/. These docs are
 * static (not persisted); the Skill detail page looks them up by skill id and
 * renders the markdown read-only. Custom skills carry their own markdown instead.
 */
export interface SkillFile { name: string; content: string }
export interface SkillDoc { markdown: string; references: SkillFile[]; scripts: SkillFile[] }

interface DocSpec {
  tier?: string
  purpose: string
  whenToUse: string
  workflow: string[]
  table?: { headers: string[]; rows: string[][] }
  example?: { lang: string; code: string }
  rules?: string[]
  actions: string[]
  references: SkillFile[]
  scripts: SkillFile[]
}

function fm(name: string, description: string, tier: string): string {
  return ['---', `name: ${name}`, `description: "${description}"`, `tier: ${tier}`, '---'].join('\n')
}

function table(t: { headers: string[]; rows: string[][] }): string {
  const head = `| ${t.headers.join(' | ')} |`
  const sep = `| ${t.headers.map(() => '---').join(' | ')} |`
  const rows = t.rows.map((r) => `| ${r.join(' | ')} |`)
  return [head, sep, ...rows].join('\n')
}

function buildMd(name: string, description: string, d: DocSpec): string {
  const out: string[] = []
  out.push(fm(name, description, d.tier ?? 'standard'))
  out.push('')
  out.push(`# ${name}`)
  out.push('')
  out.push(d.purpose)
  out.push('')
  out.push('## When to use this skill')
  out.push(d.whenToUse)
  if (d.table) {
    out.push('')
    out.push('## Data sources')
    out.push(table(d.table))
  }
  out.push('')
  out.push('## Workflow')
  d.workflow.forEach((w, i) => out.push(`${i + 1}. ${w}`))
  if (d.example) {
    out.push('')
    out.push('## Example')
    out.push('```' + d.example.lang)
    out.push(d.example.code)
    out.push('```')
  }
  if (d.rules?.length) {
    out.push('')
    out.push('## Execution rules')
    d.rules.forEach((r, i) => out.push(`${i + 1}. ${r}`))
  }
  out.push('')
  out.push('## Actions')
  d.actions.forEach((a) => out.push(`- ${a}`))
  out.push('')
  out.push('## References')
  out.push('Reference files list the confirmed operations and data this skill relies on:')
  d.references.forEach((r) => out.push(`- \`${r.name}\``))
  return out.join('\n')
}

const SPECS: Record<string, { name: string; description: string; spec: DocSpec }> = {
  'hr-reprimand': {
    name: 'Send HR notices',
    description: 'Draft and send a reprimand or note to a chronically-late employee and their manager.',
    spec: {
      tier: 'premium',
      purpose: 'Turns attendance exceptions from Talenta into a fair, documented HR notice — a reprimand or a note — addressed to the employee and copied to their manager. It separates recurring patterns from one-offs and weighs context (probation, tenure, work-related reasons) before escalating.',
      whenToUse: 'Use when an employee crosses an attendance threshold — e.g. **3+ late clock-ins in a month**, an unapproved absence, or a recurring missing check-out. Ground every figure in `Talenta/attendance` before drafting. Never issue a notice on a single isolated exception.',
      table: {
        headers: ['Trigger', 'Notice type', 'Recipient'],
        rows: [
          ['3+ late clock-ins / month', 'Reprimand', 'Employee + manager'],
          ['Unapproved absence', 'Reprimand', 'Employee + manager + HRBP'],
          ['Recurring missing check-out', 'Note', 'Employee'],
          ['System/device outage', 'No action', '— (log only)'],
        ],
      },
      workflow: [
        'Pull the month\'s attendance exceptions for the employee from Talenta.',
        'Classify each: recurring pattern vs one-off; work-related vs avoidable.',
        'If the threshold is met, draft the notice citing the exact dates and counts.',
        'Route to the employee and copy the manager (and HRBP for unapproved absence).',
        'Log the notice against the employee record for the review trail.',
      ],
      example: {
        lang: 'Plain Text',
        code: '"Send a reprimand to employees late 3+ times this month"\n→ Talenta/get_attendance_exceptions (month=current)\n→ classify recurring vs one-off\n→ draft reprimand citing dates\n→ Talenta/send_notice (to=employee, cc=manager)',
      },
      rules: [
        'Cite exact dates and counts — never "several times".',
        'Exclude device/system outages confirmed by facilities.',
        'On probation → escalate to the manager before the probation review.',
      ],
      actions: ['Draft reprimand', 'Send reprimand'],
      references: [
        { name: 'attendance-thresholds.md', content: '# Attendance thresholds\n\n- Late clock-in: after 09:00 shift start.\n- Reprimand trigger: 3+ late clock-ins in a calendar month.\n- Unapproved absence: no clock-in and no leave request filed.\n- Missing check-out: no clock-out badge event; excluded if a device outage is confirmed.' },
        { name: 'notice-templates.md', content: '# Notice templates\n\n## Reprimand\nFormal, firm-but-fair. States the policy, the observed pattern (with dates), the expectation, and the consequence of continuation.\n\n## Note\nLighter reminder for low-concern, non-recurring issues.' },
      ],
      scripts: [
        { name: 'summarise_attendance.py', content: 'import sys\nsys.path.append("/opt/.sandbox-runtime")\nfrom talenta_api import ApiClient\n\nclient = ApiClient()\n# summarise_attendance.py --employee EMP-0006 --month current\n# → returns exception counts grouped by type for the reprimand draft.' },
      ],
    },
  },
  'payment-reminder': {
    name: 'Chase payments',
    description: 'Draft and send payment reminders to overdue customers, prioritised by exposure and risk.',
    spec: {
      tier: 'premium',
      purpose: 'Identifies unpaid invoices past their due date in Jurnal, ranks them by cash impact and risk, and drafts firm-but-polite reminders. Prioritises the biggest exposures first and never invents balances.',
      whenToUse: 'Use for collections runs and whenever the user asks who is overdue and why. Always ground figures in `Jurnal/receivables` — never estimate an amount or a days-overdue count.',
      table: {
        headers: ['Days overdue', 'Tone', 'Channel'],
        rows: [
          ['1–14', 'Gentle reminder', 'Email'],
          ['15–45', 'Firm reminder', 'Email + WhatsApp'],
          ['46+', 'Final notice', 'Phone + Email'],
        ],
      },
      workflow: [
        'Fetch overdue receivables from Jurnal, sorted by amount and days overdue.',
        'Group by customer; note prior payment behaviour and any promise-to-pay.',
        'Draft a reminder matched to the overdue bucket (tone + channel).',
        'Send on approval, or queue for the collections owner.',
      ],
      example: {
        lang: 'Plain Text',
        code: '"Which customers are overdue and why?"\n→ Jurnal/get_overdue_receivables (sort=amount desc)\n→ group by customer + attach last contact\n→ draft reminder per bucket\n→ Jurnal/send_reminder (channel by days overdue)',
      },
      rules: [
        'Never invent balances — every figure comes from Jurnal.',
        'Cite invoice number, amount, and due date in every reminder.',
        'Respect an active promise-to-pay date before escalating.',
      ],
      actions: ['Draft reminder', 'Send reminder'],
      references: [
        { name: 'collections-policy.md', content: '# Collections policy\n\nReminder cadence by days overdue: 1–14 gentle (email), 15–45 firm (email + WhatsApp), 46+ final (phone + email). Always honour a recorded promise-to-pay.' },
        { name: 'jurnal-api-reference.md', content: '# Jurnal API (receivables)\n\n- `get_overdue_receivables` — unpaid invoices past due date.\n- `send_reminder` — dispatch a reminder via email/WhatsApp.\n- Cite `invoice_number`, `amount`, `due_date`.' },
      ],
      scripts: [
        { name: 'rank_overdue.py', content: 'import sys\nsys.path.append("/opt/.sandbox-runtime")\nfrom jurnal_api import ApiClient\n\nclient = ApiClient()\n# rank_overdue.py → returns overdue invoices ranked by amount × risk.' },
      ],
    },
  },
  'send-invoice': {
    name: 'Send sales invoices',
    description: 'Issue a sales invoice to a customer and email it out.',
    spec: {
      purpose: 'Creates a sales invoice from an order or a manual request in Jurnal and emails it to the customer contact, with the correct terms and due date.',
      whenToUse: 'Use when an order is ready to bill or the user asks to invoice a customer. Pull line items and pricing from the source order; never hand-type amounts.',
      workflow: [
        'Resolve the customer and the source order (or the requested line items).',
        'Build the invoice with agreed pricing, tax, and payment terms.',
        'Draft for review, then issue and email to the customer contact.',
      ],
      example: {
        lang: 'Plain Text',
        code: '"Invoice PT Kopi Kita for order SO-1042"\n→ Sales/get_order (SO-1042)\n→ Jurnal/create_invoice (from order)\n→ Jurnal/send_invoice (to=customer contact)',
      },
      actions: ['Draft invoice', 'Send invoice'],
      references: [
        { name: 'invoice-terms.md', content: '# Invoice terms\n\nDefault net-30 unless the customer has a negotiated term. Tax follows the product tax class. Always attach the PDF and the payment link.' },
      ],
      scripts: [
        { name: 'build_invoice.py', content: 'import sys\nsys.path.append("/opt/.sandbox-runtime")\nfrom jurnal_api import ApiClient\n\nclient = ApiClient()\n# build_invoice.py --order SO-1042' },
      ],
    },
  },
  'purchase-request': {
    name: 'Raise purchase requests',
    description: 'Create a purchase request for low-stock or shortage SKUs.',
    spec: {
      purpose: 'Compares warehouse on-hand stock against reorder points in Mekari WMS and drafts a purchase request for everything below the line, choosing the right vendor and quantity.',
      whenToUse: 'Use when SKUs fall below their reorder point or a shortage is flagged. Ground on-hand and reorder figures in `WMS/inventory`.',
      table: {
        headers: ['Condition', 'Action'],
        rows: [
          ['On-hand = 0', 'Urgent PR — expedite'],
          ['On-hand < reorder point', 'Standard PR to reorder level'],
          ['Lead time > 7 days', 'Order early with buffer'],
        ],
      },
      workflow: [
        'Pull on-hand vs reorder point for the flagged SKUs from WMS.',
        'Compute the order quantity to bring each back above reorder level.',
        'Pick the preferred vendor and draft the purchase request.',
        'Submit for approval.',
      ],
      actions: ['Create purchase request'],
      references: [
        { name: 'reorder-rules.md', content: '# Reorder rules\n\nOrder quantity = reorder level − on-hand + safety stock. Prefer the vendor with the shortest lead time when a SKU is at zero.' },
      ],
      scripts: [
        { name: 'low_stock.py', content: 'import sys\nsys.path.append("/opt/.sandbox-runtime")\nfrom wms_api import ApiClient\n\nclient = ApiClient()\n# low_stock.py → SKUs below reorder point with suggested order qty.' },
      ],
    },
  },
  'crm-followup': {
    name: 'Draft CRM follow-ups',
    description: 'Write personalised follow-up messages and open deals in CRM.',
    spec: {
      purpose: 'Reviews the sales pipeline in Qontak, spots stalled deals, and drafts concise, personalised outreach that moves each deal to its next stage.',
      whenToUse: 'Use for pipeline reviews and whenever a deal has gone quiet. Reference the deal stage, value, and last activity from `Qontak/deals`.',
      workflow: [
        'Pull open deals ranked by value and momentum from Qontak.',
        'Flag deals with no activity in the last 7–14 days.',
        'Draft a personalised follow-up referencing the last touchpoint.',
        'Open the deal in CRM or queue the message for the owner.',
      ],
      actions: ['Draft follow-up', 'Open in CRM'],
      references: [
        { name: 'outreach-tone.md', content: '# Outreach tone\n\nConcise, specific, and value-led. Reference the last conversation, propose one clear next step, and keep it under 120 words.' },
      ],
      scripts: [
        { name: 'stalled_deals.py', content: 'import sys\nsys.path.append("/opt/.sandbox-runtime")\nfrom qontak_api import ApiClient\n\nclient = ApiClient()\n# stalled_deals.py → open deals with no activity in N days.' },
      ],
    },
  },
  'contract-review': {
    name: 'Review contracts',
    description: 'Flag employee contracts for renewal, conversion or offboarding.',
    spec: {
      purpose: 'Scans employee contracts in Talenta for upcoming milestones — expiry, probation end, conversion to permanent — and produces a prioritised action list.',
      whenToUse: 'Use for periodic contract reviews or when a contract milestone is within 60 days.',
      workflow: [
        'List contracts with a milestone in the next 60 days from Talenta.',
        'Classify each: renew, convert, or offboard.',
        'Draft the recommended action for the manager and HRBP.',
      ],
      actions: ['Review contract'],
      references: [
        { name: 'contract-milestones.md', content: '# Contract milestones\n\nProbation end, fixed-term expiry, and conversion-to-permanent windows. Flag 60 days ahead.' },
      ],
      scripts: [],
    },
  },
  'work-order': {
    name: 'Create work orders',
    description: 'Open a production work order for a bill of materials.',
    spec: {
      purpose: 'Creates a production work order from a BOM in Mekari WMS, reserving the input materials and scheduling the run.',
      whenToUse: 'Use when a production run is needed to meet demand or replenish finished-goods stock.',
      workflow: [
        'Select the BOM and target output quantity.',
        'Check input material availability; flag shortages.',
        'Create the work order and schedule it.',
      ],
      actions: ['Create work order'],
      references: [
        { name: 'bom-reference.md', content: '# BOM reference\n\nEach finished good maps to a bill of materials with input SKUs and quantities per unit.' },
      ],
      scripts: [],
    },
  },
  'journal': {
    name: 'Work in finance',
    description: 'Open invoices, bills and journals for review or posting.',
    spec: {
      purpose: 'Opens the right finance record in Jurnal — invoice, bill, or journal entry — for review or posting, with the relevant context attached.',
      whenToUse: 'Use to jump into a specific finance document from a recommendation or a task result.',
      workflow: [
        'Resolve the document reference.',
        'Open it in Jurnal in the correct state (draft/review/post).',
      ],
      actions: ['Open in finance'],
      references: [],
      scripts: [],
    },
  },
  'create-task': {
    name: 'Create follow-up tasks',
    description: 'Turn any recommendation into a tracked task with an owner.',
    spec: {
      purpose: 'Converts a recommendation or action item into a tracked Cowork task with an owner, due date, and the source context attached.',
      whenToUse: 'Use to make any insight actionable and accountable.',
      workflow: [
        'Capture the recommendation as a task title + description.',
        'Assign an owner and a due date.',
        'Create the task so it appears in the Tasks list.',
      ],
      actions: ['Create task'],
      references: [],
      scripts: [],
    },
  },
  'send-email': {
    name: 'Send email',
    description: 'Compose and send an email on your behalf.',
    spec: {
      purpose: 'Composes and sends an email through the connected mail provider, grounded on the task context so the content is accurate.',
      whenToUse: 'Use when a task result should be communicated by email.',
      workflow: [
        'Draft the email from the task context.',
        'Confirm recipients and send.',
      ],
      actions: ['Send email'],
      references: [],
      scripts: [],
    },
  },
  'stock-count': {
    name: 'Schedule stock counts',
    description: 'Create a cycle or stock count task for a location.',
    spec: {
      purpose: 'Creates a cycle-count or full stock-count task for a warehouse location in Mekari WMS, choosing the SKUs by count policy.',
      whenToUse: 'Use for periodic cycle counts or when stock accuracy is in doubt.',
      workflow: [
        'Pick the location and count scope (cycle vs full).',
        'Select SKUs by policy (ABC, last-counted, variance).',
        'Create the count task and assign it.',
      ],
      actions: ['Create stock count'],
      references: [
        { name: 'count-policy.md', content: '# Count policy\n\nA-items counted monthly, B quarterly, C twice a year. Prioritise SKUs with recent variance.' },
      ],
      scripts: [],
    },
  },
}

export const SKILL_DOCS: Record<string, SkillDoc> = Object.fromEntries(
  Object.entries(SPECS).map(([id, { name, description, spec }]) => [
    id,
    { markdown: buildMd(name, description, spec), references: spec.references, scripts: spec.scripts },
  ]),
)
