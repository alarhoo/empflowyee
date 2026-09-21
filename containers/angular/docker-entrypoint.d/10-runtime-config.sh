#!/bin/sh
# Validate only approved public values and publish configuration atomically before NGINX starts.
set -eu

: "${APP_ENVIRONMENT:?APP_ENVIRONMENT is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"
: "${API_BASE_URL:?API_BASE_URL is required}"

case "$APP_ENVIRONMENT" in
  local|dev|qa|prod) ;;
  *) echo 'Invalid APP_ENVIRONMENT' >&2; exit 1 ;;
esac

case "$APP_ENVIRONMENT:$API_BASE_URL" in
  local:http://*|local:https://*|dev:https://*|qa:https://*|prod:https://*) ;;
  *) echo 'Invalid API_BASE_URL scheme' >&2; exit 1 ;;
esac

TARGET=/usr/share/nginx/html/assets/config.json
TMP="${TARGET}.tmp"

jq -en \
  --arg environment "$APP_ENVIRONMENT" \
  --arg releaseId "$RELEASE_ID" \
  --arg apiBaseUrl "$API_BASE_URL" \
  'if ($releaseId | test("\\S")) and ($releaseId | length) <= 128
      and ($apiBaseUrl | test("^https?://[^/?#@\\s]+(/[^?#\\s]*)?$"))
   then {environment:$environment,releaseId:$releaseId,apiBaseUrl:$apiBaseUrl}
   else error("Invalid public runtime configuration") end' \
  > "$TMP"

mv "$TMP" "$TARGET"
