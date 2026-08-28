const encoder = new TextEncoder();
const iterations = 100_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export const verifyPassword = async (password: string, storedHash: string | null) => {
  if (!storedHash) return false;
  const [algorithm, iterationText, saltText, hashText] = storedHash.split('$');
  if (algorithm !== 'pbkdf2' || !iterationText || !saltText || !hashText) return false;

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(saltText), iterations: Number(iterationText), hash: 'SHA-256' },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits)) === hashText;
};

export const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
};
