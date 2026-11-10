"""
Module:   vercel_count
Purpose:  MEH-2864 («ייעול הבדיקות», item 5) — every post-deploy check ends
          with one line, «requests to Vercel: N», so the cost of a run is on its
          own log. The Hobby team was suspended on 09/11 for Fluid Active CPU,
          and nobody had counted what the checks sent there.
Usage:    import vercel_count; call vercel_count.note(url) before every HTTP
          request. The line prints once, at process exit, on every return path.
Counts:   hosts Vercel serves — production, www, staging and *.vercel.app
          previews (an /api/* path counts: it goes through Vercel's rewrite).
          Cloudinary, Sentry and localhost are not counted.
Not a guard: a .py file. scripts/checks/run-all.sh runs only executable *.sh.
"""

import atexit
from urllib.parse import urlsplit

VERCEL_HOSTS = {"mehamakor.co.il", "www.mehamakor.co.il", "staging.mehamakor.online"}

_count = 0


def is_vercel(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host in VERCEL_HOSTS or host.endswith(".vercel.app")


def note(url: str) -> None:
    global _count
    if is_vercel(url):
        _count += 1


def count() -> int:
    return _count


def _report() -> None:
    print(f"requests to Vercel: {_count}")


atexit.register(_report)


if __name__ == "__main__":  # self-test: python scripts/checks/vercel_count.py
    cases = [
        ("https://mehamakor.co.il/", True),
        ("https://staging.mehamakor.online/api/health", True),
        ("https://food-mamkor-abc.vercel.app/he", True),
        ("http://localhost:3000/", False),
        ("https://res.cloudinary.com/x.jpg", False),
        ("https://evil.mehamakor.co.il.example.com/", False),
    ]
    bad = [u for u, want in cases if is_vercel(u) != want]
    for u, want in cases:
        print(f"{'FAIL' if u in bad else 'PASS'}  is_vercel({u}) == {want}")
    atexit.unregister(_report)
    raise SystemExit(1 if bad else 0)
