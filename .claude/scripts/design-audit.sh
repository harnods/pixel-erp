#!/usr/bin/env bash
# Design audit — run pixel-police across every real .vue file and tally rule
# violations. This is the remediation worklist for legacy pages.
# Usage: bash .claude/scripts/design-audit.sh [subdir]         (default: app)
#        bash .claude/scripts/design-audit.sh app rule/select-erpfilterselect
#          → list the file:line offenders for one rule.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICE="$ROOT/.claude/scripts/pixel-police.sh"
SUB="${1:-app}"
ONLY="${2:-}"

TMP=$(mktemp); TOTAL=0; FILES_WITH=0

while IFS= read -r f; do
  case "$f" in */app/pages/pixel/*|*DemoCard.vue|*DemoSection.vue|*DemoHeader.vue|*DemoRow.vue) continue;; esac
  TOTAL=$((TOTAL+1))
  out=$(echo "{\"tool_input\":{\"file_path\":\"$f\"}}" | bash "$POLICE" 2>/dev/null \
    | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null | grep -oE 'rule/[a-z0-9-]+' | sort -u)
  [ -z "$out" ] && continue
  FILES_WITH=$((FILES_WITH+1))
  rel="${f#$ROOT/}"
  if [ -n "$ONLY" ]; then
    echo "$out" | grep -qx "$ONLY" && echo "$rel"
  else
    echo "$out" >> "$TMP"
  fi
done < <(find "$ROOT/$SUB" -name '*.vue' -type f)

if [ -n "$ONLY" ]; then rm -f "$TMP"; exit 0; fi

echo "Design audit — $SUB"
echo "Scanned $TOTAL .vue files; $FILES_WITH have at least one violation."
echo "--- violations by rule (files affected) ---"
sort "$TMP" | uniq -c | sort -rn
rm -f "$TMP"
