"use client";

import { useEffect, useState } from "react";

type Request = (path: string, options?: RequestInit) => Promise<any>;
type Transport = "bluetooth" | "network" | "usb" | "browser";

export function PrinterSettings({
  request,
  onNotice,
}: {
  request: Request;
  onNotice: (message: string) => void;
}) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    transport: "network" as Transport,
    url: "",
    serviceUuid: "000018f0-0000-1000-8000-00805f9b34fb",
    characteristicUuid: "00002af1-0000-1000-8000-00805f9b34fb",
    vendorId: "0",
    productId: "0",
  });
  const load = () =>
    void request("/printer-profiles")
      .then((body) => setProfiles(body.printerProfiles))
      .catch((error) => onNotice(error.message));
  useEffect(load, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const connectionConfig =
      form.transport === "network"
        ? { url: form.url }
        : form.transport === "bluetooth"
          ? {
              serviceUuid: form.serviceUuid,
              characteristicUuid: form.characteristicUuid,
            }
          : form.transport === "usb"
            ? {
                vendorId: Number(form.vendorId),
                productId: Number(form.productId),
                interfaceNumber: 0,
                endpointNumber: 1,
              }
            : {};
    try {
      await request("/printer-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          transport: form.transport,
          connectionConfig,
          autoCut: true,
          isDefault: profiles.length === 0,
        }),
      });
      onNotice(
        "Printer profile saved. Pair Bluetooth or USB from the cashier device.",
      );
      setForm({ ...form, name: "" });
      load();
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Printer profile could not be saved",
      );
    }
  };
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">HARDWARE</p>
          <h2>Printer profiles</h2>
        </div>
        <span className="muted">
          Pair Bluetooth and USB printers from the cashier device.
        </span>
      </div>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label className="field">
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Transport
          <select
            value={form.transport}
            onChange={(event) =>
              setForm({ ...form, transport: event.target.value as Transport })
            }
          >
            <option value="network">Network HTTP</option>
            <option value="bluetooth">Bluetooth</option>
            <option value="usb">USB</option>
            <option value="browser">Browser fallback</option>
          </select>
        </label>
        {form.transport === "network" && (
          <label className="field">
            Local print URL
            <input
              type="url"
              value={form.url}
              onChange={(event) =>
                setForm({ ...form, url: event.target.value })
              }
              placeholder="http://192.168.1.50:9100/print"
              required
            />
          </label>
        )}
        {form.transport === "bluetooth" && (
          <>
            <label className="field">
              Service UUID
              <input
                value={form.serviceUuid}
                onChange={(event) =>
                  setForm({ ...form, serviceUuid: event.target.value })
                }
              />
            </label>
            <label className="field">
              Characteristic UUID
              <input
                value={form.characteristicUuid}
                onChange={(event) =>
                  setForm({ ...form, characteristicUuid: event.target.value })
                }
              />
            </label>
          </>
        )}
        {form.transport === "usb" && (
          <>
            <label className="field">
              Vendor ID
              <input
                inputMode="numeric"
                value={form.vendorId}
                onChange={(event) =>
                  setForm({ ...form, vendorId: event.target.value })
                }
              />
            </label>
            <label className="field">
              Product ID
              <input
                inputMode="numeric"
                value={form.productId}
                onChange={(event) =>
                  setForm({ ...form, productId: event.target.value })
                }
              />
            </label>
          </>
        )}
        <button className="primary" type="submit">
          Add printer profile
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Transport</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.name}</td>
                <td>{profile.transport}</td>
                <td>{profile.isDefault ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
