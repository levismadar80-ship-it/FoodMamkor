"""Create or reset the admin user.

Usage:
    python scripts/create_admin.py                    # interactive prompt
    python scripts/create_admin.py EMAIL PASSWORD     # non-interactive

If a user with the given email already exists, the script:
  - upgrades them to role=admin
  - resets their password
  - clears any is_blocked flag

Otherwise it creates a new admin user.
"""
import getpass
import os
import re
import sys

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mehamakor"
)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def prompt(label: str, *, hidden: bool = False) -> str:
    while True:
        value = (getpass.getpass(label) if hidden else input(label)).strip()
        if value:
            return value
        print("ערך ריק — נסי שוב.")


def main() -> int:
    if len(sys.argv) >= 3:
        email, password = sys.argv[1], sys.argv[2]
    else:
        email = prompt("Email: ")
        password = prompt("Password: ", hidden=True)

    if not EMAIL_RE.match(email):
        print(f"❌ אימייל לא תקין: {email}")
        return 1
    if len(password) < 8:
        print("❌ הסיסמה חייבת להיות לפחות 8 תווים")
        return 1

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            existing.role = "admin"
            existing.password_hash = hash_password(password)
            existing.is_blocked = False
            db.commit()
            print(f"✓ עודכן {email} → role=admin, סיסמה אופסה")
        else:
            user = User(
                email=email,
                name="מהמקור אדמין",
                password_hash=hash_password(password),
                role="admin",
            )
            db.add(user)
            db.commit()
            print(f"✓ נוצר משתמש אדמין חדש: {email}")
        print("\nכניסה: http://localhost:3000/login")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
