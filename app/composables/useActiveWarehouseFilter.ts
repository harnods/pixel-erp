/**
 * useActiveWarehouseFilter — the warehouse IDs the CURRENTLY VISIBLE index page
 * (Receipts, Receiving, Put-away, Requests, Picking, Packing, Ready to ship,
 * Shipped) is filtering its table to.
 *
 * Each of those pages syncs its own local "Warehouse" filter into this shared
 * singleton, and clears it back to empty on unmount. [...slug].vue reads it to
 * scope the tab-bar count badges (Receipts (N), etc.) to the same warehouse(s)
 * the visible table is actually filtered to — otherwise the badges quietly keep
 * counting every warehouse regardless of what's on screen.
 */
const activeWarehouseFilter = ref<string[]>([]);

export function useActiveWarehouseFilter() {
  return activeWarehouseFilter;
}
