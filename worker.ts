type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> }; GEMINI_API_KEY?: string }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } })
}

async function assets(request: Request, env: Env) {
  const response = await env.ASSETS.fetch(request)
  const headers = new Headers(response.headers)
  headers.set('Permissions-Policy', 'camera=(self)')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function cleanJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return (fenced ? fenced[1] : text).trim()
}

function extractInteractionText(raw: any) {
  if (typeof raw?.output_text === 'string') return raw.output_text.trim()
  const chunks: string[] = []
  for (const step of Array.isArray(raw?.steps) ? raw.steps : []) {
    if (step?.type !== 'model_output') continue
    for (const content of Array.isArray(step?.content) ? step.content : []) {
      if (content?.type === 'text' && typeof content.text === 'string') chunks.push(content.text)
    }
  }
  return chunks.join('\n').trim()
}

function normaliseBarcode(value: string) {
  return String(value || '').replace(/[^0-9]/g, '')
}

function normaliseImage(image: string) {
  const match = String(image || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
  if (!match) throw new Error('Invalid image payload.')
  return { mimeType: match[1].toLowerCase().replace('jpg', 'jpeg'), data: match[2] }
}

async function lookupOpenFoodFacts(barcode: string) {
  const fields = ['code', 'product_name', 'product_name_en', 'generic_name', 'brands', 'categories', 'quantity', 'image_front_url', 'nutriments', 'nutrition_grades', 'nutriscore_data', 'serving_size', 'product_type'].join(',')
  const url = `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?product_type=all&fields=${encodeURIComponent(fields)}`
  const upstream = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ScanCart/2.0 (real-world barcode shopping app)' },
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit)
  if (!upstream.ok) return null
  const raw = await upstream.json() as any
  if (raw.status !== 1 || !raw.product) return null
  const p = raw.product
  const n = p.nutriments || {}
  const calories = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'])
  const protein = Number(n.proteins_serving ?? n.proteins_100g)
  return {
    id: String(p.code || barcode),
    name: String(p.product_name || p.product_name_en || p.generic_name || '').trim() || '',
    brand: String(p.brands || '').split(',')[0].trim() || undefined,
    calories: Number.isFinite(calories) ? calories : undefined,
    protein: Number.isFinite(protein) ? protein : undefined,
    currency: 'INR',
    category: String(p.categories || '').split(',')[0].trim() || undefined,
    serving: String(p.serving_size || '').trim() || undefined,
    image: String(p.image_front_url || '').trim() || undefined,
    quantity: String(p.quantity || '').trim() || undefined,
    nutriscore: String(p.nutrition_grades || p.nutriscore_data?.grade || '').trim() || undefined,
    source: 'Open Food Facts',
  }
}

async function analyzePackage(env: Env, image: string, barcode: string) {
  if (!env.GEMINI_API_KEY) return null
  const media = normaliseImage(image)
  const prompt = `You are ScanCart's real-world package verifier. The barcode ${barcode} has already been read by a barcode scanner. Inspect ONLY the supplied physical product image. Return ONLY valid JSON with these keys: name, brand, mrp, mrpText, expiry, expiryText, quantity, calories, protein, confidence. Rules: name and brand must be returned only if visibly readable on the package. MRP means the printed Maximum Retail Price in Indian rupees, not an online or store price. Read MRP only when the printed price is visible. Never calculate or infer MRP. mrpText must contain the exact visible MRP text when mrp is returned. Expiry may be EXP, USE BY, BEST BEFORE, or an exact printed date. If only a duration such as BEST BEFORE 6 MONTHS FROM PACKAGING is visible, put the exact text in expiryText and set expiry to null. calories and protein should only be returned when clearly printed on the package, otherwise null. confidence is 0 to 1 and reflects the clarity of the information actually read. Never invent missing information.`
  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify({
      model: 'gemma-4-31b-it',
      input: [
        { type: 'image', data: media.data, mime_type: media.mimeType },
        { type: 'text', text: prompt },
      ],
    }),
  })
  if (!upstream.ok) return null
  const raw = await upstream.json() as any
  const text = extractInteractionText(raw)
  if (!text) return null
  try { return JSON.parse(cleanJson(text)) as any } catch { return null }
}

