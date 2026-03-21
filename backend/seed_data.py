"""Seed the database with initial categories and sample producers."""
import uuid

from app.config import settings
from app.database import SessionLocal
from app.models import Category, DeliveryArea, Producer, ProducerCategory, Product

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
    ("סבונים וטיפוח", "🧴"),
    ("קוסמטיקה טבעית", "🌸"),
]

PRODUCERS = [
    {
        "name": "ארז וליאת",
        "description": "לחמי מחמצת, מטבלים, קישים — הכל בעבודת יד מחומרי גלם אמיתיים.",
        "city": "מרכז",
        "lat": 32.0853,
        "lng": 34.7818,
        "phone": "+972556603367",
        "category_ids": [4],  # לחמים ואפייה
        "products": [
            {"name": "לחם מחמצת", "price_range": ""},
            {"name": "מטבלים", "price_range": ""},
            {"name": "קישים", "price_range": ""},
        ],
        "delivery_areas": [],
    },
    {
        "name": "אביגיל תותים ואוכמניות",
        "description": "פירות וירקות מחקלאים מכל הארץ — טרי, עונתי ואמיתי.",
        "city": "כל הארץ",
        "lat": 31.9,
        "lng": 34.8,
        "category_ids": [7],  # פירות
        "products": [
            {"name": "תותים", "price_range": ""},
            {"name": "אוכמניות", "price_range": ""},
            {"name": "פירות עונתיים", "price_range": ""},
        ],
        "delivery_areas": [
            {"city": "כל הארץ", "min_order": 0, "delivery_day": ""},
        ],
    },
    {
        "name": "יוסף חווה RAW אורגני",
        "description": "חלב גולמי, שמן זית, דבש, שמן קוקוס — הכל גולמי ואורגני.",
        "city": "",
        "lat": 32.5,
        "lng": 35.0,
        "category_ids": [2, 5],  # חלב וגבינות + שמנים ודבש
        "products": [
            {"name": "חלב גולמי", "price_range": ""},
            {"name": "שמן זית", "price_range": ""},
            {"name": "דבש", "price_range": ""},
            {"name": "שמן קוקוס", "price_range": ""},
        ],
        "delivery_areas": [],
    },
    {
        "name": "איתן דגים",
        "description": "מעדניית דגים ודליקטסים — דגים טריים ומוצרי דליקטסן איכותיים.",
        "city": "",
        "lat": 32.1,
        "lng": 34.8,
        "category_ids": [1],  # בשר ודגים
        "products": [
            {"name": "דגים טריים", "price_range": ""},
            {"name": "דליקטסים", "price_range": ""},
        ],
        "delivery_areas": [],
    },
    {
        "name": "ציר עצמות",
        "description": "ציר עצמות ביתי — מבושל לאט מעצמות grass-fed.",
        "city": "",
        "lat": 31.8,
        "lng": 34.7,
        "category_ids": [9],  # מוצרים מוכנים
        "products": [
            {"name": "ציר עצמות ביתי", "price_range": ""},
        ],
        "delivery_areas": [],
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
            existing = db.query(Producer).filter(Producer.name == p_data["name"]).first()
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
                status="approved",
                is_verified=True,
            )
            db.add(producer)
            db.flush()

            for cid in p_data["category_ids"]:
                db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

            for prod in p_data["products"]:
                db.add(Product(
                    producer_id=producer.id,
                    name=prod["name"],
                    price_range=prod["price_range"],
                ))

            for da in p_data["delivery_areas"]:
                db.add(DeliveryArea(
                    producer_id=producer.id,
                    city=da["city"],
                    min_order=da["min_order"],
                    delivery_day=da["delivery_day"],
                ))

        db.commit()
        print("Seed data inserted successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
