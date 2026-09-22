#!/usr/bin/env bash
# Design evals — code-based grader for the pixel-police layer.
# For each fixture in docs/design/evals/fixtures/, run pixel-police and assert the
# rule/* IDs declared in its `<!-- expect: ... -->` header fire (and only those).
# Usage: bash .claude/scripts/design-evals.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICE="$ROOT/.claude/scripts/pixel-police.sh"
FIXDIR="$ROOT/docs/design/evals/fixtures"

pass=0; fail=0

for f in "$FIXDIR"/*.vue; do
  [ -e "$f" ] || continue
  # Declared expectations from the first `expect:` line
  expline=$(grep -m1 'expect:' "$f")
  if echo "$expline" | grep -q 'expect:[[:space:]]*none'; then
    expect=""
  else
    expect=$(echo "$expline" | grep -oE 'rule/[a-z0-9-]+' | sort -u | tr '\n' ' ' | sed 's/ $//')
  fi

  # Run the linter, collect the rule IDs it emitted
  got=$(echo "{\"tool_input\":{\"file_path\":\"$f\"}}" | bash "$POLICE" \
    | jq -r '.hookSpecificOutput.additionalContext // ""' \
    | grep -oE 'rule/[a-z0-9-]+' | sort -u | tr '\n' ' ' | sed 's/ $//')

  want="$expect"

  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
    echo "✓ $(basename "$f")"
  else
    fail=$((fail+1))
    echo "✗ $(basename "$f")"
    echo "    want: ${want:-<none>}"
    echo "    got:  ${got:-<none>}"
  fi
done

echo "---"
echo "PASS $pass  FAIL $fail"
[ "$fail" -eq 0 ]
