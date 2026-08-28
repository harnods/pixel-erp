/**
 * useNavigation — URL-driven navigation state.
 *
 * Single source of truth is the route path (e.g. /sales-invoices). Sidebar
 * calls `navigate('Sales invoices')` which router-pushes the kebab-case slug;
 * pages derive their key/title back from the route. Refresh preserves the page
 * because the URL is durable; in-memory state would not survive ssr:false.
 *
 * Usage:
 *   const { currentPageKey, pageTitle, navigate } = useNavigation()
 *
 * To add a new page:
 *   1. Create  app/components/pages/YourPageName.vue
 *   2. Register it in pageRegistry inside app/pages/[...slug].vue
 */

/** 'Home' → '/', 'Sales invoices' → '/sales-invoices', 'Cash & bank' → '/cash-and-bank' */
export function labelToPath(label: string): string {
  if (label === "Home") return "/";
  return (
    "/" +
    label
      .toLowerCase()
      .replace(/\s*&\s*/g, "-and-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
  );
}

/** '/' → 'Home', '/sales-invoices' → 'Sales invoices', '/cash-and-bank' → 'Cash and bank' */
export function pathToLabel(path: string): string {
  if (!path || path === "/") return "Home";
  const slug = path.replace(/^\/+/, "");
  // /stock-counts is a retired route (its distinct "Stock counts" page has been
  // folded into "Stock adjustments", now the same page/content in every scenario)
  // — alias it so an old link/bookmark lands on the real page, sidebar highlight
  // intact, instead of falling through to Home.
  if (slug === "stock-counts") return "Stock adjustments";
  const words = slug.split("-");
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Fix acronym labels for DISPLAY only (browser title) — not for the page-key
 *  lookup, which must keep its original title-cased value. */
export function displayLabel(label: string): string {
  const ACRONYMS: Record<string, string> = { Hr: "HR", Crm: "CRM", Wms: "WMS" };
  return ACRONYMS[label] ?? label;
}

/**
 * The label of the currently-active menu item, published by the sidebar (which
 * owns the nav tree). Lets the page title bar show the exact menu name instead
 * of a label reconstructed from the URL slug — those diverge for names with
 * hyphens/slashes ('Put-away', 'Stock in/out') or distinct routes ('Inventory'
 * settings → /inventory-settings). Module-level so it's shared across components.
 */
const activeMenuLabel = ref("");

/**
 * Sidebar-active override — for detail routes whose URL segment is shared by more
 * than one menu item (e.g. /stock-adjustments/:id serves both the ERP "Stock
 * adjustments" record AND WMS "Cycle counts"/"Stock in/out" tasks). The detail
 * page sets this to the label it actually belongs to so the sidebar highlights
 * the right section instead of deriving it from the URL alone; clears it on
 * unmount so navigation elsewhere falls back to the normal URL-derived behavior.
 */
const activeSectionOverride = ref<string | null>(null);

export const useNavigation = () => {
  const route = useRoute();
  const router = useRouter();

  /**
   * Key used to look up the component to render in the stage. Derived from the
   * FIRST path segment only, so detail routes (e.g. /sales-orders/SO001) still
   * resolve to their parent ('Sales orders') — keeps the sidebar active and the
   * title sane while the detail page renders its own title bar.
   */
  const currentPageKey = computed(() => {
    const first = route.path.split("/").filter(Boolean)[0];
    return pathToLabel(first ? "/" + first : "/");
  });

  /**
   * Human-readable title shown in the page title bar. Always mirrors the active
   * menu name when known (set by the sidebar); falls back to the slug-derived
   * key before the sidebar has resolved (e.g. first paint).
   */
  const pageTitle = computed(() => activeMenuLabel.value || currentPageKey.value);

  /** Sidebar publishes the resolved active menu label here. */
  function setActiveMenuLabel(label: string) {
    activeMenuLabel.value = label;
  }

  /** See `activeSectionOverride` above. Pass null to clear (e.g. on unmount). */
  function setActiveSectionOverride(label: string | null) {
    activeSectionOverride.value = label;
  }

  /**
   * Navigate to a menu item by label.
   * @param label - the menu item label (e.g. 'Sales invoices', 'Home')
   */
  function navigate(label: string) {
    const path = labelToPath(label);
    if (route.path !== path) {
      router.push(path);
    }
  }

  return { pageTitle, currentPageKey, navigate, setActiveMenuLabel, activeSectionOverride, setActiveSectionOverride };
};
