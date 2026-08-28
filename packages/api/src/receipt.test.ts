import { describe, expect, it } from "vitest";
import { generateReceiptCommands } from "@urp/shared-types";

describe("ESC/POS receipt generation", () => {
  it("produces readable receipt bytes and a configurable cut command", () => {
    const receipt = generateReceiptCommands({
      storeName: "Corner Market",
      cashierName: "Alex",
      timestamp: "2026-08-27T12:00:00Z",
      currency: "KES",
      items: [
        {
          name: "Milk",
          quantity: "2",
          unitPrice: "100.00",
          discountAmount: "10.00",
        },
      ],
      subtotal: "200.00",
      tax: "0.00",
      discount: "10.00",
      total: "190.00",
      paymentMethod: "cash",
      changeDue: "10.00",
    });
    const output = new TextDecoder().decode(receipt);
    expect(output).toContain("Corner Market");
    expect(output).toContain("Milk x2");
    expect(output).toContain("KES 190.00");
    expect([...receipt.slice(-3)]).toEqual([0x1d, 0x56, 0x00]);
  });

  it("can omit the cut command for printers without auto-cut", () => {
    const output = generateReceiptCommands(
      {
        storeName: "Shop",
        cashierName: "A",
        timestamp: "now",
        currency: "USD",
        items: [],
        subtotal: "0.00",
        tax: "0.00",
        discount: "0.00",
        total: "0.00",
        paymentMethod: "cash",
      },
      { autoCut: false },
    );
    expect([...output.slice(-3)]).not.toEqual([0x1d, 0x56, 0x00]);
  });
});
