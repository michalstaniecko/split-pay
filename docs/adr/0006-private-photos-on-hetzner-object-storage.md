# Private photos on Hetzner Object Storage, no CSAM scanning in the MVP

Photos (receipts and avatars only) go directly from the phone, via a presigned URL, to a private Hetzner Object Storage bucket. They are accessible only to group members through short-lived signed URLs and never appear in the public web preview. This is the intended primary line of defence against abuse: the app is unsuitable for distributing content. It is complemented by limits, EXIF stripping, reporting, an admin panel and retention.

## Consequences

- Giving up Cloudflare R2 means losing Cloudflare's free CSAM scanning tool. In the MVP we do not scan; we apply for Microsoft PhotoDNA when the app launches publicly in the stores.
- A trip gallery and group cover photos are deliberately left out, because they would increase legal risk.
