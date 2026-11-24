# The heath.js container image: the built app, served by nginx as a non-root user on port 8080.
#
# Two stages. The first has Node and builds the app; the second only has nginx
# and the built files. Only the second stage ends up in the published image, so
# it carries no Node, no node_modules and no source code.
#
# Build locally:  docker build -t heath.js .
# Run locally:    docker run --rm -p 8080:8080 heath.js   then open http://localhost:8080/heath/

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, in their own layer: Docker reuses a layer when its inputs
# are unchanged, so a change to src/ doesn't reinstall every package.
COPY package.json package-lock.json ./
RUN npm ci

# Then the rest of the build context (what .dockerignore lets through), and build.
# Vite reads .env.production here, so VITE_* settings are baked into the files.
COPY . .
RUN npm run build

# ── Stage 2: serve ──────────────────────────────────────────────────────────
# nginx-unprivileged: the same nginx, running as an ordinary user (uid 101) and listening on
# 8080, so it works in containers that drop all capabilities, as the VM's Quadlet services do (#40).
FROM nginxinc/nginx-unprivileged:1.30-alpine

# Our site configuration, as a template: at start-up the image fills in the
# container's DNS servers (because of the ENV line) and writes the result over
# nginx's default site, /etc/nginx/conf.d/default.conf.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template

# The simulation engine's settings, filled into the template at start-up like the
# resolvers. Empty by default, so the image starts anywhere and answers 503 for the
# engine; the server sets them when it starts the container (deploy/README.md).
# The key is never set here: the image is public.
ENV ENGINE_URL="" \
    ENGINE_API_KEY="" \
    ENGINE_CA_FILE=/etc/ssl/certs/ca-certificates.crt

# The built app, from stage 1, into the folder nginx serves.
COPY --from=build /app/dist /usr/share/nginx/html

# Documentation only: the container listens on port 8080. Which port the server
# exposes it on is decided when the container is started (the VM's Quadlet unit file).
EXPOSE 8080
