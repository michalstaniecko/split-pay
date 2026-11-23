# Self-hosting on Coolify (Hetzner) instead of a BaaS

The backend (API, PostgreSQL) runs on our own Hetzner VPS (EU) managed by Coolify, and files live in Hetzner Object Storage. We rejected Firebase/Firestore because the web interface and the settlement logic have to be hosted somewhere anyway, and Firestore fits a relational balance model poorly. We rejected self-hosted Supabase because it is heavy to maintain and upgrade on a small VPS.

## Consequences

- Staging and production share one PostgreSQL instance (separate databases) to save RAM.
- Database backups go to a different Hetzner location than the VPS. Maintaining the infrastructure is our cost.
