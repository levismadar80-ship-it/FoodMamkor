"""MEH-2612 — every kashrut code the demo-producers seed writes is real.

`backend/scripts/seed_demo_producers.py` wrote «rabanut_mekomit» on three
ARCHETYPE_BUSINESSES rows. VALID_BADGE_CODES (trust_tier.py) does not know it, and neither
does KashrutBadgeStrip's CODE_TO_KEY, so the strip filtered it out and those
businesses rendered with no kashrut line at all. The real code is «rabanut».

Same bug class as «badatz_beit_yosef» in seed_demo_business.py (#3882); that
fix's guard (test_seed_demo_business.py) only reads the other script, which is
why this one survived it.
"""

import importlib.util
import os

from app.services.trust_tier import VALID_BADGE_CODES

_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "seed_demo_producers.py"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("seed_demo_producers", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_demo_producers_kashrut_codes_are_real_badge_codes():
    mod = _load_module()
    # Both lists the seed inserts (the run loop walks exactly these two). The
    # bad code sat in the second one, so a check of DEMO_BUSINESSES alone was
    # green against the broken seed.
    rows = mod.DEMO_BUSINESSES + mod.ARCHETYPE_BUSINESSES
    codes = {b["kashrut"] for b in rows if b.get("kashrut")}
    # Derived, not stated: the seed is meant to exercise the kashrut line, so
    # an empty set would make the subset check below pass vacuously.
    assert codes, "the demo seed is expected to carry at least one kashrut code"
    assert codes <= VALID_BADGE_CODES, codes - VALID_BADGE_CODES
