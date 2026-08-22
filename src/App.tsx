import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type Product = {
  id: string
  name: string
  brand: string
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
}
type CartItem = Product & { qty: number }
type Screen = 'home' | 'scan' | 'product' | 'expiry' | 'cart' | 'checkout' | 'success' | 'history'
type ScannerControls = { stop: () => void }

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
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14 4l3-3"/><path d="M21 19v-5h-5"/></>,
  }
  return <svg {...common}>{paths[name] ?? paths.scan}</svg>
}

function stored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch { return fallback }
}

async function lookupProduct(barcode: string): Promise<Product> {
  const response = await fetch(`/api/product/${encodeURIComponent(barcode)}`, { headers: { Accept: 'application/json' } })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.found) throw new Error(data?.message || 'This barcode was read, but no product record was found.')
  return data.product as Product
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [product, setProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => stored('scancart-cart', []))
  const [history, setHistory] = useState<Product[]>(() => stored('scancart-history', []))
  const [payment, setPayment] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [lookupState, setLookupState] = useState('')
  const [barcode, setBarcode] = useState('')
  const [expiry, setExpiry] = useState('')
  const [expiryState, setExpiryState] = useState<'idle'|'scanning'|'detected'|'failed'>('idle')
  const [manualExpiry, setManualExpiry] = useState('')
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })
  const [cameraReady, setCameraReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<ScannerControls | null>(null)
  const scanningLock = useRef(false)

  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + (i.mrp ?? 0) * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + (i.calories ?? 0) * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const stopScanner = () => {
    scannerRef.current?.stop()
    scannerRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
    scanningLock.current = false
  }

  const startScan = async () => {
    stopScanner()
    setScreen('scan')
    setScanning(false)
    setScanError('')
    setLookupState('')
    setBarcode('')
    try {
      const zxing = await import(/* @vite-ignore */ 'https://esm.sh/@zxing/browser@0.2.1') as any
      const reader = new zxing.BrowserMultiFormatReader()
      if (!videoRef.current) throw new Error('Scanner view is not ready.')
      setLookupState('Starting camera…')
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        videoRef.current,
        async (result: { getText: () => string } | undefined) => {
          if (!result || scanningLock.current) return
          scanningLock.current = true
          const raw = result.getText().trim()
          setBarcode(raw)
          setScanning(true)
          setLookupState('Barcode detected. Looking up product…')
          try {
            const found = await lookupProduct(raw)
            stopScanner()
            setProduct(found)
            setExpiry('')
            setExpiryState('idle')
            setHistory(h => [found, ...h.filter(i => i.id !== found.id)].slice(0, 12))
            setScreen('product')
          } catch (error) {
            setScanning(false)
            scanningLock.current = false
            setLookupState('')
            setScanError(error instanceof Error ? error.message : 'Product lookup failed.')
          }
        },
      )
      scannerRef.current = controls
      setCameraReady(true)
      setLookupState('Point your rear camera at the barcode.')
    } catch (error) {
      setCameraReady(false)
      const message = error instanceof Error ? error.message : 'Could not start the camera.'
      if (/permission|notallowed|denied/i.test(message)) setScanError('Camera permission was denied. Allow camera access for this site, then try again.')
      else setScanError(`Could not start the scanner. ${message}`)
    }
  }

  const add = () => {
    if (!product) return
    setCart(c => c.some(i => i.id === product.id)
      ? c.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      : [...c, { ...product, qty: 1 }])
    setScreen('home')
  }

  const changeQty = (id: string, delta: number) => setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))

  const openExpiry = async () => {
    stopScanner()
    setScreen('expiry')
    setExpiry('')
    setExpiryState('scanning')
    setScanError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      if (!videoRef.current) throw new Error('Camera view is not ready.')
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraReady(true)
    } catch (error) {
      setExpiryState('failed')
      setScanError(error instanceof Error ? error.message : 'Camera access is required for expiry OCR.')
    }
  }

  const runExpiryOCR = async () => {
    if (!videoRef.current || !cameraReady) return
    setExpiryState('scanning')
    setScanError('Reading the printed date…')
    try {
      const canvas = document.createElement('canvas')
      const video = videoRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = canvas.toDataURL('image/jpeg', 0.95)
      const tesseract = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js') as any
      const worker = await tesseract.createWorker('eng')
      const result = await worker.recognize(image)
      const text = String(result.data.text || '').replace(/\s+/g, ' ').trim()
      await worker.terminate()
      const date = text.match(/(?:0?[1-9]|[12]\d|3[01])\s*(?:[\/-]|\.)\s*(?:0?[1-9]|1[0-2])\s*(?:[\/-]|\.)\s*(?:20)?\d{2}/)?.[0]
        ?? text.match(/(?:EXP|BEST\s*BEFORE|USE\s*BY)\s*[:\-]?\s*([0-3]?\d\s*[A-Z]{3}\s*20?\d{2})/i)?.[1]
        ?? text.match(/(?:0?[1-9]|[12]\d|3[01])\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+20?\d{2}/i)?.[0]
      if (!date) throw new Error('No clear expiry date was found.')
      setExpiry(date)
      setExpiryState('detected')
      const stream = video.srcObject as MediaStream | null
      stream?.getTracks().forEach(track => track.stop())
      video.srcObject = null
      setCameraReady(false)
      setScanError('')
    } catch {
      setExpiryState('failed')
      setScanError('I could not read a clear expiry date. Move closer, improve the lighting, and keep the printed date inside the box.')
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach(track => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraReady(false)
    }
  }

  const saveManualExpiry = () => {
    if (!manualExpiry.trim()) return
    setExpiry(manualExpiry.trim())
    setExpiryState('detected')
    setManualExpiry('')
  }

  const pay = () => {
    setLastOrder({ total, items, calories })
    setCart([])
    setPayment('')
    setScreen('success')
  }

  useEffect(() => () => stopScanner(), [])

  const bottomNav = <nav className="bottomNav" aria-label="Primary navigation">
    <button className={screen === 'home' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('home') }}><Icon name="home" size={26}/><span>Home</span></button>
    <button className={screen === 'scan' ? 'active scanNav' : 'scanNav'} onClick={startScan}><Icon name="scan" size={28}/><span>Scan</span></button>
    <button className={screen === 'cart' ? 'active' : ''} onClick={() => { stopScanner(); setScreen('cart') }}><span className="navIconWrap"><Icon name="cart" size={26}/>{items > 0 && <b>{items}</b>}</span><span>Cart</span></button>
  </nav>

  return <main className="app">
    {screen === 'home' && <>
      <header className="homeHeader"><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1><p>Scan a real product barcode and get live product information.</p></header>
      <section className="stats"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total.toLocaleString('en-IN')}</strong></div></section>
      <button className="primary big" onClick={startScan}><Icon name="scan" size={28}/> Start Scanning</button>
      <section><div className="sectionTitle"><h2>Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.brand || 'Brand unavailable'} · {p.calories != null ? `${p.calories} kcal` : 'Nutrition unavailable'}</small></span><strong>{p.mrp != null ? `₹${p.mrp}` : 'Price unavailable'}</strong></button>) : <div className="empty">No recent scans<br/><small>Your real barcode scans will appear here.</small></div>}</section>
      {bottomNav}
    </>}

    {screen === 'scan' && <div className="scanner"><button className="backButton" onClick={() => { stopScanner(); setScreen('home') }} aria-label="Close scanner"><Icon name="close" size={30}/></button><div className="scannerTop"><span>SCAN PRODUCT</span><span>{cameraReady ? 'LIVE' : 'CONNECTING'}</span></div><div className="cameraFrame"><video ref={videoRef} autoPlay muted playsInline/></div><h2>{scanning ? 'Barcode found' : 'Scan a product barcode'}</h2><p>{lookupState || 'Keep the barcode flat, visible, and inside the frame.'}</p>{scanError && <div className="scanError">{scanError}</div>}{barcode && <div className="barcodeRead">Barcode: <b>{barcode}</b></div>}<button className="secondary" onClick={startScan}><Icon name="refresh" size={20}/> Restart scanner</button>{bottomNav}</div>}

    {screen === 'product' && product && <div className="productScreen"><button className="backText" onClick={() => setScreen('scan')}><Icon name="back" size={22}/> Scan again</button><div className="productHero">{product.image ? <img src={product.image} alt={product.name}/> : <div className="largeIcon">▦</div>}<div className="badge">LIVE BARCODE RESULT</div><h1>{product.name}</h1><p>{product.brand || 'Brand unavailable'}</p><small>Barcode {product.id}</small></div><div className="detailGrid"><div><small>CALORIES</small><b>{product.calories != null ? `${product.calories} kcal` : 'Unavailable'}</b><em>{product.serving ? `per ${product.serving}` : 'database value'}</em></div><div><small>PRICE</small><b>{product.mrp != null ? `₹${product.mrp}` : 'Unavailable'}</b><em>{product.mrp != null ? 'database value' : 'not supplied by database'}</em></div><div><small>PROTEIN</small><b>{product.protein != null ? `${product.protein} g` : 'Unavailable'}</b><em>database value</em></div><div><small>EXPIRY</small><b>{expiry || 'Not scanned'}</b><em>read from package</em></div></div><div className="sourceNote">Product data is retrieved from the connected Open Food Facts family of databases using the scanned barcode. ScanCart does not invent missing nutrition or price data.</div><button className="secondary" onClick={openExpiry}><Icon name="camera" size={21}/> Scan expiry date</button><button className="primary" onClick={add}><Icon name="cart" size={21}/> Add to cart</button></div>}

    {screen === 'expiry' && <div className="expiryScreen"><button className="backText" onClick={() => { stopScanner(); setScreen('product') }}><Icon name="back" size={22}/> Product</button><div className="expiryCameraFrame"><video ref={videoRef} autoPlay muted playsInline/><div className="ocrLabel">EXPIRY / BEST BEFORE</div><div className="ocrBox"/></div>{expiryState === 'scanning' && <><h1>Read the expiry date</h1><p>{scanError || 'Place the printed expiry or best-before date inside the box.'}</p><button className="primary" onClick={runExpiryOCR} disabled={!cameraReady}><Icon name="camera" size={21}/> Read date</button></>}{expiryState === 'detected' && <><div className="badge">DATE DETECTED</div><h1>{expiry}</h1><p>Check the date against the package before confirming.</p><button className="primary" onClick={() => setScreen('product')}><Icon name="check" size={21}/> Confirm date</button></>}{expiryState === 'failed' && <><h1>Expiry not detected</h1><p>{scanError}</p><button className="secondary" onClick={openExpiry}><Icon name="refresh" size={21}/> Try again</button></>}<div className="manualExpiry"><label htmlFor="expiry-input">Enter manually if print is unreadable</label><div><input id="expiry-input" value={manualExpiry} onChange={e => setManualExpiry(e.target.value)} placeholder="18 Sep 2026"/><button onClick={saveManualExpiry} disabled={!manualExpiry.trim()}>Save</button></div></div></div>}

    {screen === 'cart' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={22}/> Home</button><h1>Your Cart</h1><p className="muted">Only products you actually scanned.</p>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><div className="productThumb">{i.image ? <img src={i.image} alt=""/> : <span>▦</span>}</div><div className="grow"><b>{i.name}</b><small>{i.calories != null ? `${i.calories} kcal` : 'Calories unavailable'} · {i.mrp != null ? `₹${i.mrp}` : 'Price unavailable'}</small><div className="stepper"><button onClick={() => changeQty(i.id,-1)} aria-label="Remove one"><Icon name="minus" size={18}/></button><b>{i.qty}</b><button onClick={() => changeQty(i.id,1)} aria-label="Add one"><Icon name="plus" size={18}/></button></div></div></div>) : <div className="empty">Your cart is empty.</div>}<div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total known price <b>₹{total}</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Proceed to checkout</button>}{bottomNav}</div>}

    {screen === 'checkout' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('cart')}><Icon name="back" size={22}/> Cart</button><h1>Checkout</h1><p className="muted">Demo checkout. No real payment is processed.</p><div className="summary"><span>Items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Known product value <b>₹{total}</b></span></div><div className="paymentOptions"><button className={payment === 'UPI' ? 'selected' : ''} onClick={() => setPayment('UPI')}>UPI</button><button className={payment === 'Card' ? 'selected' : ''} onClick={() => setPayment('Card')}>Card</button><button className={payment === 'Cash' ? 'selected' : ''} onClick={() => setPayment('Cash')}>Cash</button></div><button className="primary" disabled={!payment} onClick={pay}>Place demo order</button></div>}

    {screen === 'success' && <div className="successScreen"><div className="successIcon"><Icon name="check" size={42}/></div><h1>Order complete</h1><p>Your demo order contains {lastOrder.items} items and {lastOrder.calories} kcal of known nutrition data.</p><button className="primary" onClick={() => setScreen('home')}>Back to home</button></div>}

    {screen === 'history' && <div className="contentScreen"><button className="backText" onClick={() => setScreen('home')}><Icon name="back" size={22}/> Home</button><h1>Scan History</h1>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><div className="productThumb">{p.image ? <img src={p.image} alt=""/> : <span>▦</span>}</div><span><b>{p.name}</b><small>{p.brand || 'Brand unavailable'} · {p.id}</small></span></button>) : <div className="empty">No scans yet.</div>}</div>}
  </main>
}
