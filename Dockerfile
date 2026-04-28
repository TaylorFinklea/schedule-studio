# syntax=docker/dockerfile:1

FROM node:25-slim AS build

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@10.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:25-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SCHEDULE_STUDIO_DB=/data/schedule-studio.sqlite

RUN mkdir -p /data && chown -R node:node /data /app

COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "build"]
