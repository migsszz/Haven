FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY wsgi.py .

# Product photos live here. docker-compose mounts a volume over it (shared read-only with nginx).
ENV UPLOAD_DIR=/data/uploads
RUN useradd --create-home --uid 10001 appuser && mkdir -p /data/uploads && chown appuser /data/uploads
USER appuser

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "wsgi:app"]
