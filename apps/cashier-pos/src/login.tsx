import { useState } from "react";
import { Alert, Button, Input, PinKeypad, StatusPulse } from "@urp/ui";
import type { Session } from "./db";

type LoginProps = {
  online: boolean;
  storeId: string;
  email: string;
  pin: string;
  error: string;
  onStoreId: (value: string) => void;
  onEmail: (value: string) => void;
  onPin: (value: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
};

export function CashierLogin({
  online,
  storeId,
  email,
  pin,
  error,
  onStoreId,
  onEmail,
  onPin,
  onSubmit,
}: LoginProps) {
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onSubmit(event);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <section className="login-panel cashier-login">
        <StatusPulse
          online={online}
          label={online ? "Ready to connect" : "Offline: saved session only"}
        />
        <p className="eyebrow">UNIFIED RETAIL PLATFORM</p>
        <h1>Open your till.</h1>
        <p className="muted">
          Sign in once, then keep selling when the network goes quiet.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Store ID
            <Input
              value={storeId}
              onChange={(event) => onStoreId(event.target.value)}
              required
            />
          </label>
          <label>
            Staff email
            <Input
              type="email"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
              required
            />
          </label>
          <label>
            PIN
            <Input
              inputMode="numeric"
              type="password"
              value={pin}
              readOnly
              required
              aria-label="Staff PIN"
            />
          </label>
          <PinKeypad value={pin} onChange={onPin} maxLength={8} />
          {error && <Alert>{error}</Alert>}
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
