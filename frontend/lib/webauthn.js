// @ts-check
/**
 * Module:   lib/webauthn
 * Purpose:  The browser half of an admin passkey (MEH-3305): turn the
 *           server's JSON options into what `navigator.credentials` takes, and
 *           the credential it returns back into JSON for py_webauthn.
 * Does NOT: Talk to the API (lib/auth-context.js and the admin settings card
 *           do), and adds no dependency: the conversion is base64url only.
 * History:  MEH-3305 (creation).
 */

/** @param {string} text */
export function base64urlToBuffer(text) {
  const pad = "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob((text + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** @param {ArrayBuffer | null | undefined} buf */
export function bufferToBase64url(buf) {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {any[] | undefined} list */
function withIds(list) {
  return (list || []).map((c) => ({ ...c, id: base64urlToBuffer(c.id) }));
}

export function passkeysSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    !!navigator.credentials
  );
}

/**
 * Ask the device for a NEW passkey.
 * @param {any} options PublicKeyCredentialCreationOptions as JSON
 */
export async function createPasskey(options) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    excludeCredentials: withIds(options.excludeCredentials),
  };
  const cred = /** @type {any} */ (await navigator.credentials.create({ publicKey }));
  if (!cred) throw new Error("no credential");
  const transports =
    typeof cred.response.getTransports === "function" ? cred.response.getTransports() : [];
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
      attestationObject: bufferToBase64url(cred.response.attestationObject),
      transports,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}

/**
 * Ask the device to sign in with an EXISTING passkey.
 * @param {any} options PublicKeyCredentialRequestOptions as JSON
 */
export async function getPasskeyAssertion(options) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: withIds(options.allowCredentials),
  };
  const cred = /** @type {any} */ (await navigator.credentials.get({ publicKey }));
  if (!cred) throw new Error("no credential");
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
      authenticatorData: bufferToBase64url(cred.response.authenticatorData),
      signature: bufferToBase64url(cred.response.signature),
      userHandle: bufferToBase64url(cred.response.userHandle),
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}
