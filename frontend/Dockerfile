# syntax=docker/dockerfile:1.7

# ---- Frontend build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# PocketBase URL is baked into the JS bundle at build time (Vite convention).
# Default is '/' so the browser talks to the same origin — nginx reverse-proxies
# /api and /_/ to the pocketbase container in the compose network.
ARG VITE_PB_URL=/
ARG VITE_LOCAL_TIMEZONE=America/Chicago
ENV VITE_PB_URL=$VITE_PB_URL \
    VITE_LOCAL_TIMEZONE=$VITE_LOCAL_TIMEZONE

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage (nginx) ----
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
