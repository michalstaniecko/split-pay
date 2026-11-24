# Self-hosting on Coolify (Hetzner) instead of a BaaS

The backend (API, PostgreSQL) runs on our own Hetzner VPS (EU) managed by Coolify, and files live in S3-compatible object storage (Cloudflare R2 for the MVP, [ADR-0020](./0020-object-storage-on-cloudflare-r2-behind-s3-port.md)). We rejected Firebase/Firestore because the web interface and the settlement logic have to be hosted somewhere anyway, and Firestore fits a relational balance model poorly. We rejected self-hosted Supabase because it is heavy to maintain and upgrade on a small VPS.

## Consequences

- Staging and production share one PostgreSQL instance (separate databases) to save RAM.
- Database backups go to object storage with a different provider than the VPS (R2, ADR-0020). Maintaining the infrastructure is our cost.
