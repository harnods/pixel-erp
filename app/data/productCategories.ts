import { reactive } from 'vue'
import { CATALOG } from './catalog'

/**
 * Product category master — the category database a picker reads from.
 *
 * Seeded from the categories actually in use in the catalogue, plus a few a coffee
 * business commonly stocks that may not have products yet, so a category-scoped
 * setting can be configured before the first product of that category is created.
 *
 * Reactive and in-memory: the prototype has no category-admin screen, so a
 * category added at runtime (e.g. from a settings picker) lives for the session;
 * anything a person configures against it persists through that setting's own
 * snapshot.
 */
const SEEDED_EXTRA = [
  'Packaging',
  'Cleaning Supplies',
  'Merchandise',
  'Syrups & Sauces',
  'Brewing Tools',
]

export const productCategories = reactive<string[]>(
  [...new Set([...CATALOG.map((c) => c.category), ...SEEDED_EXTRA])].sort(),
)

/** Add a category to the master if it isn't already there; keeps it sorted. */
export function addProductCategory(name: string): void {
  const n = name.trim()
  if (!n || productCategories.includes(n)) return
  productCategories.push(n)
  productCategories.sort()
}
