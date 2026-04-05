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
FROM node:20-alpine
RUN apk add --no-cache tini nginx

WORKDIR /app

# Copy built frontend to nginx html dir
COPY --from=build /app/packages/app/dist /usr/share/nginx/html

# Copy nginx config
COPY infra/nginx.conf /etc/nginx/http.d/default.conf

# Copy backend runtime files
COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/package.json packages/server/package.json

# Entrypoint
COPY infra/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Persistent volume mount points
RUN mkdir -p /config /data/libraries /data/images /data/user-stls /data/user-stl-images /tmp/nginx-image-cache
VOLUME ["/config", "/data"]

# Runtime environment — override these with -e or env_file
ENV NODE_ENV=production \
    LOG_LEVEL=warn \
    DB_PATH=/config/gridfinity.db \
    IMAGE_DIR=/data/images \
    USER_STL_DIR=/data/user-stls \
    USER_STL_IMAGE_DIR=/data/user-stl-images \
    LIBRARIES_DIR=/data/libraries \
    CORS_ORIGIN=http://localhost:8080

EXPOSE 80

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/docker-entrypoint.sh"]
