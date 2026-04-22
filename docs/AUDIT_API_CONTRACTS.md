# Audit 5/7 — API Contract Mismatches (Frontend ↔ Backend)

> Completed: April 2026  
> Branch: `claude/audit-api-contracts-qm2Rd`  
> Method: grep-based extraction + manual cross-reference  

---

## ❌ 404s — Frontend calls with no backend route

### 1. `POST /auth/forgot-password`

| | |
|---|---|
| **Frontend** | `frontend/app/forgot-password/page.js:17` |
| **Backend** | **MISSING — no route in auth.py or anywhere** |
| **Impact** | Full page exists with email form, submit, success/error states. Any user clicking "Forgot Password" fires a request that returns 404. Password reset is silently broken. |
| **Fix needed** | Add `POST /auth/forgot-password` to backend (generate token, send SMTP email) OR remove the frontend page entirely if out of scope for v1. |

---

## ⚠️ Backend Routes Never Called from Frontend (Dead Code / Unimplemented UI)

These routes exist and work on the backend but have no corresponding frontend consumer.  
Not bugs — unfinished features — but worth knowing before adding auth/security to them.

| Route | File | Notes |
|---|---|---|
| `GET /producers/me` | `producer_me.py` | No producer self-profile fetch in UI. Dashboard uses `/me/dashboard` sub-path instead. |
| `PUT /producers/me` | `producer_me.py` | No producer profile edit page in frontend. |
| `GET /producers/{id}/reviews` | `reviews.py:168` | Frontend uses `GET /reviews?producer_id=` instead (works; this alias is dead). |
| `GET /experiences/mine` | `experiences.py` | No "My Experiences" page exists in frontend. |
| `PUT /experiences/{id}` | `experiences.py` | No experience edit page. |
| `DELETE /experiences/{id}` | `experiences.py` | No user-facing delete button (only admin delete exists). |
| `GET /home-products/{product_id}` | `home_products.py` | No individual product detail page. |
| `PUT /home-products/{product_id}` | `home_products.py` | No product edit form. |
| `DELETE /home-products/{product_id}` | `home_products.py` | No user-facing delete (admin path uses different route). |
| `GET /home-products/{product_id}/ratings` | `home_products.py` | No ratings display component calls this. |
| `GET /recipes` | `recipes.py` | v2 feature — tables exist, no frontend. |
| `GET /recipes/{recipe_id}` | `recipes.py` | Same — v2. |
| `POST /recipes` | `recipes.py` | Same — v2. |
| `GET /admin/producers/pending` | `admin.py` | Frontend uses `GET /admin/producers?status=pending` instead. |
| `POST /admin/producers/{id}/reject` | `admin.py` | Admin producers page only wires approve + toggle-status; no reject button. |
| `GET /admin/stats` | `admin.py` | Never called — separate from `/admin/dashboard`. |
| `GET /users/me/following` | `producers.py` | No "Following" page in frontend. |
| `PUT /events/{event_id}` | `events.py` | No event edit page. |
| `DELETE /events/{event_id}` | `events.py` | No event delete button in producer dashboard. |

---

## ✅ Confirmed Matched Pairs (method + path + body all correct)

### Auth
| Frontend | Backend | Status |
|---|---|---|
| `POST /auth/register` | `auth.py` | ✅ |
| `POST /auth/register/producer` | `auth.py` | ✅ |
| `POST /auth/login` | `auth.py` | ✅ |
| `GET /auth/me` | `auth.py` | ✅ |
| `POST /auth/google` | `auth.py` | ✅ |
| `POST /auth/apple` | `auth.py` | ✅ |
| `DELETE /auth/me` | `auth.py` | ✅ (note: DATA.md incorrectly lists this as `DELETE /users/me`) |

### Users
| Frontend | Backend | Status |
|---|---|---|
| `PATCH /users/me` | `users_me.py` | ✅ |
| `PATCH /users/me/password` | `users_me.py` | ✅ |

### Favorites
| Frontend | Backend | Status |
|---|---|---|
| `GET /users/me/favorites` | `favorites.py` (prefix `/users/me/favorites`) | ✅ |
| `POST /users/me/favorites/{id}` | `favorites.py` | ✅ |
| `DELETE /users/me/favorites/{id}` | `favorites.py` | ✅ |

### Producers
| Frontend | Backend | Status |
|---|---|---|
| `GET /producers` | `producers.py` | ✅ |
| `GET /producers/{id}` | `producers.py` | ✅ |
| `GET /producers/by-slug/{slug}` | `producers.py` | ✅ (via direct `fetch` in `[slug]/page.js`) |
| `GET /categories` | `producers.py` | ✅ |
| `POST /producers/{id}/whatsapp-click` | `producers.py` | ✅ |
| `POST /producers/{id}/follow` | `producers.py` | ✅ |
| `DELETE /producers/{id}/follow` | `producers.py` | ✅ |
| `GET /producers/{id}/follow-status` | `producers.py` | ✅ (FollowButton.jsx) |
| `GET /producers/me/dashboard` | `producer_me.py` | ✅ |
| `GET /producers/me/analytics` | `producer_me.py` | ✅ |
| `POST /producers/me/availability` | `producer_me.py` | ✅ |
| `POST /producers/me/availability-status` | `producer_me.py` | ✅ |

### Home Products
| Frontend | Backend | Status |
|---|---|---|
| `GET /home-products` | `home_products.py` | ✅ |
| `POST /home-products` | `home_products.py` | ✅ |
| `POST /home-products/validate` | `home_products.py` | ✅ |
| `POST /home-products/{id}/whatsapp-click` | `home_products.py` | ✅ |
| `GET /home-products/rate/{token}` | `home_products.py` | ✅ |
| `POST /home-products/rate/{token}` | `home_products.py` | ✅ |

