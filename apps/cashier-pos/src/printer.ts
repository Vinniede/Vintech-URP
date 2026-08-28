import type { ReceiptConfig } from "@urp/shared-types";

export type PrinterTransport = "bluetooth" | "network" | "usb" | "browser";
export type PrinterProfile = {
  id: string;
  name: string;
  transport: PrinterTransport;
  connectionConfig: Record<string, unknown>;
  autoCut: boolean;
};

export interface PrinterAdapter {
  connect(): Promise<void>;
  print(commands: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): "connected" | "disconnected" | "error";
}

export class BrowserPrintAdapter implements PrinterAdapter {
  private status: "connected" | "disconnected" | "error" = "disconnected";
  async connect() {
    this.status = "connected";
  }
  async print(commands: Uint8Array) {
    const escaped = Array.from(commands)
      .map((byte) => String.fromCharCode(byte))
      .join("");
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const documentRef = iframe.contentDocument;
    if (!documentRef) throw new Error("Browser print is unavailable");
    documentRef.body.innerHTML = `<pre>${escaped.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character)}</pre>`;
    iframe.contentWindow?.print();
    iframe.remove();
  }
  async disconnect() {
    this.status = "disconnected";
  }
  getStatus() {
    return this.status;
  }
}

export class BluetoothPrinterAdapter implements PrinterAdapter {
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private status: "connected" | "disconnected" | "error" = "disconnected";
  constructor(private readonly profile: PrinterProfile) {}
  async connect() {
    if (!("bluetooth" in navigator))
      throw new Error("Web Bluetooth is not supported by this browser");
    const config = this.profile.connectionConfig as {
      serviceUuid?: BluetoothServiceUUID;
      characteristicUuid?: BluetoothCharacteristicUUID;
    };
    const bluetooth = navigator.bluetooth;
    this.device = await bluetooth.requestDevice({
      filters: [
        {
          services: [
            config.serviceUuid ?? "000018f0-0000-1000-8000-00805f9b34fb",
          ],
        },
      ],
    });
    const server = await this.device.gatt?.connect();
    const service = await server?.getPrimaryService(
      config.serviceUuid ?? "000018f0-0000-1000-8000-00805f9b34fb",
    );
    const characteristic = await service?.getCharacteristic(
      config.characteristicUuid ?? "00002af1-0000-1000-8000-00805f9b34fb",
    );
    if (!characteristic)
      throw new Error("Bluetooth printer characteristic not found");
    this.characteristic = characteristic;
    this.status = "connected";
  }
  async print(commands: Uint8Array) {
    if (!this.characteristic)
      throw new Error("Bluetooth printer is not connected");
    for (let offset = 0; offset < commands.length; offset += 180)
      await this.characteristic.writeValue(
        commands.slice(offset, offset + 180),
      );
  }
  async disconnect() {
    this.device?.gatt?.disconnect();
    this.status = "disconnected";
  }
  getStatus() {
    return this.status;
  }
}

export class NetworkPrinterAdapter implements PrinterAdapter {
  private status: "connected" | "disconnected" | "error" = "disconnected";
  constructor(private readonly profile: PrinterProfile) {}
  async connect() {
    const url = this.profile.connectionConfig.url;
    if (typeof url !== "string")
      throw new Error("Network printer URL is missing");
    this.status = "connected";
  }
  async print(commands: Uint8Array) {
    const url = this.profile.connectionConfig.url;
    const response = await fetch(String(url), {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: commands.buffer as ArrayBuffer,
    });
    if (!response.ok) {
      this.status = "error";
      throw new Error(`Network printer failed: ${response.status}`);
    }
  }
  async disconnect() {
    this.status = "disconnected";
  }
  getStatus() {
    return this.status;
  }
}

export class UsbPrinterAdapter implements PrinterAdapter {
  private device?: USBDevice;
  private status: "connected" | "disconnected" | "error" = "disconnected";
  constructor(private readonly profile: PrinterProfile) {}
  async connect() {
    if (!("usb" in navigator))
      throw new Error("Web USB is not supported by this browser");
    const config = this.profile.connectionConfig as {
      vendorId: number;
      productId: number;
      interfaceNumber?: number;
      endpointNumber?: number;
    };
    this.device = await navigator.usb.requestDevice({
      filters: [{ vendorId: config.vendorId, productId: config.productId }],
    });
    await this.device.open();
    if (!this.device.configuration) await this.device.selectConfiguration(1);
    await this.device.claimInterface(config.interfaceNumber ?? 0);
    this.status = "connected";
  }
  async print(commands: Uint8Array) {
    const config = this.profile.connectionConfig as { endpointNumber?: number };
    if (!this.device) throw new Error("USB printer is not connected");
    for (let offset = 0; offset < commands.length; offset += 512)
      await this.device.transferOut(
        config.endpointNumber ?? 1,
        commands.slice(offset, offset + 512),
      );
  }
  async disconnect() {
    await this.device?.close();
    this.status = "disconnected";
  }
  getStatus() {
    return this.status;
  }
}

export const adapterForProfile = (profile: PrinterProfile): PrinterAdapter => {
  if (profile.transport === "bluetooth")
    return new BluetoothPrinterAdapter(profile);
  if (profile.transport === "network")
    return new NetworkPrinterAdapter(profile);
  if (profile.transport === "usb") return new UsbPrinterAdapter(profile);
  return new BrowserPrintAdapter();
};

export const printWithFallback = async (
  profile: PrinterProfile | undefined,
  commands: Uint8Array,
  receiptConfig: ReceiptConfig = {},
) => {
  const adapter = profile
    ? adapterForProfile(profile)
    : new BrowserPrintAdapter();
  try {
    await adapter.connect();
    await adapter.print(commands);
    await adapter.disconnect();
    return "printer" as const;
  } catch {
    try {
      await adapter.disconnect();
    } catch {
      /* fallback cleanup is best effort */
    }
    const fallback = new BrowserPrintAdapter();
    await fallback.connect();
    await fallback.print(commands);
    await fallback.disconnect();
    return "browser" as const;
  }
};
