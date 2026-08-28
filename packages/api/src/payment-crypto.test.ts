import { describe, expect, it } from "vitest";
import {
  decryptCredentials,
  encryptCredentials,
  maskConfiguredCredentials,
} from "./payment-crypto";

describe("payment credential encryption", () => {
  it("round-trips credentials with AES-GCM and does not expose plaintext in the ciphertext", async () => {
    const plaintext = JSON.stringify({
      consumerKey: "key",
      consumerSecret: "secret",
    });
    const ciphertext = await encryptCredentials(plaintext, "test-master-key");

    expect(ciphertext).not.toContain("consumerSecret");
    expect(await decryptCredentials(ciphertext, "test-master-key")).toBe(
      plaintext,
    );
    await expect(decryptCredentials(ciphertext, "wrong-key")).rejects.toThrow();
  });

  it("returns only a configured indicator for stored credentials", () => {
    expect(maskConfiguredCredentials("ciphertext")).toEqual({
      configured: true,
    });
    expect(maskConfiguredCredentials(null)).toEqual({ configured: false });
  });
});
