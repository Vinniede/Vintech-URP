"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Table } from "@urp/ui";
import { PricingPanel } from "./pricing-panel";
import { InvoicePanel } from "./invoice-panel";
import { PaymentConfigPanel } from "./payment-config-panel";

type Store = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  posEnabled: boolean;
  storefrontEnabled: boolean;
  isSuspended?: boolean;
  timezone: string;
  createdAt?: string;
};
type Session = { accessToken: string; name: string; email: string };
const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"}/api/v1/platform${path}`;
const currencies = [
  ["KES", "Kenyan shilling"],
  ["NGN", "Nigerian naira"],
  ["ZAR", "South African rand"],
  ["EGP", "Egyptian pound"],
  ["GHS", "Ghanaian cedi"],
  ["TZS", "Tanzanian shilling"],
  ["UGX", "Ugandan shilling"],
  ["RWF", "Rwandan franc"],
  ["ETB", "Ethiopian birr"],
  ["MAD", "Moroccan dirham"],
  ["XOF", "West African CFA franc"],
  ["XAF", "Central African CFA franc"],
  ["USD", "US dollar"],
  ["EUR", "Euro"],
  ["GBP", "British pound"],
  ["CAD", "Canadian dollar"],
  ["AUD", "Australian dollar"],
  ["INR", "Indian rupee"],
  ["CNY", "Chinese yuan"],
  ["AED", "UAE dirham"],
] as const;
const timezones = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Accra",
  "Africa/Dar_es_Salaam",
  "Africa/Kampala",
  "Africa/Kigali",
  "Africa/Addis_Ababa",
  "Africa/Casablanca",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
] as const;

