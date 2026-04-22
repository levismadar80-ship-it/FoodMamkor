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
# Install Python deps from the lock file. Bind mounts expose pyproject.toml
# and uv.lock from the build context without adding a separate COPY layer,
# preserving the Docker layer cache when only app/ code changes.
#
# MEH-260 — no BuildKit cache mount for uv's download cache. Railway's
# BuildKit rejected `--mount=type=cache,target=...` without an id (first
# attempt), then rejected the plain `id=uv-cache` variant because its
# runner expects the Railway-specific `id=s/<service-uuid>-<name>`
# format. Rather than couple the Dockerfile to a specific Railway
# service UUID, we drop the cache mount entirely. Cost is ~20-30s per
# cold build (uv re-downloads ~80 wheels); revisit if build time
# becomes an issue post-launch.
RUN --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev

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
CMD ["sh", "-c", "exec python -u -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
