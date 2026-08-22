import { useMemo, useState } from 'react'

type Product = { id: string; name: string; brand: string; calories: number; protein?: number; mrp: number; expiry?: string }
type CartItem = Product & { qty: number }

const products: Product[] = [
  { id: '8901234567890', name: 'Buldak Ramen', brand: 'Samyang', calories: 530, protein: 11, mrp: 130, expiry: '18 Sep 2026' },
  { id: '8901234567891', name: 'Dunkin Donut', brand: 'Dunkin', calories: 393, mrp: 209, expiry: '20 Sep 2026' },
  { id: '8901234567892', name: 'Mineral Water', brand: 'Varahi', calories: 0, protein: 0, mrp: 30, expiry: '30 Dec 2026' },
]

export default function App() {
  const [screen, setScreen] = useState<'home'|'scan'|'product'|'cart'|'checkout'|'success'|'history'>('home')
  const [product, setProduct] = useState<Product>(products[0])
  const [cart, setCart] = useState<CartItem[]>([])
  const [history, setHistory] = useState<Product[]>([])
  const [payment, setPayment] = useState('')
  const [scanning, setScanning] = useState(false)
  const [expiry, setExpiry] = useState('')

  const total = useMemo(() => cart.reduce((s, i) => s + i.mrp * i.qty, 0), [cart])
  const calories = useMemo(() => cart.reduce((s, i) => s + i.calories * i.qty, 0), [cart])
  const items = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const startScan = () => {
    setScreen('scan'); setScanning(true)
    window.setTimeout(() => { setProduct(products[Math.floor(Math.random() * products.length)]); setScanning(false); setScreen('product') }, 1100)
  }
  const add = () => {
    setCart(c => { const found = c.find(i => i.id === product.id); return found ? c.map(i => i.id === product.id ? {...i, qty: i.qty + 1} : i) : [...c, {...product, qty: 1}] })
    setHistory(h => [product, ...h.filter(p => p.id !== product.id)].slice(0, 8))
  }
  const changeQty = (id: string, delta: number) => setCart(c => c.flatMap(i => i.id === id ? [{...i, qty: i.qty + delta}].filter(x => x.qty > 0) : [i]))

  return <main className="app">
    {screen === 'home' && <>
      <header><div className="eyebrow">SCANCART</div><h1>Track your health.<br/><span>Scan as you shop.</span></h1></header>
      <section className="stats"><div><small>CALORIES</small><strong>{calories.toLocaleString()} kcal</strong></div><div><small>CART VALUE</small><strong>₹{total}</strong></div></section>
      <button className="primary big" onClick={startScan}>⌕ &nbsp; Start Scanning</button>
      <section><div className="sectionTitle"><h2>Recent Scans</h2><button onClick={() => setScreen('history')}>View all</button></div>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => {setProduct(p);setScreen('product')}}><span className="productIcon">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No recent scans<br/><small>Scan a product to see it here.</small></div>}</section>
    </>}

    {screen === 'scan' && <div className="scanner"><button className="back" onClick={() => setScreen('home')}>×</button><div className="scanBox"><i/><i/><i/><i/><span/></div><h2>{scanning ? 'Analyzing product…' : 'Scan a barcode'}</h2><p>{scanning ? 'Barcode identified · Product matched · Nutrition found' : 'Point your camera at the product barcode'}</p><button className="scanCircle">⌁</button></div>}

    {screen === 'product' && <><button className="backText" onClick={() => setScreen('scan')}>‹ Back</button><div className="productHero"><div className="largeIcon">▦</div><div className="badge">VERIFIED</div><h1>{product.name}</h1><p>{product.brand}</p></div><div className="detailGrid"><div><small>CALORIES</small><b>{product.calories} kcal</b></div><div><small>MRP</small><b>₹{product.mrp}</b></div><div><small>PROTEIN</small><b>{product.protein ?? 'N/A'} g</b></div><div><small>EXPIRY</small><b>{expiry || product.expiry || 'Not detected'}</b></div></div><div className="note">Product information comes from available product data. Always verify MRP and nutrition on the physical package.</div><button className="secondary" onClick={() => setExpiry(product.expiry || '18 Sep 2026')}>Scan Expiry Date</button><button className="primary" onClick={() => {add();setScreen('scan')}}>Add to Cart</button></>}

    {screen === 'cart' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Your Cart</h1><p className="muted">Everything in one place.</p>{cart.length ? cart.map(i => <div className="cartRow" key={i.id}><span className="productIcon">▦</span><div className="grow"><b>{i.name}</b><small>{i.calories} kcal · ₹{i.mrp}</small><div className="stepper"><button onClick={() => changeQty(i.id,-1)}>−</button><b>{i.qty}</b><button onClick={() => changeQty(i.id,1)}>+</button></div></div></div>) : <div className="empty">Your cart is empty.</div>}<div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total MRP <b>₹{total}</b></span></div>{cart.length > 0 && <button className="primary" onClick={() => setScreen('checkout')}>Proceed to Pay ₹{total}</button>}</>}

    {screen === 'checkout' && <><button className="backText" onClick={() => setScreen('cart')}>‹ Cart</button><h1>Checkout</h1><div className="summary"><span>Total items <b>{items}</b></span><span>Total calories <b>{calories} kcal</b></span><span>Total <b>₹{total}</b></span></div><h2>Payment method</h2>{['UPI','Credit / Debit Card','Wallet'].map(x => <button className={'payment '+(payment===x?'selected':'')} onClick={() => setPayment(x)} key={x}><span>{x}</span><span>{payment===x?'●':'○'}</span></button>)}<button className="primary" disabled={!payment} onClick={() => setScreen('success')}>Complete Payment ₹{total}</button></>}

    {screen === 'success' && <div className="success"><div className="successIcon">✓</div><h1>Payment successful</h1><p>Order #SC10284</p><div className="summary"><span>Total <b>₹{total}</b></span><span>Items <b>{items}</b></span><span>Calories <b>{calories} kcal</b></span></div><button className="primary" onClick={() => setScreen('home')}>Back to Home</button></div>}

    {screen === 'history' && <><button className="backText" onClick={() => setScreen('home')}>‹ Home</button><h1>Scan History</h1>{history.length ? history.map(p => <button className="productRow" key={p.id} onClick={() => {setProduct(p);setScreen('product')}}><span className="productIcon">▦</span><span><b>{p.name}</b><small>{p.brand} · {p.calories} kcal</small></span><strong>₹{p.mrp}</strong></button>) : <div className="empty">No scan history.</div>}</>}

    <nav><button className={screen==='home'?'active':''} onClick={() => setScreen('home')}>⌂<small>Home</small></button><button className="scanNav" onClick={startScan}>⌕<small>Scan</small></button><button className={screen==='cart'?'active':''} onClick={() => setScreen('cart')}>□<small>Cart {items ? `(${items})` : ''}</small></button></nav>
  </main>
}
