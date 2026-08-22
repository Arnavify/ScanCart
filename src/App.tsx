import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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

type ScanControls = { stop: () => void }

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6"/></>,
    back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14 4l3-3"/><path d="M21 19v-5h-5"/></>,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
  }
  return <svg {...common}>{paths[name] ?? paths.scan}</svg>
}

function stored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}

async function lookupProduct(barcode: string): Promise<Product> {
  const response = await fetch(`/api/product/${encodeURIComponent(barcode)}`, { headers: { Accept: 'application/json' } })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.found) throw new Error(data?.message || 'Barcode detected, but no product record was found.')
  return { ...data.product, barcode }
}

async function inspectPackage(image: string, barcode: string): Promise<Partial<Product>> {
  const response = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ image, barcode }) })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.found) throw new Error(data?.message || 'Package inspection is unavailable.')
  return data.data as Partial<Product>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [product, setProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => stored('scancart-cart', []))
  const [history, setHistory] = useState<Product[]>(() => stored('scancart-history', []))
  const [scanning, setScanning] = useState(false)
  const [lookupState, setLookupState] = useState('')
  const [scanError, setScanError] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [aiState, setAiState] = useState<'idle'|'reading'|'done'|'unavailable'>('idle')
  const [payment, setPayment] = useState('')
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<ScanControls | null>(null)
  const scanLock = useRef(false)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false; scannerRef.current?.stop() }, [])
  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + (i.mrp ?? 0) * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + (i.calories ?? 0) * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const stopCamera = () => {
    scannerRef.current?.stop()
    scannerRef.current = null
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach(t => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
    scanLock.current = false
  }

  const captureFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return ''
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.88)
  }

  const handleDetected = async (raw: string) => {
    if (scanLock.current) return
    scanLock.current = true
    setBarcode(raw)
    setScanning(true)
    setLookupState('Barcode detected. Identifying product…')
    const packageImage = captureFrame()
    try {
      const found = await lookupProduct(raw)
      if (!mounted.current) return
      stopCamera()
      setProduct(found)
      setAiState('reading')
      setLookupState('')
      setScreen('product')
      setHistory(h => [found, ...h.filter(x => x.id !== found.id)].slice(0, 20))
      if (packageImage) {
        try {
          const visual = await inspectPackage(packageImage, raw)
          if (!mounted.current) return
          setProduct(current => current ? { ...current, ...visual } : current)
          setHistory(h => h.map(x => x.id === found.id ? { ...x, ...visual } : x))
          setAiState('done')
        } catch {
          setAiState('unavailable')
        }
      } else setAiState('unavailable')
    } catch (error) {
      setScanning(false)
      scanLock.current = false
      setLookupState('')
      setScanError(error instanceof Error ? error.message : 'Product lookup failed.')
    }
  }

  const startScan = () => {
    stopCamera()
    setScreen('scan')
    setScanning(false)
    setLookupState('Opening camera…')
    setScanError('')
    setBarcode('')
    setAiState('idle')
  }

  useEffect(() => {
    if (screen !== 'scan') return
    let cancelled = false
    const boot = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (cancelled || !videoRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
        setLookupState('Point the camera at any product barcode.')
        const zxing = await import(/* @vite-ignore */ 'https://esm.sh/@zxing/browser@0.2.1') as any
        if (cancelled || !videoRef.current) return
        const reader = new zxing.BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoElement(videoRef.current, (result: any) => {
          if (result) void handleDetected(result.getText().trim())
        })
        scannerRef.current = controls
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Could not start camera.'
        setCameraReady(false)
        setScanError(/permission|notallowed|denied/i.test(message) ? 'Allow camera access for this site, then tap Restart scanner.' : `Could not start scanner. ${message}`)
        setLookupState('')
      }
    }
    void boot()
    return () => { cancelled = true; scannerRef.current?.stop(); scannerRef.current = null }
  }, [screen])

  const addToCart = () => {
    if (!product) return
    setCart(c => c.some(i => i.id === product.id) ? c.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { ...product, qty: 1 }])
    setScreen('home')
  }
  const changeQty = (id: string, delta: number) => setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))
  const checkout = () => { if (items) setScreen('checkout') }
  const pay = () => { setLastOrder({ total, items, calories }); setCart([]); setPayment(''); setScreen('success') }

  const bottomNav = <nav className="bottomNav" aria-label="Primary navigation">
    <button className={screen === 'home' ? 'active' : ''} onClick={() => { stopCamera(); setScreen('home') }}><Icon name="home" size={28}/><span>Home</span></button>
    <button className="scanNav" onClick={startScan}><Icon name="scan" size={30}/><span>Scan</span></button>
    <button className={screen === 'cart' ? 'active' : ''} onClick={() => { stopCamera(); setScreen('cart') }}><span className="navIconWrap"><Icon name="cart" size={28}/>{items > 0 && <b>{items}</b>}</span><span>Cart</span></button>
  </nav>

  return <main className="app">
    {screen === 'home' && <>
      <header className="homeHeader"><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1><p>Point your camera at a product barcode. ScanCart identifies the product and verifies package information.</p></header>
      <section className="stats"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total.toLocaleString('en-IN')}</strong></div></section>
      <button className="primary big" onClick={startScan}><Icon name="scan" size={30}/> Scan a product</button>
      <section><div className="sectionTitle"><h2>Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.brand || 'Brand unavailable'} · {p.calories != null ? `${p.calories} kcal` : 'Calories unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'MRP unavailable'}</strong></button>) : <div className="empty">No recent scans<br/><small>Real barcode scans will appear here.</small></div>}</section>
      {bottomNav}
    </>}

    {screen === 'scan' && <div className="scanner"><button className="backButton" onClick={() => { stopCamera(); setScreen('home') }} aria-label="Close scanner"><Icon name="close" size={30}/></button><div className="scannerTop"><span>SCAN PRODUCT</span><span>{cameraReady ? 'LIVE' : 'CONNECTING'}</span></div><div className="cameraFrame"><video ref={videoRef} autoPlay muted playsInline/><div className="corner c1"/><div className="corner c2"/><div className="corner c3"/><div className="corner c4"/><div className="scanLine"/></div><h2>{scanning ? 'Product detected' : 'Point at a barcode'}</h2><p>{lookupState || 'The scanner detects barcodes automatically. No button press is needed.'}</p>{scanError && <div className="scanError">{scanError}</div>}{barcode && <div className="barcodeRead">Barcode: <b>{barcode}</b></div>}<button className="secondary" onClick={startScan}><Icon name="refresh" size={21}/> Restart scanner</button>{bottomNav}</div>}

    {screen === 'product' && product && <div className="productScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={20}/> Back</button><div className="productHero">{product.image ? <img src={product.image} alt={product.name}/> : <div className="largeIcon">▦</div>}<span className="badge">REAL PRODUCT DATA</span><h1>{product.name}</h1><p>{product.brand || 'Brand unavailable'}{product.quantity ? ` · ${product.quantity}` : ''}</p>{product.barcode && <small>EAN/UPC {product.barcode}</small>}</div><div className="detailGrid"><div><small>MRP</small><b>{product.mrp != null ? `₹${product.mrp}` : 'Unavailable'}</b><em>{product.mrpSource || 'Database / package'}</em></div><div><small>CALORIES</small><b>{product.calories != null ? `${product.calories} kcal` : 'Unavailable'}</b><em>{product.serving || 'Nutrition data'}</em></div><div><small>EXPIRY</small><b>{product.expiry || 'Not detected'}</b><em>{product.expirySource || 'Package vision'}</em></div><div><small>PROTEIN</small><b>{product.protein != null ? `${product.protein} g` : 'Unavailable'}</b><em>Product data</em></div></div><div className="sourceNote"><Icon name="spark" size={16}/> {aiState === 'reading' ? 'AI is checking the package for printed MRP and expiry. Values are shown only when the model can read them.' : aiState === 'done' ? 'Package information was extracted by AI and merged with barcode product data.' : aiState === 'unavailable' ? 'AI package inspection was unavailable. No missing value has been invented.' : 'Barcode data loaded from the connected product database.'}</div><button className="primary" onClick={addToCart}><Icon name="cart" size={22}/> Add to cart</button></div>}

    {screen === 'history' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={20}/> Back</button><h1>Scan history</h1>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.barcode || p.id}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'N/A'}</strong></button>) : <div className="empty">Nothing scanned yet.</div>}</div>}

    {screen === 'cart' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={20}/> Back</button><h1>Your cart</h1>{cart.length ? <>{cart.map(i => <div className="cartRow" key={i.id}><div className="productThumb">{i.image ? <img src={i.image} alt=""/> : <span>▦</span>}</div><div className="grow"><b>{i.name}</b><small>{i.mrp != null ? `₹${i.mrp}` : 'MRP unavailable'}</small><div className="stepper"><button onClick={() => changeQty(i.id, -1)}><Icon name="minus" size={17}/></button><span>{i.qty}</span><button onClick={() => changeQty(i.id, 1)}><Icon name="plus" size={17}/></button></div></div></div>)}<div className="summary"><span><b>Items</b><b>{items}</b></span><span><b>Calories</b><b>{calories} kcal</b></span><span><b>Total MRP</b><b>₹{total.toLocaleString('en-IN')}</b></span></div><button className="primary" onClick={checkout}>Continue to checkout</button></> : <div className="empty">Your cart is empty.<br/><small>Scan a product to add it.</small></div>}</div>}

    {screen === 'checkout' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('cart')}><Icon name="back" size={20}/> Back</button><h1>Checkout</h1><div className="summary"><span><b>Items</b><b>{items}</b></span><span><b>Total MRP</b><b>₹{total.toLocaleString('en-IN')}</b></span></div><div className="paymentOptions">{['UPI','Card','Cash'].map(x => <button className={payment === x ? 'selected' : ''} key={x} onClick={() => setPayment(x)}>{x}</button>)}</div><button className="primary" disabled={!payment} onClick={pay}>Pay ₹{total.toLocaleString('en-IN')}</button></div>}

    {screen === 'success' && <div className="successScreen"><div className="successIcon"><Icon name="check" size={42}/></div><h1>Order complete</h1><p>{lastOrder.items} items · ₹{lastOrder.total.toLocaleString('en-IN')} · {lastOrder.calories} kcal</p><button className="primary" onClick={() => setScreen('home')}>Back to home</button></div>}
  </main>
}