export default function PlatformHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceStore, setInvoiceStore] = useState<Store | null>(null);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    totalStores: number;
    activeStores: number;
  } | null>(null);
  const load = async (token: string) => {
    const response = await fetch(api("/stores"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Could not load stores");
    const body = (await response.json()) as { stores: Store[] };
    setStores(body.stores);
  };
  useEffect(() => {
    const saved = localStorage.getItem("urp-platform-session");
    if (saved) {
      const parsed = JSON.parse(saved) as Session;
      setSession(parsed);
      void load(parsed.accessToken);
    }
  }, []);
  const visible = useMemo(
    () =>
      stores.filter((store) =>
        `${store.name} ${store.slug}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [stores, query],
  );
  if (!session)
    return (
      <PlatformLogin
        onLogin={(value) => {
          setSession(value);
          localStorage.setItem("urp-platform-session", JSON.stringify(value));
          void load(value.accessToken);
        }}
      />
    );
  const createStore = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const normalizedSlug = String(data.slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const response = await fetch(api("/stores"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          ...data,
          slug: normalizedSlug,
          posEnabled: data.posEnabled === "on",
          storefrontEnabled: data.storefrontEnabled === "on",
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (!response.ok) {
        const error = body?.error;
        const message =
          typeof error === "string"
            ? error
            : error && typeof error === "object" && "issues" in error
              ? (error as { issues?: Array<{ message?: string }> }).issues
                  ?.map((issue) => issue.message)
                  .filter(Boolean)
                  .join(", ")
              : `Store could not be created (${response.status}).`;
        return setNotice(
          message || `Store could not be created (${response.status}).`,
        );
      }
      setNotice("Store created.");
      event.currentTarget.reset();
      try {
        await load(session.accessToken);
      } catch {
        setNotice("Store created, but the store list could not refresh.");
      }
    } catch {
      setNotice("Could not reach the API. Is the local API running?");
    }
  };
  const toggle = async (
    store: Store,
    field: "posEnabled" | "storefrontEnabled" | "isSuspended",
    value: boolean,
  ) => {
    const response = await fetch(api(`/stores/${store.id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) return setNotice("Store update failed.");
    await load(session.accessToken);
  };
  const deleteStore = async (store: Store) => {
    if (!window.confirm(`Delete ${store.name} and all of its data? This cannot be undone.`)) return;
    setDeletingStoreId(store.id);
    try {
      const response = await fetch(api(`/stores/${store.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${session.accessToken}` } });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return setNotice(body?.error ?? "Store could not be deleted.");
      setInvoiceStore(null);
      setNotice("Store deleted.");
      await load(session.accessToken);
    } finally {
      setDeletingStoreId(null);
    }
  };
  return (
    <main className="platform-shell">
      <header className="platform-header">
        <div>
          <p className="eyebrow">SYSTEM OPERATIONS</p>
          <h1>Platform Console</h1>
          <p className="muted">Every store, one operational view.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            localStorage.removeItem("urp-platform-session");
            setSession(null);
          }}
        >
          Sign out
        </Button>
      </header>
      {notice && <Alert>{notice}</Alert>}
      <div className="metrics">
        <Card>
          <span>Total stores</span>
          <strong>{metrics?.totalStores ?? stores.length}</strong>
        </Card>
        <Card>
          <span>Active stores</span>
          <strong>
            {metrics?.activeStores ??
              stores.filter((store) => !store.isSuspended).length}
          </strong>
        </Card>
        <Card>
          <span>Modules</span>
          <strong>
            {stores.filter((store) => store.posEnabled).length} POS ·{" "}
            {stores.filter((store) => store.storefrontEnabled).length} web
          </strong>
        </Card>
      </div>
      <PricingPanel session={session} />
      <PaymentConfigPanel session={session} />
      {invoiceStore && <InvoicePanel storeId={invoiceStore.id} storeName={invoiceStore.name} session={session} onClose={() => setInvoiceStore(null)} />}
      <div className="platform-grid">
        <Card>
          <div className="section-head">
            <div>
              <p className="eyebrow">TENANTS</p>
              <h2>Stores</h2>
            </div>
            <Input
              placeholder="Search stores"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Modules</th>
                <th>Status</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((store) => (
                <tr key={store.id}>
                  <td>
                    <strong>{store.name}</strong>
                    <small>{store.slug}</small>
                  </td>
                  <td>
                    {store.posEnabled ? "POS " : ""}
                    {store.storefrontEnabled ? "Web" : ""}
                  </td>
                  <td className={store.isSuspended ? "bad" : "good"}>
                    {store.isSuspended ? "Suspended" : "Active"}
                  </td>
                  <td className="actions">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void toggle(store, "posEnabled", !store.posEnabled)
                      }
                    >
                      POS
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void toggle(
                          store,
                          "storefrontEnabled",
                          !store.storefrontEnabled,
                        )
                      }
                    >
                      Web
                    </Button>
                    <Button
                      variant={store.isSuspended ? "primary" : "danger"}
                      onClick={() =>
                        void toggle(store, "isSuspended", !store.isSuspended)
                      }
                    >
                      {store.isSuspended ? "Reactivate" : "Suspend"}
                    </Button>
                    <Button variant="secondary" onClick={() => setInvoiceStore(store)}>
                      Invoices
                    </Button>
                    <Button variant="danger" disabled={deletingStoreId === store.id} onClick={() => void deleteStore(store)}>
                      {deletingStoreId === store.id ? "Deleting..." : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <p className="eyebrow">ONBOARDING</p>
          <h2>Create a store</h2>
          <form
            className="create-form"
            onSubmit={(event) => void createStore(event)}
          >
            <label>
              Name
              <Input name="name" required />
            </label>
            <label>
              Store link
              <Input name="slug" placeholder="corner-market or Corner Market" required />
            </label>
            <label>
              Currency
              <select className="platform-select"
                name="currency"
                defaultValue="KES"
                required
              >
                {currencies.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} - {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Timezone
              <select className="platform-select" name="timezone" defaultValue="Africa/Nairobi" required>
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <p className="eyebrow owner-fields-label">OWNER LOGIN</p>
            <label>
              Owner name
              <Input name="ownerName" required />
            </label>
            <label>
              Owner email
              <Input name="ownerEmail" type="email" required />
            </label>
            <label>
              Owner phone
              <Input name="ownerPhone" type="tel" />
            </label>
            <label>
              Temporary password
              <Input name="ownerPassword" type="password" minLength={8} required />
            </label>
            <label className="check">
              <input type="checkbox" name="posEnabled" /> Enable POS
            </label>
            <label className="check">
              <input type="checkbox" name="storefrontEnabled" /> Enable
              Storefront
            </label>
            <Button variant="primary" type="submit">
              Create tenant
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function PlatformLogin({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("system@urp.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(api("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("Invalid platform credentials");
      const body = (await response.json()) as {
        accessToken: string;
        admin: { name: string; email: string };
      };
      onLogin({
        accessToken: body.accessToken,
        name: body.admin.name,
        email: body.admin.email,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <Card className="login-panel">
        <p className="eyebrow">UNIFIED RETAIL PLATFORM</p>
        <h1>Platform Console</h1>
        <p className="muted">System-owner access across all store tenants.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <Alert>{error}</Alert>}
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in as system owner"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
