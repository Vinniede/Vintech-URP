"use client";

import { useEffect, useState } from "react";

type Request = (path: string, options?: RequestInit) => Promise<any>;

export function PromotionsPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      name: string;
      type: string;
      value: string;
      appliesTo: string;
      isActive: boolean;
    }>
  >([]);
  const load = () =>
    void request("/promotions")
      .then((body) => setRows(body.promotions))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">PRICING</p>
          <h2>Promotions</h2>
        </div>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Percentage and fixed discounts are calculated server-side for POS and
        Storefront.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Applies to</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.type}</td>
                <td>{row.value}</td>
                <td>{row.appliesTo}</td>
                <td className={row.isActive ? "good" : "bad"}>
                  {row.isActive ? "Active" : "Inactive"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SuppliersPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      name: string;
      contactPhone: string | null;
      contactEmail: string | null;
    }>
  >([]);
  useEffect(() => {
    void request("/suppliers")
      .then((body) => setRows(body.suppliers))
      .catch((error) => onNotice(error.message));
  }, []);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h2>Suppliers</h2>
        </div>
        <button
          className="secondary"
          onClick={() =>
            void request("/suppliers").then((body) => setRows(body.suppliers))
          }
        >
          Refresh
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.contactPhone ?? "—"}</td>
                <td>{row.contactEmail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PurchaseOrdersPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<
    Array<{ id: string; supplierId: string; status: string; createdAt: string }>
  >([]);
  const load = () =>
    void request("/purchase-orders")
      .then((body) => setRows(body.purchaseOrders))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">RECEIVING</p>
          <h2>Purchase orders</h2>
        </div>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id.slice(0, 8)}</td>
                <td>{row.supplierId.slice(0, 8)}</td>
                <td>{row.status}</td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CustomerAccountsPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      name: string;
      phone: string;
      creditLimit: string;
      balance: string;
    }>
  >([]);
  useEffect(() => {
    void request("/customer-accounts")
      .then((body) => setRows(body.customerAccounts))
      .catch((error) => onNotice(error.message));
  }, []);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">REGISTER CREDIT</p>
          <h2>Customer accounts</h2>
        </div>
        <button
          className="secondary"
          onClick={() =>
            void request("/customer-accounts").then((body) =>
              setRows(body.customerAccounts),
            )
          }
        >
          Refresh
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Balance</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.phone}</td>
                <td
                  className={
                    Number(row.balance) > Number(row.creditLimit)
                      ? "bad"
                      : "good"
                  }
                >
                  ${row.balance}
                </td>
                <td>${row.creditLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
