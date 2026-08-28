import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type Product = {
  id: string
  name: string
  brand?: string
  calories?: number
  mrp?: number
  category?: string
  quantity?: string
  source?: string
  barcode?: string
  expiry?: string
  barcodeVerified?: boolean
}
type CartItem = Product & { qty: number }
type Screen = 'home' | 'scan' | 'product' | 'cart' | 'checkout' | 'success' | 'history'

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<string, JSX.Element> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6"/></>,
    back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14 4l3-3"/><path d="M21 19v-5h-5"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
  }
  return <svg {...common}>{paths[name] || paths.scan}</svg>
}

function stored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

function cleanBarcode(value: unknown): string {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

function validCheckDigit(value: string): boolean {
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

function normalizeBarcode(value: unknown): string {
  const clean = cleanBarcode(value)
  if (validCheckDigit(clean)) return clean
  return clean.length >= 8 && clean.length <= 14 ? clean : ''
}

// Product identity + calories come from a real barcode database (instant REST
// lookup, hard-capped so it can never stall a scan). MRP and expiry are
// physically printed on each package and are not something any barcode
// database can look up, so those are captured once from the user and cached
// locally per-barcode for every scan after the first.
async function fetchDatabaseProduct(barcode: string): Promise<Product | null> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`/api/product/${barcode}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    const data = await response.json().catch(() => null)
    if (response.ok && data?.found && data.product) return data.product as Product
    return null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

function loadProductCache(): Record<string, Product> {
  return stored('scancart-products', {})
}

function saveProductToCache(product: Product) {
  const key = product.barcode || product.id
  if (!key) return
  const cache = loadProductCache()
  cache[key] = product
  try { localStorage.setItem('scancart-products', JSON.stringify(cache)) } catch {}
}

export default function ScanCartApp() {
  const [screen, setScreen] = useState<Screen>('home')
  const [product, setProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => stored('scancart-cart', []))
  const [history, setHistory] = useState<Product[]>(() => stored('scancart-history', []))
  const [cameraReady, setCameraReady] = useState(false)
  const [scanState, setScanState] = useState('Starting camera…')
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [needsDetails, setNeedsDetails] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftMrp, setDraftMrp] = useState('')
  const [draftCalories, setDraftCalories] = useState('')
  const [draftExpiry, setDraftExpiry] = useState('')
  const [payment, setPayment] = useState('')
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const scanLock = useRef(false)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false; stopScanner() }, [])
  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + (i.mrp ?? 0) * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + (i.calories ?? 0) * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  function stopScanner() {
    try { controlsRef.current?.stop?.() } catch {}
    controlsRef.current = null
    const video = videoRef.current
    const stream = video?.srcObject as MediaStream | null
    stream?.getTracks().forEach(track => track.stop())
    if (video) video.srcObject = null
    setCameraReady(false)
  }

  function addToCart(item: Product) {
    setCart(current => current.some(x => x.id === item.id)
      ? current.map(x => x.id === item.id ? { ...x, ...item } : x)
      : [...current, { ...item, qty: 1 }])
  }

  function openDetailsForm(base: Product) {
    setProduct(base)
    setDraftName(base.name || '')
    setDraftMrp(base.mrp != null ? String(base.mrp) : '')
    setDraftCalories(base.calories != null ? String(base.calories) : '')
    setDraftExpiry(base.expiry || '')
    setNeedsDetails(true)
    setScreen('product')
  }

  function finishScan(finalProduct: Product) {
    saveProductToCache(finalProduct)
    setProduct(finalProduct)
    addToCart(finalProduct)
    setHistory(h => [finalProduct, ...h.filter(x => x.id !== finalProduct.id)].slice(0, 20))
    setNeedsDetails(false)
    setScanState('')
    setScreen('product')
  }

  function saveDetails() {
    if (!product) return
    const name = draftName.trim()
    if (!name) return
    const mrpValue = draftMrp.trim() === '' ? undefined : Number(draftMrp)
    const caloriesValue = draftCalories.trim() === '' ? undefined : Number(draftCalories)
    finishScan({
      ...product,
      name,
      mrp: Number.isFinite(mrpValue as number) ? mrpValue : undefined,
      calories: Number.isFinite(caloriesValue as number) ? caloriesValue : undefined,
      expiry: draftExpiry.trim() || undefined,
    })
  }

  // Called the instant zxing decodes a valid barcode from the live camera
  // feed — fully on-device, no photo is captured or sent anywhere.
  async function acceptBarcode(raw: string) {
    const clean = normalizeBarcode(raw)
    if (scanLock.current || clean.length < 8) return
    scanLock.current = true
    setBarcode(clean)
    setScanError('')
    stopScanner()

    const cached = loadProductCache()[clean]
    if (cached && cached.name && cached.mrp != null && cached.calories != null) {
      finishScan(cached)
      return
    }

    setScanning(true)
    setScanState('Looking up product…')
    const remote = await fetchDatabaseProduct(clean)
    if (!mounted.current) return
    setScanning(false)

    const merged: Product = {
      id: clean,
      barcode: clean,
      barcodeVerified: validCheckDigit(clean),
      name: cached?.name || remote?.name || '',
      brand: remote?.brand ?? cached?.brand,
      calories: cached?.calories ?? remote?.calories,
      mrp: cached?.mrp ?? remote?.mrp,
      expiry: cached?.expiry ?? remote?.expiry,
      quantity: remote?.quantity ?? cached?.quantity,
      category: remote?.category ?? cached?.category,
      source: remote?.source ?? cached?.source,
    }

    if (!merged.name || merged.mrp == null || merged.calories == null) {
      openDetailsForm(merged)
    } else {
      finishScan(merged)
    }
  }

  async function startScanner() {
    if (scanLock.current) return
    stopScanner()
    setCameraReady(false)
    setScanError('')
    setScanning(false)
    setScanState('Starting camera…')
    const video = videoRef.current
    if (!video) { setScanError('Scanner camera view is not ready.'); return }
    if (!window.isSecureContext) { setScanError('Camera access requires HTTPS.'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setScanError('This browser does not expose camera access.'); return }

    try {
      const reader = new BrowserMultiFormatReader()
      controlsRef.current = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            frameRate: { ideal: 30, max: 60 },
          },
        },
        video,
        (result) => {
          const value = normalizeBarcode(result?.getText?.())
          if (value) void acceptBarcode(value)
        },
      )
      if (!mounted.current || screen !== 'scan') return
      setCameraReady(true)
      setScanState('Point at a barcode. Scanning is automatic.')
    } catch (error) {
      stopScanner()
      setCameraReady(false)
      setScanState('')
      const message = error instanceof Error ? error.message : 'Please allow camera access and try again.'
      setScanError(message)
    }
  }

  useEffect(() => {
    if (screen !== 'scan') return
    void startScanner()
    return () => stopScanner()
  }, [screen])

  function startScan() {
    scanLock.current = false
    setBarcode('')
    setNeedsDetails(false)
    setScanError('')
    setScreen('scan')
  }

  function changeQty(id: string, delta: number) {
    setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))
  }

  function editProductDetails(p: Product) {
    openDetailsForm(p)
  }

  const bottomNav = <nav className="bottomNav" aria-label="Primary navigation">
    <button className={screen === 'home' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('home') }}><Icon name="home" size={29}/><span>Home</span></button>
    <button className="scanNav" onClick={startScan}><Icon name="scan" size={31}/><span>Scan</span></button>
    <button className={screen === 'cart' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('cart') }}><span className="navIconWrap"><Icon name="cart" size={29}/>{items > 0 && <b>{items}</b>}</span><span>Cart</span></button>
  </nav>

  return <main className="app">
    {screen === 'home' && <>
      <header className="homeHeader"><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1><p>Point your camera at a product barcode. ScanCart reads it instantly and shows its name, calories, MRP, and expiry.</p></header>
      <section className="stats"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total.toLocaleString('en-IN')}</strong></div></section>
      <button className="primary big" onClick={startScan}><Icon name="scan" size={31}/> Scan a product</button>
      <section><div className="sectionTitle"><h2>Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setNeedsDetails(false); setScreen('product') }}><div className="productThumb"><span>{(p.name || '?').charAt(0).toUpperCase()}</span></div><span><b>{p.name}</b><small>{p.calories != null ? `${p.calories} kcal` : 'Calories unavailable'} · {p.expiry || 'Expiry unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'MRP unavailable'}</strong></button>) : <div className="empty">No recent scans<br/><small>Point ScanCart at a real product barcode to begin.</small></div>}</section>
      {bottomNav}
    </>}

    {screen === 'scan' && <div className="scanner"><button className="backButton" onClick={() => { stopScanner(); setScreen('home') }} aria-label="Close scanner"><Icon name="close" size={30}/></button><div className="scannerTop"><span>SCAN PRODUCT</span><span className={cameraReady ? 'live' : ''}>{cameraReady ? '● LIVE' : 'CONNECTING'}</span></div><div className="cameraFrame"><video ref={videoRef} autoPlay muted playsInline/><div className="corner c1"/><div className="corner c2"/><div className="corner c3"/><div className="corner c4"/><div className="scanLine"/>{scanning && <div className="analyzingOverlay"><span className="spinner"/><b>Looking it up</b><small>Fetching this product's details...</small></div>}</div><h2>{scanning ? 'Looking up product' : 'Point at a barcode'}</h2><p>{scanning ? 'Barcode read instantly on-device. Fetching product details now.' : scanState || 'Scanning is automatic.'}</p>{barcode && <div className="barcodeRead">Detected barcode <b>{barcode}</b></div>}{scanError && <div className="scanError">{scanError}</div>}<button className="secondary" onClick={() => void startScanner()} disabled={scanning}><Icon name="refresh" size={17}/> Restart scanner</button>{bottomNav}</div>}

    {screen === 'product' && product && needsDetails && <div className="productScreen"><button className="backText" onClick={() => { setNeedsDetails(false); setScreen('home') }}><Icon name="back" size={18}/> Back</button><h1 className="formTitle">Add missing details</h1><p className="muted">Barcode {product.barcode}. These aren't in any product database, so enter them once — ScanCart remembers them instantly for every future scan of this product.</p><label className="field"><span>Product name</span><input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="e.g. Amul Butter 100g"/></label><label className="field"><span>MRP (₹)</span><input inputMode="decimal" value={draftMrp} onChange={e => setDraftMrp(e.target.value)} placeholder="e.g. 62"/></label><label className="field"><span>Calories (kcal)</span><input inputMode="decimal" value={draftCalories} onChange={e => setDraftCalories(e.target.value)} placeholder="e.g. 250"/></label><label className="field"><span>Expiry date (optional)</span><input type="date" value={draftExpiry} onChange={e => setDraftExpiry(e.target.value)}/></label><button className="primary" disabled={!draftName.trim()} onClick={saveDetails}>Save and add to cart</button></div>}

    {screen === 'product' && product && !needsDetails && <div className="productScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="productHero"><h1>{product.name}</h1><small>Barcode {product.barcode}</small></div><div className="detailGrid"><div><small>MRP</small><b>{product.mrp != null ? `₹${product.mrp}` : 'Not entered'}</b></div><div><small>CALORIES</small><b>{product.calories != null ? `${product.calories} kcal` : 'Not entered'}</b></div><div><small>EXPIRY</small><b>{product.expiry || 'Not entered'}</b></div></div><button className="secondary" onClick={() => editProductDetails(product)}><Icon name="edit" size={16}/> Edit details</button><button className="primary" onClick={() => setScreen('cart')}>View cart</button></div>}

    {screen === 'cart' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="sectionTitle"><h2>Your Cart</h2><strong>{items} items</strong></div>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><div className="productThumb"><span>{(i.name || '?').charAt(0).toUpperCase()}</span></div><div className="grow"><b>{i.name}</b><small>{i.mrp != null ? `₹${i.mrp}` : 'MRP unavailable'} · {i.calories != null ? `${i.calories} kcal` : 'Calories unavailable'}</small><div className="stepper"><button onClick={() => changeQty(i.id, -1)}><Icon name="minus" size={16}/></button><strong>{i.qty}</strong><button onClick={() => changeQty(i.id, 1)}><Icon name="plus" size={16}/></button></div></div></div>) : <div className="empty">Your cart is empty.</div>}<div className="summary"><span>Items <b>{items}</b></span><span>Total <b>₹{total.toLocaleString('en-IN')}</b></span><span>Calories <b>{calories.toLocaleString()} kcal</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Continue to checkout</button>}{bottomNav}</div>}

    {screen === 'checkout' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('cart')}><Icon name="back" size={18}/> Back</button><h1>Checkout</h1><p className="muted">Demo checkout flow for the final prototype.</p><div className="summary"><span>Total <b>₹{total.toLocaleString('en-IN')}</b></span><span>Items <b>{items}</b></span></div><div className="paymentOptions">{['UPI','Card','Cash'].map(x => <button key={x} className={payment === x ? 'selected' : ''} onClick={() => setPayment(x)}>{x}</button>)}</div><button className="primary" disabled={!payment} onClick={() => { setLastOrder({ total, items, calories }); setCart([]); setPayment(''); setScreen('success') }}>Pay ₹{total.toLocaleString('en-IN')}</button></div>}

    {screen === 'success' && <div className="successScreen"><div className="successIcon"><Icon name="check" size={42}/></div><h1>Order complete</h1><p>{lastOrder.items} items, ₹{lastOrder.total.toLocaleString('en-IN')}. Your cart has been cleared.</p><button className="primary" onClick={() => setScreen('home')}>Back to home</button></div>}

    {screen === 'history' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="sectionTitle"><h2>Scan history</h2></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setNeedsDetails(false); setScreen('product') }}><div className="productThumb"><span>{(p.name || '?').charAt(0).toUpperCase()}</span></div><span><b>{p.name}</b><small>{p.calories != null ? `${p.calories} kcal` : 'Calories unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'N/A'}</strong></button>) : <div className="empty">No scan history.</div>}</div>}
  </main>
}
