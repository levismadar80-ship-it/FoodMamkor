"""Seed the database with initial categories and sample producers."""

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.models import (
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    ProducerRecipe,
    Product,
)
from app.models.models import User

CATEGORIES = [
    # MEH-927: split from the combined "בשר ודגים"; "דגים" appended at end.
    ("בשר", "🥩"),
    ("חלב וגבינות", "🥛"),
    ("ביצים", "🥚"),
    ("לחמים ואפייה", "🍞"),
    ("שמנים", "🫒"),
    ("ירקות", "🥬"),
    ("פירות", "🍓"),
    ("מותססים וכבושים", "🥒"),
    ("מוצרים מוכנים", "🫙"),
    ("צמחי מרפא ותוספים", "🌿"),
    ("סבונים טבעיים", "🧴"),
    ("קוסמטיקה טבעית", "🌸"),
    # MEH-927: "תכשירי צמחים" + "תוספי תזונה" merged into "צמחי מרפא ותוספים"
    # (kept above) — overlapping wellness rows removed.
    ("נרות וארומה", "🕯️"),
    ("יין, בירה ומשקאות", "🍷"),
    ("תבלינים וצמחי תיבול", "🌶️"),
    ("שוקולד וממתקים בוטיק", "🍫"),
    # MEH-743: honey split off from "שמנים ודבש" — dedicated license regime
    # (צו הפיקוח, תשל"ז-1977). Appended at end so existing seed-id slots
    # (1-18) stay stable; downstream sample-producer category_ids unchanged.
    ("דבש", "🍯"),
    # MEH-927: "דגים" split off from "בשר ודגים" (now standalone "בשר").
    # Appended at end so mid-list seed-ids stay stable; sample producers
    # reference only ids <=12, so none re-map. Animal-source → license-required.
    ("דגים", "🐟"),
]

