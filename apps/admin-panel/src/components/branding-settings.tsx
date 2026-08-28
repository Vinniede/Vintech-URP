"use client";

import { useState } from "react";

type Request = (path: string, options?: RequestInit) => Promise<any>;

export function BrandingSettings({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [accentColor, setAccentColor] = useState("#1F3A5F");
  const [logoUrl, setLogoUrl] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^#[0-9a-f]{6}$/i.test(accentColor))
      return onNotice("Accent must be a six-digit hex color.");
    try {
      await request("/store-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accentColor, logoUrl: logoUrl || null }),
      });
      onNotice("Storefront branding saved.");
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Branding could not be saved",
      );
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">MERCHANT BRAND</p>
          <h2>Storefront identity</h2>
        </div>
        <span className="muted">
          Preview uses contrast-safe text automatically
        </span>
      </div>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label className="field">
          Accent color
          <input
            type="color"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
          />
        </label>
        <label className="field">
          Logo URL
          <input
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>
        <button className="primary" type="submit">
          Save branding
        </button>
      </form>
    </section>
  );
}
