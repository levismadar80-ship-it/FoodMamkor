import { describe, it, expect } from "vitest";
import { base64urlToBuffer, bufferToBase64url } from "@/lib/webauthn";

// MEH-3305: py_webauthn speaks unpadded base64url; a "+", "/" or "=" in what
// the browser sends back makes the server refuse the credential.
describe("webauthn base64url", () => {
  it("round-trips bytes that produce - and _ and no padding", () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 62, 63]);
    const text = bufferToBase64url(bytes.buffer);
    expect(text).toBe("-_-_AD4_");
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(new Uint8Array(base64urlToBuffer(text)))).toEqual(Array.from(bytes));
  });

  it("decodes a value whose length needs padding", () => {
    expect(Array.from(new Uint8Array(base64urlToBuffer("AQ")))).toEqual([1]);
  });

  it("null in, null out (a credential with no userHandle)", () => {
    expect(bufferToBase64url(null)).toBeNull();
  });
});
