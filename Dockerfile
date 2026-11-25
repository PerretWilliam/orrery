# syntax=docker/dockerfile:1
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:26-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S orrery && adduser -S orrery -G orrery
# The standalone server, the static assets and the migrations (applied at start, read from ./drizzle).
COPY --from=build --chown=orrery:orrery /app/.next/standalone ./
COPY --from=build --chown=orrery:orrery /app/.next/static ./.next/static
COPY --from=build --chown=orrery:orrery /app/public ./public
COPY --from=build --chown=orrery:orrery /app/drizzle ./drizzle
USER orrery
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
