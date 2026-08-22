type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300',
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  })
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
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ScanCart/1.0 (real-world barcode shopping app)',
          },
          cf: { cacheTtl: 300, cacheEverything: true },
        } as RequestInit)

        if (!upstream.ok) return json({ found: false, message: 'Product database is temporarily unavailable.' }, 502)
        const raw = await upstream.json() as any
        if (raw.status !== 1 || !raw.product) {
          return json({ found: false, barcode, message: `Barcode ${barcode} was detected, but no product record was found in the connected product databases.` }, 404, { 'Cache-Control': 'public, max-age=60' })
        }

        const p = raw.product
        const n = p.nutriments || {}
        const calories = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'])
        const protein = Number(n.proteins_serving ?? n.proteins_100g)
        const price = Number(p.price ?? p.price_without_discount)
        const product = {
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
        }
        return json({ found: true, product })
      } catch {
        return json({ found: false, message: 'Could not reach the product database. Please try again.' }, 502, { 'Cache-Control': 'no-store' })
      }
    }

    return env.ASSETS.fetch(request)
  },
}
