import jsPDF from 'jspdf'
import { generateBarcodeDataUrl } from './barcode'

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

// jsPDF's default portrait orientation silently swaps a wider-than-tall custom
// format back to portrait — pass the orientation that actually matches our
// computed width/height so it keeps the dimensions we asked for.
function orientationFor(width: number, height: number): 'p' | 'l' {
  return width >= height ? 'l' : 'p'
}

function drawLabelCell(doc: jsPDF, barcodeDataUrl: string, info: BarcodeLabelInfo, cellX: number, cellY: number) {
  const centerX = cellX + GRID_CELL_WIDTH / 2
  const barcodeY = cellY + 26
  doc.addImage(barcodeDataUrl, 'PNG', centerX - GRID_BARCODE_WIDTH / 2, barcodeY, GRID_BARCODE_WIDTH, GRID_BARCODE_HEIGHT)

  let y = barcodeY + GRID_BARCODE_HEIGHT + 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(info.batchNo, centerX, y, { align: 'center' })

  y += 15
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(info.productName, centerX, y, { align: 'center' })

  y += 13
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(info.sku, centerX, y, { align: 'center' })
  doc.setTextColor(0)
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
export async function generateBarcodeLabelPdf(
  info: BarcodeLabelInfo,
  qty: number,
  columns: BarcodeLabelColumns,
): Promise<jsPDF> {
  const barcodeDataUrl = await generateBarcodeDataUrl(info.barcode)
  const count = Math.max(1, Math.floor(qty))

  if (columns === 1) {
    const orientation = orientationFor(GRID_CELL_WIDTH, GRID_CELL_HEIGHT)
    const doc = new jsPDF({ unit: 'pt', format: [GRID_CELL_WIDTH, GRID_CELL_HEIGHT], orientation })
    for (let i = 0; i < count; i++) {
      if (i > 0) doc.addPage([GRID_CELL_WIDTH, GRID_CELL_HEIGHT], orientation)
      drawLabelCell(doc, barcodeDataUrl, info, 0, 0)
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
    drawLabelCell(doc, barcodeDataUrl, info, col * GRID_CELL_WIDTH, row * GRID_CELL_HEIGHT)
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
