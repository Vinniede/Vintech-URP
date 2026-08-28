const encoder = new TextEncoder();
const decoder = new TextDecoder();
const algorithm = { name: "AES-GCM", length: 256 } as const;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const deriveKey = async (masterKey: string, usage: KeyUsage) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(masterKey),
  );
  return crypto.subtle.importKey("raw", digest, algorithm, false, [usage]);
};

export const encryptCredentials = async (
  plaintextJson: string,
  masterKey: string,
) => {
  if (!masterKey)
    throw new Error("Payment credential encryption key is required");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterKey, "encrypt");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintextJson),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
};

export const decryptCredentials = async (
  ciphertext: string,
  masterKey: string,
) => {
  if (!masterKey)
    throw new Error("Payment credential encryption key is required");
  const [ivText, payloadText] = ciphertext.split(".");
  if (!ivText || !payloadText)
    throw new Error("Invalid encrypted credential format");
  const key = await deriveKey(masterKey, "decrypt");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(payloadText),
  );
  return decoder.decode(plaintext);
};

export const maskConfiguredCredentials = (
  credentialsEncrypted: string | null,
) => ({ configured: Boolean(credentialsEncrypted) });
