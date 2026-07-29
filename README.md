### Facial biometric authentication

The most prevelent type of subscription fraud is third-part fraud. Third party occurs when an unauthorised user or individual gains access to a user account without their consent. Third party fraud is further divided into two major categories which are identity theft and account take over.

Identity theft is when an unauthorised individual uses another user's identity to perform fraudulent transactions. account takeover is when someone gains access to a user's account and changes the login details to prevent the owner from gaining access.

---

## Layout

```
Backend/
  app/                  FastAPI application (routers, config)
  internal_backend/     Offline SA ID validation rules
  external_backend/     VerifyNow provider client
frontend/               React + Vite + TypeScript SPA
tests/                  pytest suite
Dockerfile              Multi-stage build — one image serves API + SPA
```

The frontend bundle is built at image-build time and served by the same FastAPI
process, so the API and UI ship as a single container in a single Container App
revision.

## Running locally

Requires [uv](https://docs.astral.sh/uv/) and Node 22.

```bash
cp .env.example .env      # then fill in the VerifyNow values
uv sync

# API on :8000 with autoreload
uv run python main.py

# UI on :5173, proxying /api to the API
cd frontend && npm install && npm run dev
```

Or run the production shape in one container:

```bash
docker build -t facial-biometric-poc .
docker run --rm -p 8000:8000 --env-file .env facial-biometric-poc
```

## Endpoints

| Method | Path                     | Purpose                                       |
|--------|--------------------------|-----------------------------------------------|
| GET    | `/healthz`               | Liveness — no dependencies, never fails on outage |
| GET    | `/readyz`                | Readiness — reports provider configuration    |
| POST   | `/api/v1/validate-id`    | Offline structural validation of an ID number |
| POST   | `/api/v1/verify-identity`| Verification via the VerifyNow provider       |
| GET    | `/api/v1/credits`        | Remaining VerifyNow credit balance            |
| POST   | `/api/v1/selfies`        | Capture a selfie (HT2-11)                      |
| POST   | `/api/v1/selfies/{id}/liveness` | Run the liveness check on a selfie (HT2-12) |
| POST   | `/api/v1/verifications`  | Orchestrated decision with fallback (HT2-15)  |
| GET    | `/api/v1/verifications/history` | Verification attempt history (HT2-14), `?status=rejected` for failures |
| GET    | `/api/v1/notifications`  | In-app approval/rejection inbox (HT2-24/25)   |
| GET    | `/docs`                  | OpenAPI UI (disabled in production)           |

## Verification journey

The SPA walks a customer through **details → selfie → liveness → verification →
decision**, then shows the resulting notification and history.
`POST /api/v1/verifications` runs the whole chain server-side and returns both
the decision and a per-step `checks` array:

1. **ID precheck** — structural and Luhn validation. No external call.
2. **Liveness gate** — the captured selfie must already have passed.
3. **RICA registration** — does the claimed name own the number being swapped?
   A mismatch ends the journey before any provider call, so the fraud case
   costs nothing. Skipped when no name and number are supplied.
4. **ID verification** — VerifyNow `said_verification`. A failure here is not
   fatal; the face match is the stronger signal and still runs.
5. **Home Affairs face match** — VerifyNow `/facematch`, comparing the selfie
   against the ID photo Home Affairs holds.

The attempt is recorded (history), a notification is sent (HT2-24/25), and every
step is written to the audit trail. If the provider is unreachable, a
structurally valid, live applicant is approved through a **fallback** path
flagged for manual review (HT2-15) rather than being failed.

The face match answers `Approved`, `In Review` or `Declined`, so **`review` is a
third outcome** alongside approved and rejected — an *In Review* customer is
neither approved nor turned away.

Storage, liveness and notifications are pluggable with dependency-free defaults:

| Concern | Default (no deps) | Target provider | Enable with |
|---|---|---|---|
| History / inbox / audit | local SQLite | Azure Postgres | `DATABASE_URL=postgresql://…` (needs `psycopg`) |
| Selfie storage | local directory | Azure Blob | `AZURE_STORAGE_CONNECTION_STRING` (needs `azure-storage-blob`) |
| Liveness | `mock` heuristic | Azure AI Face | `LIVENESS_PROVIDER=azure_face` |

### Provider mode and credits

`VERIFY_MODE` resolves to `production` **only** on that exact string — anything
else falls back to `sandbox`, which returns mock responses and consumes no
credits. The request body cannot choose the mode; it is a deployment decision.

The sandbox rate-limits per IP across its routes, so the two provider calls in a
journey are separated by `SANDBOX_COOLDOWN_SECONDS` (default 11). A journey
therefore takes ~15s in sandbox and the SPA shows a progress screen. Production
has no such limit.

> **See [`docs/architecture.md`](docs/architecture.md)** for what is actually
> deployed, how the services fit together, the data model, and the gaps against
> the CARB target.

## Checks

```bash
uv run ruff check .          # lint
uv run ruff format --check . # formatting
uv run pytest                # tests
```

## Pipelines

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yaml` | PR to `main`, push to `main` | ruff, pytest + coverage, ESLint, `tsc`, Vite build, image build and smoke test |
| `security.yaml` | PR, push, weekly Monday | Gitleaks, Trivy fs + image (CRITICAL/HIGH blocking), CodeQL (python + TS), CycloneDX SBOM |
| `cd.yaml` | push to `main`, release tags, `workflow_dispatch` | Build, scan-before-push, push to ACR, roll the Container App, smoke test, auto-rollback |

Security findings land in the repository **Security → Code scanning** tab as SARIF.
The Trivy gate in `cd.yaml` runs *before* `docker push`, so an image that fails the
scan never reaches the registry.

The dependency gate blocks on any CRITICAL/HIGH in our own Python and npm
packages, fixed or not — accept one deliberately via `.trivyignore` rather than
by loosening the gate. The image gate additionally sets `ignore-unfixed`, since
base-image OS CVEs with no released patch are not actionable in this repo.

## Releasing

Deployment is tag-driven beyond dev:

| Trigger | Environment | Image tag |
|---|---|---|
| Push to `main` | `dev` | commit SHA |
| Tag `v1.2.3-rc.1` (prerelease) | `uat` | `v1.2.3-rc.1` |
| Tag `v1.2.3` | `prod` | `v1.2.3` |
| `workflow_dispatch` | chosen | chosen ref, or SHA |

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

That builds from the tag, pushes `…/facial-biometric-poc:v1.2.3` to ACR, deploys
to prod (subject to the environment's approval rule), smoke-tests it, and then
publishes a GitHub Release with generated notes. A prerelease tag goes to `uat`
and is marked as a prerelease.

Release tags are **immutable**: cutting a tag whose image is already in ACR fails
the build rather than overwriting it, so a version always identifies one exact
image. Releases are also pushed under their commit SHA, and each environment
keeps a moving `<env>-latest` pointer.

`workflow_dispatch` accepts an optional `ref` to deploy a specific tag or SHA.
If that image is already in ACR it is **reused, not rebuilt** — the artifact that
was scanned is the artifact that ships, and the `<env>-latest` pointer is retagged
server-side. That is the promotion path:

```bash
# promote the exact uat-tested build to prod
gh workflow run cd.yaml -f environment=prod -f ref=v1.2.3
```

## Deployment

Target is **Azure Container Apps**. Infrastructure lives in a separate IaC repo —
this repo does not provision anything. `cd.yaml` builds the image, pushes it to
ACR, and calls `az containerapp update --image` to roll a new revision onto the
existing app. Ingress, probes, scaling, secrets and the ACR pull identity are set
by the IaC repo and carried over to each new revision untouched.

If the target Container App does not exist, the deploy job fails with an explicit
message rather than creating one.

### What the IaC repo must provision

The pipeline assumes the Container App is configured to match the image:

| Setting | Required value |
|---|---|
| Ingress target port | `8000` |
| Liveness probe | `GET /healthz` |
| Readiness probe | `GET /readyz` |
| Startup probe | `GET /healthz` (allow a generous failure threshold) |
| Registry auth | User-assigned managed identity with `AcrPull` |
| Revision mode | Single (the rollback path assumes this) |

Application environment variables, set as Container App **secrets**:

| Variable | Notes |
|---|---|
| `VERIFY_NOW_API_KEY` | VerifyNow API key |
| `VERIFY_BASE_URL` | VerifyNow base URL |
| `Idempotency_id_key` | Casing is intentional — matches what the app reads |

Optional plain environment variables: `LOG_LEVEL`, `ENABLE_DOCS` (set `false` in
production to hide `/docs`), `APP_VERSION`.

### Required GitHub configuration

Set per environment (`dev`, `test`, `uat`, `prod`) under **Settings → Environments**.
Add required reviewers on `prod` to gate production deploys.

**Secrets**

| Name | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | OIDC federated credential (app registration) |
| `AZURE_TENANT_ID` | Entra tenant |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |

**Variables**

| Name | Example |
|---|---|
| `ACR_NAME` | `myacr` |
| `ACR_LOGIN_SERVER` | `myacr.azurecr.io` |
| `AZURE_RESOURCE_GROUP` | `rg-facial-biometric-dev` |
| `CONTAINER_APP_NAME` | `ca-facial-biometric-poc-dev` |

Provider credentials are **not** GitHub secrets here — they are Container App
secrets owned by the IaC repo, so the pipeline never handles them.

Authentication is OIDC — there is no service principal secret to rotate. The
federated credential on the app registration must trust
`repo:<org>/<repo>:environment:<env>`, and the identity needs `AcrPush` on the
registry plus `Contributor` (or a Container Apps write role) on the resource group.
