# Object storage on Cloudflare R2 behind a provider-neutral S3 port

Photos and database backups live in Cloudflare R2 instead of Hetzner Object Storage. R2's free tier (10 GB, 1M writes and 10M reads per month, no egress fees) covers the MVP, while Hetzner Object Storage has a fixed monthly base price from day one. Buckets are created with the `eu` jurisdiction so data stays in the EU. The API, PostgreSQL and Coolify stay on the Hetzner VPS (ADR-0012). This replaces only the storage provider in ADR-0006; the privacy model (private bucket, presigned upload, short-lived signed reads, no photos on the web) is unchanged.

The API reaches storage only through a small object-storage port (issue an upload URL, issue a read URL, inspect an object, delete an object) with a single S3-compatible adapter configured by environment variables (endpoint, region, bucket, credentials). Switching to Hetzner or any other S3-compatible store is a configuration change plus copying the objects (e.g. `rclone sync`), not a code change.

## Consequences

- The database stores object keys (e.g. `receipts/<groupId>/<uuid>.jpg`), never URLs or provider hostnames. The mobile app never knows the provider: it only receives presigned URLs from the API, so a provider switch does not break app versions already in the stores.
- Only features common to S3-compatible stores are used: presigned **PUT** (R2 does not support presigned POST policies), a signed `Content-Type`, and a server-side check of the uploaded object's size and type before it is attached (the size limit cannot be enforced by a POST policy). No Workers bindings, public R2 domains, Cloudflare image transformations or provider lifecycle rules — retention runs in our own job.
- Development and tests use a local S3-compatible store (MinIO), which also keeps the adapter honest about provider independence.
- Database backups go to R2, which also puts them with a different provider than the VPS.
- Cloudflare is a US company: the privacy policy lists it as a processor (Cloudflare's DPA, EU-US Data Privacy Framework / SCCs) and states that buckets use the EU jurisdiction. Hetzner would not need the transfer clause.
- The free tier is per account, shared by staging and production. When usage outgrows it and Hetzner's flat price becomes cheaper (roughly a few hundred GB), we migrate using the port.
- Cloudflare's CSAM Scanning Tool scans content served through the Cloudflare cache of a proxied website; private objects read via presigned URLs do not pass through it, so moving to R2 does not change the CSAM plan of ADR-0006 (no scanning in the MVP, PhotoDNA at the public store launch).