PRODUCERS = [
    {
        "name": "חוות הגליל - בשר אורגני",
        "slug": "galil-farm",
        "top_product_name": "בשר בקר grass-fed",
        "starting_price_label": "מ-₪70/ק״ג",
        "description": "חווה משפחתית בגליל המגדלת בקר grass-fed על מרעה טבעי. ללא הורמונים, ללא אנטיביוטיקה.",
        "city": "כרמיאל",
        "lat": 32.9136,
        "lng": 35.3035,
        "phone": "050-1234567",
        "instagram": "@galil_farm",
        "category_ids": [1],  # בשר (MEH-927: was "בשר ודגים")
        "products": [
            {"name": "סטייק אנטריקוט", "price_range": '120-180₪/ק"ג'},
            {"name": "בשר טחון", "price_range": '70-90₪/ק"ג'},
            {"name": "נקניקיות ביתיות", "price_range": '85₪/ק"ג'},
        ],
        "delivery_areas": [
            {"city": "חיפה", "min_order": 200, "delivery_day": "שלישי"},
            {"city": "כרמיאל", "min_order": 100, "delivery_day": "ראשון"},
            {"city": "עכו", "min_order": 200, "delivery_day": "שלישי"},
        ],
    },
    {
        "name": "גבינות הר הגולן",
        "slug": "golan-cheese",
        "top_product_name": "גבינת עיזים מיושנת",
        "starting_price_label": "מ-₪35/יח׳",
        "description": "מחלבה בוטיק ברמת הגולן. גבינות מחלב עיזים ופרות שגדלות במרעה חופשי.",
        "city": "קצרין",
        "lat": 32.9940,
        "lng": 35.6910,
        "phone": "052-9876543",
        "instagram": "@golan_cheese",
        "website": "https://golan-cheese.co.il",
        "category_ids": [2],  # חלב וגבינות
        "products": [
            {"name": "גבינת עיזים מיושנת", "price_range": "65₪/יח'"},
            {"name": "לאבנה ביתית", "price_range": "35₪/יח'"},
            {"name": "חמאה טבעית", "price_range": "40₪/יח'"},
        ],
        # MEH-1577: business-wide default rate — the value ירושלים below
        # inherits because it states no override of its own.
        "delivery_fee": 35,
        # MEH-1772 chunk 3: the per-area override demo. Three rows on purpose,
        # one per branch of the display logic, so the variance path is
        # reachable in preview without hand-editing the DB:
        #   תל אביב  → explicit 20 (override, cheaper than the default)
        #   חיפה     → explicit 40 (override, dearer than the default)
        #   ירושלים  → no key    (NULL → inherits the 35 above)
        # Effective set {20, 40, 35} has 2+ distinct values, so the public page
        # renders "משלוח מ-20₪" on the top line and a fee on every area row.
        "delivery_areas": [
            {
                "city": "תל אביב",
                "min_order": 300,
                "delivery_day": "חמישי",
                "delivery_fee": 20,
            },
            {
                "city": "חיפה",
                "min_order": 250,
                "delivery_day": "רביעי",
                "delivery_fee": 40,
            },
            {"city": "ירושלים", "min_order": 300, "delivery_day": "חמישי"},
        ],
    },
    {
        "name": "מאפיית המחמצת של דנה",
        "slug": "dana-sourdough",
        "top_product_name": "לחם מחמצת כוסמין",
        "starting_price_label": "מ-₪30",
        "description": "לחמים ומאפים מקמח כוסמין וקמחים מלאים. מחמצת טבעית בת 8 שנים. ללא שמרים מסחריים.",
        "city": "תל אביב",
        "lat": 32.0853,
        "lng": 34.7818,
        "phone": "054-5551234",
        "instagram": "@dana_sourdough",
        "category_ids": [4],  # לחמים ואפייה
        "products": [
            {"name": "לחם מחמצת כוסמין", "price_range": "45₪"},
            {"name": "פוקאצ'ה זעתר", "price_range": "35₪"},
            {"name": "עוגיות שיבולת שועל", "price_range": "30₪/חבילה"},
        ],
        "delivery_areas": [
            {"city": "תל אביב", "min_order": 80, "delivery_day": "שישי"},
            {"city": "רמת גן", "min_order": 100, "delivery_day": "שישי"},
            {"city": "הרצליה", "min_order": 120, "delivery_day": "שישי"},
        ],
    },
    {
        "name": "תסס - מותססים טבעיים",
        "slug": "tases-ferments",
        "top_product_name": "קימצ'י קוריאני מסורתי",
        "starting_price_label": "מ-₪25/בקבוק",
        "description": "סדנה לתסיסה טבעית. קימצ'י, כרוב כבוש, קומבוצ'ה ומשקאות מותססים - הכל בעבודת יד.",
        "city": "ירושלים",
        "lat": 31.7683,
        "lng": 35.2137,
        "phone": "050-7778899",
        "instagram": "@tases_ferments",
        "category_ids": [8],  # מותססים וכבושים
        "products": [
            {"name": "קימצ'י קוריאני מסורתי", "price_range": "45₪/צנצנת"},
            {"name": "כרוב כבוש קלאסי", "price_range": "35₪/צנצנת"},
            {"name": "קומבוצ'ה ג'ינג'ר", "price_range": "25₪/בקבוק"},
        ],
        "delivery_areas": [
            {"city": "ירושלים", "min_order": 80, "delivery_day": "ראשון"},
            {"city": "בית שמש", "min_order": 150, "delivery_day": "שני"},
            {"city": "תל אביב", "min_order": 200, "delivery_day": "רביעי"},
        ],
    },
    {
        "name": "טבע פור - סבונים ושמנים",
        "slug": "teva-pure",
        "top_product_name": "סבון שמן זית ולבנדר",
        "starting_price_label": "מ-₪35",
        "description": "סבונים בעבודת יד משמן זית ראשוני ישראלי. קרמים טבעיים ותכשירי צמחים ללא כימיקלים.",
        "city": "זכרון יעקב",
        "lat": 32.5714,
        "lng": 34.9518,
        "phone": "053-3334455",
        "instagram": "@teva_pure",
        "website": "https://tevapure.co.il",
        "category_ids": [11, 12],  # סבונים + קוסמטיקה טבעית
        "products": [
            {"name": "סבון שמן זית ולבנדר", "price_range": "35₪"},
            {"name": "קרם פנים אלוורה", "price_range": "85₪"},
            {"name": "שמן גוף ורדים", "price_range": "95₪"},
        ],
        "delivery_areas": [
            {"city": "חיפה", "min_order": 100, "delivery_day": "שלישי"},
            {"city": "תל אביב", "min_order": 150, "delivery_day": "חמישי"},
            {"city": "זכרון יעקב", "min_order": 0, "delivery_day": "כל יום"},
        ],
    },
]

