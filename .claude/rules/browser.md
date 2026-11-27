# Sapir's Chrome — one tab per thread, closed at the end, two threads at a time

Every thread in the project drives the same Chrome on Sapir's PC (Claude in
Chrome). On 27/11 it froze and blocked four threads at once (MEH-3954). Read
this before the first `mcp__claude-in-chrome__*` call. The WhatsApp keeper
rule (one sender at a time) still applies on top of this one.

## Why it piled up (from the tool contracts, not a guess)

- `tabs_context_mcp` with `createIfEmpty` opens a **new window** with its own
  tab group for every session. Ten threads = ten windows.
- The tool's own guidance says each conversation opens a new tab and never
  reuses one, so a thread that navigates five times can leave five tabs.
- `tabs_close_mcp` closes only the calling session's tabs. A thread that ends
  without closing leaves a window **no other thread can close**.
- A dirty admin or dashboard edit tab holds a native dialog:
  `useUnsavedGuard` (`frontend/hooks/useUnsavedGuard.js`, used by the admin
  edit page through `frontend/components/admin/AdminDeliveryPaymentPanel.jsx`)
  adds `beforeunload`
  («לעזוב את האתר?») and a `window.confirm` on any link click. While it is
  open, every mehamakor.co.il tab in that Chrome hangs on «בטעינה…» (one
  renderer), and `tabs_close_mcp` cannot close it.
- Nothing capped how many threads drove the browser at once.

## 1. Use her Chrome last

Pick the first that can do the job:

1. API or connector (GitHub, Linear, Drive, Vercel, Railway, Graph API, prod
   `GET /api/*`).
2. Cloud Playwright in the sandbox: staging with the bypass and the demo
   accounts (testing.md «Driving Playwright against staging»), prod public
   pages.
3. The built-in Claude Browser on her PC (`mcp__remote-devices__Claude_Browser__*`)
   for public sites and research.
4. Her Chrome, only for what is signed in there and nowhere else: WhatsApp
   Web, Facebook / Instagram, prod `/admin`, Meta / Google consoles.

## 2. Take a lease before the first call

Leases live in `/mnt/project-files/chrome-lease/`, one file per thread, named
by the thread id suffix: `<suffix>.lease`, holding three lines:
`start=<UTC ISO>`, `expires=<UTC ISO, start + 15 min>`, `what=<site · task>`.

- **At most 2 live leases at once, and at most 1 whose `what` is prod
  `/admin`.** A lease whose `expires` is past is dead and does not count.
- Acquire: list the folder, count live leases, write yours, re-read the folder
  10 s later (the mount is last-write-wins). Over the cap → the lease with the
  later `start` deletes itself and waits.
- Over 15 min: rewrite `expires` before it passes. Done: delete the file.
- Waiting: `send_later` 10 min and retry; never a sleep loop. After 3 tries
  tell the coordinator what you are waiting for.
- WhatsApp still needs the keeper's turn as well (memory `whatsapp-web-lock`).

## 3. One tab, closed at the end

- Call `tabs_context_mcp` with `createIfEmpty` **once per session**. Then
  `navigate` that same tab for every page. Open a second tab only when two
  pages must be open together (an upload stitch), and close it right after.
- **End of every browser step: `tabs_close_mcp` on every tab you hold**, then
  delete the lease. Closing the group's last tab removes its window. "I may
  need it later" is not a reason; reopening costs one call.
- Before the turn ends, `tabs_context_mcp` (no create) must show no tab of
  yours, or the reply says which tab is left open and why.

## 4. Edit pages: save before you leave

- Never `navigate`, close, reload or click a link in a tab with unsaved edits
  on `/admin/producers/<id>/edit` or `/producer/dashboard/edit|offer`. Save
  every section you touched (its own «שמירה», and «שמרו שינויים»), read the
  saved value back, then leave.
- To give up an edit, put the field back to its saved value first. If a dialog is already up, stop: the reply says «דיאלוג "לעזוב את
  האתר?" פתוח בלשונית <id>», and the thread does not open another tab to get
  around it.
- One `javascript_tool` call stays under 30 s (one file or one field per call).
- Prod admin: open the edit URL directly (`/admin/producers/<id>/edit`), not
  the list.

## 5. When Chrome is already stuck

Don't open anything new and don't retry in a loop. Tell the coordinator,
which tells Sapir in one line: which tab holds a dialog (click «עזיבה»), or,
for orphan windows no thread can close, close the extra Chrome windows (or
restart Chrome). This is the only browser step that is hers.
