/**
 * useNavigation — shared navigation state across sidebar and stage.
 *
 * Usage:
 *   const { currentPageKey, pageTitle, navigate } = useNavigation()
 *
 * To add a new page:
 *   1. Create  app/components/pages/YourPageName.vue
 *   2. Register it in pageRegistry inside app/pages/index.vue
 */
export const useNavigation = () => {
  /** Human-readable title shown in the page title bar */
  const pageTitle = useState<string>("pageTitle", () => "Home");

  /**
   * Key used to look up the component to render in the stage.
   * Matches the label of the menu item (e.g. 'Home', 'Sales invoices', 'Financials').
   */
  const currentPageKey = useState<string>("currentPageKey", () => "Home");

  /**
   * Navigate to a menu item.
   * @param key   - the menu item label (used as component registry key)
   * @param title - optional override for the page title bar (defaults to key)
   */
  function navigate(key: string, title?: string) {
    currentPageKey.value = key;
    pageTitle.value = title ?? key;
  }

  return { pageTitle, currentPageKey, navigate };
};