# MEH-906: one approved+published recipe for an existing approved producer
# (golan-cheese) so its producer page renders a populated recipes section.
# moderation_status/published are set EXPLICITLY in seed() below — the model
# defaults are pending/False, which would NOT pass the public render filter
# (producer_recipes.py:339-340: published.is_(True) AND
# moderation_status == "approved").
GOLAN_RECIPE = {
    "producer_slug": "golan-cheese",
    "title": "טוסט גבינת עיזים, דבש ואגוזים",
    "description": (
        "פתיחה מושלמת לבוקר איטי — גבינת עיזים מהר הגולן על מחמצת חמה, עם דבש ואגוזים."
    ),
    "ingredients": "\n".join(
        [
            "2 פרוסות לחם מחמצת",
            "גבינת עיזים מיושנת — כ-100 גרם",
            "2 כפות דבש",
            "חופן אגוזי מלך קצוצים",
            "עלי תימין טריים",
        ]
    ),
    "instructions": "\n".join(
        [
            "1. קולים את פרוסות המחמצת עד הזהבה.",
            "2. מורחים נדיבות גבינת עיזים.",
            "3. מפזרים אגוזי מלך קצוצים.",
            "4. מזלפים דבש ומסיימים בעלי תימין.",
        ]
    ),
    "prep_time_min": 5,
    "cook_time_min": 5,
    "servings": 2,
}


def _seed_golan_recipe(db):
    """MEH-906: insert the golan-cheese demo recipe, approved+published.

    Idempotent guard by (producer_id, title) so re-running seed() does not
    duplicate. moderation_status/published are set EXPLICITLY (model defaults
    are pending/False, which would fail the public render filter at
    producer_recipes.py:339-340).
    """
    golan = (
        db.query(Producer)
        .filter(Producer.slug == GOLAN_RECIPE["producer_slug"])
        .first()
    )
    if not golan:
        return
    existing_recipe = (
        db.query(ProducerRecipe)
        .filter(
            ProducerRecipe.producer_id == golan.id,
            ProducerRecipe.title == GOLAN_RECIPE["title"],
        )
        .first()
    )
    if existing_recipe:
        return
    db.add(
        ProducerRecipe(
            producer_id=golan.id,
            title=GOLAN_RECIPE["title"],
            description=GOLAN_RECIPE["description"],
            ingredients=GOLAN_RECIPE["ingredients"],
            instructions=GOLAN_RECIPE["instructions"],
            prep_time_min=GOLAN_RECIPE["prep_time_min"],
            cook_time_min=GOLAN_RECIPE["cook_time_min"],
            servings=GOLAN_RECIPE["servings"],
            moderation_status="approved",
            published=True,
        )
    )
    db.commit()


# MEH-1530: the column that identifies an existing category for conflict
# detection. MEH-1456 (move to a stable slug key) changes this ONE line to
# "slug" once that column exists — nothing else in seed_categories names the
# identity column, so the Expand step needs no restructuring here.
CATEGORY_CONFLICT_KEY = "name"


def seed_categories(db):
    """Insert missing categories. Never renames, never deletes — insert-only.

    Seeding bootstraps a fresh database; it is NOT a reconciler. Renames and
    deletions are the exclusive responsibility of Alembic migrations — the MEH-927
    revision is the worked example: it re-keys rows by name inside a reviewed,
    reversible revision with a fail-loud FK guard. A boot-time seed has none of
    that safety and must not mutate rows a human or a migration already owns.

    Why both previous designs failed, so neither is reintroduced:

    - **Name-keyed UPDATE (pre-MEH-1107)** checked existence by ``Category.name``.
      A rename in ``CATEGORIES`` matched nothing, so the re-seed INSERTed a second
      row while the old-named row survived — the MEH-1104 duplicate.
    - **Id-keyed UPDATE (MEH-1107, replaced here)** mapped list position to primary
      key (``cat_id = idx + 1``) and renamed whichever row sat at that id. That
      assumption was false: ``admin_extra.py`` and the MEH-927 migration both create
      rows at autoincrement ids, so the id sequence has holes. On staging (holes at
      ids 1, 5, 13, 15) the first iteration looked up id 1, found nothing, and
      INSERTed 'בשר' — a name already live on id 22 — violating
      ``categories_name_key`` and rolling back the WHOLE transaction on every boot.
      That rollback was the only thing preventing four categories from being
      silently renamed (MEH-1530).

    This version is immune to both: it issues no UPDATE at all, so id holes are
    irrelevant and a rename in ``CATEGORIES`` is simply a no-op here (land renames
    as a migration). Idempotence comes from the database via the existing UNIQUE
    constraint on ``categories.name``, not from a read-then-write race:
    ``ON CONFLICT DO NOTHING`` makes a re-run a no-op, so two consecutive calls
    leave the table byte-identical — same row count, same ids, same names. Rows are
    inserted without an explicit id so autoincrement keeps advancing the sequence
    (``admin_extra.py`` creates categories at runtime and would collide on a
    stranded sequence).

    Expected result against current staging data: all 18 rows conflict, zero rows
    change. A non-zero row delta means the taxonomy genuinely drifted and wants a
    migration — not a seed change.
    """
    # DO NOT reintroduce an UPDATE here — name-keyed was MEH-1104, id-keyed was
    # MEH-1530. Renames/deletes belong in an Alembic revision (MEH-927 pattern).
    db.execute(
        pg_insert(Category)
        .values([{"name": name, "emoji": emoji} for name, emoji in CATEGORIES])
        .on_conflict_do_nothing(index_elements=[CATEGORY_CONFLICT_KEY])
    )
    db.commit()


