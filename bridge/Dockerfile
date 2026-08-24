# Fluxentiq — Python AI bridge image
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# curl is required by the Docker healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code + the deterministic ML engine modules (engine_routes.py lazily
# imports `python_engine.*`, so these MUST ship with the image or every
# /api/engine/* endpoint will fail at runtime).
COPY server.py ./
COPY bridge ./bridge
COPY python_engine ./python_engine

RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
