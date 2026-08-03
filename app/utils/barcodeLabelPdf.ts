import jsPDF from 'jspdf'
import { generateBarcodeDataUrl, type BarcodeStyle } from './barcode'
import { getWarehouseSettings } from '~/data/warehouseSettings'

export interface BarcodeLabelInfo {
  barcode: string
  batchNo: string
  productName: string
  sku: string
}

/** 1 = one full page per copy; 2/3 = copies laid out side by side on one sheet. */
export type BarcodeLabelColumns = 1 | 2 | 3

const GRID_CELL_WIDTH = 220
const GRID_CELL_HEIGHT = 160
const GRID_BARCODE_WIDTH = 160
const GRID_BARCODE_HEIGHT = 60
// A QR code is square — sized to roughly the same visual weight as the
// barcode image rather than reusing its wide/short dimensions.
const GRID_QR_SIZE = 80

// jsPDF's default portrait orientation silently swaps a wider-than-tall custom
// format back to portrait — pass the orientation that actually matches our
// computed width/height so it keeps the dimensions we asked for.
function orientationFor(width: number, height: number): 'p' | 'l' {
  return width >= height ? 'l' : 'p'
}

function drawLabelCell(doc: jsPDF, codeDataUrl: string, style: BarcodeStyle, info: BarcodeLabelInfo, cellX: number, cellY: number) {
  const centerX = cellX + GRID_CELL_WIDTH / 2
  const codeY = cellY + 26
  const codeWidth = style === 'qrcode' ? GRID_QR_SIZE : GRID_BARCODE_WIDTH
  const codeHeight = style === 'qrcode' ? GRID_QR_SIZE : GRID_BARCODE_HEIGHT
  doc.addImage(codeDataUrl, 'PNG', centerX - codeWidth / 2, codeY, codeWidth, codeHeight)

  // A blank field (e.g. no batch/serial identifier for a plain SKU label) is
  // skipped entirely rather than leaving an empty line's worth of gap.
  let y = codeY + codeHeight + 20
  if (info.batchNo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(info.batchNo, centerX, y, { align: 'center' })
    y += 15
  }

  if (info.productName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(info.productName, centerX, y, { align: 'center' })
    y += 13
  }

  if (info.sku) {
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(info.sku, centerX, y, { align: 'center' })
    doc.setTextColor(0)
  }
}

/**
 * Builds a printable sheet of `qty` copies of one batch's barcode label, sized
 * like a real barcode sticker (not a full A4 sheet). `columns === 1` gives
 * every copy its own small page (a dedicated label per copy); `columns === 2`
 * or `3` instead lays all copies out on a single sheet that many across, with
 * dashed cut-guides between printed cells so the operator can trim them apart
 * — a guide only appears where there's a printed cell on either side of it,
 * so a half-empty last row doesn't get a stray line through blank paper.
 * Returns the jsPDF instance for the caller to preview/save (doesn't save it
 * itself).
 */
/** Lays a list of pre-rendered label cells into the sticker grid (shared by the
 *  single-label and per-serial sheet builders). Each cell carries its own barcode
 *  image, so cells can be identical copies (one SKU/batch) or all distinct (one
 *  per serial number). */
function renderLabelGrid(cells: { codeDataUrl: string; info: BarcodeLabelInfo }[], style: BarcodeStyle, columns: BarcodeLabelColumns): jsPDF {
  const count = cells.length

  if (columns === 1) {
    const orientation = orientationFor(GRID_CELL_WIDTH, GRID_CELL_HEIGHT)
    const doc = new jsPDF({ unit: 'pt', format: [GRID_CELL_WIDTH, GRID_CELL_HEIGHT], orientation })
    for (let i = 0; i < count; i++) {
      if (i > 0) doc.addPage([GRID_CELL_WIDTH, GRID_CELL_HEIGHT], orientation)
      drawLabelCell(doc, cells[i]!.codeDataUrl, style, cells[i]!.info, 0, 0)
    }
    return doc
  }

  const rows = Math.ceil(count / columns)
  const pageWidth = columns * GRID_CELL_WIDTH
  const pageHeight = rows * GRID_CELL_HEIGHT
  const doc = new jsPDF({ unit: 'pt', format: [pageWidth, pageHeight], orientation: orientationFor(pageWidth, pageHeight) })

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns)
    const col = i % columns
    drawLabelCell(doc, cells[i]!.codeDataUrl, style, cells[i]!.info, col * GRID_CELL_WIDTH, row * GRID_CELL_HEIGHT)
  }

  doc.setDrawColor(150)
  doc.setLineWidth(1)
  doc.setLineDashPattern([4, 3], 0)
  for (let row = 0; row < rows; row++) {
    const filledInRow = Math.min(columns, count - row * columns)
    for (let c = 0; c < Math.min(filledInRow, columns - 1); c++) {
      const x = (c + 1) * GRID_CELL_WIDTH
      doc.line(x, row * GRID_CELL_HEIGHT, x, (row + 1) * GRID_CELL_HEIGHT)
    }
  }
  for (let row = 1; row < rows; row++) {
    doc.line(0, row * GRID_CELL_HEIGHT, pageWidth, row * GRID_CELL_HEIGHT)
  }
  doc.setLineDashPattern([], 0)

  return doc
}

export async function generateBarcodeLabelPdf(
  info: BarcodeLabelInfo,
  qty: number,
  columns: BarcodeLabelColumns,
): Promise<jsPDF> {
  const style = getWarehouseSettings().barcodeStyle
  const codeDataUrl = await generateBarcodeDataUrl(info.barcode, style)
  const count = Math.max(1, Math.floor(qty))
  const cells = Array.from({ length: count }, () => ({ codeDataUrl, info }))
  return renderLabelGrid(cells, style, columns)
}

/**
 * One distinct barcode label per entry — e.g. a label for every serial number's
 * own barcode — laid out in the same sticker grid. `qtyPer` copies of each label
 * (default 1). Empty input yields a single blank label page.
 */
export async function generateBarcodeSheetPdf(
  labels: BarcodeLabelInfo[],
  columns: BarcodeLabelColumns,
  qtyPer = 1,
): Promise<jsPDF> {
  const style = getWarehouseSettings().barcodeStyle
  const per = Math.max(1, Math.floor(qtyPer))
  const expanded = labels.flatMap((info) => Array.from({ length: per }, () => info))
  const source = expanded.length ? expanded : [{ barcode: '', batchNo: '', productName: '', sku: '' }]
  const cells = await Promise.all(
    source.map(async (info) => ({ codeDataUrl: await generateBarcodeDataUrl(info.barcode, style), info })),
  )
  return renderLabelGrid(cells, style, columns)
}
