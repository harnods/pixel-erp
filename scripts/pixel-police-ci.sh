#!/usr/bin/env bash
#
# Pixel Police (CI gate) — fails the build on NEW Pixel token/component
# violations introduced by a change. It only inspects the lines ADDED in the
# diff against a base ref, so the repo's existing tech-debt never blocks a
# merge; only newly-written violations do.
#
# Usage: scripts/pixel-police-ci.sh <base-ref-or-sha>
#
# Rules (same intent as .claude/scripts/pixel-police.sh, but hard-failing):
#   1. Hardcoded colors (#hex / rgb() / rgba() / hsl())  -> use var(--mp-color-*)
#   2. Raw <button|input|select|textarea>                -> use MpButton/MpInput/…
#   3. Hardcoded px in an inline style="" attribute      -> use var(--mp-spacing-*)
#   4. Hardcoded margin/padding/gap/width/height px in a <style> block
#   5. Non-@mekari/pixel3 @mekari import                 -> use @mekari/pixel3 only

set -uo pipefail

BASE_INPUT="${1:-}"

# Resolve a usable base commit. github.event.before can be all-zeros (new branch)
# or unreachable; fall back to the merge-base with origin/main, then HEAD~1.
resolve_base() {
  local b="$1"
  if [[ -n "$b" && "$b" != "0000000000000000000000000000000000000000" ]] \
     && git cat-file -e "${b}^{commit}" 2>/dev/null; then
    echo "$b"; return
  fi
  if git rev-parse --verify -q origin/main >/dev/null; then
    git merge-base origin/main HEAD 2>/dev/null && return
  fi
  git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD
}

BASE="$(resolve_base "$BASE_INPUT")"
echo "Pixel Police (CI): checking added lines since ${BASE:0:12}"

fail=0

# Only .vue files that changed in the range. `while read` (not mapfile) so this
# runs on the CI runner's bash and older local bash alike; process substitution
# keeps `fail` in the current shell.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || continue   # skip deletions

  # Added lines only: keep '+' lines, drop the '+++ b/file' header, strip the '+'.
  added="$(git diff --unified=0 "$BASE"...HEAD -- "$f" | grep '^+' | grep -v '^+++' | sed 's/^+//')"
  [[ -z "$added" ]] && continue

  file_msgs=""
  check() { # <regex> <message>
    local hits
    hits="$(grep -nE "$1" <<<"$added" || true)"
    if [[ -n "$hits" ]]; then
      file_msgs+="  ✗ $2"$'\n'
      file_msgs+="$(sed 's/^/       + /' <<<"$hits" | head -3)"$'\n'
    fi
  }

  check ':[[:space:]]*(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\()' 'Hardcoded color — use var(--mp-color-*)'

  # Raw HTML controls must use Pixel components — EXCEPT a <button class="btn-enterprise…">,
  # which is the project's sanctioned Enterprise button (erp.css; MpButton's secondary
  # renders with the wrong color), and a raw <input class="…-search-input">, which is the
  # project's sanctioned search-pill input (erp.css .filter-search/.pr-filter-search/
  # .rcvgd-search-wrap focus ring; MpInput can't sit borderless inside that pill). Anything
  # else raw is still flagged.
  rawctl_hits="$(grep -nE '<(button|input|select|textarea)[ >]' <<<"$added" | grep -viE 'btn-enterprise|search-input' || true)"
  if [[ -n "$rawctl_hits" ]]; then
    file_msgs+="  ✗ Raw HTML control — use MpButton / MpInput / MpSelect / MpTextarea (or a btn-enterprise button)"$'\n'
    file_msgs+="$(sed 's/^/       + /' <<<"$rawctl_hits" | head -3)"$'\n'
  fi
  check 'style="[^"]*[0-9]+px'                                'Hardcoded px in inline style — use var(--mp-spacing-*)'
  check '^[[:space:]]+(margin|padding|gap|width|height)[[:space:]]*:[[:space:]]*[0-9]+px' 'Hardcoded spacing in <style> — use var(--mp-spacing-*)/(--mp-size-*)'
  check "from ['\"]@mekari/pixel[^3'\"]"                       'Non-Pixel3 import — use @mekari/pixel3 only'

  # Drop-shadow on a card/box/panel is banned — Enterprise surfaces use a 1px
  # border, never a drop-shadow. `inset` shadows (focus rings, cell borders) are
  # fine. Real floating overlays (menu/popover/modal/drawer) may keep a shadow —
  # append a trailing `pixel-police-allow-shadow` comment on that line to opt out.
  shadow_hits="$(grep -nE 'box-shadow|--mp-shadows-' <<<"$added" | grep -viE 'inset|pixel-police-allow-shadow' || true)"
  if [[ -n "$shadow_hits" ]]; then
    file_msgs+="  ✗ Drop-shadow on a surface — Enterprise cards use a 1px border (var(--mp-border-*)), not box-shadow"$'\n'
    file_msgs+="$(sed 's/^/       + /' <<<"$shadow_hits" | head -3)"$'\n'
  fi

  if [[ -n "$file_msgs" ]]; then
    echo ""
    echo "🚨 $f"
    printf '%s' "$file_msgs"
    fail=1
  fi
done < <(git diff --name-only "$BASE"...HEAD -- '*.vue')

echo ""
if [[ $fail -eq 0 ]]; then
  echo "✅ Pixel Police: no new token/component violations in changed .vue files."
else
  echo "❌ Pixel Police: new violations above must be fixed before merge."
  echo "   (Only newly-added lines are checked — pre-existing code is not flagged.)"
fi
exit $fail
