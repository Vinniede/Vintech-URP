'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Table } from '@urp/ui';

type Invoice = { id: string; amount: string; currency: string; plan: string; billingCycle: string; status: string; dueDate: string; paidAt: string | null };
type Session = { accessToken: string };
const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? 'https://unified-retail-api.vintech-urp.workers.dev'}/api/v1/platform${path}`;

export function InvoicePanel({ storeId, storeName, session, onClose }: { storeId: string; storeName: string; session: Session; onClose: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(api(`/stores/${storeId}/invoices`), { headers: { Authorization: `Bearer ${session.accessToken}` } });
      if (!response.ok) throw new Error('Could not load invoices');
      setInvoices((await response.json() as { invoices: Invoice[] }).invoices);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load invoices'); } finally { setLoading(false); }
  };
  
  useEffect(() => { void load(); }, [storeId]);
  
  const markPaid = async (invoiceId: string) => {
    const response = await fetch(api(`/invoices/${invoiceId}/mark-paid`), { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!response.ok) return setNotice('Could not mark invoice paid');
    setNotice('Invoice marked paid.'); await load();
  };
  
  const generateInvoice = async () => {
    setGenerating(true);
    try {
      const response = await fetch(api(`/stores/${storeId}/generate-invoice`), { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${session.accessToken}` }
      });
      if (!response.ok) return setNotice('Could not generate invoice');
      setNotice('Invoice generated successfully.'); 
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not generate invoice');
    } finally {
      setGenerating(false);
    }
  };
  
  return (
    <Card className="invoice-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">BILLING</p>
          <h2>{storeName} invoices</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="primary" onClick={() => void generateInvoice()} disabled={generating}>
            {generating ? 'Generating...' : 'Generate invoice now'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
      {notice && <Alert>{notice}</Alert>}
      {loading ? (
        <p className="muted">Loading invoices...</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Period</th>
              <th>Due</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.plan} · {invoice.billingCycle}</td>
                <td>{invoice.currency} {invoice.amount}</td>
                <td>{invoice.status}</td>
                <td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td>
                  {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                    <Button variant="confirm" onClick={() => void markPaid(invoice.id)}>Mark paid</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
