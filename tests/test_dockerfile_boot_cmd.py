"""MEH-2903 chunk 2 — the image boots through migrate_on_boot.py.

The boot step is the reason a backend rollback can work at all
(docs/release/ROLLBACK.md §2d): an older image whose CMD still runs a bare
`alembic upgrade head` stops on a database it does not know, and the rollback
silently never goes live. This test pins what the CMD must do:

- run `python -u scripts/migrate_on_boot.py` first;
- chain it to uvicorn with `&&`, so every non-zero exit of the step (1 failed
  migration, 2 no migrations, 3 split history) stops the boot;
- no longer call `alembic upgrade head` itself (the script does it);
- keep `exec` (uvicorn as PID 1 gets Railway's SIGTERM) and `${PORT:-8000}`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DOCKERFILE = Path(__file__).resolve().parents[1] / "Dockerfile"


def _cmd() -> str:
    """The shell string of the last CMD instruction (exec form, `sh -c`)."""
    cmds = [
        line
        for line in DOCKERFILE.read_text(encoding="utf-8").splitlines()
        if line.startswith("CMD ")
    ]
    assert cmds, "the Dockerfile has no CMD"
    argv = json.loads(cmds[-1][len("CMD ") :])
    assert argv[:2] == ["sh", "-c"], argv
    return argv[2]


def test_boot_runs_the_migration_step_before_uvicorn():
    cmd = _cmd()
    step = "python -u scripts/migrate_on_boot.py"
    assert step in cmd, cmd
    server = "exec python -u -m uvicorn app.main:app"
    assert server in cmd, cmd
    # `&&` between them: any non-zero exit of the step stops the boot.
    between = cmd[cmd.index(step) + len(step) : cmd.index(server)]
    assert between.strip() == "&&", repr(between)


def test_boot_no_longer_runs_a_bare_upgrade_head():
    assert not re.search(r"alembic\s+upgrade", _cmd()), _cmd()


def test_boot_keeps_the_runtime_port():
    assert "--port ${PORT:-8000}" in _cmd(), _cmd()
