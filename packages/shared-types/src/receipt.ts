const encoder = new TextEncoder();

export type ReceiptItem = {
  name: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
};

export type ReceiptData = {
  storeName: string;
  footerMessage?: string;
  cashierName: string;
  timestamp: string;
  currency: string;
  items: ReceiptItem[];
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  paymentMethod: string;
  changeDue?: string;
};

export type ReceiptConfig = { autoCut?: boolean };

const line = (value: string) => `${value}\n`;
const amount = (value: string, currency: string) => `${currency} ${value}`;
const columns = (left: string, right: string, width = 42) =>
  `${left.slice(0, width - right.length - 1).padEnd(width - right.length - 1)} ${right}\n`;

export const generateReceiptCommands = (
  receipt: ReceiptData,
  config: ReceiptConfig = {},
) => {
  const commands: number[] = [];
  const push = (...bytes: number[]) => commands.push(...bytes);
  const text = (value: string) => commands.push(...encoder.encode(value));

  push(0x1b, 0x40); // initialize
  push(0x1b, 0x61, 0x01); // center
  push(0x1b, 0x45, 0x01);
  text(line(receipt.storeName));
  push(0x1b, 0x45, 0x00);
  text(line("RECEIPT"));
  push(0x1b, 0x61, 0x00); // left
  text(line("-".repeat(42)));
  for (const item of receipt.items) {
    const lineTotal = (
      Number(item.unitPrice) * Number(item.quantity) -
      Number(item.discountAmount ?? "0")
    ).toFixed(2);
    text(
      columns(
        `${item.name} x${item.quantity}`,
        amount(lineTotal, receipt.currency),
      ),
    );
    if (item.discountAmount && Number(item.discountAmount) > 0)
      text(
        columns(
          "  Discount",
          `-${amount(item.discountAmount, receipt.currency)}`,
        ),
      );
  }
  text(line("-".repeat(42)));
  text(columns("Subtotal", amount(receipt.subtotal, receipt.currency)));
  text(columns("Discount", `-${amount(receipt.discount, receipt.currency)}`));
  text(columns("Tax", amount(receipt.tax, receipt.currency)));
  push(0x1b, 0x45, 0x01);
  text(columns("TOTAL", amount(receipt.total, receipt.currency)));
  push(0x1b, 0x45, 0x00);
  text(line(`Payment: ${receipt.paymentMethod}`));
  if (receipt.changeDue)
    text(line(`Change: ${amount(receipt.changeDue, receipt.currency)}`));
  text(line(`Cashier: ${receipt.cashierName}`));
  text(line(receipt.timestamp));
  if (receipt.footerMessage) {
    push(0x1b, 0x61, 0x01);
    text(line(receipt.footerMessage));
    push(0x1b, 0x61, 0x00);
  }
  text(line("\n"));
  if (config.autoCut !== false) push(0x1d, 0x56, 0x00); // full cut
  return new Uint8Array(commands);
};
