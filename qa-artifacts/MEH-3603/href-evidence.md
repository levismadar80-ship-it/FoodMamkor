# MEH-3603 — rendered hrefs before / after

No pixel or copy changes. Each of the four links renders the same href string it rendered before; only the code that builds it moved to `frontend/lib/utils.js`.

| Site | Before (hand-built) | After |
|---|---|---|
| dashboard support sheet (`page.js:158`) | `https://wa.me/${SUPPORT_PHONE \|\| "972500000000"}` | `getWhatsAppChatHref(same)` → same string |
| dashboard week nudge (`page.js:1015`) | `"https://wa.me/"` | `getWhatsAppChatHref()` → `https://wa.me/` (asserted in `DashboardWeekCard.test.jsx:151`) |
| admin owner invite (`OwnerInvitePanel.jsx:241`) | `` `https://wa.me/?text=${encodeURIComponent(t)}` `` | `getWhatsAppHref("", t)` → same string |
| share button (`WhatsAppShareButton.jsx:24`) | same form | `getWhatsAppHref("", text)` → same string |

Byte equality is pinned by `frontend/__tests__/WhatsAppChatHref.test.js`.
