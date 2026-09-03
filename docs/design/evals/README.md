# Design evals — does the system actually catch violations?

A rule that isn't measured decays. This is the third leg (skill + linter + **evals**)
of the Vercel/Anthropic method: fixtures of known-bad and known-good UI, graded so we
know our checks catch what they claim to.

## Two grader types (Anthropic: code-based vs LLM-judge)

- **Code-based (automated, runs in CI/locally).** Each fixture is a `.vue` snippet
  with a header declaring the rule IDs it *should* trip. The runner feeds it through
  `pixel-police` and asserts those IDs fire — and that "clean" fixtures stay silent.
  Fast, deterministic, catches linter regressions. Only covers `Lint: pixel-police`
  rules.

      .claude/scripts/design-evals.sh

- **LLM-as-judge (manual / on-demand).** For `Lint: review` rules (judgment), grade a
  real page against the rubric below. Score **rule correctness separately from
  similarity to a mockup** — an agent should follow the rule even when the mockup is
  wrong (that's a *holdout*, not a failure).

## Fixture format

One `.vue` file per case in `fixtures/`. First line declares expectations:

    <!-- expect: rule/select-erpfilterselect rule/type-no-italic -->
    <!-- expect: none -->     ← a clean fixture; the linter must stay silent

Keep fixtures small and **real** — derive them from actual review corrections, not
hypotheticals (Anthropic: "start with what you already test manually"). Add one every
time a violation slips past review; that's how coverage grows toward the 20–50 real
cases that make an eval set trustworthy.

## Running

    bash .claude/scripts/design-evals.sh

Exit 0 = all fixtures graded as expected. Non-zero = a check regressed (a rule stopped
firing, or a clean fixture started tripping). Read the diff before touching
`pixel-police.sh`.

## LLM-judge rubric (for `Lint: review` rules)

Given a changed page/diff, for each applicable `rule/*` in `docs/design/RULES.md`:

1. **Applies?** Does this surface reach the rule? (skip if not)
2. **Satisfied / Violated / Deviation-justified** — one verdict per rule, cite the ID.
3. **Reachable states** — is every state in `reachable-states.md` for this surface
   designed? List omissions.
4. Score = (rules satisfied or justified) / (rules that apply). Report violations
   most-severe first. Don't reward matching a mockup that itself breaks a rule.

## Maintenance

- Read real agent output weekly; when a bad pattern ships, add a fixture (code-based
  if grep-able, else a rubric note) so it can't regress silently.
- When a fixture saturates (always passes), it still guards regressions — keep it.
- If a check is too noisy or too lax, fix `pixel-police.sh` and re-run the evals.
