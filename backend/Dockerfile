FROM python:3.12-slim

WORKDIR /app

# Runtime helper to drop privileges after fixing mounted volume permissions
RUN apt-get update && apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appgroup -g 1001 && \
    useradd -r -g appgroup -u 1001 -m -s /sbin/nologin appuser

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application (excluding sensitive files)
COPY --chown=appuser:appgroup . .

# Remove any accidentally copied sensitive files
RUN rm -f .env .env.local .env.production

# Create data directories with proper ownership.
# Note: Railway Volumes are mounted at runtime and will hide these
# directories; ownership will be fixed again in the entrypoint.
RUN mkdir -p /app/data/chroma /app/data/bm25 && \
    chown -R appuser:appgroup /app/data

# Entrypoint fixes permissions for the mounted volume and then execs as appuser.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

# Expose port
EXPOSE 8000

# Health check
# Railway (and many PaaS) expect the app to bind to $PORT.
# Keep 8000 as the default for local/docker-compose.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; port=os.getenv('PORT','8000'); urllib.request.urlopen('http://localhost:%s/health' % port).read()" || exit 1

# Run the application
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
