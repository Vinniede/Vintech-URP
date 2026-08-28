'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Table } from '@urp/ui';

type Config = { provider: string; environment: string; isActive: boolean; configured: boolean };
type Session = { accessToken: string };
const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'}/api/v1/platform${path}`;

export function PaymentConfigPanel({ session }: { session: Session }) {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [notice, setNotice] = useState('');
  const load = async () => {
    const response = await fetch(api('/billing/config'), { headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!response.ok) throw new Error('Could not load payment settings');
    setConfigs((await response.json() as { paymentConfigs: Config[] }).paymentConfigs);
  };
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load payment settings')); }, [session.accessToken]);
  const remove = async (provider: string) => {
    if (!window.confirm(`Delete the ${provider} platform payment configuration?`)) return;
    const response = await fetch(api(`/billing/config/${provider}`), { method: 'DELETE', headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!response.ok) return setNotice('Could not delete payment configuration');
    setNotice('Payment configuration deleted.'); await load();
  };
  return <Card><p className="eyebrow">PLATFORM PAYMENTS</p><h2>Payment configurations</h2>{notice && <Alert>{notice}</Alert>}<Table><thead><tr><th>Provider</th><th>Environment</th><th>Status</th><th>Action</th></tr></thead><tbody>{configs.map((config) => <tr key={config.provider}><td>{config.provider}</td><td>{config.environment}</td><td>{config.configured ? (config.isActive ? 'Active' : 'Inactive') : 'Not configured'}</td><td><Button variant="danger" onClick={() => void remove(config.provider)}>Delete</Button></td></tr>)}</tbody></Table></Card>;
}
