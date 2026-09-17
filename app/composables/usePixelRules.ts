// Shared state for the /pixel right-hand "Rules" rail. Each component page's
// DemoHeader registers the rule/* ids that govern it; the shell reads them and
// renders the rule → meaning table.
export function usePixelRules() {
  return useState<string[]>('pixel-rules', () => [])
}
