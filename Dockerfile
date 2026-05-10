# syntax=docker/dockerfile:1

FROM node:24-slim AS build

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@10.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-slim AS runtime

ARG BUILD_VERSION=dev
ARG BUILD_ARCH="amd64|aarch64"

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SCHEDULE_STUDIO_DB=/data/schedule-studio.sqlite

RUN mkdir -p /data

COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((res) => { if (!res.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "build"]
