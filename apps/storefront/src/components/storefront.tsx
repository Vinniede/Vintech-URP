'use client';

import { useEffect, useMemo, useState } from 'react';

type Product = { id: string; name: string; sku: string; description: string | null; sellingPrice: string; stockQuantity: string };
type CartLine = { product: Product; quantity: number };
const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1${path}`;
const storeSlug = process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';

export function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'disabled' | 'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => { void fetch(api(`/storefront/${storeSlug}/products`)).then(async (response) => { if (response.status === 404) return setState('missing'); if (response.status === 403) return setState('disabled'); if (!response.ok) throw new Error(); const body = await response.json() as { products: Product[] }; setProducts(body.products); setState('ready'); }).catch(() => setState('error')); }, []);
  const visible = useMemo(() => products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const total = cart.reduce((sum, line) => sum + Number(line.product.sellingPrice) * line.quantity, 0);
  const add = (product: Product) => setCart((current) => { const existing = current.find((line) => line.product.id === product.id); return existing ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1 }]; });
  if (state !== 'ready') return <main className="state">{state === 'loading' ? <p>Loading store...</p> : state === 'disabled' ? <><h2>Storefront unavailable</h2><p className="muted">This store has not enabled online shopping.</p></> : state === 'missing' ? <><h2>Store not found</h2><p className="muted">Check the store link and try again.</p></> : <><h2>Something went wrong</h2><p className="error">The catalog could not be loaded.</p></>}</main>;
  return <div className="store-shell"><header className="store-header"><div><div className="wordmark">UNIFIED RETAIL</div><h1>{storeSlug}</h1></div><button className="cart-button" onClick={() => setCartOpen(true)}>Cart · {cart.reduce((sum, line) => sum + line.quantity, 0)}</button></header><main className="store-main"><section className="hero"><div><p className="eyebrow">TODAY'S SHELF</p><h2>Good things, ready when you are.</h2></div><input className="search" placeholder="Search the catalog" value={query} onChange={(event) => setQuery(event.target.value)} /></section><div className="catalog-grid">{visible.map((product) => <article className="product-card" key={product.id}><div><h3>{product.name}</h3><p>{product.description ?? 'A store favorite.'}</p></div><span className="price">${product.sellingPrice}</span><button className="add" onClick={() => add(product)}>Add to cart</button></article>)}</div></main>{cartOpen && <aside className="cart-panel"><button className="close" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button><p className="eyebrow">YOUR ORDER</p><h2>Cart</h2>{cart.length === 0 ? <p className="muted">Your cart is empty.</p> : cart.map((line) => <div className="cart-line" key={line.product.id}><div><strong>{line.product.name}</strong><small>${line.product.sellingPrice} · quantity {line.quantity}</small></div><button className="close" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label={`Remove ${line.product.name}`}>×</button></div>)}<div className="cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div><button className="checkout" onClick={() => setMessage('Checkout is ready for customer authentication and payment integration.')}>Continue to checkout</button>{message && <p className="muted">{message}</p>}</aside>}</div>;
}
