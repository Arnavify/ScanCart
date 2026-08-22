import { useEffect, useMemo, useRef, useState } from 'react'

type Product = {
  id: string
  name: string
  brand?: string
  calories?: number
  protein?: number
  mrp?: number
  currency?: string
  category?: string
  serving?: string
  image?: string
  quantity?: string
  nutriscore?: string
  source?: string
  barcode?: string
  mrpSource?: string
  expiry?: string
  expirySource?: string
  confidence?: number
}
type CartItem = Product & { qty: number }
type Screen = 'home' | 'scan' | 'product' | 'cart' | 'checkout' | 'success' | 'history'

declare global {
  interface Window {
    Quagga?: any
    ZXingBrowser?: any
  }
}

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
  }
  return <svg {...common}>{paths[name] || paths.scan}</svg>
}

function stored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

async function resolveProduct(barcode: string, image: string): Promise<Product> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ barcode, image }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.found || !data.product) throw new Error(data?.message || 'The barcode was detected, but the product could not be identified.')
    return { ...data.product, barcode }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Product analysis timed out. Please scan again.')
    throw error
  } finally { window.clearTimeout(timeout) }
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
  const [aiState, setAiState] = useState<'idle'|'reading'|'done'|'unavailable'>('idle')
  const [payment, setPayment] = useState('')
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })
  const scannerRef = useRef<any>(null)
  const zxingRef = useRef<any>(null)
  const scanLock = useRef(false)
  const candidates = useRef(new Map<string, number>())
  const mounted = useRef(true)
  const scannerRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { mounted.current = false; stopScanner() }, [])
  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + (i.mrp ?? 0) * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + (i.calories ?? 0) * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  function stopScanner() {
    try { scannerRef.current?.stop?.() } catch {}
    scannerRef.current = null
    try { window.Quagga?.stop?.() } catch {}
    try { zxingRef.current?.stop?.() } catch {}
    zxingRef.current = null
    if (scannerRootRef.current) scannerRootRef.current.innerHTML = ''
    setCameraReady(false)
  }

  function captureFrame(): string {
    const video = scannerRootRef.current?.querySelector('video') as HTMLVideoElement | null
    if (!video?.videoWidth || !video.videoHeight) return ''
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1400 / video.videoWidth)
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  function addToCart(item: Product) {
    setCart(current => current.some(x => x.id === item.id)
      ? current.map(x => x.id === item.id ? { ...x, ...item } : x)
      : [...current, { ...item, qty: 1 }])
  }

  async function acceptBarcode(raw: string) {
    const clean = String(raw || '').replace(/[^0-9]/g, '')
    if (scanLock.current || clean.length < 8) return

    const now = Date.now()
    for (const [code, time] of candidates.current) if (now - time > 1800) candidates.current.delete(code)
    candidates.current.set(clean, now)
    const repeats = [...candidates.current.entries()].filter(([code, time]) => code === clean && now - time < 1800).length
    if (repeats < 1) return

    scanLock.current = true
    setBarcode(clean)
    setScanning(true)
    setScanState('Barcode detected. Analyzing product…')
    setScanError('')
    const image = captureFrame()
    stopScanner()

    try {
      const found = await resolveProduct(clean, image)
      if (!mounted.current) return
      setProduct(found)
      addToCart(found)
      setHistory(h => [found, ...h.filter(x => x.id !== found.id)].slice(0, 20))
      setAiState(found.mrpSource || found.expirySource ? 'done' : 'unavailable')
      setScanState('Product identified and added to cart.')
      setScreen('product')
      setScanning(false)
      scanLock.current = false
    } catch (error) {
      if (!mounted.current) return
      setScanning(false)
      scanLock.current = false
      setScanState('')
      setScanError(error instanceof Error ? error.message : 'Product analysis failed.')
      setScreen('scan')
      window.setTimeout(() => { if (mounted.current && screen === 'scan') void startScanner() }, 200)
    }
  }

  async function startScanner() {
    if (scanLock.current) return
    stopScanner()
    candidates.current.clear()
    setCameraReady(false)
    setScanError('')
    setScanState('Starting camera…')
    setScanning(false)

    const root = scannerRootRef.current
    if (!root) return
    if (!window.isSecureContext) { setScanError('Camera access requires HTTPS.'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setScanError('This browser does not expose camera access.'); return }
    if (!window.Quagga) { setScanError('Barcode engine did not load. Reload the page and try again.'); return }

    try {
      await new Promise<void>((resolve, reject) => {
        window.Quagga.init({
          inputStream: {
            name: 'ScanCart Camera',
            type: 'LiveStream',
            target: root,
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 960 },
              height: { ideal: 1080, min: 540 },
              frameRate: { ideal: 30, max: 60 },
            },
            area: { top: '15%', right: '4%', left: '4%', bottom: '15%' },
          },
          locator: { patchSize: 'medium', halfSample: false },
          numOfWorkers: 0,
          frequency: 12,
          locate: true,
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
              'code_39_reader',
              'i2of5_reader',
            ],
            multiple: false,
          },
          debug: { drawBoundingBox: false, showFrequency: false, drawScanline: false, showPattern: false },
        }, (err: any) => err ? reject(err) : resolve())
      })

      if (!mounted.current || screen !== 'scan') { stopScanner(); return }
      scannerRef.current = window.Quagga
      window.Quagga.start()
      setCameraReady(true)
      setScanState('Point at a barcode. Scanning is automatic.')

      window.Quagga.onDetected((result: any) => {
        const code = result?.codeResult?.code
        if (code) void acceptBarcode(code)
      })

      const video = root.querySelector('video') as HTMLVideoElement | null
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0]
      const caps = track?.getCapabilities?.() as any
      const advanced: any[] = []
      if (caps?.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' })
      if (typeof caps?.zoom?.max === 'number' && caps.zoom.max > 1) advanced.push({ zoom: Math.min(2, caps.zoom.max) })
      if (advanced.length && track?.applyConstraints) { try { await track.applyConstraints({ advanced }) } catch {} }

      if (window.ZXingBrowser && video) {
        try {
          const Reader = window.ZXingBrowser.BrowserMultiFormatOneDReader || window.ZXingBrowser.BrowserMultiFormatReader
          if (Reader) {
            const reader = new Reader(undefined, { delayBetweenScanSuccess: 250, delayBetweenScanAttempts: 80 })
            zxingRef.current = await reader.decodeFromVideoElement(video, (result: any) => {
              const text = result?.getText?.() || ''
              if (text) void acceptBarcode(text)
            })
          }
        } catch {}
      }
    } catch (error) {
      stopScanner()
      setCameraReady(false)
      setScanError(`Camera scanner could not start. ${error instanceof Error ? error.message : 'Please allow camera access and try again.'}`)
      setScanState('')
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
    setAiState('idle')
    setScreen('scan')
  }

  function changeQty(id: string, delta: number) {
    setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))
  }

  const bottomNav = <nav className="bottomNav" aria-label="Primary navigation">
    <button className={screen === 'home' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('home') }}><Icon name="home" size={29}/><span>Home</span></button>
    <button className="scanNav" onClick={startScan}><Icon name="scan" size={31}/><span>Scan</span></button>
    <button className={screen === 'cart' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('cart') }}><span className="navIconWrap"><Icon name="cart" size={29}/>{items > 0 && <b>{items}</b>}</span><span>Cart</span></button>
  </nav>

  return <main className="app">
    {screen === 'home' && <>
      <header className="homeHeader"><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1><p>Point your camera at a real product barcode. ScanCart reads the code, looks up the product, and verifies package information.</p></header>
      <section className="stats"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total.toLocaleString('en-IN')}</strong></div></section>
      <button className="primary big" onClick={startScan}><Icon name="scan" size={31}/> Scan a product</button>
      <section><div className="sectionTitle"><h2>Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.brand || 'Brand unavailable'} · {p.calories != null ? `${p.calories} kcal` : 'Calories unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'MRP unavailable'}</strong></button>) : <div className="empty">No recent scans<br/><small>Point ScanCart at a real product barcode to begin.</small></div>}</section>
      {bottomNav}
    </>}

    {screen === 'scan' && <div className="scanner"><button className="backButton" onClick={() => { stopScanner(); setScreen('home') }} aria-label="Close scanner"><Icon name="close" size={30}/></button><div className="scannerTop"><span>SCAN PRODUCT</span><span className={cameraReady ? 'live' : ''}>{cameraReady ? '● LIVE' : 'CONNECTING'}</span></div><div className="cameraFrame"><div ref={scannerRootRef} className="quaggaRoot"/><div className="corner c1"/><div className="corner c2"/><div className="corner c3"/><div className="corner c4"/><div className="scanLine"/>{scanning && <div className="analyzingOverlay"><span className="spinner"/><b>Analyzing</b><small>Identifying the product and reading package details...</small></div>}</div><h2>{scanning ? 'Analyzing product' : 'Point at a barcode'}</h2><p>{scanning ? 'The barcode was detected. We are now getting the real product data.' : scanState || 'Scanning is automatic.'}</p>{barcode && <div className="barcodeRead">Detected barcode <b>{barcode}</b></div>}{scanError && <div className="scanError">{scanError}</div>}<button className="secondary" onClick={() => void startScanner()} disabled={scanning}><Icon name="refresh" size={17}/> Restart scanner</button>{bottomNav}</div>}

    {screen === 'product' && product && <div className="productScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="productHero">{product.image ? <img src={product.image} alt=""/> : <div className="largeIcon">▦</div>}<span className="badge">BARCODE VERIFIED</span><h1>{product.name}</h1><p>{product.brand || 'Brand unavailable'}{product.quantity ? ` · ${product.quantity}` : ''}</p><small>Barcode {product.barcode}</small></div><div className={`aiStatus ${aiState === 'done' ? 'done' : ''}`}><Icon name={aiState === 'done' ? 'check' : 'scan'} size={22}/><span><b>{aiState === 'done' ? 'Package details verified' : 'Product data found'}</b><small>{aiState === 'done' ? 'MRP and expiry came from the package image.' : product.source || 'Connected product database'}</small></span></div><div className="detailGrid"><div><small>MRP</small><b>{product.mrp != null ? `₹${product.mrp}` : 'Not verified'}</b><em>{product.mrpSource || 'No printed price read'}</em></div><div><small>EXPIRY</small><b>{product.expiry || 'Not verified'}</b><em>{product.expirySource || 'No printed date read'}</em></div><div><small>CALORIES</small><b>{product.calories != null ? `${product.calories} kcal` : 'N/A'}</b><em>{product.serving || 'Per serving / database value'}</em></div><div><small>PROTEIN</small><b>{product.protein != null ? `${product.protein} g` : 'N/A'}</b><em>Nutrition database</em></div></div><div className="sourceNote"><b>Data sources.</b> Barcode identity comes from a product database when available. MRP and expiry are only shown when they are read from the package image. ScanCart does not invent a price.</div><button className="primary" onClick={() => setScreen('cart')}>View cart</button></div>}

    {screen === 'cart' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="sectionTitle"><h2>Your Cart</h2><strong>{items} items</strong></div>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><div className="productThumb">{i.image ? <img src={i.image} alt=""/> : <span>▦</span>}</div><div className="grow"><b>{i.name}</b><small>{i.brand || 'Brand unavailable'}</small><div className="stepper"><button onClick={() => changeQty(i.id, -1)}><Icon name="minus" size={16}/></button><strong>{i.qty}</strong><button onClick={() => changeQty(i.id, 1)}><Icon name="plus" size={16}/></button></div></div></div>) : <div className="empty">Your cart is empty.</div>}<div className="summary"><span>Items <b>{items}</b></span><span>Total <b>₹{total.toLocaleString('en-IN')}</b></span><span>Calories <b>{calories.toLocaleString()} kcal</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Continue to checkout</button>}{bottomNav}</div>}

    {screen === 'checkout' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('cart')}><Icon name="back" size={18}/> Back</button><h1>Checkout</h1><p className="muted">Demo checkout flow for the final prototype.</p><div className="summary"><span>Total <b>₹{total.toLocaleString('en-IN')}</b></span><span>Items <b>{items}</b></span></div><div className="paymentOptions">{['UPI','Card','Cash'].map(x => <button key={x} className={payment === x ? 'selected' : ''} onClick={() => setPayment(x)}>{x}</button>)}</div><button className="primary" disabled={!payment} onClick={() => { setLastOrder({ total, items, calories }); setCart([]); setPayment(''); setScreen('success') }}>Pay ₹{total.toLocaleString('en-IN')}</button></div>}

    {screen === 'success' && <div className="successScreen"><div className="successIcon"><Icon name="check" size={42}/></div><h1>Order complete</h1><p>{lastOrder.items} items, ₹{lastOrder.total.toLocaleString('en-IN')}. Your cart has been cleared.</p><button className="primary" onClick={() => setScreen('home')}>Back to home</button></div>}

    {screen === 'history' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={18}/> Back</button><div className="sectionTitle"><h2>Scan history</h2></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.brand || 'Brand unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'N/A'}</strong></button>) : <div className="empty">No scan history.</div>}</div>}
  </main>
}
