type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  })
}

async function assets(request: Request, env: Env) {
  const response = await env.ASSETS.fetch(request)
  const headers = new Headers(response.headers)
  headers.set('Permissions-Policy', 'camera=(self)')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function normaliseBarcode(value: string) {
  return String(value || '').replace(/[^0-9]/g, '')
}

function plausibleBarcode(value: string) {
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)
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
  if (/^\d{14}$/.test(value)) {
    let sum = 0
    for (let i = 0; i < 13; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
    return (10 - (sum % 10)) % 10 === Number(value[13])
  }
  return false
}

// Open Food Facts is the only network dependency left in the scan path. It is
// given a hard timeout so a slow or unreachable upstream can never make a
// scan feel stuck — the client falls back to quick manual entry instead.
async function lookupOpenFoodFacts(barcode: string) {
  const fields = ['code', 'product_name', 'product_name_en', 'generic_name', 'brands', 'categories', 'quantity', 'image_front_url', 'nutriments', 'serving_size', 'product_type'].join(',')
  const url = `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?product_type=all&fields=${encodeURIComponent(fields)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ScanCart/3.0 (real-world barcode shopping app)' },
      signal: controller.signal,
    } as RequestInit)
    if (!upstream.ok) return null
    const raw = await upstream.json() as any
    if (!raw.product) return null
    const p = raw.product
    const n = p.nutriments || {}
    const calories = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? n['energy-kcal'])
    return {
      id: String(p.code || barcode),
      name: String(p.product_name || p.product_name_en || p.generic_name || '').trim(),
      brand: String(p.brands || '').split(',')[0].trim() || undefined,
      calories: Number.isFinite(calories) ? Math.round(calories) : undefined,
      category: String(p.categories || '').split(',')[0].trim() || undefined,
      quantity: String(p.quantity || '').trim() || undefined,
      image: String(p.image_front_url || '').trim() || undefined,
      source: 'Open Food Facts',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true })
    }

    const productMatch = url.pathname.match(/^\/api\/product\/([^/]+)$/)
    if (request.method === 'GET' && productMatch) {
      const barcode = normaliseBarcode(decodeURIComponent(productMatch[1]))
      if (!plausibleBarcode(barcode)) return json({ found: false, message: 'Invalid barcode.' }, 400)
      try {
        const product = await lookupOpenFoodFacts(barcode)
        if (!product || !product.name) return json({ found: false, barcode, verified: validBarcode(barcode), message: 'No product record was found for this barcode.' }, 404)
        return json({ found: true, product: { ...product, barcode, barcodeVerified: validBarcode(barcode) } }, 200, { 'Cache-Control': 'public, max-age=300' })
      } catch {
        return json({ found: false, barcode, verified: validBarcode(barcode), message: 'Product database is temporarily unavailable.' }, 502)
      }
    }

    return assets(request, env)
  },
}
