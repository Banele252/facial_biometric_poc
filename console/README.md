# MTN Management Console

React + Vite + TypeScript read surface over the audit trail and fraud/transaction
data produced by the facial biometric SIM-swap journey. No mock data — every view
calls the backend.

## Views

| Route | Backend endpoint |
|---|---|
| `/audit-logs` | `GET  {MANAGEMENT_PATH}/audit-logs` |
| `/fraud-intelligence` | `GET  {MANAGEMENT_PATH}/fraud-intelligence` |
| `/transactions` | `GET  {MANAGEMENT_PATH}/transactions` |
| `/chatbot` | `POST {MANAGEMENT_PATH}/chat` |

## Quick start

```bash
cd console
npm install
cp .env.example .env     # fill in VITE_CONSOLE_PASSWORD
npm run dev
```

Open http://localhost:5174

## Auth

The console authenticates itself at startup against the same `/auth/token`
endpoint the mobile app uses (`src/lib/auth.ts`), then attaches the bearer token
to every management call. Scopes are read-only by default — the console must
never hold `simswap:execute` or `biometric:write`.

A 401 triggers exactly one silent re-bootstrap and replay. A second 401 surfaces
as a visible error rather than a redirect.

## Zero-trust headers

`src/lib/http.ts` mirrors the mobile interceptor header-for-header:
`X-Correlation-Id`, `X-Device-Fingerprint`, `X-Geo-Fence`, `X-Request-Nonce`
(mutations only), `Authorization`, and `X-API-Key`. If the backend tightens
this contract, both clients must change together.

## Audit contract

`src/types/audit.ts` is a copy of the wire shape emitted by the mobile
`AuditService`. Any change to `AuditLogEntry` or the `AuditEvent` union on the
device must be mirrored there.

The console verifies hash-chain **linkage** (`previous_hash` vs the preceding
entry's `integrity_hash`) and flags breaks in the table. It does not recompute
`integrity_hash` — that requires byte-identical reconstruction of the JSON the
device hashed and belongs server-side at ingest.

Note: the device resets its chain to the zero hash after each successful flush,
so the first entry of every batch legitimately has no predecessor. Those rows
show as "Chain start", not as breaks.

## Docker

The console is a service in the root `docker-compose.yml`, alongside `api`
and `redis` on the `biometric_net` network.

```bash
# from the repo root
export CONSOLE_USERNAME=console_readonly
export CONSOLE_PASSWORD=...        # never commit this
docker compose up --build
```

Console on http://localhost:5174, API on :8000. Both bind to loopback only.

The console waits on the API's `service_healthy` condition, which uses the
`HEALTHCHECK` baked into the API image (`curl /healthz`).

### Runtime config, not build-time

Vite inlines `import.meta.env.VITE_*` at **build** time, so an image built
against staging can never be promoted to prod. Instead the entrypoint writes
`/tmp/console/config.js` from `CONSOLE_*` container env at start, nginx aliases
`/config.js` onto it, and `index.html` loads it before the bundle. One image,
every environment.

`npm run dev` has no `config.js`; the 404 is a no-op and config falls back to
`import.meta.env`, so `.env` still works locally.

### Same-origin by default

nginx reverse-proxies `/api` and `/auth` to `CONSOLE_UPSTREAM`, so the browser
never makes a cross-origin call and the backend needs no CORS allowance for the
console. Set `CONSOLE_API_BASE_URL` only if you want the browser to hit the API
directly — then CORS becomes your problem.

`resolver 127.0.0.11` in `nginx.conf` is Docker's embedded DNS. On Azure
Container Apps or any non-Compose runtime, change it to that platform's
resolver or use a fully-qualified upstream.

### Container hardening

Runs as the unprivileged `nginx` user (uid 101), which is why it listens on
8080 rather than 80. Compose runs it `read_only` with tmpfs on the four paths
nginx needs to write. `no-new-privileges` is set. tini is PID 1 so `docker stop`
is a clean shutdown rather than a SIGKILL wait.

### Security note on the service account

`CONSOLE_PASSWORD` reaches the browser in `config.js` — any user with devtools
can read it and mint their own token with the console's scopes. Runtime
injection keeps it out of the image and out of git, but it does not make it a
secret.

This is acceptable for a POC with read-only scopes. It is not acceptable in
production. The fix is to stop having a browser-held service account: either a
per-operator login against the identity provider, or a thin BFF that holds the
credential server-side and issues the browser a short-lived session cookie.
