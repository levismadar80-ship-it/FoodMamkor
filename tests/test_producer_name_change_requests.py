"""MEH-1872 — the re-moderated business-name edit path.

MEH-1851 removed `name` from the owner-writable set because a plain setattr
let an approved business become a different business after approval. The whole
point of this feature is that the public name does NOT move until an admin
says so, so that is what these tests assert — the behaviour, not the presence
of the new table (workflow.md §3.6: an exploit-proving test asserts behaviour,
otherwise an inert implementation passes by construction).
"""

from conftest import auth_header, make_producer, make_user


def _owner(db, producer):
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _admin(db):
    return make_user(db, role="admin")


class TestNameChangeRequest:
    def test_filing_a_request_does_not_move_the_public_name(self, client, db):
        """The invariant the feature exists for."""
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)

        resp = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי", "reason": "שינוי מיתוג"},
            headers=auth_header(owner),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "pending"
        assert resp.json()["current_name"] == "שם ישן"

        db.refresh(producer)
        assert producer.name == "שם ישן"

        # And the public surface agrees — not just the row.
        public = client.get(f"/producers/{producer.id}")
        assert public.status_code == 200
        assert public.json()["name"] == "שם ישן"

    def test_approval_is_what_moves_the_name(self, client, db):
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)
        admin = _admin(db)

        req_id = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(owner),
        ).json()["id"]

        resp = client.patch(
            f"/admin/name-change-requests/{req_id}",
            json={"status": "approved"},
            headers=auth_header(admin),
        )

        assert resp.status_code == 200, resp.text
        db.refresh(producer)
        assert producer.name == "שם חדש לגמרי"

    def test_rejection_leaves_the_name_alone(self, client, db):
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)
        admin = _admin(db)

        req_id = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(owner),
        ).json()["id"]

        client.patch(
            f"/admin/name-change-requests/{req_id}",
            json={"status": "rejected", "admin_notes": "לא מתאים"},
            headers=auth_header(admin),
        )

        db.refresh(producer)
        assert producer.name == "שם ישן"

    def test_a_decided_request_cannot_be_reviewed_twice(self, client, db):
        """Otherwise a second approval moves the public name from a decision
        that was already taken."""
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)
        admin = _admin(db)

        req_id = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(owner),
        ).json()["id"]

        first = client.patch(
            f"/admin/name-change-requests/{req_id}",
            json={"status": "rejected"},
            headers=auth_header(admin),
        )
        assert first.status_code == 200

        second = client.patch(
            f"/admin/name-change-requests/{req_id}",
            json={"status": "approved"},
            headers=auth_header(admin),
        )
        assert second.status_code == 409
        db.refresh(producer)
        assert producer.name == "שם ישן"

    def test_only_one_pending_request_at_a_time(self, client, db):
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)

        client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(owner),
        )
        second = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם אחר לגמרי"},
            headers=auth_header(owner),
        )

        assert second.status_code == 409

    def test_requesting_the_current_name_is_rejected(self, client, db):
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)

        resp = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם ישן"},
            headers=auth_header(owner),
        )

        assert resp.status_code == 400


class TestNameChangeAuth:
    """Guard tests send schema-valid payloads — a 422 would prove nothing
    about the guard (regression rule 6)."""

    def test_anonymous_cannot_file(self, client, db):
        make_producer(db, name="שם ישן")
        resp = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
        )
        assert resp.status_code in (401, 403)

    def test_a_consumer_cannot_file(self, client, db):
        consumer = make_user(db, role="consumer")
        resp = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(consumer),
        )
        assert resp.status_code == 403

    def test_an_owner_cannot_review_her_own_request(self, client, db):
        """The whole feature collapses if the requester is also the approver."""
        producer = make_producer(db, name="שם ישן")
        owner = _owner(db, producer)

        req_id = client.post(
            "/producers/me/name-change-requests",
            json={"requested_name": "שם חדש לגמרי"},
            headers=auth_header(owner),
        ).json()["id"]

        resp = client.patch(
            f"/admin/name-change-requests/{req_id}",
            json={"status": "approved"},
            headers=auth_header(owner),
        )

        assert resp.status_code == 403
        db.refresh(producer)
        assert producer.name == "שם ישן"

    def test_a_consumer_cannot_read_the_admin_queue(self, client, db):
        consumer = make_user(db, role="consumer")
        resp = client.get(
            "/admin/name-change-requests", headers=auth_header(consumer)
        )
        assert resp.status_code == 403
