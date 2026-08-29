'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input } from '@urp/ui';
import { calculatePromotionPricing, sumPricedLines, type PromotionRule } from '@urp/shared-types';
import { merchantThemeStyle } from '../theme';

type Product = { id: string; name: string; sku: string; description: string | null; sellingPrice: string; stockQuantity: string };
type Line = { product: Product; quantity: number };
type Customer = { id: string; name: string; email: string; storeId: string; accessToken: string; refreshToken: string };
const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? 'https://unified-retail-api.vintech-urp.workers.dev'}/api/v1${path}`;

export function StorefrontV2({ storeSlug }: { storeSlug: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<PromotionRule[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['cash']);
  const [cart, setCart] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<'cart' | 'account' | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ storeId: '', name: '', email: '', password: '' });
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'disabled' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [storeBranding, setStoreBranding] = useState({ accentColor: '#1F3A5F', logoUrl: '' });
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`urp-customer-${storeSlug}`);
    if (saved) setCustomer(JSON.parse(saved) as Customer);
    void Promise.all([fetch(api(`/storefront/${storeSlug}/products`)), fetch(api(`/storefront/${storeSlug}/promotions`)), fetch(api(`/storefront/${storeSlug}/payment-methods`)), fetch(api(`/stores/slug/${storeSlug}`))]).then(async ([response, promotionResponse, methodsResponse, storeResponse]) => {
      if (response.status === 404) return setState('missing');
      if (response.status === 403) return setState('disabled');
      if (!response.ok) throw new Error();
      setProducts((await response.json() as { products: Product[] }).products); setState('ready');
      if (promotionResponse.ok) setPromotions((await promotionResponse.json() as { promotions: PromotionRule[] }).promotions);
      if (methodsResponse.ok) setPaymentMethods((await methodsResponse.json() as { paymentMethods: string[] }).paymentMethods);
      if (storeResponse.ok) { const store = (await storeResponse.json() as { store: { accentColor: string; logoUrl: string | null } }).store; setStoreBranding({ accentColor: store.accentColor, logoUrl: store.logoUrl ?? '' }); }
    }).catch(() => setState('error'));
  }, [storeSlug]);

  const visible = useMemo(() => products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const pricedCart = calculatePromotionPricing(cart.map((line) => ({ productId: line.product.id, quantity: String(line.quantity), unitPrice: line.product.sellingPrice })), promotions);
  const total = Number(sumPricedLines(pricedCart));
  const add = (product: Product) => setCart((current) => { const found = current.find((line) => line.product.id === product.id); return found ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1 }]; });

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setAuthLoading(true);
    try { const path = mode === 'login' ? '/customers/login' : '/customers/register'; const response = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); if (!response.ok) throw new Error('Could not authenticate with those details.'); const body = await response.json() as { customer: Customer; accessToken?: string; refreshToken?: string }; if (mode === 'register') { setMessage('Account created. Sign in to continue.'); setMode('login'); return; } const saved = { ...body.customer, accessToken: body.accessToken ?? '', refreshToken: body.refreshToken ?? '' }; localStorage.setItem(`urp-customer-${storeSlug}`, JSON.stringify(saved)); setCustomer(saved); setDrawer(null); } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); } finally { setAuthLoading(false); }
  };

  const placeOrder = async () => { if (!customer) { setDrawer('account'); setMessage('Sign in before checkout.'); return; } const response = await fetch(api('/orders'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.accessToken}` }, body: JSON.stringify({ fulfillmentType, items: cart.map((line) => ({ productId: line.product.id, quantity: String(line.quantity) })) }) }); if (!response.ok) { setMessage('Could not place this order.'); return; } const body = await response.json() as { order: { id: string } }; setCart([]); setMessage(`Order ${body.order.id.slice(0, 8)} created. Payment integration is pending provider configuration.`); };

  if (state !== 'ready') return <main className="state"><h2>{state === 'loading' ? 'Loading store...' : state === 'disabled' ? 'Storefront unavailable' : state === 'missing' ? 'Store not found' : 'Something went wrong'}</h2><p className="muted">{state === 'disabled' ? 'This store has not enabled online shopping.' : state === 'missing' ? 'Check the store link and try again.' : 'The catalog could not be loaded.'}</p></main>;
  return <div className="store-shell" style={merchantThemeStyle(storeBranding.accentColor)}><header className="store-header"><div>{storeBranding.logoUrl && <img className="store-logo" src={storeBranding.logoUrl} alt="" />}<div className="wordmark">UNIFIED RETAIL</div><h1>{storeSlug}</h1></div><div className="header-actions"><Button variant="secondary" className="account-button" onClick={() => setDrawer('account')}>{customer ? customer.name : 'Account'}</Button><Button variant="primary" className="cart-button" onClick={() => setDrawer('cart')}>Cart · {cart.reduce((sum, line) => sum + line.quantity, 0)}</Button></div></header><main className="store-main"><section className="hero"><div><p className="eyebrow">TODAY'S SHELF</p><h2>Good things, ready when you are.</h2></div><Input className="search" placeholder="Search the catalog" value={query} onChange={(event) => setQuery(event.target.value)} /></section><div className="catalog-grid">{visible.map((product) => <article className="product-card" key={product.id}><div><h3>{product.name}</h3><p>{product.description ?? 'A store favorite.'}</p></div><span className="price">${product.sellingPrice}</span><Button variant="primary" className="add" style={{ backgroundColor: 'var(--merchant-accent)', color: 'var(--merchant-accent-text)' }} onClick={() => add(product)}>Add to cart</Button></article>)}</div></main>{drawer === 'cart' && <aside className="cart-panel"><button className="close" onClick={() => setDrawer(null)} aria-label="Close cart">×</button><p className="eyebrow">YOUR ORDER</p><h2>Cart</h2>{cart.length === 0 ? <p className="muted">Your cart is empty.</p> : cart.map((line) => <div className="cart-line" key={line.product.id}><div><strong>{line.product.name}</strong><small>${line.product.sellingPrice} · quantity {line.quantity}</small></div><button className="close" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label={`Remove ${line.product.name}`}>×</button></div>)}<div className="cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div>{cart.length > 0 && <><select className="fulfillment" value={fulfillmentType} onChange={(event) => setFulfillmentType(event.target.value as 'pickup' | 'delivery')}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select><select className="fulfillment" aria-label="Payment method"><option value="">Choose payment method</option>{paymentMethods.map((method) => <option value={method} key={method}>{method}</option>)}</select><Button variant="primary" className="checkout" onClick={() => void placeOrder()}>Place order</Button></>}{message && <p className="muted">{message}</p>}</aside>}{drawer === 'account' && <div className="auth-backdrop"><form className="auth-panel" onSubmit={(event) => void authenticate(event)}><button type="button" className="close" onClick={() => setDrawer(null)} aria-label="Close account">×</button><p className="eyebrow">CUSTOMER ACCOUNT</p><h2>{mode === 'login' ? 'Welcome back.' : 'Create an account.'}</h2>{mode === 'register' && <label>Name<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>}<label>Store ID<Input value={form.storeId} onChange={(event) => setForm({ ...form, storeId: event.target.value })} required /></label><label>Email<Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>Password<Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>{message && <Alert>{message}</Alert>}<Button variant="primary" type="submit" disabled={authLoading}>{authLoading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Register'}</Button><Button variant="secondary" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Use existing account'}</Button></form></div>}</div>;
}
