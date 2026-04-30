# Stage 1: Build frontend + backend
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/ shared/
COPY server/ server/
COPY app/package.json app/
COPY app/tsconfig.json app/tsconfig.app.json app/tsconfig.node.json app/vite.config.ts app/index.html app/
COPY app/src/ app/src/
COPY app/public/ app/public/
RUN npm ci

# Build shared library
RUN npm run build --workspace=shared

# Build frontend
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace=app

# Build backend
RUN npm run build --workspace=server

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
COPY server/scripts/py/requirements.txt /tmp/py-requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/py-requirements.txt

# Copy built frontend to nginx html dir
COPY --from=build /app/app/dist /usr/share/nginx/html

# Copy nginx config; remove default site to avoid conflicts
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Copy backend runtime files
COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/node_modules server/node_modules

# Copy Python scripts and tools
COPY server/scripts/ scripts/
COPY generator/ generator/
COPY tools/library-builder/ tools/library-builder/
COPY app/public/libraries/ app/public/libraries/

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
    GRIDFINITY_GENERATOR_DIR=/app/generator \
    LIBRARY_BUILDER_DIR=/app/tools/library-builder \
    GENERATED_STL_DIR=/data/generated \
    OPENSCAD_PATH=/app/openscad/AppRun \
    OPENSCAD_BACKEND=Manifold \
    SCAD_FILE=/app/generator/gridfinity_basic_cup.scad

EXPOSE 80

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/docker-entrypoint.sh"]
