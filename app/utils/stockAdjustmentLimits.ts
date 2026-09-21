/**
 * Stock Adjustment (Stock count / Stock in-out) shares one pooled line budget across
 * every Product row and its Batch Drawer entries — replacing the old fixed 1,000
 * Product x 10 Batch split. See PRD "Increase Limit of Batch Drawer in Multiple
 * Transactions". The 10,000 ceiling itself is unchanged; only how it's distributed
 * between Products and Batches is now flexible.
 */
export const STOCK_ADJUSTMENT_LINE_CAP = 10000

/**
 * The line-usage counter stays out of the way for the common case (a handful of
 * Products/Batches) and only earns its place on screen once a document is building
 * up enough lines that the 10,000 budget becomes a real planning concern.
 */
export const STOCK_ADJUSTMENT_COUNTER_SHOW_FROM = 2000
