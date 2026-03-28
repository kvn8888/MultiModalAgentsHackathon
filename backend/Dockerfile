# PermitPulse Backend — Production Dockerfile
# Uses a multi-stage build to keep the image small.
# Stage 1: Install dependencies into a virtual environment.
# Stage 2: Copy only the venv + app code into a slim runtime image.

# ---------------------------------------------------------------------------
# Stage 1 — Builder: install Python dependencies in an isolated venv
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Copy only the requirements file first so Docker can cache the install layer
# as long as dependencies haven't changed.
COPY requirements.txt .

# Create a virtual environment and install dependencies into it
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2 — Runtime: slim image with only the app + installed packages
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Prevent .pyc files and enable unbuffered stdout/stderr (important for logging)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy the pre-built virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv

# Make the venv's Python and pip the default on PATH
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Copy the entire backend application code
COPY . .

# DigitalOcean App Platform injects PORT as an environment variable.
# Default to 8000 for local Docker runs.
ENV PORT=8000

# Expose the port the app listens on (documentation; DO overrides at runtime)
EXPOSE ${PORT}

# Health check — hits our /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/api/health')" || exit 1

# Start the FastAPI server with uvicorn.
# --host 0.0.0.0 binds to all interfaces (required inside containers).
# $PORT is set by DigitalOcean at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
