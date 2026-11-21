// @ts-check
/**
 * Module:   chat-knowledge
 * Purpose:  Builds what the AI assistant knows about the tools a business
 *           gets, from the same registry and words /join renders — so a tool
 *           added to the site reaches the assistant without anyone editing
 *           its prompt.
 * Touches:  nothing — pure function over lib/business-features.js + messages.
 * Does NOT: write the file the backend reads (backend/app/data/
 *           chat_business_features.json): __tests__/ChatKnowledgeSync.test.js
 *           fails when that file differs from this output, and
 *           `WRITE_CHAT_KNOWLEDGE=1 npx vitest run __tests__/ChatKnowledgeSync.test.js`
 *           rewrites it.
 * Related:  backend/app/services/chat_site_knowledge.py (reads the file) ·
 *           backend/app/routers/chat.py (puts it in the prompt).
 * History:  20/11 — Sapir: the assistant's «why join» answer missed tools.
 */
import { BUSINESS_FEATURES, BUSINESS_FEATURE_GROUPS } from "./business-features";

/**
 * @param {any} messages the parsed messages/he.json
 * @returns {{ groups: Array<{ key: string, label: string, items: Array<{ id: string, label: string, flag?: string }> }> }}
 */
export function buildChatBusinessFeatures(messages) {
  const copy = messages.business_features;
  return {
    groups: BUSINESS_FEATURE_GROUPS.map((key) => ({
      key,
      label: copy.groups[key].label,
      items: BUSINESS_FEATURES.filter((f) => f.group === key && f.status === "live").map((f) => ({
        id: f.id,
        label: copy.items[f.id].label,
        // The backend reads its own switch for a flagged tool (chat.py).
        ...(f.flag ? { flag: f.id } : {}),
      })),
    })),
  };
}
