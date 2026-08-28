"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { productInputSchema } from "@urp/shared-types";
import {
  CustomerAccountsPanel,
  PromotionsPanel,
  PurchaseOrdersPanel,
  SuppliersPanel,
} from "./phase4-panels-v2";
import { PaymentSettings } from "./payment-settings";
import { PrinterSettings } from "./printer-settings";
import { BrandingSettings } from "./branding-settings";
import { BillingPanel } from "./billing-panel";
import { AdminLogin } from "./admin-login";

type Role = "owner" | "store_admin" | "inventory_clerk" | "fulfillment";
type View =
  | "dashboard"
  | "products"
  | "staff"
  | "shifts"
  | "approvals"
  | "reports"
  | "audit"
  | "orders"
  | "promotions"
  | "suppliers"
  | "purchase-orders"
  | "customer-accounts"
  | "payments"
  | "printers"
  | "branding"
  | "billing";

type Product = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  stockQuantity: string;
  reorderLevel: string;
  publishedOnline: boolean;
};
type Session = {
  accessToken: string;
  storeId: string;
  role: Role;
  name: string;
};

const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1${path}`;
const today = () => new Date().toISOString().slice(0, 10);

export function AdminConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<{
    totalAmount: string;
    transactionCount: number;
    byPaymentMethod: Record<string, string>;
  } | null>(null);
  const [approvals, setApprovals] = useState<
    Array<{
      id: string;
      actionType: string;
      reason: string;
      targetSaleId: string | null;
      metadata?: {
        customerAccountId?: string;
        totalAmount?: string;
        resultingBalance?: string;
      };
    }>
  >([]);
  const [shifts, setShifts] = useState<
    Array<{
      id: string;
      status: string;
      cashierId: string;
      discrepancy: string | null;
      openedAt: string;
      closedAt: string | null;
    }>
  >([]);
  const [orders, setOrders] = useState<
    Array<{
      id: string;
      status: string;
      fulfillmentType: string;
      totalAmount: string;
      createdAt: string;
    }>
  >([]);
  const [notice, setNotice] = useState("");

  const request = async (path: string, options?: RequestInit) => {
    if (!session) return null;
    const response = await fetch(api(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(options?.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  };
  const load = async () => {
    if (!session) return;
    try {
      const [productBody, summaryBody, approvalBody, shiftBody, orderBody] =
        await Promise.all([
          request("/products"),
          request(`/reports/daily-summary?date=${date}`),
          request("/approvals/pending"),
          request("/shifts"),
          request("/orders"),
        ]);
      setProducts(productBody.products);
      setSummary(summaryBody);
      setApprovals(approvalBody.approvals);
      setShifts(shiftBody.shifts);
      setOrders(orderBody.orders);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load admin data",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [session, date]);

  const lowStock = useMemo(
    () =>
      products.filter(
        (product) =>
          Number(product.stockQuantity) <= Number(product.reorderLevel),
      ),
    [products],
  );
  const nav =
    session?.role === "inventory_clerk"
      ? [
          { id: "products", label: "Products" },
          { id: "suppliers", label: "Suppliers" },
          { id: "purchase-orders", label: "Purchase orders" },
        ]
      : session?.role === "fulfillment"
        ? [{ id: "orders", label: "Orders" }]
        : ([
            { id: "dashboard", label: "Dashboard" },
            { id: "products", label: "Products" },
            { id: "staff", label: "Staff" },
            { id: "shifts", label: "Shifts" },
            { id: "approvals", label: "Approvals" },
            { id: "reports", label: "Reports" },
            { id: "promotions", label: "Promotions" },
            { id: "suppliers", label: "Suppliers" },
            { id: "purchase-orders", label: "Purchase orders" },
            { id: "customer-accounts", label: "Customer accounts" },
            { id: "payments", label: "Payment settings" },
            { id: "printers", label: "Printer settings" },
            { id: "branding", label: "Storefront identity" },
            { id: "billing", label: "Billing" },
            { id: "audit", label: "Audit log" },
          ] as const);

  if (!session) return <AdminLogin onLogin={setSession} />;
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">UNIFIED RETAIL / ADMIN</div>
        <nav>
          {nav.map((item) => (
            <button
              className={`nav-button ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id as View)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="nav-button" onClick={() => setSession(null)}>
          Sign out
        </button>
      </aside>
      <main className="main-content">
        <header className="header">
          <div>
            <p className="eyebrow">
              {session.role.replace("_", " ").toUpperCase()}
            </p>
            <h1>
              {view === "dashboard"
                ? `Good morning, ${session.name.split(" ")[0]}.`
                : nav.find((item) => item.id === view)?.label}
            </h1>
          </div>
          <input
            className="date-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </header>
        {notice && <p className="notice">{notice}</p>}
        {view === "dashboard" && (
          <Dashboard
            summary={summary}
            lowStock={lowStock}
            shifts={shifts}
            approvals={approvals}
          />
        )}
        {view === "products" && (
          <Products
            products={products}
            inventoryOnly={session.role === "inventory_clerk"}
            onRefresh={load}
          />
        )}
        {view === "staff" && <Staff request={request} onNotice={setNotice} />}
        {view === "shifts" && <Shifts shifts={shifts} />}
        {view === "approvals" && (
          <Approvals
            approvals={approvals}
            request={request}
            onRefresh={load}
            onNotice={setNotice}
          />
        )}
        {view === "reports" && (
          <Reports
            summary={summary}
            shifts={shifts}
            products={products}
            request={request}
          />
        )}
        {view === "audit" && <Audit request={request} />}
        {view === "orders" && (
          <Orders
            orders={orders}
            request={request}
            onRefresh={load}
            onNotice={setNotice}
          />
        )}
        {view === "promotions" && (
          <PromotionsPanel request={request} onNotice={setNotice} />
        )}
        {view === "suppliers" && (
          <SuppliersPanel request={request} onNotice={setNotice} />
        )}
        {view === "purchase-orders" && (
          <PurchaseOrdersPanel request={request} onNotice={setNotice} />
        )}
        {view === "customer-accounts" && (
          <CustomerAccountsPanel request={request} onNotice={setNotice} />
        )}
        {view === "payments" && (
          <PaymentSettings request={request} onNotice={setNotice} />
        )}
        {view === "printers" && (
          <PrinterSettings request={request} onNotice={setNotice} />
        )}
        {view === "branding" && (
          <BrandingSettings request={request} onNotice={setNotice} />
        )}
        {view === "billing" && session.role === "owner" && (
          <BillingPanel request={request} onNotice={setNotice} />
        )}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">OPERATIONS CONSOLE</p>
        <h1>Run the store.</h1>
        <p className="muted">
          Owner and admin controls for the unified retail platform.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const response = await fetch(api("/auth/staff-login"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storeId, email, password }),
              });
              if (!response.ok) throw new Error("Invalid credentials");
              const body = await response.json();
              onLogin({ ...body.user, accessToken: body.accessToken });
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : "Login failed",
              );
            }
          }}
        >
          <label>
            Store ID
            <input
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({
  summary,
  lowStock,
  shifts,
  approvals,
}: {
  summary: {
    totalAmount: string;
    transactionCount: number;
    byPaymentMethod: Record<string, string>;
  } | null;
  lowStock: Product[];
  shifts: Array<{ status: string }>;
  approvals: unknown[];
}) {
  return (
    <>
      <div className="grid">
        <div className="metric">
          <span>SALES TODAY</span>
          <strong>${summary?.totalAmount ?? "0.00"}</strong>
        </div>
        <div className="metric">
          <span>TRANSACTIONS</span>
          <strong>{summary?.transactionCount ?? 0}</strong>
        </div>
        <div className="metric">
          <span>OPEN SHIFTS</span>
          <strong>
            {shifts.filter((shift) => shift.status === "open").length}
          </strong>
        </div>
        <div className="metric">
          <span>PENDING APPROVALS</span>
          <strong>{approvals.length}</strong>
        </div>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>Payment mix</h2>
          <span className="muted">Today</span>
        </div>
        <div className="actions">
          {Object.entries(summary?.byPaymentMethod ?? {}).map(
            ([method, amount]) => (
              <span className="secondary" key={method}>
                {method}: ${amount}
              </span>
            ),
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Low stock</h2>
          <span className={lowStock.length ? "bad" : "good"}>
            {lowStock.length} items
          </span>
        </div>
        {lowStock.length === 0 ? (
          <p className="muted">Everything is above reorder level.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td className="bad">{product.stockQuantity}</td>
                    <td>{product.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Products({
  products,
  inventoryOnly,
  onRefresh,
}: {
  products: Product[];
  inventoryOnly: boolean;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h2>Products</h2>
        </div>
        <button className="secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted">
        {inventoryOnly
          ? "Stock visibility only for inventory clerks."
          : "Product editing remains protected by the API role checks."}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Online</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>{inventoryOnly ? "—" : `$${product.sellingPrice}`}</td>
                <td>{product.stockQuantity}</td>
                <td>{product.publishedOnline ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <p>{editing.name}</p>}
    </section>
  );
}

function Staff({
  request,
  onNotice,
}: {
  request: (path: string, options?: RequestInit) => Promise<any>;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      isActive: boolean;
    }>
  >([]);
  useEffect(() => {
    void request("/users")
      .then((body) => setRows(body.users))
      .catch((error) => onNotice(error.message));
  }, []);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Staff management</h2>
        <span className="muted">Deactivate, never delete</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{row.role}</td>
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

function Shifts({
  shifts,
}: {
  shifts: Array<{
    id: string;
    status: string;
    cashierId: string;
    discrepancy: string | null;
    openedAt: string;
    closedAt: string | null;
  }>;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Shift oversight</h2>
        <span className="muted">Open and recent shifts</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cashier</th>
              <th>Status</th>
              <th>Opened</th>
              <th>Closed</th>
              <th>Discrepancy</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td>{shift.cashierId}</td>
                <td>{shift.status}</td>
                <td>{new Date(shift.openedAt).toLocaleString()}</td>
                <td>
                  {shift.closedAt
                    ? new Date(shift.closedAt).toLocaleString()
                    : "—"}
                </td>
                <td
                  className={
                    shift.discrepancy && Number(shift.discrepancy) !== 0
                      ? "bad"
                      : "good"
                  }
                >
                  {shift.discrepancy ?? "0.00"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Approvals({
  approvals,
  request,
  onRefresh,
  onNotice,
}: {
  approvals: Array<{
    id: string;
    actionType: string;
    reason: string;
    targetSaleId: string | null;
    metadata?: {
      customerAccountId?: string;
      totalAmount?: string;
      resultingBalance?: string;
    };
  }>;
  request: (path: string, options?: RequestInit) => Promise<any>;
  onRefresh: () => void;
  onNotice: (message: string) => void;
}) {
  const [pin, setPin] = useState("");
  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      await request(`/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, pin }),
      });
      setPin("");
      onRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Approval failed");
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Pending approvals</h2>
        <span className="muted">Supervisor PIN required</span>
      </div>
      <label className="field">
        Your PIN
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Reason</th>
              <th>Context</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.id}>
                <td>{approval.actionType}</td>
                <td>{approval.reason}</td>
                <td>
                  {approval.actionType === "credit_limit_override"
                    ? `Account ${approval.metadata?.customerAccountId?.slice(0, 8) ?? "—"} · charge $${approval.metadata?.totalAmount ?? "—"} · resulting $${approval.metadata?.resultingBalance ?? "—"}`
                    : (approval.targetSaleId ?? "—")}
                </td>
                <td className="actions">
                  <button
                    className="primary"
                    onClick={() => void decide(approval.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void decide(approval.id, "rejected")}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Reports({
  summary,
  shifts,
  products,
  request,
}: {
  summary: { totalAmount: string; transactionCount: number } | null;
  shifts: Array<{ discrepancy: string | null }>;
  products: Product[];
  request: (path: string) => Promise<any>;
}) {
  return (
    <>
      <section className="section">
        <h2>Daily summary</h2>
        <p>
          Total ${summary?.totalAmount ?? "0.00"} across{" "}
          {summary?.transactionCount ?? 0} completed transactions.
        </p>
      </section>
      <section className="section">
        <h2>Discrepancies</h2>
        <p>
          Cash discrepancies:{" "}
          {
            shifts.filter(
              (shift) => shift.discrepancy && Number(shift.discrepancy) !== 0,
            ).length
          }
        </p>
        <p>
          Stock discrepancies are available from the audit log action{" "}
          <code>stock.discrepancy</code>.
        </p>
        <button
          className="secondary"
          onClick={() => void request(`/reports/discrepancies?date=${today()}`)}
        >
          Refresh discrepancy source
        </button>
      </section>
      <section className="section">
        <h2>Inventory context</h2>
        <p className="muted">
          {products.length} products in the current store catalog.
        </p>
      </section>
    </>
  );
}

function Audit({ request }: { request: (path: string) => Promise<any> }) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      createdAt: string;
      metadata: unknown;
    }>
  >([]);
  useEffect(() => {
    void request("/audit-logs?page=1&pageSize=50")
      .then((body) => setRows(body.auditLogs))
      .catch(() => undefined);
  }, []);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Audit log</h2>
        <span className="muted">Latest 50 entries</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.action}</td>
                <td>
                  {row.entityType} / {row.entityId ?? "—"}
                </td>
                <td>
                  <code>{JSON.stringify(row.metadata)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Orders({
  orders,
  request,
  onRefresh,
  onNotice,
}: {
  orders: Array<{
    id: string;
    status: string;
    fulfillmentType: string;
    totalAmount: string;
    createdAt: string;
  }>;
  request: (path: string, options?: RequestInit) => Promise<any>;
  onRefresh: () => void;
  onNotice: (message: string) => void;
}) {
  const nextStatus: Record<string, string | undefined> = {
    paid: "packed",
    packed: "shipped",
    shipped: "completed",
    ready_for_pickup: "completed",
  };
  const advance = async (order: OrdersProps["orders"][number]) => {
    const status = nextStatus[order.status];
    if (!status) return;
    try {
      await request(`/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Could not update order",
      );
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Order fulfillment</h2>
        <span className="muted">Status advances are server-validated</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Type</th>
              <th>Total</th>
              <th>Placed</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id.slice(0, 8)}</td>
                <td>{order.status}</td>
                <td>{order.fulfillmentType}</td>
                <td>${order.totalAmount}</td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
                <td>
                  {nextStatus[order.status] ? (
                    <button
                      className="primary"
                      onClick={() => void advance(order)}
                    >
                      Mark {nextStatus[order.status]}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type OrdersProps = {
  orders: Array<{
    id: string;
    status: string;
    fulfillmentType: string;
    totalAmount: string;
    createdAt: string;
  }>;
};
