FROM python:3.12-slim

# System deps: libpq for psycopg2 runtime; build-essential kept for any
# transitive wheels that need C compilation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build context is the REPO ROOT (not backend/) so Railway finds this
# Dockerfile at the top level without needing a Root Directory setting.
# All COPY paths are prefixed with backend/ accordingly.
#
# Install Python deps first so Docker layer cache is reused when only
# backend/app/ code changes.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Railway (and most PaaS) injects $PORT at runtime. Default to 8000 for
# docker-compose / local runs.
ENV PORT=8000
EXPOSE 8000

# Flush Python stdout/stderr immediately — without this, startup logs
# can be invisible in Railway's log panel for the first few minutes.
ENV PYTHONUNBUFFERED=1

# Use sh -c so $PORT is expanded at runtime, not baked into the image.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
