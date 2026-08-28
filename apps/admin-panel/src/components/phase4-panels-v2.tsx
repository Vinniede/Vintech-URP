"use client";

import { useEffect, useState } from "react";
import {
  customerAccountPaymentSchema,
  customerAccountSchema,
  promotionSchema,
  purchaseOrderReceiveSchema,
  purchaseOrderSchema,
  supplierSchema,
} from "@urp/shared-types";

type Request = (path: string, options?: RequestInit) => Promise<any>;
const submit = async (
  request: Request,
  path: string,
  method: string,
  payload: unknown,
  onNotice: (message: string) => void,
) => {
  try {
    await request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onNotice("Saved successfully.");
    return true;
  } catch (error) {
    onNotice(error instanceof Error ? error.message : "Save failed");
    return false;
  }
};

export function PromotionsPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "percentage_discount",
    value: "10",
    appliesTo: "all",
    categoryId: "",
    productIds: "",
    startAt: new Date().toISOString().slice(0, 16),
    endAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    isActive: true,
    buyQuantity: "",
    getQuantity: "",
    getDiscountPercentage: "100",
    bundleQuantity: "",
    bundleTotalPrice: "",
  });
  const load = () =>
    void request("/promotions")
      .then((body) => setRows(body.promotions))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      categoryId: form.categoryId || null,
      productIds: form.productIds
        ? form.productIds.split(",").map((id) => id.trim())
        : [],
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      buyQuantity: form.buyQuantity || null,
      getQuantity: form.getQuantity || null,
      getDiscountPercentage: form.getDiscountPercentage || null,
      bundleQuantity: form.bundleQuantity || null,
      bundleTotalPrice: form.bundleTotalPrice || null,
    };
    const parsed = promotionSchema.safeParse(payload);
    if (!parsed.success) {
      onNotice(parsed.error.issues[0]?.message ?? "Invalid promotion");
      return;
    }
    if (await submit(request, "/promotions", "POST", parsed.data, onNotice)) {
      setForm({ ...form, name: "" });
      load();
    }
  };
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
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label className="field">
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="field">
          Type
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            <option value="percentage_discount">Percentage discount</option>
            <option value="fixed_discount">Fixed discount</option>
            <option value="buy_x_get_y">Buy X get Y</option>
            <option value="bundle_price">Bundle price</option>
          </select>
        </label>
        <label className="field">
          Value
          <input
            value={form.value}
            onChange={(event) =>
              setForm({ ...form, value: event.target.value })
            }
          />
        </label>
        <label className="field">
          Applies to
          <select
            value={form.appliesTo}
            onChange={(event) =>
              setForm({ ...form, appliesTo: event.target.value })
            }
          >
            <option value="all">All products</option>
            <option value="category">Category</option>
            <option value="specific_products">Specific products</option>
          </select>
        </label>
        {form.type === "buy_x_get_y" && (
          <>
            <label className="field">
              Buy quantity
              <input
                value={form.buyQuantity}
                onChange={(event) =>
                  setForm({ ...form, buyQuantity: event.target.value })
                }
              />
            </label>
            <label className="field">
              Get quantity
              <input
                value={form.getQuantity}
                onChange={(event) =>
                  setForm({ ...form, getQuantity: event.target.value })
                }
              />
            </label>
            <label className="field">
              Get discount %
              <input
                value={form.getDiscountPercentage}
                onChange={(event) =>
                  setForm({
                    ...form,
                    getDiscountPercentage: event.target.value,
                  })
                }
              />
            </label>
          </>
        )}
        {form.type === "bundle_price" && (
          <>
            <label className="field">
              Bundle quantity
              <input
                value={form.bundleQuantity}
                onChange={(event) =>
                  setForm({ ...form, bundleQuantity: event.target.value })
                }
              />
            </label>
            <label className="field">
              Bundle total price
              <input
                value={form.bundleTotalPrice}
                onChange={(event) =>
                  setForm({ ...form, bundleTotalPrice: event.target.value })
                }
              />
            </label>
          </>
        )}
        <label className="field">
          Category ID
          <input
            value={form.categoryId}
            onChange={(event) =>
              setForm({ ...form, categoryId: event.target.value })
            }
          />
        </label>
        <label className="field">
          Product IDs, comma-separated
          <input
            value={form.productIds}
            onChange={(event) =>
              setForm({ ...form, productIds: event.target.value })
            }
          />
        </label>
        <label className="field">
          Starts
          <input
            type="datetime-local"
            value={form.startAt}
            onChange={(event) =>
              setForm({ ...form, startAt: event.target.value })
            }
          />
        </label>
        <label className="field">
          Ends
          <input
            type="datetime-local"
            value={form.endAt}
            onChange={(event) =>
              setForm({ ...form, endAt: event.target.value })
            }
          />
        </label>
        <button className="primary" type="submit">
          Create promotion
        </button>
      </form>
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
                <td>{row.isActive ? "Active" : "Inactive"}</td>
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
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    contactPhone: "",
    contactEmail: "",
    notes: "",
  });
  const load = () =>
    void request("/suppliers")
      .then((body) => setRows(body.suppliers))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = supplierSchema.safeParse({
      ...form,
      contactPhone: form.contactPhone || null,
      contactEmail: form.contactEmail || null,
      notes: form.notes || null,
    });
    if (!parsed.success)
      return onNotice(parsed.error.issues[0]?.message ?? "Invalid supplier");
    if (await submit(request, "/suppliers", "POST", parsed.data, onNotice)) {
      setForm({ name: "", contactPhone: "", contactEmail: "", notes: "" });
      load();
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Suppliers</h2>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label className="field">
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="field">
          Phone
          <input
            value={form.contactPhone}
            onChange={(event) =>
              setForm({ ...form, contactPhone: event.target.value })
            }
          />
        </label>
        <label className="field">
          Email
          <input
            value={form.contactEmail}
            onChange={(event) =>
              setForm({ ...form, contactEmail: event.target.value })
            }
          />
        </label>
        <label className="field">
          Notes
          <input
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
          />
        </label>
        <button className="primary" type="submit">
          Add supplier
        </button>
      </form>
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
  const [rows, setRows] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const load = () =>
    void Promise.all([
      request("/purchase-orders"),
      request("/suppliers"),
      request("/products"),
    ])
      .then(([orders, supplierBody, productBody]) => {
        setRows(orders.purchaseOrders);
        setSuppliers(supplierBody.suppliers);
        setProducts(productBody.products);
      })
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const create = async (status: "draft" | "ordered") => {
    const parsed = purchaseOrderSchema.safeParse({
      supplierId,
      items: [{ productId, quantityOrdered: quantity, unitCost }],
    });
    if (!parsed.success)
      return onNotice(
        parsed.error.issues[0]?.message ?? "Invalid purchase order",
      );
    if (
      await submit(request, "/purchase-orders", "POST", parsed.data, onNotice)
    )
      load();
  };
  const receive = async (order: any) => {
    const items =
      order.items
        ?.filter(
          (item: any) =>
            Number(item.quantityOrdered) > Number(item.quantityReceived),
        )
        .map((item: any) => ({
          itemId: item.id,
          quantityReceived:
            prompt(
              `Receive quantity for ${item.productId}`,
              String(
                Number(item.quantityOrdered) - Number(item.quantityReceived),
              ),
            ) ?? "0",
        })) ?? [];
    const parsed = purchaseOrderReceiveSchema.safeParse({ items });
    if (!parsed.success)
      return onNotice(
        parsed.error.issues[0]?.message ?? "Invalid received quantity",
      );
    if (
      await submit(
        request,
        `/purchase-orders/${order.id}/receive`,
        "POST",
        parsed.data,
        onNotice,
      )
    )
      load();
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Purchase orders</h2>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="form-grid">
        <label className="field">
          Supplier
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">Select supplier</option>
            {suppliers.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Product
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Select product</option>
            {products.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Quantity
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className="field">
          Unit cost
          <input
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
          />
        </label>
        <div className="actions">
          <button className="secondary" onClick={() => void create("draft")}>
            Save draft
          </button>
          <button className="primary" onClick={() => void create("ordered")}>
            Order
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id.slice(0, 8)}</td>
                <td>{row.supplierId.slice(0, 8)}</td>
                <td>{row.status}</td>
                <td>
                  {["draft", "ordered", "partially_received"].includes(
                    row.status,
                  ) ? (
                    <button
                      className="primary"
                      onClick={() => void receive(row)}
                    >
                      Receive
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

export function CustomerAccountsPanel({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", creditLimit: "0" });
  const [payment, setPayment] = useState({ id: "", amount: "", note: "" });
  const load = () =>
    void request("/customer-accounts")
      .then((body) => setRows(body.customerAccounts))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = customerAccountSchema.safeParse(form);
    if (!parsed.success)
      return onNotice(parsed.error.issues[0]?.message ?? "Invalid account");
    if (
      await submit(request, "/customer-accounts", "POST", parsed.data, onNotice)
    ) {
      setForm({ name: "", phone: "", creditLimit: "0" });
      load();
    }
  };
  const pay = async () => {
    const parsed = customerAccountPaymentSchema.safeParse(payment);
    if (!parsed.success)
      return onNotice(parsed.error.issues[0]?.message ?? "Invalid payment");
    if (
      await submit(
        request,
        `/customer-accounts/${payment.id}/payments`,
        "POST",
        parsed.data,
        onNotice,
      )
    ) {
      setPayment({ id: "", amount: "", note: "" });
      load();
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Customer accounts</h2>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <form className="form-grid" onSubmit={(event) => void create(event)}>
        <label className="field">
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="field">
          Phone
          <input
            value={form.phone}
            onChange={(event) =>
              setForm({ ...form, phone: event.target.value })
            }
          />
        </label>
        <label className="field">
          Credit limit
          <input
            value={form.creditLimit}
            onChange={(event) =>
              setForm({ ...form, creditLimit: event.target.value })
            }
          />
        </label>
        <button className="primary" type="submit">
          Create account
        </button>
      </form>
      <div className="actions">
        {rows.map((row) => (
          <button
            className="secondary"
            key={row.id}
            onClick={() => setPayment({ ...payment, id: row.id })}
          >
            {row.name}: ${row.balance} / ${row.creditLimit}
          </button>
        ))}
      </div>
      {payment.id && (
        <div className="form-grid">
          <label className="field">
            Payment amount
            <input
              value={payment.amount}
              onChange={(event) =>
                setPayment({ ...payment, amount: event.target.value })
              }
            />
          </label>
          <label className="field">
            Note
            <input
              value={payment.note}
              onChange={(event) =>
                setPayment({ ...payment, note: event.target.value })
              }
            />
          </label>
          <button className="primary" onClick={() => void pay()}>
            Record payment
          </button>
        </div>
      )}
    </section>
  );
}