def seed():
    """Bootstrap a fresh database. Idempotent, insert-only, never a reconciler.

    Identity is the STABLE key, never the display value. Every existence check
    below matches on a column the product does not let a human edit for
    presentation reasons — ``producers.slug`` (unique, part of the public URL),
    ``categories.name`` via the DB UNIQUE constraint in ``seed_categories``,
    ``users.email``. Display columns (``name``, ``title``, labels) are MUTABLE:
    an admin renames one at runtime (``admin_extra.py`` for categories,
    ``admin.py`` / ``producer_me.py`` for producers) and any seed keyed on that
    value stops matching its own row on the next boot — it then INSERTs a
    second copy instead of skipping.

    Renames and deletions belong in an Alembic migration, not here. A migration
    is reviewed, reversible, and can carry an FK guard; a boot-time seed has
    none of that. Changing a display value in ``PRODUCERS`` / ``CATEGORIES`` is
    deliberately a no-op against an already-seeded database.

    History: MEH-1104 (name-keyed category UPDATE duplicated a row),
    MEH-1107 (id-keyed replacement crashed on staging id holes),
    MEH-1530 (categories → insert-only; producers → slug-keyed here).
    """
    db = SessionLocal()
    try:
        # Seed categories — insert-only; renames/deletes are migrations (MEH-1530).
        seed_categories(db)

        # Seed producers. Keyed by slug — the stable identity column (unique,
        # public URL). DO NOT key this on Producer.name: name is display text an
        # admin can edit at runtime, and a rename would make this lookup miss its
        # own row and INSERT a duplicate — the MEH-1104 failure, one table over.
        # producers.name carries NO unique constraint, so nothing downstream
        # would catch the duplicate.
        for p_data in PRODUCERS:
            existing = (
                db.query(Producer).filter(Producer.slug == p_data["slug"]).first()
            )
            if existing:
                continue

            producer = Producer(
                name=p_data["name"],
                description=p_data["description"],
                city=p_data["city"],
                lat=p_data["lat"],
                lng=p_data["lng"],
                phone=p_data.get("phone"),
                instagram=p_data.get("instagram"),
                website=p_data.get("website"),
                slug=p_data.get("slug"),
                top_product_name=p_data.get("top_product_name"),
                starting_price_label=p_data.get("starting_price_label"),
                # MEH-1772 chunk 3: .get() so the producers that state no rate
                # keep NULL ("cost not stated") rather than becoming 0 ("free").
                delivery_fee=p_data.get("delivery_fee"),
                status="approved",
                # MEH-766 ch3: seed no longer sets is_verified (column default False).
            )
            db.add(producer)
            db.flush()

            for cid in p_data["category_ids"]:
                db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

            for prod in p_data["products"]:
                db.add(
                    Product(
                        producer_id=producer.id,
                        name=prod["name"],
                        price_range=prod["price_range"],
                    )
                )

            for da in p_data["delivery_areas"]:
                db.add(
                    DeliveryArea(
                        producer_id=producer.id,
                        city=da["city"],
                        min_order=da["min_order"],
                        delivery_day=da["delivery_day"],
                        # MEH-1772 chunk 3: .get() — a row without the key
                        # inherits the producer-level rate (NULL), which is
                        # every seeded row except the two demo overrides.
                        delivery_fee=da.get("delivery_fee"),
                    )
                )

        db.commit()

        # MEH-906: seed one approved+published recipe for golan-cheese so its
        # producer page renders a populated recipes section.
        _seed_golan_recipe(db)

        # Seed admin user from env vars.
        # Both ADMIN_EMAIL and ADMIN_PASSWORD must be set; otherwise we
        # skip the seed so local dev / CI can run without a pre-baked
        # admin. Secrets must NEVER be hardcoded here — the previous
        # hardcoded pair was exposed in git history and has been rotated.
        if settings.admin_email and settings.admin_password:
            existing_admin = (
                db.query(User).filter(User.email == settings.admin_email).first()
            )
            if not existing_admin:
                admin_user = User(
                    email=settings.admin_email,
                    name="Admin",
                    password_hash=hash_password(settings.admin_password),
                    role="admin",
                )
                db.add(admin_user)
                db.commit()
                print(f"Admin user created: {settings.admin_email}")
            else:
                print(f"Admin user already exists: {settings.admin_email}")
        else:
            print("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed")

        print("Seed data inserted successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
