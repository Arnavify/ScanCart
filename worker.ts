type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> }; GEMINI_API_KEY?: string }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300',
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  })
}

function cleanJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1] : text.trim()
}

function normaliseImage(image: string) {
  const match = image.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
  if (!match) throw new Error('Invalid image payload.')
  return { mimeType: match[1].toLowerCase().replace('jpg', 'jpeg'), data: match[2] }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const match = url.pathname.match(/^\/api\/product\/([^/]+)$/)
    if (request.method === 'GET' && match) {
      const barcode = decodeURIComponent(match[1]).replace(/[^0-9]/g, '')
      if (!barcode) return json({ found: false, message: 'Invalid barcode.' }, 400)
      const fields = [
        'code', 'product_name', 'product_name_en', 'brands', 'categories', 'quantity',
        'image_front_url', 'nutriments', 'nutrition_grades', 'nutriscore_data',
        'serving_size', 'product_type', 'price', 'price_without_discount', 'price_currency',
      ].join(',')
      try {
        const upstream = await fetch(`https://world.openfoodfacts.org/api/v3/product/${barcode}.json?product_type=all&fields=${encodeURIComponent(fields)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'ScanCart/1.0 (real-world barcode shopping app)' },
          cf: { cacheTtl: 300, cacheEverything: true },
        } as RequestInit)
        if (!upstream.ok) return json({ found: false, message: 'Product database is temporarily unavailable.' }, 502)
        const raw = await upstream.json() as any
        if (raw.status !== 1 || !raw.product) return json({ found: false, barcode, message: `Barcode ${barcode} was detected, but no product record was found in the connected product database.` }, 404, { 'Cache-Control': 'public, max-age=60' })
        const p = raw.product
        const n = p.nutriments || {}
        const calories = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'])
        const protein = Number(n.proteins_serving ?? n.proteins_100g)
        const price = Number(p.price ?? p.price_without_discount)
        return json({ found: true, product: {
          id: String(p.code || barcode),
          name: String(p.product_name || p.product_name_en || '').trim() || 'Unnamed product',
          brand: String(p.brands || '').split(',')[0].trim(),
          calories: Number.isFinite(calories) ? calories : undefined,
          protein: Number.isFinite(protein) ? protein : undefined,
          mrp: Number.isFinite(price) ? price : undefined,
          currency: String(p.price_currency || 'INR'),
          category: String(p.categories || '').split(',')[0].trim() || undefined,
          serving: String(p.serving_size || '').trim() || undefined,
          image: String(p.image_front_url || '').trim() || undefined,
          quantity: String(p.quantity || '').trim() || undefined,
          nutriscore: String(p.nutrition_grades || p.nutriscore_data?.grade || '').trim() || undefined,
          source: 'Open Food Facts',
        } })
      } catch { return json({ found: false, message: 'Could not reach the product database. Please try again.' }, 502, { 'Cache-Control': 'no-store' }) }
    }

    if (request.method === 'POST' && url.pathname === '/api/inspect') {
      if (!env.GEMINI_API_KEY) return json({ found: false, message: 'AI package inspection is not configured on this deployment.' }, 503, { 'Cache-Control': 'no-store' })
      try {
        const body = await request.json() as { image?: string; barcode?: string }
        if (!body.image) return json({ found: false, message: 'Package image is required.' }, 400)
        const image = normaliseImage(body.image)
        const prompt = `You are ScanCart's package-data verifier. Inspect ONLY the supplied physical product image. The barcode is ${body.barcode || 'unknown'} and is context only. Read printed package information exactly. Never guess, infer, calculate, or invent missing values. Return ONLY valid JSON with this schema: {"mrp": number|null, "mrpText": string|null, "expiry": string|null, "expiryText": string|null, "quantity": string|null, "confidence": number}. MRP means the printed Maximum Retail Price in INR, not a store selling price. Accept Rs, ₹, INR and MRP markings. Expiry may be EXP, USE BY, BEST BEFORE or a printed date. If a date is only a duration such as 'Best Before 6 Months From Packaging', return the exact printed text in expiryText and leave expiry null. Confidence must reflect how clearly the printed information is visible. Do not return a value you cannot read from the image.`
        const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            model: 'gemma-4-31b-it',
            input: [
              { type: 'image', data: image.data, mime_type: image.mimeType },
              { type: 'text', text: prompt },
            ],
          }),
        })
        const raw = await upstream.json() as any
        if (!upstream.ok) return json({ found: false, message: 'The AI package verifier could not process this image.' }, 502, { 'Cache-Control': 'no-store' })
        const text = String(raw.output_text || '').trim()
        const parsed = JSON.parse(cleanJson(text)) as any
        const confidence = Number(parsed.confidence)
        const data: Record<string, unknown> = { confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0 }
        if (typeof parsed.mrp === 'number' && Number.isFinite(parsed.mrp) && parsed.mrp >= 0) { data.mrp = parsed.mrp; data.mrpSource = 'Package AI verification' }
        if (typeof parsed.expiry === 'string' && parsed.expiry.trim()) { data.expiry = parsed.expiry.trim(); data.expirySource = 'Package AI verification' }
        if (typeof parsed.expiryText === 'string' && parsed.expiryText.trim() && !data.expiry) { data.expiry = parsed.expiryText.trim(); data.expirySource = 'Package AI verification' }
        if (typeof parsed.quantity === 'string' && parsed.quantity.trim()) data.quantity = parsed.quantity.trim()
        return json({ found: true, data }, 200, { 'Cache-Control': 'no-store' })
      } catch { return json({ found: false, message: 'AI could not confidently read the printed package information. No value was invented.' }, 422, { 'Cache-Control': 'no-store' }) }
    }

    return env.ASSETS.fetch(request)
  },
}
