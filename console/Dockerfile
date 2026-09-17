# syntax=docker/dockerfile:1.7

# ---------- build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Manifests first, so the dependency layer caches independently of source.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` is `tsc -b && vite build` — a type error fails the image
# rather than shipping a broken bundle.
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache tini

# Placed in /etc/nginx/templates so the image's 20-envsubst-on-templates.sh
# expands ${CONSOLE_UPSTREAM} at start. NGINX_ENVSUBST_FILTER restricts
# substitution to CONSOLE_* — without it, envsubst would eat nginx's own
# runtime variables ($host, $remote_addr, $request_uri) and break the proxy.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.d/99-console-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_FILTER="^CONSOLE_" \
    CONSOLE_UPSTREAM="http://api:8000"

# Runs as the image's unprivileged nginx user (uid 101), so it cannot bind
# port 80 — hence `listen 8080` in nginx.conf. These paths must be writable
# by that user: conf.d for the rendered template, html for config.js.
RUN chmod +x /docker-entrypoint.d/99-console-config.sh \
    && chown -R nginx:nginx \
        /usr/share/nginx/html \
        /etc/nginx/conf.d \
        /var/cache/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

# tini reaps zombies and forwards signals, so `docker stop` is a clean
# nginx shutdown rather than a 10-second SIGKILL wait.
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
