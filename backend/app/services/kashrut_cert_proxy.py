"""
Module:   kashrut_cert_proxy
Purpose:  Decide which kashrut certificates a public page may show, and stream
          one of them from Cloudinary without ever handing out its address.
Touches:  kashrut_badge_requests (read) · Cloudinary over HTTPS (httpx.stream).
Does NOT: register a route — GET /producers/{id}/kashrut-cert/{code} stays in
          routers/producers.py, with its rate limit and docstring (the
          openapi description). Does not approve or expire certs — admin side.
Related:  backend/app/routers/producers.py (get_kashrut_cert, the detail
          serializer) · backend/app/routers/producer_draft_preview.py ·
          backend/app/routers/upload.py (_sniff_image_type, MAX_FILE_SIZE).
History:  MEH-1672 (creation, in the router); MEH-2128 (content-type set);
          MEH-2518 (newest first); MEH-3559 (moved here verbatim from
          routers/producers.py, no behaviour change).
"""

from __future__ import annotations

from urllib.parse import urlparse
from uuid import UUID

import httpx
import structlog
from fastapi import HTTPException, Response
from sqlalchemy.orm import Session

from app.models import KashrutBadgeRequest, Producer
from app.utils.clock import utc_now

# MEH-3559: the logger keeps the router's name, so the two warnings below land
# under the same logger they always did.
logger = structlog.get_logger("app.routers.producers")

# MEH-1672 (adversarial review): the only host the cert proxy will ever
# fetch from. `cert_url` is producer-submitted (KashrutRequestCreate only
# validates an https:// prefix), so the proxy is a server-side fetch of a
# value the requester controls — an explicit host allowlist is the SSRF
# defense, not a nice-to-have.
ALLOWED_CERT_HOSTS = frozenset({"res.cloudinary.com"})

# MEH-1672 (adversarial review): the proxy streams and caps DURING download,
# not after — httpx.get().content would buffer the whole body first
# regardless of any check on the result. 8 MB gives headroom above the 5 MB
# upload-time cap (upload.py:MAX_FILE_SIZE) for re-encoding, not a promise
# that a 5 MB+ file is legitimate.
MAX_CERT_BYTES = 8 * 1024 * 1024

# MEH-2128: the media types Cloudinary may report for a file that
# `_sniff_image_type` (upload.py:47-61) accepts at upload time — jpeg / png /
# webp / gif, plus HEIC and HEIF, whose ISO-BMFF brands that function folds
# into the single label "heic" while Cloudinary still distinguishes the two on
# delivery. A `startswith("image/")` gate served ANY image/*,
# `image/svg+xml` included: an SVG proxied from our own origin renders as a
# top-level document and executes embedded <script>, i.e. stored XSS on
# mehamakor. What cannot enter through upload must not leave through the proxy,
# so the serve-side set is a membership test against exactly that set — never
# wider (no image/avif, no image/svg+xml).
ALLOWED_CERT_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
        "image/heif",
    }
)


# MEH-1672: the ONE rule deciding whether a kashrut certificate may be shown.
# Both call sites use it — the serializer that lists which badges have a cert,
# and the proxy that streams the bytes — so a badge can never be advertised as
# viewable while the proxy refuses it, or vice versa.
def servable_kashrut_certs(
    db: Session, producer: Producer
) -> list[KashrutBadgeRequest]:
    """Approved requests with a cert, for an approved producer, not yet expired.

    Expiry is checked against `producer.kashrut_expires_at` — the same field
    KashrutBadgeStrip hides the whole strip on (MEH-1260). A legacy NULL
    expiry stays visible, matching that component exactly.
    """
    # MEH-2465: `kind` too — an organizer row never serves a kashrut cert,
    # whatever is stored against it (ADR-036).
    if producer.status != "approved" or producer.kind != "producer":
        return []
    expires_at = producer.kashrut_expires_at
    if expires_at is not None and expires_at <= utc_now():
        return []
    return (
        db.query(KashrutBadgeRequest)
        .filter(
            KashrutBadgeRequest.producer_id == producer.id,
            KashrutBadgeRequest.status == "approved",
            KashrutBadgeRequest.cert_url.isnot(None),
            KashrutBadgeRequest.cert_url != "",
        )
        # MEH-2518: a renewal leaves two approved rows for one code; newest
        # first so the proxy's next(...) serves the current certificate.
        .order_by(KashrutBadgeRequest.created_at.desc())
        .all()
    )


