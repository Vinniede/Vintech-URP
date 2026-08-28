import { decryptCredentials } from "./payment-crypto.js";

type MpesaCredentials = {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
};
type MpesaConfig = MpesaCredentials & { environment: "sandbox" | "production" };
type TokenEntry = { token: string; expiresAt: number };

export class PaymentProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} payment provider is not yet configured`);
    this.name = "PaymentProviderNotConfiguredError";
  }
}

export const initiateCard = async () => {
  throw new PaymentProviderNotConfiguredError("Card");
};

const tokenCache = new Map<string, TokenEntry>();
const endpoints = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

const timestamp = () => {
  const date = new Date();
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  return parts.map((part) => String(part).padStart(2, "0")).join("");
};

const getAccessToken = async (config: MpesaConfig) => {
  const cacheKey = `${config.environment}:${config.consumerKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const response = await fetch(
    `${endpoints[config.environment]}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${btoa(`${config.consumerKey}:${config.consumerSecret}`)}`,
      },
    },
  );
  if (!response.ok) throw new Error(`M-Pesa OAuth failed: ${response.status}`);
  const body = (await response.json()) as {
    access_token: string;
    expires_in: string;
  };
  tokenCache.set(cacheKey, {
    token: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in) * 1000,
  });
  return body.access_token;
};

export const testMpesaConnection = async (config: MpesaConfig) => {
  await getAccessToken(config);
  return true;
};

export const initiateMpesa = async (
  config: MpesaConfig,
  input: { amount: string; customerPhone: string; callbackUrl: string },
) => {
  const token = await getAccessToken(config);
  const requestTimestamp = timestamp();
  const response = await fetch(
    `${endpoints[config.environment]}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: btoa(
          `${config.shortcode}${config.passkey}${requestTimestamp}`,
        ),
        Timestamp: requestTimestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(Number(input.amount)),
        PartyA: input.customerPhone,
        PartyB: config.shortcode,
        PhoneNumber: input.customerPhone,
        CallBackURL: input.callbackUrl,
        AccountReference: "UnifiedRetail",
        TransactionDesc: "Retail payment",
      }),
    },
  );
  if (!response.ok)
    throw new Error(`M-Pesa STK Push failed: ${response.status}`);
  return response.json() as Promise<{
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    CustomerMessage?: string;
  }>;
};

export const decryptMpesaConfig = async (
  ciphertext: string,
  masterKey: string,
  environment: "sandbox" | "production",
) => ({
  ...(JSON.parse(
    await decryptCredentials(ciphertext, masterKey),
  ) as MpesaCredentials),
  environment,
});
