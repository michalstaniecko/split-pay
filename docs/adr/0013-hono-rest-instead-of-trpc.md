# Hono + REST with a typed client instead of tRPC

The API is built with Hono, with Zod validation and an `hc` client shared by the app and the web. This gives end-to-end typing without code generation, while the API remains plain REST. We rejected tRPC because public endpoints (web preview via link, Open Graph, webhooks) need predictable URLs.
