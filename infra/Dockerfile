# Stage 1: Build frontend + backend
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/app/package.json packages/app/
COPY packages/app/tsconfig.json packages/app/tsconfig.app.json packages/app/tsconfig.node.json packages/app/vite.config.ts packages/app/index.html packages/app/
COPY packages/app/src/ packages/app/src/
COPY packages/app/public/ packages/app/public/
RUN npm ci

# Build shared library
RUN npm run build --workspace=packages/shared

# Build frontend
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace=packages/app

# Build backend
RUN npm run build --workspace=packages/server

# Stage 2: Production image
# Debian Slim (not Alpine) — AppImages require glibc, not musl
FROM node:20-slim
WORKDIR /app

# System deps: nginx, tini, Python, OpenSCAD headless rendering libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    tini \
    python3 \
    python3-pip \
    wget \
    libgl1 \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libfontconfig1 \
    libfreetype6 \
    libharfbuzz0b \
    libegl1 \
    && rm -rf /var/lib/apt/lists/*

# Download OpenSCAD AppImage, extract it (FUSE not available in Docker)
# --appimage-extract unpacks the squashfs without needing FUSE
RUN wget -q https://files.openscad.org/snapshots/OpenSCAD-2026.04.16-x86_64.AppImage \
         -O /tmp/openscad.AppImage \
    && chmod +x /tmp/openscad.AppImage \
    && cd /tmp && /tmp/openscad.AppImage --appimage-extract \
    && mv /tmp/squashfs-root /app/openscad \
    && rm /tmp/openscad.AppImage

# Install Python dependencies for STL processing
COPY packages/server/scripts/py/requirements.txt /tmp/py-requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/py-requirements.txt

# Copy built frontend to nginx html dir
COPY --from=build /app/packages/app/dist /usr/share/nginx/html

# Copy nginx config; remove default site to avoid conflicts
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Copy backend runtime files
COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/server/node_modules packages/server/node_modules

# Copy Python scripts and tools
COPY packages/server/scripts/ scripts/
COPY tools/gridfinity-generator/ tools/gridfinity-generator/
COPY tools/library-builder/ tools/library-builder/
COPY packages/app/public/libraries/ packages/app/public/libraries/

# Entrypoint
COPY infra/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Persistent volume mount points
RUN mkdir -p /config /data/libraries /data/images /data/user-stls /data/user-stl-images /data/generated /tmp/nginx-image-cache
VOLUME ["/config", "/data"]

ENV NODE_ENV=production \
    LOG_LEVEL=warn \
    DB_PATH=/config/gridfinity.db \
    IMAGE_DIR=/data/images \
    USER_STL_DIR=/data/user-stls \
    USER_STL_IMAGE_DIR=/data/user-stl-images \
    CORS_ORIGIN=http://localhost:8080 \
    GRIDFINITY_GENERATOR_DIR=/app/tools/gridfinity-generator \
    LIBRARY_BUILDER_DIR=/app/tools/library-builder \
    GENERATED_STL_DIR=/data/generated \
    OPENSCAD_PATH=/app/openscad/AppRun \
    OPENSCAD_BACKEND=Manifold \
    SCAD_FILE=/app/tools/gridfinity-generator/gridfinity_basic_cup.scad

EXPOSE 80

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/docker-entrypoint.sh"]
