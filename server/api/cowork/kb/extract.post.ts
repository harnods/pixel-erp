/**
 * KB ingestion — extract text from an uploaded file, server-side so the heavy
 * parsers never touch the client bundle (avoids the Panda/Vite optimizeDeps
 * race) and every format is handled uniformly.
 *
 *   text / md / csv / tsv / json  → decode directly
 *   docx                          → mammoth
 *   xlsx / xls                    → SheetJS → CSV per sheet
 *   pdf (text layer)              → unpdf
 *   pdf (scanned) / png / jpg / … → Gemini vision OCR (falls back gracefully)
 *
 * Body: { fileName, mime, ext, dataBase64 }  (base64 may be a bare string or a data: URL)
 * Returns: { text, pageCount?, warning?, source }
 */
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { extractText, getDocumentProxy } from 'unpdf'

interface Body { fileName?: string; mime?: string; ext?: string; dataBase64?: string }

const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'csv', 'tsv', 'json', 'log', 'yml', 'yaml'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])

function toBuffer(b64: string): Buffer {
  const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  return Buffer.from(raw, 'base64')
}

/** OCR / describe an image (or scanned page) via Gemini vision. Empty string on any failure. */
async function visionExtract(base64: string, mime: string): Promise<string> {
  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (config.geminiModel as string) || 'gemini-flash-latest'
  if (!apiKey) return ''
  const data = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        systemInstruction: { parts: [{ text: 'You extract knowledge from a document image for a knowledge base. Transcribe all visible text faithfully. If it is a table, render it as a markdown table. If it is a chart/diagram/photo with little text, describe its content in a few sentences. Output only the extracted content — no preamble.' }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime || 'image/png', data } }, { text: 'Extract the text/content from this file.' }] }],
        generationConfig: { temperature: 0.1 },
      },
    })
    return res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
  } catch {
    return ''
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const ext = (body?.ext || body?.fileName?.split('.').pop() || '').toLowerCase()
  const mime = body?.mime || ''
  if (!body?.dataBase64) { setResponseStatus(event, 400); return { error: 'No file data' } }

  const buf = toBuffer(body.dataBase64)

  try {
    // ── Plain text family ──
    if (TEXT_EXT.has(ext) || mime.startsWith('text/') || mime === 'application/json') {
      return { text: buf.toString('utf8'), source: 'text' }
    }

    // ── Word ──
    if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
      const { value } = await mammoth.extractRawText({ buffer: buf })
      return { text: (value || '').trim(), source: 'docx' }
    }
    if (ext === 'doc') {
      // Legacy binary .doc isn't supported by mammoth; best-effort strip.
      const rough = buf.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
      return { text: rough, warning: 'Legacy .doc — limited extraction. Re-save as .docx for best results.', source: 'doc' }
    }

    // ── Spreadsheets ──
    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml') || mime.includes('ms-excel')) {
      const wb = XLSX.read(buf, { type: 'buffer' })
      const out: string[] = []
      for (const name of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]!)
        if (csv.trim()) out.push(`## ${name}\n${csv.trim()}`)
      }
      return { text: out.join('\n\n'), pageCount: wb.SheetNames.length, source: 'xlsx' }
    }

    // ── PDF ──
    if (ext === 'pdf' || mime === 'application/pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buf))
      const { totalPages, text } = await extractText(pdf, { mergePages: true })
      const clean = (text || '').trim()
      if (clean.length >= 40) return { text: clean, pageCount: totalPages, source: 'pdf' }
      // Little/no text layer → probably scanned. Try vision OCR on the whole file.
      const ocr = await visionExtract(body.dataBase64, 'application/pdf')
      return { text: ocr || clean, pageCount: totalPages, warning: ocr ? 'Scanned PDF — OCR best-effort.' : 'No extractable text found.', source: ocr ? 'pdf-ocr' : 'pdf' }
    }

    // ── Images ──
    if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) {
      const text = await visionExtract(body.dataBase64, mime || `image/${ext}`)
      return { text, warning: text ? undefined : 'Could not read this image (model unavailable).', source: 'image' }
    }

    // ── Unknown — best-effort text sniff ──
    const sniff = buf.toString('utf8')
    const printable = sniff.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    if (printable.length > sniff.length * 0.7) return { text: sniff.trim(), warning: `Unrecognised type .${ext} — read as plain text.`, source: 'sniff' }
    return { text: '', warning: `Unsupported file type .${ext}. Stored as an attachment; no text extracted.`, source: 'unsupported' }
  } catch (err: any) {
    setResponseStatus(event, 200)
    return { text: '', warning: `Extraction failed: ${String(err?.message ?? err)}`, source: 'error' }
  }
})
