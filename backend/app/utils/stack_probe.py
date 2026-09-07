"""MEH-2119 — the measurement gate's probe, and nothing else.

WHAT: `frame_depth()` counts the Python frames above the caller — the
number `len(inspect.stack())` would report, without `inspect.stack()`'s cost
(it reads every frame's source file; on a hot route that is the wrong probe).

WHY IT EXISTS: MEH-1906 hypothesis 2 ("stack depth near the ceiling") was
marked refuted from a LOCAL measurement (entry depth 7-10 of 1000), while the
Sentry trace for MEHAMAKOR-BACKEND-Q showed ~50 frames before the handler.
Both cannot be right, and the card's §4 gate says the number that settles it
must come from STAGING with the full middleware chain — which is where this
logs. Read the number off the Railway logs (`stack_probe route=… depth=…`),
apply the card's table (≈1000 → convert · 40-60 → real but not the MEH-1906
fix · 7-10 → close the card), then REVERT this file and its two call sites.

CONTROL: the same probe is logged from GET /categories, a route with the same
`add_middleware` chain but no `joinedload` work under it. If both routes report
the same number the depth is the chain's; if they differ the difference is
the handler's own. A single number with no control would be a constant that
looks like a measurement.

Temporary by design — no test, no config flag, no new env var. The log line
is INFO on two GET routes; Railway keeps it for the read and it costs a
frame walk, not a stack capture.
"""

import logging
import sys

logger = logging.getLogger(__name__)


def frame_depth() -> int:
    """Frames above the caller, counted by walking f_back (cheap, no source I/O)."""
    depth = 0
    frame = sys._getframe(1)  # noqa: SLF001 — the documented CPython accessor
    while frame is not None:
        depth += 1
        frame = frame.f_back
    return depth


def log_depth(route: str) -> None:
    """One INFO line per request: `stack_probe route=<name> depth=<n>`."""
    logger.info("stack_probe route=%s depth=%d", route, frame_depth())
