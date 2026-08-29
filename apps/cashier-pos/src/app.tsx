import { useEffect, useMemo, useState } from "react";
import {
  posDb,
  type CachedProduct,
  type CachedPromotion,
  type PendingSale,
  type Session,
} from "./db";
import { calculatePromotionPricing, sumPricedLines } from "@urp/shared-types";
import {
  queueSale,
  syncPendingActions,
  syncPendingSales,
  syncPromotions,
} from "./sync";
import { generateReceiptCommands } from "@urp/shared-types";
import { printWithFallback, type PrinterProfile } from "./printer";
import { Button, Select, StatusPulse } from "@urp/ui";
import { CashierLogin } from "./login";
import { SupervisorApprovalModal } from "./supervisor-approval-modal";
import { SaleHistory } from "./sale-history";
import { parseQuantityInput } from "./cart-utils";
import { useCameraScan, useKeyboardWedgeScan } from "@urp/scanning";

const apiUrl = (path: string) =>
  `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`;

type CartLine = { product: CachedProduct; quantity: number };
type CustomerAccount = {
  id: string;
  name: string;
  phone: string;
  balance: string;
  creditLimit: string;
};

const money = (value: number) => value.toFixed(2);

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [promotions, setPromotions] = useState<CachedPromotion[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [shift, setShift] = useState<{
    id: string;
    openingFloat: string;
  } | null>(null);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);
  const [printerProfileId, setPrinterProfileId] = useState(
    () => localStorage.getItem("urp-printer-profile") ?? "",
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PendingSale["paymentMethod"]>("cash");
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>(
    [],
  );
  const [customerAccountId, setCustomerAccountId] = useState("");
  const [approvalIds, setApprovalIds] = useState<string[]>([]);
  const [view, setView] = useState<"sell" | "history">("sell");
  const [pendingQuantityProduct, setPendingQuantityProduct] =
    useState<CachedProduct | null>(null);
  const [pendingQuantityValue, setPendingQuantityValue] = useState("1");

  const refreshPendingCount = async () =>
    setPendingCount(await posDb.pendingSales.count());

  const loadCatalog = async (activeSession: Session) => {
    const response = await fetch(apiUrl("/products"), {
      headers: { Authorization: `Bearer ${activeSession.accessToken}` },
    });
    if (!response.ok) throw new Error("Could not refresh catalog");
    const body = (await response.json()) as { products: CachedProduct[] };
    await posDb.products.bulkPut(body.products);
    setProducts(body.products);
    const cachedPromotions = await posDb.promotions.toArray();
    setPromotions(cachedPromotions);
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void posDb.session.get("active").then((saved) => {
      if (saved) {
        setSession(saved);
        void posDb.products
          .where("storeId")
          .equals(saved.storeId)
          .toArray()
          .then(setProducts);
        void posDb.currentShift
          .where("storeId")
          .equals(saved.storeId)
          .first()
          .then((savedShift) => savedShift && setShift(savedShift));
      }
    });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    void refreshPendingCount();
    if (!session) return;
    const sync = async () => {
      try {
        const syncResult = await syncPendingSales(session);
        const actionResult = await syncPendingActions(session);
        if (actionResult.approvalIds.length)
          setApprovalIds(actionResult.approvalIds);
        if (syncResult.approvalIds.length || actionResult.approvalIds.length)
          setApprovalIds(syncResult.approvalIds);
        if (syncResult.approvalIds.length)
          setNotice(
            "Credit sale needs supervisor approval. It remains queued until approved.",
          );
        await refreshPendingCount();
        if (online) {
          await loadCatalog(session);
          await syncPromotions(session);
          setPromotions(await posDb.promotions.toArray());
        }
        if (online) {
          const accountResponse = await fetch(apiUrl("/customer-accounts"), {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });
          if (accountResponse.ok)
            setCustomerAccounts(
              (
                (await accountResponse.json()) as {
                  customerAccounts: CustomerAccount[];
                }
              ).customerAccounts,
            );
        }
        if (online) {
          const printerResponse = await fetch(apiUrl("/printer-profiles"), {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });
          if (printerResponse.ok)
            setPrinterProfiles(
              (
                (await printerResponse.json()) as {
                  printerProfiles: PrinterProfile[];
                }
              ).printerProfiles,
            );
        }
      } catch {
        setNotice("Sync will retry when the connection is stable.");
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 60_000);
    return () => window.clearInterval(timer);
  }, [session, online]);

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const haystack =
          `${product.name} ${product.sku} ${product.barcode ?? ""}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [products, query],
  );

  const pricedCart = calculatePromotionPricing(
    cart.map((line) => ({
      productId: line.product.id,
      categoryId: line.product.categoryId,
      quantity: String(line.quantity),
      unitPrice: line.product.sellingPrice,
    })),
    promotions,
  );
  const total = Number(sumPricedLines(pricedCart));

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch(apiUrl("/auth/staff-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, email, pin }),
      });
      if (!response.ok) throw new Error("Invalid store, email, or PIN");
      const body = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        user: {
          id: string;
          name: string;
          storeId: string;
          role: Session["role"];
        };
      };
      const saved: Session = {
        ...body.user,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
      };
      await posDb.session.put(saved, "active");
      setSession(saved);
      await loadCatalog(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    }
  };

  const addToCart = (product: CachedProduct, quantity = 1) => {
    const finalQuantity =
      Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing)
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                quantity: Number((line.quantity + finalQuantity).toFixed(3)),
              }
            : line,
        );
      return [
        ...current,
        { product, quantity: Number(finalQuantity.toFixed(3)) },
      ];
    });
  };

  const handleBarcodeScan = (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) return;

    const match = products.find((product) => {
      const sku = product.sku.trim().toLowerCase();
      const code = (product.barcode ?? "").trim().toLowerCase();
      return sku === normalized.toLowerCase() || code === normalized.toLowerCase();
    });

    if (!match) {
      setNotice(`No product matches barcode or SKU “${normalized}”.`);
      return;
    }

    setQuery("");
    openQuantityPrompt(match);
  };

  useKeyboardWedgeScan((barcode) => {
    handleBarcodeScan(barcode);
  });

  const cameraScan = useCameraScan((barcode) => {
    handleBarcodeScan(barcode);
  });

  const openQuantityPrompt = (product: CachedProduct) => {
    const isWeighted =
      product.unitOfMeasure === "kg" || product.unitOfMeasure === "litre";
    if (!isWeighted) {
      addToCart(product, 1);
      return;
    }

    setPendingQuantityProduct(product);
    setPendingQuantityValue("1");
  };

  const confirmWeightedQuantity = () => {
    if (!pendingQuantityProduct) return;
    const parsed = parseQuantityInput(
      pendingQuantityValue,
      pendingQuantityProduct.unitOfMeasure,
    );
    if (parsed === null) {
      setNotice("Enter a valid quantity greater than zero.");
      return;
    }
    addToCart(pendingQuantityProduct, parsed);
    setPendingQuantityProduct(null);
    setPendingQuantityValue("1");
  };

  const checkout = async () => {
    if (
      !session ||
      !shift ||
      cart.length === 0 ||
      (paymentMethod === "credit" && !customerAccountId)
    )
      return;
    const sale: PendingSale = {
      deviceSaleId: crypto.randomUUID(),
      storeId: session.storeId,
      shiftId: shift.id,
      totalAmount: money(total),
      paymentMethod,
      customerAccountId: paymentMethod === "credit" ? customerAccountId : null,
      items: cart.map((line, index) => ({
        productId: line.product.id,
        quantity: String(line.quantity),
        unitPrice: line.product.sellingPrice,
        discountAmount: pricedCart[index]?.discountAmount ?? "0",
      })),
      createdAt: new Date().toISOString(),
    };
    await queueSale(sale);
    await Promise.all(
      cart.map(async ({ product, quantity }) => {
        const cached = await posDb.products.get(product.id);
        if (cached)
          await posDb.products.put({
            ...cached,
            stockQuantity: String(Number(cached.stockQuantity) - quantity),
          });
      }),
    );
    setCart([]);
    await refreshPendingCount();
    setNotice(
      online
        ? "Sale queued and syncing."
        : "Sale saved offline. It will sync automatically.",
    );
    const profile = printerProfiles.find(
      (candidate) => candidate.id === printerProfileId,
    );
    const receipt = generateReceiptCommands({
      storeName: session.storeId,
      cashierName: session.name,
      timestamp: sale.createdAt,
      currency: "USD",
      items: sale.items.map((item) => ({
        name:
          products.find((product) => product.id === item.productId)?.name ??
          item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
      })),
      subtotal: money(total),
      tax: "0.00",
      discount: pricedCart
        .reduce((sum, line) => sum + Number(line.discountAmount), 0)
        .toFixed(2),
      total: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
    });
    void printWithFallback(
      profile,
      receipt,
      profile ? { autoCut: profile.autoCut } : {},
    )
      .then((transport) =>
        setNotice(
          `${online ? "Sale queued." : "Offline sale saved."} Receipt sent via ${transport}.`,
        ),
      )
      .catch(() =>
        setNotice("Sale saved. Browser receipt printing was unavailable."),
      );
    if (online)
      void syncPendingSales(session)
        .then((result) => {
          if (result.approvalIds.length) setApprovalIds(result.approvalIds);
          if (result.approvalIds.length)
            setNotice(
              "Credit sale needs supervisor approval. It remains queued until approved.",
            );
          return refreshPendingCount();
        })
        .catch(() => undefined);
    if (online) void syncPendingActions(session).catch(() => undefined);
  };

  const openShift = async () => {
    if (!session) return;
    const id = crypto.randomUUID();
    const localShift = {
      id,
      storeId: session.storeId,
      openingFloat,
      openedAt: new Date().toISOString(),
    };
    await posDb.currentShift.put(localShift);
    setShift(localShift);
    if (online) {
      try {
        const response = await fetch(apiUrl("/shifts/open"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ openingFloat }),
        });
        if (!response.ok) throw new Error("Shift could not be opened online");
        const body = (await response.json()) as { shift: { id: string } };
        if (body.shift.id !== id) {
          await posDb.currentShift.delete(id);
          const syncedShift = { ...localShift, id: body.shift.id };
          await posDb.currentShift.put(syncedShift);
          setShift(syncedShift);
        }
      } catch {
        setNotice(
          "Shift saved locally and will need reconciliation when online.",
        );
      }
    } else setNotice("Shift saved offline. Sales will sync when connected.");
  };

  if (!session)
    return (
      <CashierLogin
        online={online}
        storeId={storeId}
        email={email}
        pin={pin}
        error={error}
        onStoreId={setStoreId}
        onEmail={setEmail}
        onPin={setPin}
        onSubmit={login}
      />
    );

  return (
    <>
      <main className="pos-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">CASHIER TERMINAL</p>
            <h1>Good shift, {session.name.split(" ")[0]}.</h1>
          </div>
          <div className="status">
            <StatusPulse online={online} />
            <span className="pending">{pendingCount} pending</span>
            <Button
              variant="secondary"
              className="quiet"
              onClick={() => {
                void posDb.session.delete("active");
                setSession(null);
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        <nav className="pos-nav" aria-label="Cashier views">
          <Button
            variant={view === "sell" ? "primary" : "secondary"}
            onClick={() => setView("sell")}
          >
            Sell
          </Button>
          <Button
            variant={view === "history" ? "primary" : "secondary"}
            onClick={() => setView("history")}
          >
            Sale history
          </Button>
        </nav>
        {view === "history" && (
          <SaleHistory
            session={session}
            {...(shift ? { shiftId: shift.id } : {})}
            online={online}
            onNotice={setNotice}
          />
        )}
        {view === "sell" && (
          <>
            {!shift ? (
              <section className="shift-banner">
                <div>
                  <p className="eyebrow">START OF SHIFT</p>
                  <h2>Open the till to sell.</h2>
                </div>
                <input
                  aria-label="Opening float"
                  value={openingFloat}
                  onChange={(event) => setOpeningFloat(event.target.value)}
                />
                <Button variant="confirm" onClick={() => void openShift()}>
                  Open shift
                </Button>
              </section>
            ) : (
              <p className="shift-active">
                Shift active · opening float ${shift.openingFloat}
              </p>
            )}
            <div className="workspace">
              <section className="catalog">
                <div className="catalog-head">
                  <div>
                    <p className="eyebrow">CATALOG</p>
                    <h2>Choose products</h2>
                  </div>
                  <div className="search-row">
                    <input
                      className="search"
                      placeholder="Search SKU, barcode, or name"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <Button
                      variant={cameraScan.active ? "secondary" : "primary"}
                      onClick={() => {
                        if (cameraScan.active) {
                          void cameraScan.stop();
                          return;
                        }
                        void cameraScan.start();
                      }}
                    >
                      {cameraScan.active ? "Stop camera" : "Scan camera"}
                    </Button>
                  </div>
                </div>
                {cameraScan.error && <p className="notice">{cameraScan.error}</p>}
                {notice && <p className="notice">{notice}</p>}
                {pendingQuantityProduct && (
                  <div className="quantity-prompt">
                    <div>
                      <p className="eyebrow">WEIGHED ITEM</p>
                      <h3>{pendingQuantityProduct.name}</h3>
                    </div>
                    <input
                      aria-label="Enter quantity"
                      type="number"
                      min="0"
                      step="0.001"
                      value={pendingQuantityValue}
                      onChange={(event) =>
                        setPendingQuantityValue(event.target.value)
                      }
                    />
                    <div className="quantity-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setPendingQuantityProduct(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="confirm"
                        onClick={confirmWeightedQuantity}
                      >
                        Add to cart
                      </Button>
                    </div>
                  </div>
                )}
                <div className="product-grid">
                  {visibleProducts.map((product) => (
                    <button
                      className="product"
                      key={product.id}
                      disabled={!shift}
                      onClick={() => openQuantityPrompt(product)}
                    >
                      <span className="product-name">{product.name}</span>
                      <span className="product-meta">
                        {product.sku} · {product.stockQuantity} in stock
                      </span>
                      <strong>${product.sellingPrice}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <aside className="cart">
                <div className="cart-head">
                  <div>
                    <p className="eyebrow">CURRENT SALE</p>
                    <h2>Cart</h2>
                  </div>
                  <span>{cart.length} lines</span>
                </div>
                {cart.length === 0 ? (
                  <div className="empty">Tap a product to start a sale.</div>
                ) : (
                  <div className="cart-lines">
                    {cart.map((line) => (
                      <div className="cart-line" key={line.product.id}>
                        <div>
                          <strong>{line.product.name}</strong>
                          <small>${line.product.sellingPrice} each</small>
                        </div>
                        <div className="quantity">
                          <button
                            onClick={() =>
                              setCart((current) =>
                                current.flatMap((item) =>
                                  item.product.id !== line.product.id
                                    ? [item]
                                    : item.quantity > 1
                                      ? [
                                          {
                                            ...item,
                                            quantity: item.quantity - 1,
                                          },
                                        ]
                                      : [],
                                ),
                              )
                            }
                          >
                            −
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            onClick={() => openQuantityPrompt(line.product)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="cart-total">
                  <span>Total</span>
                  <strong>${money(total)}</strong>
                </div>
                <Select
                  className="payment-select"
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value as PendingSale["paymentMethod"],
                    )
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="split">Split</option>
                  <option value="credit">Charge to account</option>
                </Select>
                {paymentMethod === "credit" && (
                  <Select
                    className="payment-select"
                    value={customerAccountId}
                    onChange={(event) =>
                      setCustomerAccountId(event.target.value)
                    }
                    disabled={!online}
                  >
                    <option value="">
                      {online
                        ? "Select customer account"
                        : "Credit requires connection"}
                    </option>
                    {customerAccounts.map((account) => (
                      <option value={account.id} key={account.id}>
                        {account.name} · ${account.balance} / $
                        {account.creditLimit}
                      </option>
                    ))}
                  </Select>
                )}
                <Select
                  className="payment-select"
                  value={printerProfileId}
                  onChange={(event) => {
                    setPrinterProfileId(event.target.value);
                    localStorage.setItem(
                      "urp-printer-profile",
                      event.target.value,
                    );
                  }}
                >
                  <option value="">Browser receipt fallback</option>
                  {printerProfiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name} · {profile.transport}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="confirm"
                  className="checkout"
                  disabled={
                    cart.length === 0 ||
                    !shift ||
                    (paymentMethod === "credit" && !customerAccountId)
                  }
                  onClick={() => void checkout()}
                >
                  Complete sale
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setNotice(
                      shift
                        ? "Shift close will connect to /shifts/:id/close in the next UI pass."
                        : "Open a shift before selling.",
                    )
                  }
                >
                  Manage shift
                </Button>
              </aside>
            </div>
          </>
        )}
      </main>
      {approvalIds[0] && (
        <SupervisorApprovalModal
          approval={{
            id: approvalIds[0],
            actionType: "credit limit override",
            context: "A queued credit sale needs supervisor approval.",
          }}
          apiUrl={apiUrl}
          accessToken={session.accessToken}
          onComplete={(approved) => {
            setApprovalIds((current) => current.slice(1));
            setNotice(
              approved
                ? "Supervisor approved the queued sale."
                : "Supervisor did not approve the queued sale.",
            );
          }}
        />
      )}
    </>
  );
}
