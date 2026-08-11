"""MEH-1191 — WhatsApp opt-in requires a phone (defense-in-depth 422).

The fan-out at alerts.py:194 already guards WhatsApp delivery on
`alert.user.phone`, so opting in without a phone was a silent no-op. The
upsert now rejects whatsapp_opt_in=true with 422 when the user has no phone,
so the UI can collect one just-in-time instead of promising undelivered alerts.
"""

from conftest import auth_header, make_producer, make_user


def _favorite(client, user, producer):
    r = client.post(f"/users/me/favorites/{producer.id}", headers=auth_header(user))
    assert r.status_code in (200, 201)


class TestWhatsAppOptInRequiresPhone:
    def test_optin_without_phone_returns_422(self, client, db):
        user = make_user(db, email="nophone@example.com")
        producer = make_producer(db, name="Farm A")
        _favorite(client, user, producer)
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"whatsapp_opt_in": True},
            headers=auth_header(user),
        )
        assert r.status_code == 422
        assert "טלפון" in r.json()["detail"]

    def test_optin_with_phone_returns_200(self, client, db):
        user = make_user(db, email="withphone@example.com")
        user.phone = "0501234567"
        db.commit()
        producer = make_producer(db, name="Farm B")
        _favorite(client, user, producer)
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"whatsapp_opt_in": True},
            headers=auth_header(user),
        )
        assert r.status_code == 200
        assert r.json()["whatsapp_opt_in"] is True

    def test_optin_false_without_phone_returns_200(self, client, db):
        user = make_user(db, email="optout@example.com")
        producer = make_producer(db, name="Farm C")
        _favorite(client, user, producer)
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"whatsapp_opt_in": False},
            headers=auth_header(user),
        )
        assert r.status_code == 200
        assert r.json()["whatsapp_opt_in"] is False
