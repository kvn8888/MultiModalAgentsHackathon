# PermitPulse Frontend — Production Dockerfile
# Multi-stage build optimized for Next.js standalone output.
# Stage 1: Install dependencies.
# Stage 2: Build the Next.js app.
# Stage 3: Run using only the standalone output (smallest possible image).

# ---------------------------------------------------------------------------
# Stage 1 — Dependencies: install node_modules
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json package-lock.json ./

# Install production + dev dependencies (dev needed for build step)
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2 — Builder: build the Next.js production bundle
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Set Next.js to output a standalone build (smaller, self-contained)
# This is set via next.config.ts but we also set the env for safety
ENV NEXT_TELEMETRY_DISABLED=1

# Build the production Next.js app
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — Runtime: minimal image with only the built output
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Don't run as root in production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Copy the built standalone output and static assets
# Next.js standalone mode bundles everything needed to run
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# DigitalOcean injects PORT; Next.js defaults to 3000
ENV PORT=3000
EXPOSE ${PORT}

# Switch to non-root user
USER nextjs

# Start the standalone Next.js server (self-contained, no npm needed)
CMD ["node", "server.js"]
