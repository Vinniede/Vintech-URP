"use client";

import { useState } from "react";
import { Alert, Button, Card, Input } from "@urp/ui";

type Session = {
  accessToken: string;
  storeId: string;
  role: "owner" | "store_admin" | "inventory_clerk" | "fulfillment";
  name: string;
};
const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1${path}`;

export function AdminLogin({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
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
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <Card className="login-panel">
        <p className="eyebrow">OPERATIONS CONSOLE</p>
        <h1>Run the store.</h1>
        <p className="muted">
          Owner and admin controls for the unified retail platform.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Store ID
            <Input
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              required
            />
          </label>
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
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