### Events & Experiences
| Frontend | Backend | Status |
|---|---|---|
| `GET /events` | `events.py` | ✅ |
| `GET /events/upcoming` | `events.py` | ✅ |
| `GET /events/{id}` | `events.py` | ✅ |
| `POST /events` | `events.py` | ✅ |
| `GET /experiences` | `experiences.py` | ✅ |
| `POST /experiences` | `experiences.py` | ✅ |
| `POST /experiences/validate` | `experiences.py` | ✅ |
| `GET /experiences/{id}` | `experiences.py` | ✅ |

### Reviews & Reports
| Frontend | Backend | Status |
|---|---|---|
| `GET /reviews?producer_id=` | `reviews.py` | ✅ (required query param) |
| `POST /reviews` | `reviews.py` | ✅ |
| `DELETE /reviews/{id}` | `reviews.py` | ✅ |
| `GET /admin/reviews` | `reviews.py` | ✅ |
| `POST /producers/{id}/report` | `reports.py` | ✅ |

### Marketing / Misc
| Frontend | Backend | Status |
|---|---|---|
| `GET /stats` | `marketing.py` | ✅ |
| `POST /newsletter` | `marketing.py` | ✅ |
| `POST /contact` | `marketing.py` | ✅ |
| `GET /cities` | `marketing.py` | ✅ |
| `POST /chat` | `chat.py` | ✅ |
| `POST /upload/image` | `upload.py` | ✅ |
| `GET /search` | `search.py` | ✅ |
| `GET /register/producer/prefill/{token}` | `admin_outreach.py` (prefill_router) | ✅ |

### Admin
| Frontend | Backend | Status |
|---|---|---|
| `GET /admin/dashboard` | `admin_extra.py` | ✅ |
| `GET /admin/analytics` | `admin_extra.py` | ✅ |
| `GET /admin/settings` | `admin_extra.py` | ✅ |
| `PUT /admin/settings` | `admin_extra.py` | ✅ |
| `POST /admin/settings/test/{service}` | `admin_extra.py` | ✅ |
| `GET /admin/users` | `admin_extra.py` | ✅ |
| `PUT /admin/users/{id}/role` | `admin_extra.py` | ✅ |
| `POST /admin/users/{id}/block` | `admin_extra.py` | ✅ |
| `GET /admin/users/{id}/favorites` | `admin_extra.py` | ✅ |
| `GET /admin/categories` | `admin_extra.py` | ✅ |
| `POST /admin/categories` | `admin_extra.py` | ✅ |
| `PUT /admin/categories/{id}` | `admin_extra.py` | ✅ |
| `DELETE /admin/categories/{id}` | `admin_extra.py` | ✅ |
| `GET /admin/pages/{slug}` | `admin_extra.py` | ✅ |
| `PUT /admin/pages/{slug}` | `admin_extra.py` | ✅ |
| `GET /admin/producers` | `admin.py` | ✅ |
| `POST /admin/producers` | `admin.py` | ✅ |
| `PUT /admin/producers/{id}` | `admin.py` | ✅ |
| `POST /admin/producers/{id}/toggle-status` | `admin.py` | ✅ |
| `DELETE /admin/producers/{id}` | `admin.py` | ✅ |
| `POST /admin/producers/import` | `admin.py` | ✅ |
| `POST /admin/producers/{id}/approve` | `admin.py` | ✅ |
| `GET /admin/reports` | `reports.py` | ✅ |
| `GET /admin/home-products/flagged` | `admin.py` | ✅ |
| `GET /admin/home-products/hidden` | `admin.py` | ✅ |
| `POST /admin/home-products/{id}/approve` | `admin.py` | ✅ |
| `POST /admin/home-products/{id}/remove` | `admin.py` | ✅ (body: `{reason}` → `RemoveListingBody.reason`) |
| `POST /admin/home-products/{id}/restore` | `admin.py` | ✅ |
| `DELETE /admin/home-products/{id}` | `admin.py` | ✅ |
| `GET /admin/experiences` | `admin_experiences.py` | ✅ |
| `POST /admin/experiences/{id}/approve` | `admin_experiences.py` | ✅ |
| `POST /admin/experiences/{id}/request-changes` | `admin_experiences.py` | ✅ (body: `{feedback}` → `ExperienceModerationAction.feedback`) |
| `POST /admin/experiences/{id}/reject` | `admin_experiences.py` | ✅ (same) |
| `GET /admin/outreach` | `admin_outreach.py` | ✅ |
| `POST /admin/outreach` | `admin_outreach.py` | ✅ |
| `PATCH /admin/outreach/{id}` | `admin_outreach.py` | ✅ (body: `{status}` → `OutreachLeadUpdate.status`) |
| `DELETE /admin/outreach/{id}` | `admin_outreach.py` | ✅ |
| `POST /admin/outreach/{id}/prefill-token` | `admin_outreach.py` | ✅ |
| `GET /admin/outreach/metrics/summary` | `admin_outreach.py` | ✅ |

---

## Docs Mismatch (non-blocking)

- `docs/DATA.md` lists `DELETE /users/me` under Auth endpoints, but the actual route is `DELETE /auth/me` (in `auth.py` with prefix `/auth`). Code is correct; docs need a one-line fix.

---

## Verdict

| Category | Count |
|---|---|
| ❌ 404 — frontend call, no backend route | **1** |
| ⚠️ Dead backend routes (no frontend consumer) | **19** |
| ✅ Matched pairs (method + path + body verified) | **~70** |
| 📄 Docs mismatch (non-blocking) | **1** |

**Single actionable fix required:**  
`POST /auth/forgot-password` — implement the backend route, or remove the frontend page.  
All other mismatches are unfinished features (dead backend routes) — not broken flows.
