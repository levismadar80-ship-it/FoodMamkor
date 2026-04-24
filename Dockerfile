FROM python:3.12-slim

# System deps: libpq for psycopg2 runtime; build-essential kept for any
# transitive wheels that need C compilation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible installs from the lock file.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Compile bytecode at install time (faster cold-start) and use copy mode
# so the venv works correctly when the layer is committed to the image.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Build context is the REPO ROOT (not backend/) so Railway finds this
# Dockerfile at the top level without needing a Root Directory setting.
# All COPY paths are prefixed with backend/ accordingly.
#
# MEH-260 — Railway's BuildKit only accepts `type=cache` mounts, and
# even those require a Railway-specific `id=s/<service-uuid>-<name>`
# format. `type=bind` mounts (which we used to avoid a COPY layer)
# are rejected outright with:
#   "other mount types are not supported"
# So we fall back to the standard pattern: COPY the lockfiles first,
# run uv sync, then COPY the app code. When only app/ code changes,
# the uv sync layer still hits the Docker layer cache as long as the
# COPY of uv.lock + pyproject.toml is identical.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Put the venv on PATH so `python` and `uvicorn` resolve from the venv.
ENV PATH="/app/.venv/bin:${PATH}"

COPY backend/ .

# Railway (and most PaaS) injects $PORT at runtime. Default to 8000 for
# docker-compose / local runs.
ENV PORT=8000
EXPOSE 8000

# Flush Python stdout/stderr immediately — without this, startup logs
# can be invisible in Railway's log panel for the first few minutes.
ENV PYTHONUNBUFFERED=1

# CMD notes:
#   - `sh -c` is required so ${PORT:-8000} is expanded at runtime
#   - `exec` makes python replace sh as PID 1, so SIGTERM from Railway
#     reaches uvicorn cleanly instead of being eaten by the shell
#   - `python -u -m uvicorn` is equivalent to the `uvicorn` console
#     script but guarantees unbuffered stdout even if PYTHONUNBUFFERED
#     somehow isn't honored
#   - DO NOT also set `startCommand` in railway.json — Railway runs
#     that without a shell and ${PORT:-8000} would be passed literally,
#     causing "Invalid value for '--port'". Let the Dockerfile CMD win.
CMD ["sh", "-c", "alembic upgrade head && exec python -u -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
