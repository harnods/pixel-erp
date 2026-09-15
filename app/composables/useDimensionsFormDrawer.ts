/**
 * useDimensionsFormDrawer — lets the page title bar's "+ New dimension" button
 * ([...slug].vue, outside DimensionsIndexPage.vue) request opening the create
 * drawer that DimensionsIndexPage.vue owns and renders. A module-level counter
 * (not a boolean) so repeated clicks always trigger a fresh `watch`, even if the
 * drawer was closed again without changing any other state.
 */
const createRequestId = ref(0)

export function useDimensionsFormDrawer() {
  function requestDimensionCreate() {
    createRequestId.value++
  }

  return { createRequestId, requestDimensionCreate }
}
