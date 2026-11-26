# Operations runbook

How the hosted environments are set up, where the secrets live, and how to do the recurring operations: deploy, rotate a token, restore a backup, check error reporting.

Decisions behind this setup: [ADR-0012](adr/0012-self-hosting-on-coolify.md) (Coolify on a VPS), [ADR-0020](adr/0020-object-storage-on-cloudflare-r2-behind-s3-port.md) (Cloudflare R2 behind an S3 port), [ADR-0023](adr/0023-otp-emails-via-zeptomail-http-api.md) (OTP emails via ZeptoMail).

**No secrets in this file or anywhere in the repo.** They live in Coolify and in the owner's password manager (see [Secrets](#secrets)).

## Overview

| What | Where | Notes |
|---|---|---|
| API (staging) | Coolify on the Hetzner VPS, project `split-pay`, environment `staging` | `https://api-stage.splitpay.on.ihumbak.website`, built from `main` |
| API (production) | Same Coolify project, environment `production` | Not set up yet: waits for the final app name and domain (SPEC, open tasks) |
| PostgreSQL 18 | Coolify resource `split-pay-postgres` (one instance) | One database per environment: `splitpay_staging`, later `splitpay_production` |
| Photo buckets | Cloudflare R2, EU jurisdiction | `split-pay-stage`, `split-pay-prod` |
| Database backups | Cloudflare R2, EU jurisdiction | `split-pay-backups`, written by Coolify's scheduled backups |
| Sign-in code emails | Zoho ZeptoMail, EU data centre | Domain `kwitz.app`, sender `no-reply@kwitz.app` |
| Error reporting | Sentry, EU region (`de.sentry.io`), org `ihumbakwebsite` | Projects `split-pay-api`, `split-pay-mobile` |
| Web app | Coolify, same project and environments | Not set up yet (#53). Production `https://app.kwitz.app` (ADR-0022) |

The working domain `splitpay.on.ihumbak.website` is for staging only. Don't send real invitations from it: group links contain the domain, so they break when it changes (ADR-0009).

## Cloudflare R2

### Buckets

| Bucket | Used by | Token |
|---|---|---|
| `split-pay-stage` | Staging API (photos) | `split-pay-stage-api` |
| `split-pay-prod` | Production API (photos) | `split-pay-prod-api` |
| `split-pay-backups` | Coolify database backups | `split-pay-backups` |

- Every bucket was created with **jurisdiction: European Union (EU)**. This can't be changed later. A new bucket must be created with *Specify jurisdiction → EU*, not with a location hint. You can check it from the S3 endpoint, which must contain `.eu.`: `https://<account-id>.eu.r2.cloudflarestorage.com`.
- **No public access** on any bucket: the `r2.dev` URL is disabled, there are no custom domains and no CORS rules. The phone only uses presigned URLs issued by the API (ADR-0020), and native apps don't need CORS.
- No lifecycle rules except Cloudflare's default that aborts unfinished multipart uploads. Our own jobs handle retention: photo retention in the API, backup retention in Coolify.
- The account has 2FA and a billing (usage) notification.

### Tokens

One **Account API token** per bucket. Each has **Object Read & Write** on that bucket only, a TTL of *Forever* and **no IP filter**. Phones upload through presigned URLs signed with the photo tokens, so an IP filter would block them. The backup token could later be limited to the VPS IP.

Because each token works on its own bucket only, the staging token gets `403 AccessDenied` on any other bucket.

### API environment variables

```
S3_ENDPOINT=https://<account-id>.eu.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=split-pay-stage            # or split-pay-prod
S3_ACCESS_KEY_ID=<token access key id>
S3_SECRET_ACCESS_KEY=<token secret>
S3_FORCE_PATH_STYLE=true
```

Without these variables, the photo routes answer 503.

> Known gap: photo uploads still use presigned POST, which R2 rejects (#63). Reads and deletes work.

### Rotate a token

1. Cloudflare → **R2 → Manage API tokens** → the token → **Roll**. Cloudflare shows the new secret once. Save it in the password manager.
2. Update the secret where it's used:
   - photo tokens: in the API app's environment variables in Coolify, then **Restart**;
   - backup token: in Coolify **Storages → `r2-backups`**, then **Validate Connection**.
3. Check: the next deploy or backup succeeds. For the backup token, also run the listing from [Restore a backup](#restore-a-backup).

### Move to another S3-compatible store

The API only talks to storage through the S3 port, so moving is a copy plus an env change (ADR-0020):

1. Create the buckets and tokens at the new provider.
2. Copy the objects with `rclone sync r2:<bucket> <new>:<bucket>`.
3. Point `S3_*` (and Coolify's backup storage) at the new provider and restart.
4. Run `rclone sync` once more for anything written during the switch, then delete the R2 buckets.

## Coolify

### Project layout

- Project `split-pay`, environments `staging` and `production`.
- Source: the GitHub App `split-pay-github`, installed on `michalstaniecko/split-pay` only.
- **Preview deployments are off.** The repo is public: a preview deployment would build and run a stranger's pull request on the VPS, with the environment's secrets.

### PostgreSQL

- Resource `split-pay-postgres`, PostgreSQL 18 (the same version CI uses), **not publicly available**. Apps reach it over Coolify's internal Docker network through its internal hostname, shown in *Postgres URL (internal)*.
- One database and owner per environment. To create the production one, run this in the resource's **Terminal**:

  ```sql
  psql -U postgres   -- or the "Postgres User" shown in the resource
  CREATE USER splitpay_production WITH PASSWORD '<openssl rand -hex 24>';
  CREATE DATABASE splitpay_production OWNER splitpay_production;
  ```

  Use `-hex` passwords: base64 can contain `/`, `+` and `=`, which break `DATABASE_URL`.

### API application

| Setting | Value |
|---|---|
| Source | `split-pay-github` → `split-pay`, branch `main` |
| Build pack | Dockerfile |
| Base directory | `/` (the image is built from the repo root) |
| Dockerfile location | `/apps/api/Dockerfile` |
| Ports exposes | `3000` |
| Domain | `https://api-stage.splitpay.on.ihumbak.website` (DNS `A` record to the VPS, *DNS only* if proxied by Cloudflare) |
| Health check | `GET /health` on port 3000 (the image also has its own `HEALTHCHECK`) |
| Auto deploy | On |

Environment variables. All of them are runtime only, so leave **Build Variable** unchecked:

```
PORT=3000
DATABASE_URL=postgres://splitpay_staging:<password>@<internal-host>:5432/splitpay_staging
BETTER_AUTH_URL=https://api-stage.splitpay.on.ihumbak.website
BETTER_AUTH_SECRET=<openssl rand -hex 32>       # changing it signs everyone out
ADMIN_EMAILS=<admin emails, comma-separated>
S3_*                                            # see Cloudflare R2
SENTRY_DSN=<DSN of split-pay-api>
SENTRY_ENVIRONMENT=staging
ZEPTOMAIL_TOKEN=<Send Mail token>                # see ZeptoMail; unset = codes go to the log
```

Not set yet: `PUSH_SENDER`/`EXPO_ACCESS_TOKEN` (needs the Expo project) and `WEB_URL` (the web app's origin, set once the [web app](#web-app) runs, #53). Without `ZEPTOMAIL_TOKEN`, sign-in codes appear in the app's **Logs** in Coolify.

### Web app

The web build of `apps/mobile` (the read-only web Conversation and the landing page of group links), served by Caddy (`apps/mobile/Dockerfile`, `apps/mobile/docker/`). It serves the SPA for every unknown path (`/g/*` included), proxies link preview crawlers asking for `/g/<token>` to the API's `/og/<token>`, and serves the universal link / App Link files for `/g/*`.

| Setting | Value |
|---|---|
| Source | `split-pay-github` → `split-pay`, branch `main` |
| Build pack | Dockerfile |
| Base directory | `/` |
| Dockerfile location | `/apps/mobile/Dockerfile` |
| Ports exposes | `8080` |
| Domain | Production `https://app.kwitz.app`. Staging: a host under `splitpay.on.ihumbak.website`, e.g. `https://app-stage.splitpay.on.ihumbak.website` (DNS as for the API) |
| Health check | `GET /` on port 8080 (the image also has its own `HEALTHCHECK`) |
| Auto deploy | On |

Build variables. `EXPO_PUBLIC_*` values are inlined into the bundle, so check **Build Variable** for them. A change needs a **Redeploy**, not a restart:

```
EXPO_PUBLIC_WEB_URL=https://app-stage.splitpay.on.ihumbak.website   # required, https: the build fails otherwise
EXPO_PUBLIC_API_URL=https://api-stage.splitpay.on.ihumbak.website
EXPO_PUBLIC_APP_STORE_URL=                                         # optional, the "download the app" button
EXPO_PUBLIC_PLAY_STORE_URL=
EXPO_PUBLIC_SENTRY_DSN=<DSN of split-pay-mobile>
EXPO_PUBLIC_SENTRY_ENVIRONMENT=staging
```

Runtime variables (leave **Build Variable** unchecked), read by `apps/mobile/docker/entrypoint.sh` at startup:

```
API_URL=https://api-stage.splitpay.on.ihumbak.website   # required, origin only (no path): previews are proxied to <API_URL>/og/<token>
APPLE_TEAM_ID=<Apple Developer Team ID>                  # unset = no apple-app-site-association (404)
ANDROID_SHA256_FINGERPRINTS=<AA:BB:…>[,<…>]              # signing cert SHA-256, comma-separated; unset = no assetlinks.json (404)
# APPLE_BUNDLE_ID=app.kwitz                              # defaults
# ANDROID_PACKAGE=app.kwitz
```

For Android add both the upload key's and Google Play's app signing key's fingerprint (Play Console → *App integrity*). Without the files, `https://<host>/g/<token>` still works: it opens the web view instead of the app.

Then set `WEB_URL=<web app origin>` on the API application, so link previews send people to the web view.

**Native and EAS Update builds** need the same `EXPO_PUBLIC_WEB_URL` in the build environment. `app.config.ts` fails every production export (release bundles, `eas update`, the web image) unless it is an https URL, so shared links never fall back to `kwitz://` or a dev URL. Its https host is also what the app is associated with (`ios.associatedDomains`, an auto-verified Android intent filter for `/g/*`), so staging and production builds differ. Local dev uses `EXPO_PUBLIC_WEB_URL=http://localhost:8081` (`apps/mobile/.env.example`): links open the Metro web view and nothing is associated.

Check a deployment:

```sh
curl -sI https://<host>/.well-known/apple-app-site-association   # 200, content-type: application/json, no redirect
curl -s  https://<host>/.well-known/assetlinks.json
curl -s -A facebookexternalhit/1.1 https://<host>/g/<token>       # the Open Graph page from the API
```

Verify on devices: Apple's CDN caches the association file (`https://app-site-association.cdn-apple.com/a/v1/<host>`), and on Android `adb shell pm get-app-links app.kwitz` should show the host as `verified`.

### Deploys

- A merge to `main` triggers a deploy through the GitHub App webhook. **Deploy** in Coolify does the same by hand.
- On startup the API applies pending migrations under a Postgres advisory lock, then starts serving (#64).
- If startup fails (for example a broken `DATABASE_URL` or a failing migration), the new container never becomes healthy. Coolify then **keeps the old container running** and logs `New container is not healthy, rolling back`. Read the *Container logs* part of the deployment log.
- Environment variables are read at startup only, so after changing one, use **Restart** (or **Redeploy**).

### Troubleshooting

| Symptom | Cause |
|---|---|
| `[db] migration failed, not starting … getaddrinfo EAI_AGAIN ' <host>'` (note the space) | A stray space or newline in `DATABASE_URL` |
| `getaddrinfo EAI_AGAIN <host>` without a space | The app and the database are on different Docker networks: check the database's *Destination*, or enable *Connect to Predefined Network* in the app |
| `wget: can't connect to remote host (127.0.0.1)` in the health check | The API didn't start: read the container logs above it |
| Photo routes answer 503 | `S3_*` not set |

## Backups

### Setup

- Coolify **Storages → `r2-backups`**: the `split-pay-backups` bucket with the backup token. The endpoint is the `.eu.` one and the region is `auto`.
- `split-pay-postgres` → **Backups**: daily at `0 3 * * *` (server time), saved to S3 storage `r2-backups`. When production exists, add `splitpay_production` to the backed-up databases. Retention is set in the same screen, locally and in S3.
- Backups are `pg_dump` custom-format files (`.dmp`) stored at:

  ```
  split-pay-backups/data/coolify/backups/databases/<team>/split-pay-postgres-<resource-id>/pg-dump-<database>-<timestamp>-<id>.dmp
  ```

  `<resource-id>` is the Coolify resource ID of the database. If the database resource is ever re-created, new backups go to a new folder, but older backups stay in the old one.

### Restore a backup

This restores from R2 on any machine with Docker, with no access to the VPS. It covers the case where the VPS is lost. Credentials come from a local env file with the backup token, the same format as the [API variables](#api-environment-variables) with `S3_BUCKET=split-pay-backups`. Keep the file `chmod 600` and outside the repo, e.g. `~/.config/split-pay/r2-backups.env`.

```bash
mkdir -p /tmp/split-pay-restore && cd /tmp/split-pay-restore

# rclone in Docker, configured from the env file (credentials are never printed)
r2() (
  set -a; . "$HOME/.config/split-pay/r2-backups.env"; set +a
  docker run --rm -v "$PWD:/data" \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="$S3_ENDPOINT" -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    rclone/rclone:latest "$@"
)

r2 lsl r2:split-pay-backups                                   # 1. find the newest .dmp
r2 copyto r2:split-pay-backups/<path-to-dump>.dmp /data/backup.dmp   # 2. download it

# 3. restore into a throwaway PostgreSQL 18
docker run -d --name splitpay-restore -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore \
  -v "$PWD/backup.dmp:/backup.dmp:ro" postgres:18-alpine
until docker exec splitpay-restore pg_isready -U postgres -d restore -q; do sleep 1; done
docker exec splitpay-restore pg_restore -U postgres -d restore --no-owner --no-acl --exit-on-error /backup.dmp

# 4. check it
docker exec splitpay-restore psql -U postgres -d restore -c 'select count(*) from drizzle.__drizzle_migrations'
docker exec splitpay-restore psql -U postgres -d restore -c '\dt'

# 5. clean up
docker rm -f splitpay-restore && rm backup.dmp
```

To recover a real environment, restore into an **empty** database created as in [PostgreSQL](#postgresql) (as its owner: `pg_restore -U <owner> -d <database> --no-owner --no-acl --exit-on-error <file>`). Then point the app's `DATABASE_URL` at it. Never restore over a live database.

### Last restore test

| Date | Backup | Result |
|---|---|---|
| 2026-11-25 | `splitpay_staging` | `pg_restore` exit 0; 14/14 migrations, 21 tables, 7449 `ecb_rates` rows (2025-11-25 to 2026-11-25) |

Repeat the test after big schema changes and at least before the public launch. Add a row to this table each time.

## ZeptoMail

Sign-in codes are emailed through Zoho ZeptoMail's HTTP API (ADR-0023), EU data centre. Zoho is a processor of the recipients' email addresses (privacy policy).

### Setup

1. ZeptoMail console (EU account, `zeptomail.zoho.eu`) → **Domains** → add `kwitz.app`. Add the SPF and DKIM records it shows at the DNS provider (OVH) and wait until both are verified.
2. **Mail Agents** → the agent for Kwitz → set a **bounce address** (a subdomain of `kwitz.app`, with the CNAME record ZeptoMail shows).
3. Same agent → **SMTP/API** → **API** → copy the **Send Mail token**, and check the API host shown there. Save the token in the password manager.

### API environment variables

| Variable | Value |
|---|---|
| `ZEPTOMAIL_TOKEN` | Send Mail token (with or without the `Zoho-enczapikey ` prefix). Unset = codes go to the log |
| `ZEPTOMAIL_API_URL` | Optional. Base URL, default `https://api.zeptomail.eu`. Set it only if the console shows another host |
| `EMAIL_FROM` | Optional. Default `Kwitz <no-reply@kwitz.app>`. Must be on a verified domain |

### Check that codes arrive

Request a sign-in code in the app for a mailbox you can read. The email arrives within a minute in the app's language (Polish or English). If it doesn't: the API log shows `[otp] delivery failed`, and Sentry has an issue tagged `job: otp-email` with the HTTP status (401 = wrong token or host, 4xx with a verified domain = check `EMAIL_FROM`). ZeptoMail → **Reports / Logs** shows bounces.

To check a token or a newly verified domain without the app, run the live test from `apps/api` with the variables in `.env`. It sends one Polish and one English email:

```
ZEPTOMAIL_LIVE_TEST=1 ZEPTOMAIL_LIVE_TO=<your mailbox> \
node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/otp-email/zeptomail.live.test.ts
```

### Rotate the token

Mail Agent → **SMTP/API** → generate a new Send Mail token, update `ZEPTOMAIL_TOKEN` in Coolify, **Restart**, check that codes arrive, then delete the old token.

## Sentry

- Organization `ihumbakwebsite`, **EU data storage** (`de.sentry.io`). It can't be moved.
- Projects: `split-pay-api` (platform `node-hono`) and `split-pay-mobile` (`react-native`).
- Privacy:
  - The organization *and* both projects have **Require Data Scrubber**, **Require Using Default Scrubbers** and **Prevent Storing of IP Addresses** on.
  - On top of that, the SDKs collect no personal data and every event goes through the shared scrubber (`packages/shared`, #64).
  - Native mobile crashes skip the JS scrubber, which is why the server-side settings matter.
- DSNs: **Project settings → Client Keys (DSN)**. They must contain `.de.`. The API uses `SENTRY_DSN` and `SENTRY_ENVIRONMENT`. The app uses `EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, set at build time.
- Mobile source maps need `SENTRY_AUTH_TOKEN` (plus `SENTRY_ORG` and `SENTRY_PROJECT`) at build time. They're not set up yet: that comes with the first EAS builds. The API's stack traces are readable without them.
- Failed background-job runs are reported with a `job` tag (`rates`, `push`, `photo-retention`), and failed sign-in code emails with `job: otp-email`. The release is set automatically to the deployed commit.

### Check that errors arrive

You can check this without changing code:

1. Set `FRANKFURTER_URL=https://invalid.example` on the API in Coolify and **Restart**.
2. The rate job runs on startup and fails. Within a minute, `split-pay-api` has a `TypeError: fetch failed` issue tagged `job: rates`. With the [Sentry CLI](https://cli.sentry.dev): `sentry issue list ihumbakwebsite/split-pay-api --period 1h`.
3. Remove `FRANKFURTER_URL`, **Restart**, and resolve the test issue.

Last checked: 2026-11-25 on staging.

## Secrets

| Secret | Lives in |
|---|---|
| R2 token secrets (stage, prod, backups) | Password manager. Coolify (API env for photo tokens, *Storages* for the backup token) |
| `BETTER_AUTH_SECRET` (per environment) | Password manager, Coolify |
| Database passwords (per environment) | Password manager, Coolify (`DATABASE_URL`) |
| ZeptoMail Send Mail token (per environment) | Password manager, Coolify (`ZEPTOMAIL_TOKEN`) |
| Sentry DSNs | Coolify (API), build environment (app). Not secret, but kept out of the repo |
| Sentry auth token (source maps) | Build environment only, when it exists |

GitHub Actions needs none of them: CI tests run against a Postgres service and an in-memory bucket. The S3 adapter's test against a real store (`apps/api/src/storage/s3.live.test.ts`) runs by hand, against the local store from `compose.yaml` or a staging R2 bucket (instructions in the file).

## Before production

- [x] App name and domain chosen: Kwitz, `kwitz.app` (ADR-0022).
- [x] `kwitz.app` registered (DNS at OVH).
- [ ] Set up `api.kwitz.app` and `app.kwitz.app` (the [web app](#web-app), #53): DNS, Coolify resources, `APPLE_TEAM_ID` / `ANDROID_SHA256_FINGERPRINTS`, `WEB_URL` on the API, `EXPO_PUBLIC_WEB_URL` in the release build environment. Universal links / App Links checked on devices.
- [x] Display name, URL scheme and bundle ID in `apps/mobile/app.json` set to Kwitz / `kwitz` / `app.kwitz`.
- [x] No app named Kwitz in the App Store or Google Play (2026-11-25).
- [ ] Trademark check for Kwitz (EUIPO, USPTO).
- [ ] `production` environment in Coolify: database `splitpay_production`, the API app with production secrets, `S3_BUCKET=split-pay-prod`, `SENTRY_ENVIRONMENT=production`.
- [ ] `splitpay_production` added to the backup schedule, and a restore test done.
- [ ] `kwitz.app` verified in ZeptoMail (SPF, DKIM), bounce address set, `ZEPTOMAIL_TOKEN` set and codes checked (#32).
- [ ] Push credentials (`PUSH_SENDER=expo`).
- [ ] Photo uploads work on R2 (#63).
