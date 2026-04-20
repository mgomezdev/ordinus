#!/bin/sh
set -e

# Ensure volume-backed directories exist (volumes may be newly mounted and empty)
mkdir -p /config /data/libraries /data/images /data/user-stls /data/user-stl-images

# Start the Node.js backend in the background
node packages/server/dist/index.js &

# Start nginx in the foreground
exec nginx -g 'daemon off;'
