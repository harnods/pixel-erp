// @ts-expect-error bwip-js's package exports map (browser/node/electron conditions) isn't resolved by TS's bundler moduleResolution
import * as bwipjs from 'bwip-js'

export type BarcodeStyle = 'barcode' | 'qrcode'

/**
 * Renders `value` as a Code128 barcode or QR code PNG data URL (per `style`) for
 * embedding via jsPDF's addImage. bwip-js resolves to its browser build
 * (canvas-based) when bundled for the client and to its Node build
 * (buffer-based) under Vitest — both code paths are handled so this runs for
 * real in each environment rather than being mocked.
 */
export async function generateBarcodeDataUrl(value: string, style: BarcodeStyle = 'barcode'): Promise<string> {
  const opts = style === 'qrcode'
    ? { bcid: 'qrcode', text: value, scale: 3 }
    : { bcid: 'code128', text: value, scale: 3, height: 12, includetext: true, textxalign: 'center' }
  const bw = bwipjs as unknown as {
    toCanvas?: (canvas: HTMLCanvasElement, opts: unknown) => HTMLCanvasElement
    toBuffer?: (opts: unknown) => Promise<Buffer>
  }
  if (typeof bw.toCanvas === 'function') {
    const canvas = document.createElement('canvas')
    bw.toCanvas(canvas, opts)
    return canvas.toDataURL('image/png')
  }
  const buffer = await bw.toBuffer!(opts)
  return `data:image/png;base64,${buffer.toString('base64')}`
}
