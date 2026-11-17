# Cloudflare Tunnel WebGUI, PaaS edition: FastAPI + Vue, with cloudflared as a
# supervised child process. Built by .github/workflows/release.yml and pushed to
# ghcr.io/woowtech/cf-tunnel-webgui; deployed by charts/cf-tunnel-webgui.

# ── Stage 1: Build the Vue frontend ──────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ─────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# tini for PID 1 signal handling; curl for the in-pod probes (the app listens on
# loopback only) and to fetch cloudflared.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- cloudflared binary (multi-arch), pinned by version AND checksum ---
# The SHA256s are the GitHub release asset digests of this exact version.
ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.7.3
ARG CLOUDFLARED_SHA256_AMD64=9d71c677db00134c1bd4144b7783486b654ad281b1ea62b4972098d19f770f17
ARG CLOUDFLARED_SHA256_ARM64=65259e652a7bea08bf5df603233ab22b8bf3116af8df9f9206209af6a1b955c0
RUN set -eux; \
    # Cloudflare marked these releases "Do not use; upgrade to 2026.8.2 or later"
    # (path normalisation / trailing-slash stripping for HTTP origins).
    case "$CLOUDFLARED_VERSION" in \
      2026.8.0|2026.8.1) echo "cloudflared $CLOUDFLARED_VERSION is marked 'Do not use' by Cloudflare" >&2; exit 1 ;; \
    esac; \
    arch="${TARGETARCH:-}"; \
    if [ -z "$arch" ]; then arch="$(dpkg --print-architecture)"; fi; \
    case "$arch" in \
      amd64) CF_ARCH=amd64; CF_SHA="$CLOUDFLARED_SHA256_AMD64" ;; \
      arm64) CF_ARCH=arm64; CF_SHA="$CLOUDFLARED_SHA256_ARM64" ;; \
      *) echo "unsupported arch ${arch}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${CF_ARCH}"; \
    echo "${CF_SHA}  /usr/local/bin/cloudflared" | sha256sum -c -; \
    chmod +x /usr/local/bin/cloudflared; \
    cloudflared --version

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /build/dist ./static/

# Non-root (uid 1000, the PaaS chart's runAsUser). /data is the volume; HOME is
# where `cloudflared tunnel login` drops cert.pem before the app moves it.
RUN groupadd -g 1000 app \
    && useradd -u 1000 -g 1000 -d /home/app -m -s /usr/sbin/nologin app \
    && mkdir -p /data && chown 1000:1000 /data

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/home/app \
    CF_SUPERVISE=1 \
    CF_LOG_STDOUT=1 \
    CF_METRICS_ADDR=127.0.0.1:20241
USER 1000:1000
EXPOSE 8000
VOLUME ["/data"]

LABEL org.opencontainers.image.source="https://github.com/WOOWTECH/Woow_k3s_cf_tunnel_webgui" \
      org.opencontainers.image.title="cf-tunnel-webgui" \
      org.opencontainers.image.description="Cloudflare Tunnel WebGUI (WOOW PaaS edition) with a supervised cloudflared connector" \
      org.opencontainers.image.licenses="MIT"

ENTRYPOINT ["tini", "--"]
# uvicorn reads UVICORN_HOST / UVICORN_PORT (default 127.0.0.1:8000): the chart
# keeps it on loopback behind the auth proxy.
CMD ["uvicorn", "backend.main:app"]
