"""MEH-3613: CodeQL hardening — Cloudinary host check and the cities regex.

`extract_public_id` feeds image ownership and `destroy_image`, so it must
accept only URLs whose HOST is res.cloudinary.com, not any URL that merely
contains that string (CodeQL py/incomplete-url-substring-sanitization).
`fix_reversed_parens` must keep its output and stay linear on long input
(CodeQL py/polynomial-redos).
"""

import time

import pytest

from app.cloudinary_utils import extract_public_id
from app.data.cities import fix_reversed_parens


REAL = "https://res.cloudinary.com/mehamakor/image/upload/v1/mehamakor/abc123.jpg"


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example/?res.cloudinary.com/image/upload/mehamakor/abc123.jpg",
        "https://evil.example/res.cloudinary.com/image/upload/mehamakor/abc123.jpg",
        "https://res.cloudinary.com.evil.example/x/image/upload/mehamakor/abc123.jpg",
        "https://res.cloudinary.com@evil.example/x/image/upload/mehamakor/abc123.jpg",
        "https://evil.example/x/image/upload/mehamakor/abc123.jpg#res.cloudinary.com",
        "javascript://res.cloudinary.com/x/image/upload/mehamakor/abc123.jpg",
        "https://evil.example\\@res.cloudinary.com/c/image/upload/mehamakor/abc.jpg",
        "https://res.cloudinary.com/c/image/up\tload/v1/mehamakor/u/ab/x.jpg",
    ],
)
def test_spoofed_cloudinary_host_is_not_parsed(url):
    assert extract_public_id(url) is None


def test_real_cloudinary_url_still_parses():
    assert extract_public_id(REAL) == "mehamakor/abc123"


def test_upload_marker_only_in_query_is_not_parsed():
    url = (
        "https://res.cloudinary.com/mehamakor/image/fetch/x.jpg?u=/image/upload/a/b.jpg"
    )
    assert extract_public_id(url) is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("יקנעם )מושבה(", "יקנעם (מושבה)"),
        ("קרית יערים)מוסד(", "קרית יערים (מוסד)"),
        ("יקנעם   ) מושבה (", "יקנעם (מושבה)"),
        ("תל אביב", "תל אביב"),
        ("a )b( c )d(", "a (b) c (d)"),
        ("", ""),
    ],
)
def test_fix_reversed_parens_output(raw, expected):
    assert fix_reversed_parens(raw) == expected


def test_fix_reversed_parens_is_linear_on_long_whitespace():
    raw = " " * 50_000 + "x"
    start = time.perf_counter()
    assert fix_reversed_parens(raw) == raw
    assert time.perf_counter() - start < 0.5
