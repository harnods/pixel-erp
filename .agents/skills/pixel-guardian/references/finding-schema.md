# Finding schema — the guard's output contract

Every issue the guard raises is a **Finding**. Report findings as a list,
most-severe first. Fields (adapted from Pixel Guardian's `types/finding.ts`):

| Field | Values / rule |
|-------|---------------|
| `id` | short slug, e.g. `token-hardcoded-color` |
| `title` | one short line (ID); the claim alone |
| `dimension` | `prd-coverage` · `undocumented-behavior` · `pixel-component` · `pixel-token` · `ux-flow` · `design-principle` · `ux-law` · `uxw-copy` · `state-coverage` |
| `category` | `missing-requirement` · `undocumented-behavior` · `design-guideline-violation` · `ux-flow-violation` · `ambiguous-requirement` · `missing-edge-case` · `needs-product-decision` |
| `classification` | `confirmed-gap` · `potential-gap` · `cannot-verify` · `intentional-exception-candidate` |
| `severity` | `high` · `medium` · `low` |
| `evidence` | what you observed in the screenshot/PRD (quote PRD **verbatim**, contiguous, Ctrl+F-able; else null) |
| `guideline` | the rule it violates + **source** (`DESIGN.md`, `docs/patterns/X.md`, MCP `get-component`, `design-principles.md`, `ux-laws.md`, `uxw-copy-library.md`) |
| `fix` | the concrete Enterprise-correct replacement (component/prop/token/copy) |
| `decisionQuestion` | when it's a judgement call, the question for the human |
| `suggestedOwner` | `Product Manager` · `Product Designer` · `Joint decision` |

## Rules (from the Pixel Guardian Constitution)

- **Cite real evidence.** Every finding must cite the screenshot/PRD text, a
  real `docs/patterns/*` / `DESIGN.md` rule, or a real MCP lookup. Never
  invent a requirement, component, or token.
- **Absence is not proof.** If something couldn't be seen in the screenshot,
  mark `cannot-verify` — don't assert it's missing.
- **Guidelines are defaults, not laws.** When the design deviates, ask if
  it's an intentional exception (`intentional-exception-candidate`) rather
  than declaring it wrong outright — surface a `decisionQuestion`.
- **Every finding is actionable.** A concrete `fix` (for hard rules) or a
  `decisionQuestion` (for judgement calls), plus a `suggestedOwner`.
- **Don't pad to a number.** A short list of well-evidenced findings beats a
  long list of thin ones. But never skip a whole dimension just because PRD
  coverage looks fine.
