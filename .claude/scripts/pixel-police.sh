#!/usr/bin/env bash
# Pixel Police — runs after Edit/Write on .vue files.
# Deterministic checks only (mechanics). Judgment lives in docs/design/RULES.md.
# Every message cites a rule/* ID so it's traceable back to the registry.

set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check .vue files
[[ "$FILE" != *.vue ]] && exit 0
[[ ! -f "$FILE" ]] && exit 0

VIOLATIONS=()

# rule/token-no-hardcoded-color — hex/rgb/rgba/hsl must be var(--mp-color-*)
if grep -qE ':[[:space:]]*(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\()' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE ':[[:space:]]*(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\()' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/token-no-hardcoded-color — use var(--mp-color-*) DT 2.4 tokens:\n$LINES")
fi

# rule/token-no-raw-html — interactive elements must be Mp* (or a btn-enterprise button)
if grep -nE '<(button|input|select|textarea)[ >]' "$FILE" 2>/dev/null | grep -viqE 'btn-enterprise'; then
  LINES=$(grep -nE '<(button|input|select|textarea)[ >]' "$FILE" | grep -viE 'btn-enterprise' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/token-no-raw-html — use MpButton / MpInput / MpTextarea (or a btn-enterprise button):\n$LINES")
fi

# rule/token-no-hardcoded-spacing — px in inline style attrs
if grep -qE 'style="[^"]*[0-9]+px' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE 'style="[^"]*[0-9]+px' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/token-no-hardcoded-spacing — use var(--mp-spacing-*) tokens (inline style):\n$LINES")
fi

# rule/token-no-hardcoded-spacing — px in <style scoped>
if grep -qE '^\s+(margin|padding|gap|width|height)\s*:\s*[0-9]+px' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE '^\s+(margin|padding|gap|width|height)\s*:\s*[0-9]+px' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/token-no-hardcoded-spacing — use var(--mp-spacing-*) / var(--mp-size-*) tokens:\n$LINES")
fi

# rule/token-pixel3-only — no non-pixel3 imports
if grep -qE "from ['\"]@mekari/pixel[^3'\"]" "$FILE" 2>/dev/null; then
  LINES=$(grep -nE "from ['\"]@mekari/pixel[^3'\"]" "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/token-pixel3-only — import from @mekari/pixel3 only:\n$LINES")
fi

# rule/surface-border-no-shadow — no drop-shadow on a surface (inset / allow-shadow exempt)
if grep -nE 'box-shadow|--mp-shadows-' "$FILE" 2>/dev/null | grep -viqE 'inset|pixel-police-allow-shadow'; then
  LINES=$(grep -nE 'box-shadow|--mp-shadows-' "$FILE" | grep -viE 'inset|pixel-police-allow-shadow' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/surface-border-no-shadow — Enterprise surfaces use a 1px border, not box-shadow:\n$LINES")
fi

# rule/type-no-italic — no italic anywhere (font-style:italic / <i> / <em>)
if grep -nE 'font-style:[[:space:]]*italic|<i>|<i [^>]*>|<em>|<em [^>]*>' "$FILE" 2>/dev/null | grep -viqE '<img|<input|<icon'; then
  LINES=$(grep -nE 'font-style:[[:space:]]*italic|<i>|<i [^>]*>|<em>|<em [^>]*>' "$FILE" | grep -viE '<img|<input|<icon' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/type-no-italic — no italic in the ERP; de-emphasize with size+secondary color, emphasize with weight:\n$LINES")
fi

# rule/select-erpfilterselect — MpSelect is banned repo-wide (native OS dropdown).
# Every dropdown uses MpAutocomplete (popover menu). Flag ANY <MpSelect>.
if grep -nqE '<MpSelect[ />]' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE '<MpSelect[ />]' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/select-erpfilterselect — MpSelect (native OS dropdown) is banned; use MpAutocomplete (popover menu, options never native):\n$LINES")
fi

# rule/drawer-custom-shell — MpDrawer has no structural CSS here; use the Teleport shell
if grep -nqE '<MpDrawer[ />]' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE '<MpDrawer[ />]' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/drawer-custom-shell — MpDrawer renders broken in this build; copy the BillsFiltersDrawer Teleport shell:\n$LINES")
fi

# rule/btn-cancel-ghost — a Cancel button styled secondary (should be ghost). Heuristic.
if grep -nE '(Cancel|Batal)' "$FILE" 2>/dev/null | grep -iqE 'secondary'; then
  LINES=$(grep -nE '(Cancel|Batal)' "$FILE" | grep -iE 'secondary' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/btn-cancel-ghost — Cancel/dismiss must be the ghost variant, not secondary:\n$LINES")
fi

# rule/btn-always-pill — single-line <MpButton …> without is-rounded (heuristic nudge)
if grep -nE '<MpButton[^>]*>' "$FILE" 2>/dev/null | grep -viqE 'is-rounded'; then
  LINES=$(grep -nE '<MpButton[^>]*>' "$FILE" | grep -viE 'is-rounded' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/btn-always-pill — ERP buttons are pill-rounded; add is-rounded (ignore if the tag spans lines and already has it):\n$LINES")
fi

# rule/btn-no-disabled-validation — is-disabled on MpButton (loading lock is the only allowed disable)
if grep -nE '<MpButton[^>]*(is-disabled|:disabled)' "$FILE" 2>/dev/null | grep -viqE 'loading|is-loading'; then
  LINES=$(grep -nE '<MpButton[^>]*(is-disabled|:disabled)' "$FILE" | grep -viE 'loading|is-loading' | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/btn-no-disabled-validation — don't disable to signal 'not ready'; keep clickable + inline error (loading lock exempt):\n$LINES")
fi

# Button strict rules — inspect each <MpButton …> opening tag (multi-line aware).
# rule/btn-no-size-md, rule/btn-sm-secondary-only, rule/btn-danger-no-icon,
# rule/btn-sm-dropdown-only, rule/btn-no-full-width.
BTN=$(perl -0777 -ne '
  while (/<MpButton\b([^>]*?)\/?>/sg) {
    my $a = $1;
    (my $snip = $a) =~ s/\s+/ /g; $snip =~ s/^ //; $snip = substr($snip,0,72);
    my $sec   = $a =~ /variant\s*=\s*"secondary"/;
    my $dang  = $a =~ /variant\s*=\s*"danger"/;
    my $sm    = $a =~ /size\s*=\s*"sm"/;
    my $md    = $a =~ /size\s*=\s*"md"/;
    my $left  = $a =~ /left-icon/;
    my $right = $a =~ /right-icon/;
    my $full  = $a =~ /is-full-width/;
    print "rule/btn-no-size-md\tsize=\"md\" is the default — remove it: <MpButton $snip>\n" if $md;
    print "rule/btn-sm-secondary-only\tsize=\"sm\" only on secondary (bulk-bar): <MpButton $snip>\n" if $sm && !$sec;
    print "rule/btn-danger-no-icon\tdanger buttons are text-only, no icon: <MpButton $snip>\n" if $dang && ($left || $right);
    print "rule/btn-sm-dropdown-only\tsm button may only carry a right-icon dropdown, no left-icon: <MpButton $snip>\n" if $sm && $left;
    print "rule/btn-no-full-width\tno full-width buttons: <MpButton $snip>\n" if $full;
  }
' "$FILE" 2>/dev/null)
if [ -n "$BTN" ]; then
  while IFS=$'\t' read -r rid msg; do
    [ -z "$rid" ] && continue
    VIOLATIONS+=("$rid — $msg")
  done <<< "$BTN"
fi

# rule/btn-danger-confirm — a danger button's click must open a confirm MpModal.
# Heuristic: file has a clickable <MpButton variant="danger" … @click …> but no MpModal.
if perl -0777 -ne 'exit 1 unless /<MpButton\b[^>]*variant\s*=\s*"danger"[^>]*\@click/s; exit 0' "$FILE" 2>/dev/null && ! grep -q 'MpModal' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE 'variant\s*=\s*"danger"' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/btn-danger-confirm — a danger action must open a confirm MpModal (size md, UXW copy), not run on click:\n$LINES")
fi

# rule/btn-dropdown-mppopover — a dropdown chevron button must live inside an MpPopover.
# Heuristic: file has an MpButton with a right-icon chevron but no MpPopover at all.
if grep -qE 'right-icon\s*=\s*"(chevrons?-down|caret-down)"' "$FILE" 2>/dev/null && ! grep -q 'MpPopover' "$FILE" 2>/dev/null; then
  LINES=$(grep -nE 'right-icon\s*=\s*"(chevrons?-down|caret-down)"' "$FILE" | head -3 | sed 's/^/    /')
  VIOLATIONS+=("rule/btn-dropdown-mppopover — a dropdown button must be an MpPopover (Trigger→Content→List→ListItem), not a bare chevron button:\n$LINES")
fi

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  MSG="PIXEL-POLICE 🚨 ${FILE}  (rules: docs/design/RULES.md)"
  for v in "${VIOLATIONS[@]}"; do
    MSG="${MSG}\n• ${v}"
  done
  jq -n --arg ctx "$MSG" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi

exit 0
