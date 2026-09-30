/**
 * Dropbox OCR — extract a bill / invoice / receipt's key fields from an uploaded
 * file via Gemini vision. Runs server-side (key never touches the client) and
 * returns structured JSON the Dropbox row is filled from.
 *
 * Body: { fileName, mime, dataBase64 }  (base64 may be bare or a data: URL)
 * Returns: { number, vendorName, date, amount, classification, confidence }
 *   classification ∈ bill | invoice | receipt | unclassified
 *   confidence     0–100
 * On any failure returns { error, ... } with a low-confidence empty result so the
 * client can still mark the row scanned.
 */
interface Body { fileName?: string; mime?: string; dataBase64?: string }

type Classification = 'bill' | 'invoice' | 'receipt' | 'unclassified'
interface OcrResult {
  number: string
  vendorName: string
  date: string          // YYYY-MM-DD ('' if unreadable)
  amount: number        // integer IDR (0 if unreadable)
  classification: Classification
  confidence: number    // 0–100
}

const EMPTY: OcrResult = { number: '', vendorName: '', date: '', amount: 0, classification: 'unclassified', confidence: 0 }

function mimeFor(fileName: string, mime?: string): string {
  if (mime) return mime
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

export default defineEventHandler(async (event): Promise<OcrResult & { source: string; error?: string }> => {
  const body = await readBody<Body>(event)
  if (!body?.dataBase64) { setResponseStatus(event, 400); return { ...EMPTY, source: 'error', error: 'No file data' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (config.geminiModel as string) || 'gemini-flash-latest'
  if (!apiKey) return { ...EMPTY, source: 'fallback', error: 'No Gemini API key' }

  const mime = mimeFor(body.fileName || '', body.mime)
  const data = body.dataBase64.includes(',') ? body.dataBase64.slice(body.dataBase64.indexOf(',') + 1) : body.dataBase64

  const systemInstruction =
    'You are an OCR extraction engine for Indonesian financial documents (bills/tagihan, ' +
    'purchase & sales invoices/faktur, and payment receipts/kwitansi). From the document ' +
    'image or PDF, extract: the document number, the vendor/merchant/counterparty name, the ' +
    'document date, and the grand total amount. Classify the document as one of: ' +
    '"bill" (an expense/vendor bill/tagihan), "invoice" (a purchase or sales invoice/faktur), ' +
    '"receipt" (a payment receipt/kwitansi), or "unclassified" (anything else). Give a ' +
    'confidence score 0-100 for how certain the overall extraction is. ' +
    'Rules: date must be YYYY-MM-DD ("" if unreadable); amount must be an integer in rupiah ' +
    'with no separators or decimals (0 if unreadable); number/vendorName "" if unreadable. ' +
    'Output ONLY the JSON object.'

  const responseSchema = {
    type: 'object',
    properties: {
      number: { type: 'string' },
      vendorName: { type: 'string' },
      date: { type: 'string' },
      amount: { type: 'number' },
      classification: { type: 'string', enum: ['bill', 'invoice', 'receipt', 'unclassified'] },
      confidence: { type: 'number' },
    },
    required: ['number', 'vendorName', 'date', 'amount', 'classification', 'confidence'],
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: 'Extract the fields from this document.' }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema },
      },
    })
    const raw = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
    const parsed = JSON.parse(raw) as Partial<OcrResult>
    const cls = (['bill', 'invoice', 'receipt', 'unclassified'] as const).includes(parsed.classification as Classification)
      ? (parsed.classification as Classification) : 'unclassified'
    return {
      number: String(parsed.number ?? '').trim(),
      vendorName: String(parsed.vendorName ?? '').trim(),
      date: String(parsed.date ?? '').trim(),
      amount: Math.max(0, Math.round(Number(parsed.amount) || 0)),
      classification: cls,
      confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
      source: 'gemini',
    }
  } catch (e: any) {
    return { ...EMPTY, source: 'error', error: e?.message || 'OCR failed' }
  }
})
