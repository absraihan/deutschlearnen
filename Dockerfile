# Production image for the DeutschLearnen tutor server.
#
# Multi-stage so the runtime image carries no TypeScript, no test files and no
# dev dependencies. The mobile app is not part of this image - only the server
# and the shared package it imports.
#
# Build from the repository root:
#   docker build -t deutschlearnen-server .
#   docker run -p 4000:4000 --env-file .env deutschlearnen-server

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so a dependency install is cached across source-only changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/

# The mobile workspace is not needed here and pulls in a very large native
# toolchain, so it is deliberately excluded from the install.
RUN npm ci --workspace @deutschlearnen/shared --workspace @deutschlearnen/server --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

RUN npm run build --workspace @deutschlearnen/shared \
 && npm run build --workspace @deutschlearnen/server

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Reinstall without dev dependencies rather than copying node_modules, so the
# image does not ship typescript, vitest and their trees.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @deutschlearnen/shared --workspace @deutschlearnen/server --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist

# Run as the unprivileged user the base image already provides.
USER node

# Hosts that inject their own port (Cloud Run, Render, Railway) override this.
ENV PORT=4000
EXPOSE 4000

# HOST must be 0.0.0.0 inside a container or the platform cannot reach it.
ENV HOST=0.0.0.0

CMD ["node", "apps/server/dist/index.js"]
