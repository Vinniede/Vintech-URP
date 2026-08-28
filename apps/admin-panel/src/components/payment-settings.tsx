"use client";

import { useEffect, useState } from "react";

type Request = (path: string, options?: RequestInit) => Promise<any>;
type Provider = "mpesa" | "bank" | "card";

export function PaymentSettings({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [configs, setConfigs] = useState<
    Array<{
      provider: Provider;
      isEnabled: boolean;
      environment: string;
      configured: boolean;
    }>
  >([]);
  const [provider, setProvider] = useState<Provider>("mpesa");
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<"sandbox" | "production">(
    "sandbox",
  );
  const [credentials, setCredentials] = useState({
    consumerKey: "",
    consumerSecret: "",
    shortcode: "",
    passkey: "",
  });
  const [bankInstructions, setBankInstructions] = useState("");

  const load = () =>
    void request("/payment-configs")
      .then((body) => setConfigs(body.paymentConfigs))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const current = configs.find((config) => config.provider === provider);
  useEffect(() => {
    setEnabled(current?.isEnabled ?? false);
    setEnvironment(
      (current?.environment as "sandbox" | "production" | undefined) ??
        "sandbox",
    );
  }, [provider, current?.isEnabled, current?.environment]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload =
      provider === "mpesa"
        ? {
            provider,
            isEnabled: enabled,
            environment,
            credentials: Object.fromEntries(
              Object.entries(credentials).filter(([, value]) => value),
            ),
          }
        : {
            provider,
            isEnabled: enabled,
            environment,
            credentials: { instructions: bankInstructions },
          };
    try {
      await request(`/payment-configs/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCredentials({
        consumerKey: "",
        consumerSecret: "",
        shortcode: "",
        passkey: "",
      });
      onNotice("Payment settings saved.");
      load();
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Payment settings could not be saved",
      );
    }
  };
  const test = async () => {
    try {
      const result = await request("/payment-configs/mpesa/test", {
        method: "POST",
      });
      onNotice(
        result.ok
          ? "M-Pesa OAuth connection succeeded."
          : "M-Pesa connection failed.",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "M-Pesa test failed");
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">COLLECTIONS</p>
          <h2>Payment settings</h2>
        </div>
        <span className="muted">
          Credentials are encrypted and never returned
        </span>
      </div>
      <div className="actions">
        {(["mpesa", "bank", "card"] as Provider[]).map((item) => (
          <button
            className={provider === item ? "primary" : "secondary"}
            key={item}
            onClick={() => setProvider(item)}
          >
            {item === "mpesa"
              ? "M-Pesa"
              : item === "bank"
                ? "Bank transfer"
                : "Card"}
          </button>
        ))}
      </div>
      {provider === "card" ? (
        <p className="notice">
          Card payments are coming soon. Configure a processor before enabling
          this method.
        </p>
      ) : (
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field">
            Enabled
            <select
              value={enabled ? "yes" : "no"}
              onChange={(event) => setEnabled(event.target.value === "yes")}
            >
              <option value="no">Disabled</option>
              <option value="yes">Enabled</option>
            </select>
          </label>
          <label className="field">
            Environment
            <select
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as "sandbox" | "production")
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          {provider === "mpesa" ? (
            <>
              <label className="field">
                Consumer key
                <input
                  type="password"
                  placeholder={
                    current?.configured ? "Configured; enter to replace" : ""
                  }
                  value={credentials.consumerKey}
                  onChange={(event) =>
                    setCredentials({
                      ...credentials,
                      consumerKey: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Consumer secret
                <input
                  type="password"
                  placeholder={
                    current?.configured ? "Configured; enter to replace" : ""
                  }
                  value={credentials.consumerSecret}
                  onChange={(event) =>
                    setCredentials({
                      ...credentials,
                      consumerSecret: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Shortcode
                <input
                  value={credentials.shortcode}
                  onChange={(event) =>
                    setCredentials({
                      ...credentials,
                      shortcode: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Passkey
                <input
                  type="password"
                  placeholder={
                    current?.configured ? "Configured; enter to replace" : ""
                  }
                  value={credentials.passkey}
                  onChange={(event) =>
                    setCredentials({
                      ...credentials,
                      passkey: event.target.value,
                    })
                  }
                />
              </label>
            </>
          ) : (
            <label className="field">
              Transfer instructions
              <input
                value={bankInstructions}
                onChange={(event) => setBankInstructions(event.target.value)}
                placeholder="Account name and number"
              />
            </label>
          )}
          <button className="primary" type="submit">
            Save {provider} settings
          </button>
          {provider === "mpesa" && (
            <button
              type="button"
              className="secondary"
              onClick={() => void test()}
            >
              Test connection
            </button>
          )}
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Environment</th>
              <th>Credentials</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cash</td>
              <td className="good">Always available</td>
              <td>—</td>
              <td>Not applicable</td>
            </tr>
            {configs.map((config) => (
              <tr key={config.provider}>
                <td>{config.provider}</td>
                <td>{config.isEnabled ? "Enabled" : "Disabled"}</td>
                <td>{config.environment}</td>
                <td>{config.configured ? "Configured" : "Not configured"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
