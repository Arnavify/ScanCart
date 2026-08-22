import { useEffect, useMemo, useState } from 'react'

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
  const [product, setProduct] = useState(products[0])
  const [cart, setCart] = useState<CartItem[]>(() => stored('scancart-cart', []))
  const [history, setHistory] = useState<Product[]>(() => stored('scancart-history', []))
  const [payment, setPayment] = useState('')
  const [scanning, setScanning] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [expiryState, setExpiryState] = useState<'idle'|'scanning'|'detected'|'failed'>('idle')
  const [manualExpiry, setManualExpiry] = useState('')
  const [scanIndex, setScanIndex] = useState(0)
  const [lastOrder, setLastOrder] = useState({ total: 0, items: 0, calories: 0 })

  useEffect(() => localStorage.setItem('scancart-cart', JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem('scancart-history', JSON.stringify(history)), [history])

  const total = useMemo(() => cart.reduce((s, i) => s + i.mrp * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + i.calories * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const startScan = () => {
    setScreen('scan'); setScanning(true)
    const next = products[scanIndex % products.length]; setScanIndex(i => i + 1)
    window.setTimeout(() => { setProduct(next); setScanning(false); setExpiry(''); setExpiryState('idle'); setScreen('product') }, 900)
  }
  const add = () => {
    setCart(c => c.some(i => i.id === product.id) ? c.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { ...product, qty: 1 }])
    setHistory(h => [product, ...h.filter(i => i.id !== product.id)].slice(0, 8))
  }
  const changeQty = (id: string, delta: number) => setCart(c => c.flatMap(i => i.id === id ? [{ ...i, qty: i.qty + delta }].filter(x => x.qty > 0) : [i]))
  const scanExpiry = () => { setScreen('expiry'); setExpiryState('scanning'); window.setTimeout(() => { setExpiry(product.expiry ?? ''); setExpiryState(product.expiry ? 'detected' : 'failed') }, 800) }
  const saveManualExpiry = () => { if (!manualExpiry.trim()) return; setExpiry(manualExpiry.trim()); setExpiryState('detected'); setManualExpiry('') }
  const pay = () => { setLastOrder({ total, items, calories }); setCart([]); setPayment(''); setScreen('success') }

  return <main className="app">
    {screen === 'home' && <>
      <header><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1></header>
      <section className="stats" aria-label="Cart summary"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total}</strong></div></section>
      <button className="primary big" onClick={startScan}>⌕ &nbsp; Start Scanning</button>
      <section aria-labelledby="recent-title"><div className="sectionTitle"><h2 id="recent-title">Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><span className="productIcon" aria-hidden="true">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No recent scans<br/><small>Scan a product to see it here.</small></div>}</section>
    </>}

    {screen === 'scan' && <div className="scanner" aria-live="polite"><button className="back" onClick={() => { setScanning(false); setScreen('home') }} aria-label="Close scanner">×</button><div className="scanBox" aria-label="Barcode scanning area"><i/><i/><i/><i/><span/></div><h2>{scanning ? 'Analyzing product…' : 'Scan a barcode'}</h2><p>{scanning ? 'Barcode identified · Product matched · Nutrition found' : 'Point your camera at the product barcode'}</p>{!scanning && <button className="scanCircle" onClick={startScan} aria-label="Scan barcode">⌁</button>}</div>}

    {screen === 'product' && <><button className="backText" onClick={() => setScreen('scan')}>‹ Back</button><div className="productHero"><div className="largeIcon" aria-hidden="true">▦</div><div className="badge">DATABASE MATCH</div><h1>{product.name}</h1><p>{product.brand}</p></div><div className="detailGrid"><div><small>CALORIES</small><b>{product.calories} kcal</b><em>per {product.serving}</em></div><div><small>MRP</small><b>₹{product.mrp}</b><em>verify on package</em></div><div><small>PROTEIN</small><b>{product.protein ?? 'N/A'} g</b></div><div><small>EXPIRY</small><b>{expiry || 'Not scanned'}</b></div></div><div className="note">The barcode identifies the product. Nutrition and MRP come from available product data. Expiry is scanned separately from the package.</div><button className="secondary" onClick={scanExpiry}>Scan Expiry Date</button><button className="primary" onClick={() => { add(); setScreen('scan') }}>Add to Cart</button></>}

    {screen === 'expiry' && <div className="expiryScreen" aria-live="polite"><button className="backText" onClick={() => setScreen('product')}>‹ Product</button><div className="expiryFrame"><span>OCR</span></div>{expiryState === 'scanning' && <><h1>Scanning expiry</h1><p>Looking for an expiry or best-before date on the package.</p></>}{expiryState === 'detected' && <><div className="badge">DATE DETECTED</div><h1>{expiry}</h1><p>Confirm this date before saving it.</p><button className="primary" onClick={() => setScreen('product')}>Confirm Date</button></>}{expiryState === 'failed' && <><h1>Expiry not detected</h1><p>We could not read a date from the package.</p><button className="secondary" onClick={scanExpiry}>Try Again</button></>}<div className="manualExpiry"><label htmlFor="expiry-input">Enter manually</label><div><input id="expiry-input" value={manualExpiry} onChange={e => setManualExpiry(e.target.value)} placeholder="e.g. 18 Sep 2026"/><button onClick={saveManualExpiry} disabled={!manualExpiry.trim()}>Save</button></div></div></div>}

    {screen === 'cart' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Your Cart</h1><p className="muted">Everything in one place.</p>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><span className="productIcon" aria-hidden="true">▦</span><div className="grow"><b>{i.name}</b><small>{i.calories} kcal · ₹{i.mrp} each</small><div className="stepper" aria-label={`Quantity for ${i.name}`}><button onClick={() => changeQty(i.id,-1)} aria-label={`Remove one ${i.name}`}>−</button><b>{i.qty}</b><button onClick={() => changeQty(i.id,1)} aria-label={`Add one ${i.name}`}>+</button></div></div></div>) : <div className="empty">Your cart is empty.<br/><small>Scan a product to add it.</small></div>}<div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total MRP <b>₹{total}</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Proceed to Pay ₹{total}</button>}</>}

    {screen === 'checkout' && <><button className="backText" onClick={() => setScreen('cart')}>‹ Cart</button><h1>Checkout</h1><div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total <b>₹{total}</b></span></div><h2>Payment method</h2>{['UPI','Credit / Debit Card','Wallet'].map(x => <button className={`payment ${payment === x ? 'selected' : ''}`} onClick={() => setPayment(x)} aria-pressed={payment === x} key={x}><span>{x}</span><span aria-hidden="true">{payment === x ? '●' : '○'}</span></button>)}<button className="primary" disabled={!payment} onClick={pay}>Complete Payment ₹{total}</button></>}

    {screen === 'success' && <div className="success"><div className="successIcon" aria-hidden="true">✓</div><h1>Payment successful</h1><p>Order #SC10284</p><div className="summary"><span>Total <b>₹{lastOrder.total}</b></span><span>Items <b>{lastOrder.items}</b></span><span>Calories <b>{lastOrder.calories} kcal</b></span></div><button className="primary" onClick={() => setScreen('home')}>Back to Home</button></div>}

    {screen === 'history' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Scan History</h1>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => { setProduct(p); setExpiry(''); setScreen('product') }}><span className="productIcon" aria-hidden="true">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No scan history.</div>}</>}

    <nav aria-label="Primary navigation"><button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')} aria-label="Home">⌂<small>Home</small></button><button className="scanNav" onClick={startScan} aria-label="Scan">⌕<small>Scan</small></button><button className={screen === 'cart' ? 'active' : ''} onClick={() => setScreen('cart')} aria-label="Cart">□<small>Cart {items ? `(${items})` : ''}</small></button></nav>
  </main>
}
