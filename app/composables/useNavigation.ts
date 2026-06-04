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
  const words = slug.split("-");
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

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

  /** Human-readable title shown in the page title bar. */
  const pageTitle = computed(() => currentPageKey.value);

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

  return { pageTitle, currentPageKey, navigate };
};
