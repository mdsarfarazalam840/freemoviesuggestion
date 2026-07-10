# Docker — Free Movie Suggestion

Multi-stage Docker builds for the Astro + Cloudflare Workers SSR platform.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Files](#project-files)
- [Build Stages](#build-stages)
  - [1. Builder](#1-builder)
  - [2. Runner (default) — Local Preview](#2-runner-default--local-preview)
- [Environment Variables](#environment-variables)
  - [How env vars reach the Worker](#how-env-vars-reach-the-worker)
  - [Environment File (.env.docker)](#environment-file-envdocker)
- [Usage Examples](#usage-examples)
  - [Local Preview (docker run)](#local-preview-docker-run)
  - [Docker Compose](#docker-compose)
  - [Custom Build Tag](#custom-build-tag)
  - [Shell Access](#shell-access)
- [Publishing to Docker Hub](#publishing-to-docker-hub)
  - [Using the Helper Script](#using-the-helper-script)
  - [Manual Push](#manual-push)
  - [Multi-Architecture Builds](#multi-architecture-builds)
- [Container Init (tini)](#container-init-tini)
- [Security](#security)
- [Development Workflow](#development-workflow)
- [CI/CD Integration](#cicd-integration)
  - [GitLab CI](#gitlab-ci)
  - [GitHub Actions](#github-actions)
- [Troubleshooting](#troubleshooting)
  - [Build fails on `prerendering static routes`](#build-fails-on-prerendering-static-routes)
  - [wrangler dev exits immediately](#wrangler-dev-exits-immediately)
  - [Container runs but port not reachable](#container-runs-but-port-not-reachable)
  - [Environment variable not picked up](#environment-variable-not-picked-up)
  - [workerd binary not found](#workerd-binary-not-found)
- [Image Size](#image-size)

---

## Overview

This project deploys as a **Cloudflare Worker** (SSR via `@astrojs/cloudflare`), not a traditional Node.js server. Docker is used for:

- **Consistent builds** — produce the `dist/` artifact in a reproducible environment
- **Local preview** — run the full SSR app locally via `wrangler dev`
- **Distribution** — publish multi-arch images to Docker Hub for easy deployment

> **Important:** The base image must be **Debian/glibc** (`node:22-bookworm`). Alpine Linux (`node:22-alpine`) is incompatible because `@cloudflare/workerd-linux-64` is a glibc binary that will not run on musl libc.

---

## Prerequisites

- [Docker Desktop](https://docs.docker.com/engine/install/) 24+ with BuildKit (`docker buildx`)
- API keys for the services listed under [Environment Variables](#environment-variables)
- A [Docker Hub](https://hub.docker.com/) account (only needed for pushing images)

---

## Quick Start

```powershell
# 1. Set up runtime environment variables
Copy-Item .env.docker.example .env.docker
# Edit .env.docker with your real values (at minimum SUPABASE_URL)

# 2. Build the image
docker build -t ajaysin/freemoviesuggestion:latest .

# 3. Run the container
docker run --init --rm -p 4321:4321 --env-file .env.docker ajaysin/freemoviesuggestion:latest

# 4. Open http://localhost:4321
```

Or with Docker Compose:

```powershell
docker compose up -d
# Visit http://localhost:4321
docker compose logs -f
docker compose down
```

---

## Project Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build (builder + runner) |
| `docker-entrypoint.sh` | Container entrypoint — generates `.dev.vars` from runtime env |
| `.dockerignore` | Prevents secrets and build artifacts from entering the build context |
| `docker-compose.yml` | One-command local run via Compose |
| `.env.docker` | Runtime environment variables (excluded from git) |
| `.env.docker.example` | Template for `.env.docker` |
| `scripts/docker-publish.ps1` | Helper script for local build or multi-arch push to Docker Hub |

---

## Build Stages

The `Dockerfile` defines two stages. The default target is `runner`.

### 1. Builder

Compiles the Astro project and produces the `dist/` directory.

- Installs system packages: `ca-certificates`, `openssl`
- Runs `npm ci` with locked dependencies
- Runs `npm run build` (Astro build with Cloudflare adapter)
- Sets `NODE_OPTIONS="--dns-result-order=ipv4first"` to work around a Node.js fetch + workerd compatibility issue in Docker (see [Troubleshooting](#build-fails-on-prerendering-static-routes))

### 2. Runner (default) — Local Preview

Starts `wrangler dev` pointing at the built `dist/server/wrangler.json` to give you a fully functional SSR preview of the site.

- Copies `dist/`, `node_modules/`, and config files from the builder
- Installs `tini` (init system for proper signal handling) and `curl` (for healthcheck)
- Exposes port `4321`
- **Healthcheck**: curls `localhost:4321` every 30s (start period 20s, 3 retries)
- **Entrypoint** (`docker-entrypoint.sh`): reads Docker container environment variables and writes them to `dist/server/.dev.vars` so wrangler/workerd can access them
- **Init**: runs via `tini` as PID 1 for correct signal forwarding
- Default command: `node node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --port 4321 --ip 0.0.0.0`

> **How env vars flow:** Docker `--env-file` → container shell → `docker-entrypoint.sh` writes `dist/server/.dev.vars` → wrangler reads `.dev.vars` → workerd bindings → `getServerEnv()` checks `import.meta.env` → `globalThis.__ENV` → `process.env`

---

## Environment Variables

All vars passed to the container should be placed in `.env.docker`. They are written into `dist/server/.dev.vars` for wrangler at container start.

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | **Yes** | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (server-side only) |
| `PUBLIC_SUPABASE_ANON_KEY` | No | Public anon key (fallback alias) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST endpoint (for caching) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token |
| `TMDB_API_KEY` | No | TMDB API key (at least one of TMDB vars needed) |
| `TMDB_ACCESS_TOKEN` | No | TMDB access token (at least one of TMDB vars needed) |
| `CLOUDFLARE_ACCOUNT_ID` | No | Cloudflare account ID (for remote resources) |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare API token |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | No | Workers subdomain |

> **Security:** Never bake secrets into the image. Always pass them at runtime via `.env.docker`.

### How env vars reach the Worker

```
Docker --env-file .env.docker
  → container shell (process.env)
    → docker-entrypoint.sh writes dist/server/.dev.vars
      → wrangler dev reads .dev.vars → workerd bindings
        → middleware (src/middleware.ts) copies bindings to globalThis.__ENV
          → getServerEnv() checks:
              1. import.meta.env[name] (build-time vars)
              2. globalThis.__ENV[name] (Cloudflare bindings)
              3. process.env[name] (Node.js vars)
```

Without this chain, env vars passed to Docker would be visible to the Node.js process running wrangler, but **not** to the workerd runtime that runs the actual Worker code.

The entrypoint also validates that `SUPABASE_URL` is set and exits early if missing.

### Environment File (.env.docker)

Create `.env.docker` from the template and fill in your values:

```powershell
Copy-Item .env.docker.example .env.docker
```

The `.env.docker` file is gitignored and should never be committed. Only `.env.docker.example` (without real values) is tracked.

---

## Usage Examples

### Local Preview (docker run)

```powershell
# Build
docker build -t ajaysin/freemoviesuggestion:latest .

# Run with env file
docker run --init --rm -p 4321:4321 --env-file .env.docker ajaysin/freemoviesuggestion:latest

# Run in detached mode
docker run --init -d --name fms -p 4321:4321 --env-file .env.docker ajaysin/freemoviesuggestion:latest
docker logs fms -f
docker stop fms && docker rm fms
```

### Docker Compose

```yaml
# docker-compose.yml (already in project root)
services:
  app:
    image: ajaysin/freemoviesuggestion:latest
    build:
      context: .
    ports:
      - "4321:4321"
    env_file:
      - .env.docker
    init: true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4321"]
      interval: 30s
      timeout: 10s
      start_period: 20s
      retries: 3
    restart: unless-stopped
```

```powershell
docker compose up -d      # start
docker compose logs -f    # follow logs
docker compose down       # stop
```

### Custom Build Tag

```powershell
docker build -t ajaysin/freemoviesuggestion:v1.2.3 .
```

### Shell Access

```powershell
docker run --rm -it --entrypoint bash ajaysin/freemoviesuggestion:latest
```

---

## Publishing to Docker Hub

### Using the Helper Script

The `scripts/docker-publish.ps1` script handles both local builds and multi-arch publishing:

```powershell
# Build locally (single-arch, no push) — test before publishing
.\scripts\docker-publish.ps1 -NoPush

# Build + push multi-arch to Docker Hub
.\scripts\docker-publish.ps1

# Build + push with an additional version tag
.\scripts\docker-publish.ps1 -Tag 1.0.0
```

What the script does:

1. **Login check** — runs `docker login` (uses stored credentials via Docker Desktop's credential store)
2. **Tagging** — always tags `latest`; optionally adds a version tag (e.g., `1.0.0`)
3. **Build**:
   - `-NoPush`: builds for the local architecture using the default builder
   - Without `-NoPush`: creates a `multiarch` buildx instance and builds for `linux/amd64,linux/arm64`

### Manual Push

```powershell
docker login
docker build -t ajaysin/freemoviesuggestion:latest .
docker push ajaysin/freemoviesuggestion:latest
```

### Multi-Architecture Builds

The push workflow builds for two platforms simultaneously:

- `linux/amd64` — Intel/AMD servers, most VPS providers
- `linux/arm64` — Apple Silicon, ARM servers (AWS Graviton, etc.)

Docker Hub stores them as a single manifest, so pulling on any platform automatically gets the right binary.

---

## Container Init (tini)

The Dockerfile uses `tini` as PID 1 (via `ENTRYPOINT ["tini", "--", "/app/docker-entrypoint.sh"]`).

**Why tini?** Without an init system, Node.js processes don't receive Unix signals (SIGTERM, SIGINT) correctly, causing `docker stop` to force-kill after 10s instead of gracefully shutting down wrangler.

If running with a custom command that bypasses the default entrypoint, always use `docker run --init`:

```powershell
docker run --init ...
```

The Compose file sets `init: true` automatically.

---

## Security

- **`.env.docker`** is excluded from git — add it to `.gitignore` if not already present
- **`dist/server/.dev.vars`** (local generated secrets) is excluded from the Docker build context via `.dockerignore`
- **`.env`** (Astro/Vite build-time env) is excluded from the Docker context
- **Secrets are injected at container runtime** only, never baked into the image
- The `docker-entrypoint.sh` cleans any stale `.dev.vars` before regeneration to prevent mixing old build-time secrets with runtime secrets

---

## Development Workflow

For rapid local iteration, mount your source code and use the dev server (outside Docker). Use Docker only for:

1. **Validating the production build** — run `npm run build` locally, then `docker build` and preview with `wrangler dev`
2. **CI integration** — ensure the build passes in the same environment that CI will use
3. **Reproducing environment-specific bugs** — test with the exact same Node.js and OS as production

---

## CI/CD Integration

### GitLab CI

```yaml
variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

build:docker:
  stage: build
  image: docker:27
  services:
    - docker:dind
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker push $DOCKER_IMAGE
  only:
    - main
```

### GitHub Actions

```yaml
name: Docker Build

on:
  push:
    branches: [main]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and push
        run: |
          docker build -t ajaysin/freemoviesuggestion:latest .
          docker push ajaysin/freemoviesuggestion:latest
```

---

## Troubleshooting

### Build fails on `prerendering static routes`

```
prerendering static routes
fetch failed
  Location:
    /app/node_modules/@astrojs/cloudflare/dist/prerenderer.js:63:24
  Caused by:
  connect ECONNREFUSED 127.0.0.1:4xxxx
```

**Cause:** The `@astrojs/cloudflare` adapter's prerenderer starts a Vite preview server with workerd, then fetches `http://localhost:<port>`. In Docker, Node.js `fetch()` may resolve `localhost` to `::1` (IPv6) first, and workerd only listens on IPv4, causing a connection refusal.

**Fix:** The Dockerfile sets `ENV NODE_OPTIONS="--dns-result-order=ipv4first"` before the build command. If you encounter this outside Docker:

```sh
NODE_OPTIONS="--dns-result-order=ipv4first" npm run build
```

### wrangler dev exits immediately

**Cause:** Missing or broken `node_modules`. Ensure the runner stage has the full `node_modules` (including devDependencies like `wrangler`).

**Check:**

```sh
docker run --rm --entrypoint "" ajaysin/freemoviesuggestion:latest \
  ls -la /app/node_modules/wrangler/bin/wrangler.js
```

### Container runs but port not reachable

```sh
docker ps
docker logs <container-id>
# Expected: Ready on http://0.0.0.0:4321
```

Ensure you're publishing the port: `-p 4321:4321`.

### Environment variable not picked up

The Worker runs inside workerd, which has no direct access to the host's `process.env`. The `docker-entrypoint.sh` bridges this gap by writing container env vars to `dist/server/.dev.vars`.

If a variable is missing:

1. Confirm it was passed to Docker: `docker inspect <container> | grep SUPABASE_URL`
2. Check the entrypoint generated `.dev.vars` correctly: `docker exec <container> cat /app/dist/server/.dev.vars`
3. Verify the variable name matches exactly (case-sensitive)
4. Ensure the variable is listed in `docker-entrypoint.sh`'s `VAR_NAMES`

### workerd binary not found

```sh
docker run --rm --entrypoint "" ajaysin/freemoviesuggestion:latest \
  find /app/node_modules -name "workerd" -type f
```

Expected output: a binary for your platform (e.g., `/app/node_modules/@cloudflare/workerd-linux-64/bin/workerd`).

If missing, ensure you're using a Debian-based base image (not Alpine).

---

## Image Size

| Stage | Size | Notes |
|---|---|---|
| `builder` | ~1.5 GB | Full Node.js + devDependencies + source |
| `runner` | ~958 MB | Includes `node_modules/` (with wrangler + workerd) |

The runner image cannot be reduced to `scratch` or `alpine` because the `workerd` binary requires glibc.
