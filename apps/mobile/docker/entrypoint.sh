#!/bin/sh
# Writes the universal link / App Link association files from the environment, then
# starts Caddy (apps/mobile/docker/Caddyfile). Both cover group links (/g/*) only; a
# file whose values are missing is not written and answers 404 (links then open the
# web view instead of the app).
#
#   API_URL                      origin of apps/api, for link previews (/og/:token); required
#   APPLE_TEAM_ID                Apple Developer Team ID
#   APPLE_BUNDLE_ID              default app.kwitz
#   ANDROID_PACKAGE              default app.kwitz
#   ANDROID_SHA256_FINGERPRINTS  signing certificate SHA-256 fingerprint(s), comma-separated
set -eu

if [ -z "${API_URL:-}" ]; then
  echo "web: API_URL is required (origin of the API, e.g. https://api.kwitz.app)" >&2
  exit 1
fi

dir=/srv/assoc/.well-known
mkdir -p "$dir"
rm -f "$dir/apple-app-site-association" "$dir/assetlinks.json"

bundle_id="${APPLE_BUNDLE_ID:-app.kwitz}"
package="${ANDROID_PACKAGE:-app.kwitz}"

if [ -n "${APPLE_TEAM_ID:-}" ]; then
  printf '{"applinks":{"details":[{"appIDs":["%s.%s"],"components":[{"/":"/g/*"}]}]}}\n' \
    "$APPLE_TEAM_ID" "$bundle_id" > "$dir/apple-app-site-association"
else
  echo "web: APPLE_TEAM_ID unset, not serving apple-app-site-association" >&2
fi

if [ -n "${ANDROID_SHA256_FINGERPRINTS:-}" ]; then
  # "AA:BB, CC:DD" -> AA:BB","CC:DD
  fingerprints=$(printf '%s' "$ANDROID_SHA256_FINGERPRINTS" | tr -d ' ' | sed 's/,/","/g')
  printf '[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"%s","sha256_cert_fingerprints":["%s"]}}]\n' \
    "$package" "$fingerprints" > "$dir/assetlinks.json"
else
  echo "web: ANDROID_SHA256_FINGERPRINTS unset, not serving assetlinks.json" >&2
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