function mergeProduct(database: any, ai: any, barcode: string) {
  const name = database?.name || (typeof ai?.name === 'string' ? ai.name.trim() : '')
  if (!name) return null
  const product: Record<string, unknown> = {
    id: String(database?.id || barcode),
    name,
    brand: database?.brand || (typeof ai?.brand === 'string' ? ai.brand.trim() : undefined),
    calories: database?.calories,
    protein: database?.protein,
    currency: 'INR',
    category: database?.category,
    serving: database?.serving,
    image: database?.image,
    quantity: database?.quantity || (typeof ai?.quantity === 'string' ? ai.quantity.trim() : undefined),
    nutriscore: database?.nutriscore,
    source: database?.source || 'Package AI identification',
    barcode,
  }
  const confidence = Number(ai?.confidence)
  if (Number.isFinite(confidence)) product.confidence = Math.max(0, Math.min(1, confidence))
  const mrp = Number(ai?.mrp)
  const mrpText = typeof ai?.mrpText === 'string' ? ai.mrpText.trim() : ''
  if (Number.isFinite(mrp) && mrp >= 0 && mrpText) {
    product.mrp = mrp
    product.mrpSource = 'Package AI verification'
  }
  if (typeof ai?.expiry === 'string' && ai.expiry.trim()) {
    product.expiry = ai.expiry.trim()
    product.expirySource = 'Package AI verification'
  } else if (typeof ai?.expiryText === 'string' && ai.expiryText.trim()) {
    product.expiry = ai.expiryText.trim()
    product.expirySource = 'Package AI verification'
  }
  if (product.calories == null && Number.isFinite(Number(ai?.calories))) product.calories = Number(ai.calories)
  if (product.protein == null && Number.isFinite(Number(ai?.protein))) product.protein = Number(ai.protein)
  return product
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const productMatch = url.pathname.match(/^\/api\/product\/([^/]+)$/)
    if (request.method === 'GET' && productMatch) {
      const barcode = normaliseBarcode(decodeURIComponent(productMatch[1]))
      if (!barcode) return json({ found: false, message: 'Invalid barcode.' }, 400)
      try {
        const product = await lookupOpenFoodFacts(barcode)
        if (!product) return json({ found: false, barcode, message: 'No product record was found for this barcode.' }, 404)
        return json({ found: true, product }, 200, { 'Cache-Control': 'public, max-age=300' })
      } catch {
        return json({ found: false, message: 'Product database is temporarily unavailable.' }, 502)
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/resolve') {
      try {
        const body = await request.json() as { barcode?: string; image?: string }
        const barcode = normaliseBarcode(body.barcode || '')
        if (barcode.length < 8) return json({ found: false, message: 'Invalid barcode.' }, 400)
        const database = await lookupOpenFoodFacts(barcode).catch(() => null)
        const ai = body.image ? await analyzePackage(env, body.image, barcode).catch(() => null) : null
        const product = mergeProduct(database, ai, barcode)
        if (!product) return json({ found: false, barcode, message: 'The barcode was read, but no verified product identity was available. The package image was not clear enough to identify it.' }, 404)
        return json({ found: true, product })
      } catch {
        return json({ found: false, message: 'Product analysis failed. Please scan the barcode again.' }, 422)
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/inspect') {
      try {
        const body = await request.json() as { image?: string; barcode?: string }
        if (!body.image) return json({ found: false, message: 'Package image is required.' }, 400)
        const ai = await analyzePackage(env, body.image, normaliseBarcode(body.barcode || ''))
        if (!ai) return json({ found: false, message: 'AI package inspection is not configured or could not read the image.' }, 422)
        const data: Record<string, unknown> = {}
        const confidence = Number(ai.confidence)
        if (Number.isFinite(confidence)) data.confidence = Math.max(0, Math.min(1, confidence))
        const mrp = Number(ai.mrp)
        const mrpText = typeof ai.mrpText === 'string' ? ai.mrpText.trim() : ''
        if (Number.isFinite(mrp) && mrp >= 0 && mrpText) { data.mrp = mrp; data.mrpSource = 'Package AI verification' }
        if (typeof ai.expiry === 'string' && ai.expiry.trim()) { data.expiry = ai.expiry.trim(); data.expirySource = 'Package AI verification' }
        else if (typeof ai.expiryText === 'string' && ai.expiryText.trim()) { data.expiry = ai.expiryText.trim(); data.expirySource = 'Package AI verification' }
        if (typeof ai.quantity === 'string' && ai.quantity.trim()) data.quantity = ai.quantity.trim()
        return json({ found: true, data })
      } catch { return json({ found: false, message: 'AI could not confidently read the package.' }, 422) }
    }

    return assets(request, env)
  },
}
