"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  plan: string;
  billingCycle: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  periodEnd: string;
};

type Request = (path: string, options?: RequestInit) => Promise<any>;

export function BillingPanel({ request, onNotice }: { request: Request; onNotice: (notice: string) => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const body = await request("/billing/invoices");
    setInvoices(body.invoices);
  };

  useEffect(() => {
    void load().catch(() => onNotice("Could not load billing"));
  }, []);

  const current = invoices.find((invoice) => invoice.status === "pending" || invoice.status === "overdue");
  const pay = async () => {
    if (!current || !phone) return;
    setLoading(true);
    try {
      await request("/billing/invoices/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: current.id, customerPhone: phone }),
      });
      onNotice("M-Pesa payment request sent");
    } catch {
      onNotice("M-Pesa payment could not be started");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel-stack">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h2>Billing</h2>
        </div>
        <span className="muted">Invoice and collect</span>
      </div>
      {current ? (
        <div className="settings-card">
          <p className="eyebrow">CURRENT INVOICE</p>
          <h3>{current.plan.replace("_", " ")} · {current.billingCycle}</h3>
          <p>{current.currency} {current.amount} · due {new Date(current.dueDate).toLocaleDateString()}</p>
          <div className="inline-form">
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="M-Pesa phone number" />
            <button className="primary-button" onClick={() => void pay()} disabled={loading || !phone}>{loading ? "Sending..." : "Pay with M-Pesa"}</button>
          </div>
        </div>
      ) : <p className="muted">No open invoice.</p>}
      <div className="table-wrap">
        <table><thead><tr><th>Period</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {invoices.map((invoice) => <tr key={invoice.id}><td>{new Date(invoice.periodEnd).toLocaleDateString()}</td><td>{invoice.plan.replace("_", " ")}</td><td>{invoice.currency} {invoice.amount}</td><td>{invoice.status}</td></tr>)}
        </tbody></table>
      </div>
    </section>
  );
}
