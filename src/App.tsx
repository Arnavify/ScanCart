import { useEffect, useMemo, useRef, useState } from 'react'

type Product = { id: string; name: string; brand: string; calories: number; protein?: number; mrp: number; category: string; serving: string; expiry?: string }
type CartItem = Product & { qty: number }
type Screen = 'home' | 'scan' | 'product' | 'expiry' | 'cart' | 'checkout' | 'success' | 'history'

const products: Product[] = [
  { id: '8901234567890', name: 'Buldak Ramen', brand: 'Samyang', calories: 530, protein: 11, mrp: 130, category: 'Instant noodles', serving: '1 pack', expiry: '18 Sep 2026' },
  { id: '8901234567891', name: 'Dunkin Donut', brand: 'Dunkin', calories: 393, mrp: 209, category: 'Bakery', serving: '1 donut', expiry: '20 Sep 2026' },
  { id: '8901234567892', name: 'Mineral Water', brand: 'Varahi', calories: 0, protein: 0, mrp: 30, category: 'Beverage', serving: '1 bottle', expiry: '30 Dec 2026' },
]

function stored<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback } }

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [product, setProduct] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => stored('scancart-cart', []))
  const [history, setHistory] = useState<Product[]>(() => stored('scancart-history', []))
  const [payment, setPayment] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [expiry, setExpiry] = useState('')
  const [expiryState, setExpiryState] = useState<'idle'|'scanning'|'detected'|'failed'>('idle')
  const [manualExpiry, setManualExpiry] = useState('')
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })
  const [cameraReady, setCameraReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + i.mrp * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + i.calories * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const stopCamera = () => {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current)
    scanTimerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }

  const findProduct = (raw: string) => products.find(p => p.id === raw.replace(/\D/g, '')) ?? null

  const startScan = async () => {
    stopCamera()
    setScreen('scan')
    setScanning(false)
    setScanError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      streamRef.current = stream
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraReady(true)

      const BarcodeDetectorClass = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
      if (!BarcodeDetectorClass) {
        setScanError('Barcode scanning is not supported in this browser. Use Chrome on Android or Safari on iPhone, or enter the barcode manually.')
        return
      }
      const detector = new BarcodeDetectorClass({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2 || scanning) return
        try {
          const codes = await detector.detect(videoRef.current)
          const code = codes[0]?.rawValue
          if (!code) return
          const matched = findProduct(code)
          if (!matched) {
            setScanError(`Barcode ${code} was scanned, but this product is not in the database.`)
            return
          }
          setScanning(true)
          stopCamera()
          setProduct(matched)
          setExpiry('')
          setExpiryState('idle')
          setScreen('product')
        } catch {
          setScanError('Could not read that barcode. Hold the phone steady and move closer.')
        }
      }, 250)
    } catch (error) {
      setScanError(error instanceof Error && error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings and try again.' : error instanceof Error ? error.message : 'Could not open the camera.')
    }
  }

  const add = () => {
    if (!product) return
    setCart(c => c.some(i => i.id === product.id) ? c.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { ...product, qty: 1 }])
    setHistory(h => [product, ...h.filter(i => i.id !== product.id)].slice(0, 8))
  }
  const changeQty = (id: string, delta: number) => setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))

  const openExpiry = async () => {
    stopCamera()
    setScreen('expiry')
    setExpiry('')
    setExpiryState('scanning')
    setScanError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      streamRef.current = stream
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraReady(true)
    } catch {
      setExpiryState('failed')
      setScanError('Camera access is required for expiry OCR. Allow camera access and try again.')
    }
  }

  const runExpiryOCR = async () => {
    if (!videoRef.current || !cameraReady) return
    setExpiryState('scanning')
    setScanError('')
    try {
      const canvas = document.createElement('canvas')
      const video = videoRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = canvas.toDataURL('image/jpeg', 0.92)
      const w = window as Window & { Tesseract?: { recognize: (image: string, lang: string, options?: { logger?: (m: { status?: string; progress?: number }) => void }) => Promise<{ data: { text: string } }> } }
      if (!w.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('OCR library failed to load.'))
          document.head.appendChild(script)
        })
      }
      const result = await w.Tesseract!.recognize(image, 'eng')
      const text = result.data.text.replace(/\s+/g, ' ').trim()
      const date = text.match(/(?:0?[1-9]|[12]\d|3[01])\s*(?:[\/-]|\.)\s*(?:0?[1-9]|1[0-2])\s*(?:[\/-]|\.)\s*(?:20)?\d{2}/)?.[0]
        ?? text.match(/(?:EXP|BEST\s*BEFORE|USE\s*BY)\s*[:\-]?\s*([0-3]?\d\s*[A-Z]{3}\s*20?\d{2})/i)?.[1]
        ?? text.match(/(?:0?[1-9]|[12]\d|3[01])\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+20?\d{2}/i)?.[0]
      if (!date) throw new Error('No date found')
      setExpiry(date)
      setExpiryState('detected')
      stopCamera()
    } catch {
      setExpiryState('failed')
      setScanError('I could not read a clear expiry date. Move closer, keep the date inside the frame, and try again.')
      stopCamera()
    }
  }

  const saveManualExpiry = () => { if (!manualExpiry.trim()) return; setExpiry(manualExpiry.trim()); setExpiryState('detected'); setManualExpiry(''); stopCamera() }
  const pay = () => { setLastOrder({ total, items, calories }); setCart([]); setPayment(''); setScreen('success') }

  useEffect(() => () => stopCamera(), [])

  return <main className="app">
    {screen === 'home' && <>
      <header><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1></header>
      <section className="stats" aria-label="Cart summary"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total}</strong></div></section>
      <button className="primary big" onClick={startScan}>⌕ &nbsp; Start Scanning</button>
      <section aria-labelledby="recent-title"><div className="sectionTitle"><h2 id="recent-title">Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><span className="productIcon" aria-hidden="true">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No recent scans<br/><small>Scan a product to see it here.</small></div>}</section>
    </>}

    {screen === 'scan' && <div className="scanner" aria-live="polite"><button className="back" onClick={() => { stopCamera(); setScreen('home') }} aria-label="Close scanner">×</button><div className="cameraFrame"><video ref={videoRef} autoPlay muted playsInline /><div className="corner c1"/><div className="corner c2"/><div className="corner c3"/><div className="corner c4"/><span className="scanLine"/></div><h2>{scanning ? 'Barcode found' : cameraReady ? 'Scan a barcode' : 'Opening camera…'}</h2><p>{cameraReady ? 'Point your rear camera at the barcode on the package.' : 'Allow camera access when your browser asks.'}</p>{scanError && <div className="scanError">{scanError}</div>}{cameraReady && !scanning && <button className="secondary cameraRetry" onClick={startScan}>Restart Camera</button>}</div>}

    {screen === 'product' && product && <><button className="backText" onClick={() => { stopCamera(); setScreen('scan') }}>‹ Scan again</button><div className="productHero"><div className="largeIcon" aria-hidden="true">▦</div><div className="badge">BARCODE MATCH</div><h1>{product.name}</h1><p>{product.brand}</p></div><div className="detailGrid"><div><small>CALORIES</small><b>{product.calories} kcal</b><em>per {product.serving}</em></div><div><small>MRP</small><b>₹{product.mrp}</b><em>verify on package</em></div><div><small>PROTEIN</small><b>{product.protein ?? 'N/A'} g</b></div><div><small>EXPIRY</small><b>{expiry || 'Not scanned'}</b></div></div><div className="note">The product above appears only after a real barcode is detected. Nutrition and MRP come from the product database. Expiry is read separately with camera OCR.</div><button className="secondary" onClick={openExpiry}>Scan Expiry Date</button><button className="primary" onClick={() => { add(); setScreen('scan'); stopCamera() }}>Add to Cart</button></>}

    {screen === 'expiry' && <div className="expiryScreen" aria-live="polite"><button className="backText" onClick={() => { stopCamera(); setScreen('product') }}>‹ Product</button><div className="expiryCameraFrame"><video ref={videoRef} autoPlay muted playsInline /><div className="ocrLabel">EXPIRY / BEST BEFORE</div><div className="ocrBox"/></div>{expiryState === 'scanning' && <><h1>Scan the expiry date</h1><p>Place the printed expiry or best-before date inside the box.</p><button className="primary" onClick={runExpiryOCR} disabled={!cameraReady}>Read Date</button></>}{expiryState === 'detected' && <><div className="badge">DATE DETECTED</div><h1>{expiry}</h1><p>Confirm this date before saving it.</p><button className="primary" onClick={() => setScreen('product')}>Confirm Date</button></>}{expiryState === 'failed' && <><h1>Expiry not detected</h1><p>{scanError || 'The camera could not read a clear date.'}</p><button className="secondary" onClick={openExpiry}>Try Again</button></>}<div className="manualExpiry"><label htmlFor="expiry-input">Enter manually</label><div><input id="expiry-input" value={manualExpiry} onChange={e => setManualExpiry(e.target.value)} placeholder="e.g. 18 Sep 2026"/><button onClick={saveManualExpiry} disabled={!manualExpiry.trim()}>Save</button></div></div></div>}

    {screen === 'cart' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Your Cart</h1><p className="muted">Everything in one place.</p>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><span className="productIcon" aria-hidden="true">▦</span><div className="grow"><b>{i.name}</b><small>{i.calories} kcal · ₹{i.mrp} each</small><div className="stepper"><button onClick={() => changeQty(i.id,-1)} aria-label={`Remove one ${i.name}`}>−</button><b>{i.qty}</b><button onClick={() => changeQty(i.id,1)} aria-label={`Add one ${i.name}`}>+</button></div></div></div>) : <div className="empty">Your cart is empty.<br/><small>Scan a product to add it.</small></div>}<div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total MRP <b>₹{total}</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Proceed to Pay ₹{total}</button>}</>}

    {screen === 'checkout' && <><button className="backText" onClick={() => setScreen('cart')}>‹ Cart</button><h1>Checkout</h1><div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total <b>₹{total}</b></span></div><h2>Payment method</h2>{['UPI','Credit / Debit Card','Wallet'].map(x => <button className={`payment ${payment === x ? 'selected' : ''}`} onClick={() => setPayment(x)} aria-pressed={payment === x} key={x}><span>{x}</span><span aria-hidden="true">{payment === x ? '●' : '○'}</span></button>)}<button className="primary" disabled={!payment} onClick={pay}>Complete Payment ₹{total}</button></>}

    {screen === 'success' && <div className="success"><div className="successIcon" aria-hidden="true">✓</div><h1>Payment successful</h1><p>Order #SC10284</p><div className="summary"><span>Total <b>₹{lastOrder.total}</b></span><span>Items <b>{lastOrder.items}</b></span><span>Calories <b>{lastOrder.calories} kcal</b></span></div><button className="primary" onClick={() => setScreen('home')}>Back to Home</button></div>}

    {screen === 'history' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Scan History</h1>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><span className="productIcon" aria-hidden="true">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No scan history.</div>}</>}

    <nav aria-label="Primary navigation"><button className={screen === 'home' ? 'active' : ''} onClick={() => { stopCamera(); setScreen('home') }} aria-label="Home"><span className="navIcon">⌂</span><small>Home</small></button><button className="scanNav" onClick={startScan} aria-label="Scan"><span className="navIcon">⌕</span><small>Scan</small></button><button className={screen === 'cart' ? 'active' : ''} onClick={() => { stopCamera(); setScreen('cart') }} aria-label="Cart"><span className="navIcon">□</span><small>Cart {items ? `(${items})` : ''}</small></button></nav>
  </main>
}
