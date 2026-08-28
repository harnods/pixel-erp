/**
 * HR product route matcher. The HR (Talenta) product owns /hr plus the HR module
 * pages that live at top-level slugs (Employee directory, Employee transfer,
 * Resignation). Both the layout (which sidebar to show) and the product rail
 * (which product is active) use this so they stay in sync.
 */
const HR_PREFIXES = ['/hr', '/employee-directory', '/organization-chart', '/employee-transfer', '/resignation']

export function isHrPath(path: string): boolean {
  return HR_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
}