def stream_kashrut_cert(db: Session, producer_id: UUID, badge_code: str) -> Response:
    """The body of GET /producers/{id}/kashrut-cert/{code}; see its docstring.

    Every authorization failure is 404; 502 only for a cert that is already
    public through the producer's own serializer.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="לא נמצא")

    match = next(
        (c for c in servable_kashrut_certs(db, producer) if c.badge_code == badge_code),
        None,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="לא נמצא")

    # Adversarial review (MEH-1672): cert_url is written by the producer's own
    # kashrut-request submission and only validated to start with https://,
    # so an explicit host allowlist makes the SSRF defense here explicit
    # rather than resting on operational trust of the upload flow. No
    # redirect-follow either — a redirect off-host would defeat the check.
    if urlparse(match.cert_url).hostname not in ALLOWED_CERT_HOSTS:  # type: ignore[call-overload]
        logger.warning(
            "kashrut cert_url host not allowlisted", producer_id=str(producer_id)
        )
        raise HTTPException(status_code=404, detail="לא נמצא")

    try:
        with httpx.stream(
            "GET",
            match.cert_url,  # type: ignore[arg-type]
            timeout=10.0,
            follow_redirects=False,
        ) as upstream:
            if upstream.status_code != 200:
                raise HTTPException(status_code=404, detail="לא נמצא")

            # MEH-2128: normalise before comparing — an upstream may send
            # `IMAGE/JPEG; charset=utf-8`, and a raw compare would reject a
            # legitimate cert while a raw pass-through would echo the
            # requester-influenced string straight into the response header.
            content_type = (
                upstream.headers.get("content-type", "application/octet-stream")
                .split(";")[0]
                .strip()
                .lower()
            )
            # Only ever serve an image — the upload route sniffs magic bytes,
            # but the column is plain text, so this is the second lock
            # rather than the first. Membership, not a prefix: `image/svg+xml`
            # passes `startswith("image/")` and executes script when opened
            # as a top-level document from our own origin (MEH-2128).
            if content_type not in ALLOWED_CERT_CONTENT_TYPES:
                raise HTTPException(status_code=404, detail="לא נמצא")

            # Adversarial review: httpx.get().content buffers the WHOLE body
            # into memory regardless of any post-hoc size check on the
            # result — only streaming and capping DURING the read actually
            # bounds memory. MAX_CERT_BYTES sits above the 5 MB upload cap
            # (upload.py:MAX_FILE_SIZE) with headroom for re-encoding.
            body = bytearray()
            for chunk in upstream.iter_bytes():
                body.extend(chunk)
                if len(body) > MAX_CERT_BYTES:
                    logger.warning(
                        "kashrut cert exceeded size cap", producer_id=str(producer_id)
                    )
                    raise HTTPException(
                        status_code=502, detail="לא ניתן לטעון את התעודה כרגע"
                    )
    except HTTPException:
        raise
    except Exception:
        logger.warning("kashrut cert fetch failed", producer_id=str(producer_id))
        raise HTTPException(status_code=502, detail="לא ניתן לטעון את התעודה כרגע")

    return Response(
        content=bytes(body),
        media_type=content_type,
        headers={
            # Adversarial review: max-age=300 contradicted this endpoint's
            # own "revocation is immediate" claim — a browser could still
            # serve a stale image for up to 5 minutes after an admin
            # rejects a badge or it expires. no-store means every open of
            # the modal re-checks servable_kashrut_certs for real.
            "Cache-Control": "no-store",
        },
    )
