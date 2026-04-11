# מהמקור — DB Schema + API
> קרא קובץ זה כשעובדים על backend, DB, endpoints

## DB Schema

```sql
-- עסקים
producers (
  id uuid PK,
  name, description, city,
  lat float, lng float,
  phone, instagram, website,
  status: pending|approved|rejected,
  images text[],
  is_verified bool,
  slug text unique,
  created_at
)

-- משתמשים
users (
  id uuid PK,
  email unique, name, password_hash,
  city,
  role: consumer|producer|admin,
  producer_id FK nullable,
  apple_id text nullable,
  is_blocked bool default false,
  created_at
)

-- קטגוריות
categories (id, name, emoji)
producer_categories (producer_id FK, category_id FK)

-- מוצרים
products (id, producer_id FK, name, description, price_range)

-- משלוחים
delivery_areas (id, producer_id FK, city, min_order int, delivery_day)

-- מועדפים
favorites (user_id FK, producer_id FK, PRIMARY KEY(user_id,producer_id), created_at)

-- מוצרים ביתיים
home_listings (
  id uuid PK, user_id FK,
  title, description, photo_url,
  quantity, price, neighborhood,
  available_until date,
  is_active bool, created_at
)

-- דירוגים
ratings (
  id uuid PK,
  from_user_id FK, to_user_id FK, listing_id FK,
  stars int(1-5), comment text(max 100), created_at
)

-- אדמין
admin_settings (key text PK, value text)
static_pages (slug text PK, title, body, updated_at)

-- ניוזלטר
newsletter_subscribers (id, email unique, created_at)

-- מתכונים (גרסה 2)
recipes (id, title, description, steps json, category_id FK,
         submitted_by FK, status: pending|approved|rejected, created_at)
recipe_ingredients (id, recipe_id FK, ingredient_name, producer_id FK nullable, notes)

-- אירועים וחוויות (v1)
events (
  id uuid PK,
  title, description text, images text[], category,
  type: event|experience,
  host_type: producer|community,
  location_type: producer_farm|home|public,
  host_user_id FK → users, producer_id FK → producers nullable,
  starts_at, ends_at, is_recurring bool, recurring_schedule,
  city, address, lat float, lng float,
  max_participants int, participants_count int,
  price_per_person numeric(10,2) nullable,  -- NULL = free
  requirements text,
  status: pending|approved|rejected|changes_requested,
  rejection_reason text, admin_feedback text,
  moderation_flags json,  -- Claude pre-moderation output
  created_at, updated_at
)
```

## API Endpoints

```
# עסקים
GET  /producers?lat=&lng=&radius_km=&category=&delivery_city=&verified=
GET  /producers/:id
GET  /producers/slug/:slug
POST /producers

# קטגוריות
GET  /categories

# אימות
POST /auth/register            — צרכן
POST /auth/register/producer   — טופס מלא (multi-step)
POST /auth/login               — JWT
POST /auth/google              — Google OAuth
POST /auth/apple               — Apple OAuth (חובה App Store)
DELETE /users/me               — מחיקת חשבון (חובה App Store)

# פרופיל
GET  /users/me/favorites
POST /users/me/favorites/:id
DELETE /users/me/favorites/:id
GET  /producers/me
PUT  /producers/me
POST /producers/me/images

# מהמטבח של השכן
GET  /home-listings?city=&category=
POST /home-listings
GET  /home-listings/:id
DELETE /home-listings/:id

# דירוגים
POST /ratings
GET  /ratings/listing/:id

# אדמין (role=admin בלבד)
GET  /admin/producers/pending
POST /admin/producers/:id/approve
POST /admin/producers/:id/reject
GET  /admin/users
PUT  /admin/users/:id/role
POST /admin/users/:id/block
GET  /admin/categories
POST /admin/categories
PUT  /admin/categories/:id
DELETE /admin/categories/:id
GET  /admin/pages/:slug
PUT  /admin/pages/:slug
GET  /admin/analytics
GET  /admin/settings
PUT  /admin/settings
GET  /admin/dashboard

# כלים חדשים
GET  /api/stats               → { producers_count, categories_count }
POST /api/newsletter          → newsletter_subscribers
POST /api/contact             → מייל לאדמין

# אירועים וחוויות (v1)
GET    /events?type=&category=&city=      — רק approved
GET    /events/mine                        — כל ההגשות של המשתמש
GET    /events/{id}                        — פרטים (owner/admin רואים גם pending)
POST   /events                             — הגשה → status=pending + Claude pre-mod
PUT    /events/{id}                        — עריכה (מחזירה ל-pending)
DELETE /events/{id}                        — רק בעלים/אדמין

# אדמין — מודרציה
GET  /admin/events?status=pending|approved|rejected|changes_requested|all
POST /admin/events/{id}/approve
POST /admin/events/{id}/request-changes    { feedback }
POST /admin/events/{id}/reject             { feedback }
```

## התראות (Twilio WhatsApp)
```
כשיצרן נרשם → WhatsApp לאדמין:
"עסק חדש מבקש אישור: [שם] - [עיר] - [קטגוריה]
 לאישור: mehamekor.co.il/admin"

3 דיווחים על עסק → התראה לאדמין
24 שעות אחרי לחיצת WhatsApp → Twilio שולח לקונה: "דרגי את הרכישה 👇"

אימות תקופתי:
מייל כל 3 חודשים לעסקים → 6 חודשים ללא תגובה = status: inactive
```

## Apple App Store — דרישות חובה
```
DELETE /users/me — מוחק: user, favorites, home_listings, ratings
POST /auth/apple — identity token → יוצר/מחבר משתמש
שמירת apple_id בטבלת users
```
