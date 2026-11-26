// @ts-check
/**
 * Module:   owner-assistant-store
 * Purpose:  Keep the owner's assistant conversation in this browser for a
 *           week, so closing the tab or reloading does not lose it.
 * Touches:  localStorage key `mehamakor:owner-assistant:<user id>` (text
 *           only: her messages and the answers; no drafts, rows or cards).
 * Does NOT: send it anywhere. A different signed-in user reads a different
 *           key, and «שיחה חדשה» clears it (clearOwnerChat).
 * History:  MEH-3902 (26/11).
 */

const PREFIX = "mehamakor:owner-assistant:";
const KEEP_DAYS = 7;
const DAY_MS = 86_400_000;
const KEEP_MS = KEEP_DAYS * DAY_MS;
const KEEP_MESSAGES = 40; // the server reads at most 40 (OwnerChatRequest)

/** @param {string | number | null | undefined} userId */
const chatKeyFor = (userId) => (userId ? `${PREFIX}${userId}` : null);

/**
 * @param {string | number | null | undefined} userId
 * @returns {{ role: "user" | "assistant", content: string }[]}
 */
export function loadOwnerChat(userId) {
  const key = chatKeyFor(userId);
  if (!key) return [];
  try {
    // eslint-disable-next-line no-restricted-syntax -- read after mount, shown only inside the panel she opens with a tap; nothing on the page moves
    const raw = JSON.parse(globalThis.localStorage?.getItem(key) || "null");
    if (!raw || typeof raw.at !== "number" || Date.now() - raw.at > KEEP_MS) return [];
    return (Array.isArray(raw.messages) ? raw.messages : [])
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .map(({ role, content }) => ({ role, content }));
  } catch {
    return [];
  }
}

/**
 * @param {string | number | null | undefined} userId
 * @param {{ role: string, content: string }[]} messages
 */
export function saveOwnerChat(userId, messages) {
  const key = chatKeyFor(userId);
  if (!key) return;
  try {
    const kept = messages.slice(-KEEP_MESSAGES).map(({ role, content }) => ({ role, content }));
    globalThis.localStorage?.setItem(key, JSON.stringify({ at: Date.now(), messages: kept }));
  } catch {
    // storage full or blocked: the conversation still works for this visit
  }
}

/** @param {string | number | null | undefined} userId */
export function clearOwnerChat(userId) {
  const key = chatKeyFor(userId);
  if (!key) return;
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // nothing stored
  }
}
