"""Seed the database with initial categories and sample producers."""

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.models import Category, DeliveryArea, Producer, ProducerCategory, Product
from app.models.models import User

CATEGORIES = [
    ("בשר ודגים", "🥩"),
    ("חלב וגבינות", "🥛"),
    ("ביצים", "🥚"),
    ("לחמים ואפייה", "🍞"),
    ("שמנים ודבש", "🫒"),
    ("ירקות", "🥬"),
    ("פירות", "🍓"),
    ("מותססים וכבושים", "🥒"),
    ("מוצרים מוכנים", "🫙"),
    ("צמחי מרפא ותוספים", "🌿"),
    ("סבונים טבעיים", "🧴"),
    ("קרמים ושמנים", "🌸"),
    ("תכשירי צמחים", "🌿"),
    ("נרות וארומה", "🕯️"),
    ("תוספי תזונה", "💊"),
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
        "category_ids": [1],  # בשר ודגים
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
        "delivery_areas": [
            {"city": "תל אביב", "min_order": 300, "delivery_day": "חמישי"},
            {"city": "חיפה", "min_order": 250, "delivery_day": "רביעי"},
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
        "category_ids": [11, 12],  # סבונים + קרמים
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


def seed():
    db = SessionLocal()
    try:
        # Seed categories
        for name, emoji in CATEGORIES:
            existing = db.query(Category).filter(Category.name == name).first()
            if not existing:
                db.add(Category(name=name, emoji=emoji))
        db.commit()

        # Seed producers
        for p_data in PRODUCERS:
            existing = (
                db.query(Producer).filter(Producer.name == p_data["name"]).first()
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
                status="approved",
                is_verified=True,
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
                    )
                )

        db.commit()

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
