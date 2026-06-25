#!/usr/bin/env bash

set -Eeuo pipefail

########################################
# Configuration
########################################

APP_DIR="/home/ubuntu/app"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"

APP_NAME="tcbt-app-server"

HEALTH_URL="http://127.0.0.1:3000/auth/health"

KEEP_RELEASES=5

LOG_FILE="$APP_DIR/logs/deploy.log"

########################################
# Validate Input
########################################

if [ $# -ne 1 ]; then
    echo "Usage: deploy.sh <artifact-name>"
    exit 1
fi

ARTIFACT_NAME="$1"
ARTIFACT="$APP_DIR/artifacts/$ARTIFACT_NAME"

########################################
# Setup
########################################

mkdir -p "$APP_DIR/logs"

START_TIME=$(date +%s)

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RELEASE_DIR="$RELEASES_DIR/release_$TIMESTAMP"

PREVIOUS_RELEASE=""

########################################
# Logging
########################################

log() {
    echo "[$(date '+%F %T')] $1" | tee -a "$LOG_FILE"
}

########################################
# Rollback
########################################

rollback() {

    log "Deployment failed."

    if [ -d "$RELEASE_DIR" ]; then
        rm -rf "$RELEASE_DIR"
        log "Removed failed release."
    fi

    if [ -n "$PREVIOUS_RELEASE" ]; then

        log "Rolling back to previous release..."

        ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"

        cd "$CURRENT_LINK"

        if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
            pm2 reload ecosystem.config.js
        else
            pm2 start ecosystem.config.js
        fi

        log "Rollback completed."

    fi

    exit 1
}

trap rollback ERR

########################################
# Start Deployment
########################################

log "========================================"
log "Starting deployment"
log "Release : $RELEASE_DIR"
log "Artifact: $ARTIFACT_NAME"

########################################
# Validation
########################################

if [ ! -f "$ARTIFACT" ]; then
    log "Artifact not found."
    exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
    log ".env file not found."
    exit 1
fi

########################################
# Save Previous Release
########################################

if [ -L "$CURRENT_LINK" ]; then
    PREVIOUS_RELEASE=$(readlink -f "$CURRENT_LINK")
fi

########################################
# Create Release
########################################

mkdir -p "$RELEASE_DIR"

log "Created release directory."

########################################
# Extract Artifact
########################################

log "Extracting artifact..."

tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"

########################################
# Copy Environment
########################################

cp "$APP_DIR/.env" "$RELEASE_DIR/.env"

########################################
# Install Dependencies
########################################

cd "$RELEASE_DIR"

log "Installing production dependencies..."

npm ci --omit=dev

########################################
# Switch Release
########################################

log "Updating current symlink..."

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
# Verify PM2
########################################

STATUS=$(pm2 jlist | grep "\"name\":\"$APP_NAME\"" | grep "\"status\":\"online\"" || true)

if [ -z "$STATUS" ]; then
    log "PM2 process is not online."
    exit 1
fi

########################################
# Health Check
########################################

log "Waiting for application..."

HEALTHY=false

for i in {1..15}; do

    if curl --silent --fail "$HEALTH_URL" >/dev/null; then
        HEALTHY=true
        break
    fi

    sleep 2

done

if [ "$HEALTHY" = false ]; then
    log "Health check failed."
    exit 1
fi

log "Health check passed."

########################################
# Cleanup
########################################

log "Removing deployment artifact..."

rm -f "$ARTIFACT"

log "Cleaning old releases..."

cd "$RELEASES_DIR"

ls -dt release_* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

COUNT=$(find "$RELEASES_DIR" -maxdepth 1 -type d -name "release_*" | wc -l)

log "Available releases: $COUNT"

pm2 save

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log "Deployment completed successfully."
log "Deployment time: ${DURATION}s"
log "========================================"