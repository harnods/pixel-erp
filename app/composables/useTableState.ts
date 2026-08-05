/**
 * useTableState — reusable state for index/list pages.
 *
 * Handles: search, status filter, pagination (with reactive per-page), and sort.
 *
 * Usage:
 *   const { search, statusFilter, currentPage, paginated, total, perPage, setPage, setPerPage } =
 *     useTableState(rows, {
 *       perPage: 25,
 *       filterFn: (row, search, status) =>
 *         row.customer.name.toLowerCase().includes(search) &&
 *         (!status || row.status === status),
 *     })
 */
export function useTableState<T>(
  source: Ref<T[]> | ComputedRef<T[]>,
  options?: {
    perPage?: number
    filterFn?: (row: T, search: string, status: string) => boolean
  },
) {
  const perPage = ref(options?.perPage ?? 25)

  const search = ref('')
  const statusFilter = ref('')
  const currentPage = ref(1)
  const sortKey = ref('')
  const sortDir = ref<'asc' | 'desc'>('asc')

  // Reset to page 1 whenever filters or per-page changes
  watch([search, statusFilter, perPage], () => { currentPage.value = 1 })

  const filtered = computed(() => {
    if (!options?.filterFn) return source.value
    const s = search.value.toLowerCase().trim()
    const st = statusFilter.value
    return source.value.filter(row => options.filterFn!(row, s, st))
  })

  const sorted = computed(() => {
    if (!sortKey.value) return filtered.value
    return [...filtered.value].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey.value]
      const bv = (b as Record<string, unknown>)[sortKey.value]
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      // strings (incl. ISO date strings — chronological) via natural, case-insensitive compare
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir.value === 'asc' ? cmp : -cmp
    })
  })

  const total = computed(() => sorted.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  const paginated = computed(() => {
    const start = (currentPage.value - 1) * perPage.value
    return sorted.value.slice(start, start + perPage.value)
  })

  function setPage(page: number) {
    currentPage.value = Math.min(Math.max(1, page), totalPages.value)
  }

  function setPerPage(n: number) {
    perPage.value = n
  }

  function toggleSort(key: string) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortDir.value = 'asc'
    }
  }
  /** Set an explicit sort direction (used by the column-header sort menu). */
  function setSort(key: string, dir: 'asc' | 'desc') {
    sortKey.value = key
    sortDir.value = dir
  }

  const hasActiveSearch = computed(() => !!search.value.trim())
  const hasActiveFilter = computed(() => !!statusFilter.value)

  return {
    search,
    statusFilter,
    hasActiveSearch,
    hasActiveFilter,
    currentPage,
    sortKey,
    sortDir,
    total,
    totalPages,
    paginated,
    perPage,
    setPage,
    setPerPage,
    toggleSort,
    setSort,
  }
}
