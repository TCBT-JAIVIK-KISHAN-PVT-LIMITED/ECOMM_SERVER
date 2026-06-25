#!/usr/bin/env bash

set -Eeuo pipefail

########################################
# Configuration
########################################

APP_DIR="/home/ubuntu/app"
ARTIFACT="$APP_DIR/artifacts/artifact.tar.gz"

RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"

APP_NAME="tcbt-app-server"

HEALTH_URL="http://127.0.0.1:3000/auth/health"

KEEP_RELEASES=5

########################################

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RELEASE_DIR="$RELEASES_DIR/release_$TIMESTAMP"

PREVIOUS_RELEASE=""

log() {
    echo "[$(date '+%F %T')] $1"
}

rollback() {

    log "Deployment failed."

    if [ -d "$RELEASE_DIR" ]; then
        rm -rf "$RELEASE_DIR"
        log "Incomplete release removed."
    fi

    if [ -n "$PREVIOUS_RELEASE" ]; then
        ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"

        cd "$CURRENT_LINK"

        pm2 reload ecosystem.config.js || true

        log "Rollback completed."
    fi

    exit 1
}

trap rollback ERR

########################################
# Validation
########################################

log "Starting deployment..."

if [ ! -f "$ARTIFACT" ]; then
    log "Artifact not found."

    exit 1
fi

mkdir -p "$RELEASE_DIR"

########################################
# Extract
########################################

log "Extracting artifact..."

tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"

########################################
# Environment
########################################
if [ ! -f "$APP_DIR/.env" ]; then
    log ".env file not found."
    exit 1
fi

cp "$APP_DIR/.env" "$RELEASE_DIR/.env"

########################################
# Install packages
########################################

cd "$RELEASE_DIR"

log "Installing production dependencies..."

npm ci --omit=dev

########################################
# Save current release
########################################

if [ -L "$CURRENT_LINK" ]; then
    PREVIOUS_RELEASE=$(readlink -f "$CURRENT_LINK")
fi

########################################
# Switch release
########################################

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

########################################
# Start / Reload PM2
########################################

cd "$CURRENT_LINK"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then

    log "Reloading PM2..."

    pm2 reload ecosystem.config.js

else

    log "Starting PM2..."

    pm2 start ecosystem.config.js

fi

########################################
# Health Check
########################################

log "Waiting for application..."

sleep 8

log "Running health check..."

curl --fail --silent "$HEALTH_URL" >/dev/null

log "Health check passed."

########################################
# Cleanup
########################################

rm -f "$ARTIFACT"

cd "$RELEASES_DIR"

ls -dt release_* | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

pm2 save

log "Deployment completed successfully."