FROM python:3.12-slim

# System deps: libpq is needed for psycopg2 runtime; build-essential for any
# source builds (GeoAlchemy2 is pure Python, but keep headers available).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so Docker layer cache is reused when only app/
# code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway (and most PaaS) injects $PORT at runtime. Default to 8000 for
# docker-compose / local runs.
ENV PORT=8000
EXPOSE 8000

# Use sh -c so $PORT is expanded at runtime, not baked into the image.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
