'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Table } from '@urp/ui';

type Pricing = { id: string; plan: string; billingCycle: string; amount: string; currency: string; isActive: boolean; effectiveFrom: string };
type Session = { accessToken: string };
const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? 'https://unified-retail-api.vintech-urp.workers.dev'}/api/v1/platform${path}`;

export function PricingPanel({ session }: { session: Session }) {
  const [pricing, setPricing] = useState<Pricing[]>([]);
  const [notice, setNotice] = useState('');
  const load = async () => {
    const response = await fetch(api('/billing/pricing'), { headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!response.ok) throw new Error('Could not load pricing');
    setPricing((await response.json() as { pricing: Pricing[] }).pricing);
  };
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load pricing')); }, [session.accessToken]);
  const addPrice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch(api('/billing/pricing'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ ...data, isActive: true, effectiveFrom: new Date(`${data.effectiveFrom}T00:00:00.000Z`).toISOString() }) });
    if (!response.ok) return setNotice('Could not add pricing');
    setNotice('Pricing version added.'); form.reset(); await load();
  };
  const deletePrice = async (item: Pricing) => {
    if (!window.confirm(`Delete the ${item.plan} ${item.billingCycle} pricing version?`)) return;
    const response = await fetch(api(`/billing/pricing/${item.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok) return setNotice('Could not delete pricing version');
    setNotice('Pricing version deleted.');
    await load();
  };
  return <div className="platform-grid"><Card><p className="eyebrow">BILLING</p><h2>Plan pricing</h2>{notice && <Alert>{notice}</Alert>}<Table><thead><tr><th>Plan</th><th>Cycle</th><th>Amount</th><th>Effective</th><th>Action</th></tr></thead><tbody>{pricing.map((item) => <tr key={item.id}><td>{item.plan}</td><td>{item.billingCycle}</td><td>{item.currency} {item.amount}</td><td>{new Date(item.effectiveFrom).toLocaleDateString()}</td><td><Button variant="danger" onClick={() => void deletePrice(item)}>Delete</Button></td></tr>)}</tbody></Table></Card><Card><p className="eyebrow">NEW VERSION</p><h2>Set a price</h2><form onSubmit={(event) => void addPrice(event)}><label>Plan<select name="plan" defaultValue="pos_only"><option value="pos_only">POS only</option><option value="storefront_only">Storefront only</option><option value="bundled">Bundled</option></select></label><label>Cycle<select name="billingCycle" defaultValue="monthly"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><label>Amount<Input name="amount" inputMode="decimal" required /></label><label>Currency<Input name="currency" defaultValue="KES" maxLength={3} required /></label><label>Effective from<Input name="effectiveFrom" type="date" required /></label><Button type="submit" variant="primary">Add pricing version</Button></form></Card></div>;
}
