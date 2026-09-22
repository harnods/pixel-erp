#!/usr/bin/env bash
# Pixel Fix — runs after Edit/Write on a .vue file and AUTO-REPAIRS the mechanical
# rule violations in place (token fallbacks, redundant size="md"), so a prototype
# dropped into this repo is corrected to the design rules without asking.
# Judgement-level issues are still flagged (not fixed) by pixel-police.sh.

set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE" != *.vue ]] && exit 0
[[ ! -f "$FILE" ]] && exit 0

OUT=$(node scripts/pixel-fix.mjs "$FILE" 2>/dev/null)
# Only surface a note when something was actually repaired.
if echo "$OUT" | grep -q '^fixed'; then
  WHAT=$(echo "$OUT" | grep '^fixed' | sed -E 's#^fixed +[^ ]+ +##')
  echo "🔧 pixel-fix auto-repaired $FILE $WHAT"
fi
exit 0
