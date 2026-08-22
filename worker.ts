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

function extractGeminiText(raw: any) {
  const parts = raw?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.filter((part: any) => typeof part?.text === 'string').map((part: any) => part.text).join('\n').trim()
}

function normaliseBarcode(value: string) {
  return String(value || '').replace(/[^0-9]/g, '')
}

function validBarcode(value: string) {
  if (/^\d{13}$/.test(value)) {
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
    return (10 - (sum % 10)) % 10 === Number(value[12])
  }
  if (/^\d{12}$/.test(value)) {
    let sum = 0
    for (let i = 0; i < 11; i++) sum += Number(value[i]) * (i % 2 ? 1 : 3)
    return (10 - (sum % 10)) % 10 === Number(value[11])
  }
  if (/^\d{8}$/.test(value)) {
    let sum = 0
    for (let i = 0; i < 7; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
    return (10 - (sum % 10)) % 10 === Number(value[7])
  }
  return false
}

function normaliseImage(image: string) {
  const match = String(image || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
  if (!match) throw new Error('Invalid image payload.')
  return { mimeType: match[1].toLowerCase().replace('jpg', 'jpeg'), data: match[2] }
}

async function geminiImageJson(env: Env, image: string, prompt: string, model = 'gemini-2.5-flash') {
  if (!env.GEMINI_API_KEY) return null
  const media = normaliseImage(image)
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: media.mimeType, data: media.data } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  })
  if (!upstream.ok) return null
  const raw = await upstream.json() as any
  const text = extractGeminiText(raw)
  if (!text) return null
  try { return JSON.parse(cleanJson(text)) as any } catch { return null }
}

async function lookupOpenFoodFacts(barcode: string) {
  const fields = ['code', 'product_name', 'product_name_en', 'generic_name', 'brands', 'categories', 'quantity', 'image_front_url', 'nutriments', 'nutrition_grades', 'nutriscore_data', 'serving_size', 'product_type'].join(',')
  const url = `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?product_type=all&fields=${encodeURIComponent(fields)}`
  const upstream = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ScanCart/2.1 (real-world barcode shopping app)' },
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit)
  if (!upstream.ok) return null
  const raw = await upstream.json() as any
  if (!raw.product) return null
  const p = raw.product
  const n = p.nutriments || {}
  const calories = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? n['energy-kcal'])
  const protein = Number(n.proteins_serving ?? n.proteins_100g ?? n.proteins)
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

async function analyzeBarcode(env: Env, image: string) {
  return geminiImageJson(env, image, `Read the 1D product barcode in this image. Focus on the digits printed directly below the bars. Return ONLY JSON in this exact shape: {"barcode":""}. Return the complete numeric barcode only if all digits are clearly readable. Do not guess, invent, complete, or repair digits. Prefer EAN-13, EAN-8, or UPC-A. If no barcode can be read confidently, return {"barcode":""}.`, 'gemini-2.5-flash-lite')
}

async function analyzePackage(env: Env, image: string, barcode: string) {
  const ai = await geminiImageJson(env, image, `You are ScanCart's package verifier. The barcode has already been decoded as ${barcode}. Inspect ONLY the supplied physical product image. Return ONLY JSON with these keys: name, brand, mrp, mrpText, expiry, expiryText, quantity, calories, protein, confidence. Rules: name and brand only when visibly readable. MRP means the printed Maximum Retail Price in Indian rupees. Read MRP only when the printed price is visible on the package. Never use an online price, never calculate MRP, and never infer it from the barcode. mrpText must preserve the visible price text. Expiry may be EXP, USE BY, BEST BEFORE, or a printed date. If only a duration is printed, put the exact wording in expiryText and set expiry to null. Calories and protein only when clearly printed, otherwise null. confidence is 0 to 1 and describes how clearly the requested package information was read. Never invent missing information.`, 'gemini-2.5-flash')
  return ai
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
    source: database?.source || 'Gemini package identification',
    barcode,
  }
  const confidence = Number(ai?.confidence)
  if (Number.isFinite(confidence)) product.confidence = Math.max(0, Math.min(1, confidence))
  const mrp = Number(ai?.mrp)
  const mrpText = typeof ai?.mrpText === 'string' ? ai.mrpText.trim() : ''
  if (Number.isFinite(mrp) && mrp >= 0 && mrpText) {
    product.mrp = mrp
    product.mrpSource = 'Gemini package verification'
  }
  if (typeof ai?.expiry === 'string' && ai.expiry.trim()) {
    product.expiry = ai.expiry.trim()
    product.expirySource = 'Gemini package verification'
  } else if (typeof ai?.expiryText === 'string' && ai.expiryText.trim()) {
    product.expiry = ai.expiryText.trim()
    product.expirySource = 'Gemini package verification'
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

    if (request.method === 'POST' && url.pathname === '/api/barcode') {
      try {
        const body = await request.json() as { image?: string }
        if (!body.image) return json({ found: false, message: 'Barcode image is required.' }, 400)
        const ai = await analyzeBarcode(env, body.image)
        const barcode = normaliseBarcode(String(ai?.barcode || ''))
        if (!barcode || !validBarcode(barcode)) return json({ found: false, message: 'No verified barcode was read from the image.' }, 404)
        return json({ found: true, barcode })
      } catch {
        return json({ found: false, message: 'AI barcode analysis failed.' }, 422)
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/resolve') {
      try {
        const body = await request.json() as { barcode?: string; image?: string }
        const barcode = normaliseBarcode(body.barcode || '')
        if (!validBarcode(barcode)) return json({ found: false, message: 'Invalid barcode.' }, 400)
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
        if (Number.isFinite(mrp) && mrp >= 0 && mrpText) { data.mrp = mrp; data.mrpSource = 'Gemini package verification' }
        if (typeof ai.expiry === 'string' && ai.expiry.trim()) { data.expiry = ai.expiry.trim(); data.expirySource = 'Gemini package verification' }
        else if (typeof ai.expiryText === 'string' && ai.expiryText.trim()) { data.expiry = ai.expiryText.trim(); data.expirySource = 'Gemini package verification' }
        if (typeof ai.quantity === 'string' && ai.quantity.trim()) data.quantity = ai.quantity.trim()
        return json({ found: true, data })
      } catch { return json({ found: false, message: 'AI could not confidently read the package.' }, 422) }
    }

    return assets(request, env)
  },
}
