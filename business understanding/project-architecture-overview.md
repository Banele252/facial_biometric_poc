# Project architecture overview

High-level view of how this project's front end, API layer, and
database/service layer fit together, based on what is actually wired up in
the code today (not unmounted/dead routes, and not the superseded
`Backend/analytics_api`).

## Arrow granularity — assessment

Arrows are drawn at **mixed granularity**, not uniformly at the big-block or
subblock level:

- **Front End → API layer**: drawn at the feature-group level, not just
  block-to-block. This matters because the relationship isn't uniform — the
  customer-facing apps never call RICA (it's an internal-only call made by
  the verifications orchestrator), and the management dashboard never calls
  the App API at all. A single "Front End → API layer" arrow would hide
  exactly the separation this diagram exists to show.
- **API layer → Database/Service layer**: drawn at the subblock level.
  Nearly every feature area within each API touches its own API's database
  and services, so per-endpoint arrows here would add clutter without adding
  information.
- **Database → Database**: one explicit labeled arrow for the
  `analytics_sync` Azure Function, since that's a distinct, real data flow
  (a 15-minute mirror job) worth calling out on its own.

```mermaid
flowchart TB

    subgraph frontend["FRONT END"]
        subgraph customerApp["Customer-Facing Application"]
            webSpa["Web SPA<br/>React + Vite<br/>(frontend/)"]
            mobileApp["Mobile App<br/>React Native / Expo<br/>(mobile/)"]
        end
        subgraph mgmtApp["Management-Console Application"]
            mgmtDash["Management Dashboard<br/>React + Vite, admin<br/>(management-frontend/)"]
        end
    end

    subgraph apiLayer["APPLICATION LAYER / API"]
        subgraph appApi["App API Endpoints (Backend/app)"]
            health["Health<br/>GET /healthz<br/>GET /readyz"]
            validation["Validation<br/>POST /api/v1/validate-id"]
            verification["Verification (single-provider)<br/>POST /api/v1/verify-identity<br/>GET /api/v1/credits"]
            selfies["Selfies / Liveness<br/>POST /api/v1/selfies<br/>POST /api/v1/selfies/{id}/liveness"]
            verifications["Verifications (orchestrator)<br/>POST /api/v1/verifications<br/>GET /api/v1/verifications/history"]
            notifications["Notifications<br/>GET /api/v1/notifications"]
            rica["RICA<br/>POST /api/v1/rica/records<br/>GET /api/v1/rica/records<br/>GET /api/v1/rica/records/{msisdn}<br/>POST /api/v1/rica/verify"]
        end
        subgraph mgmtApi["Management Backend API Endpoints (management-backend)"]
            mgmtAuth["Auth<br/>POST /api/v1/auth/login"]
            mgmtChat["Chat<br/>POST /api/v1/chat"]
            mgmtAudit["Analytics: Audit Logs<br/>GET /api/v1/analytics/audit-logs"]
            mgmtFraud["Analytics: Fraud Rejections<br/>GET /api/v1/analytics/fraud-rejections<br/>GET .../fraud-rejections/summary"]
            mgmtSim["Analytics: SIM Swap Orders<br/>GET /api/v1/analytics/sim-swap-orders<br/>GET .../status-summary<br/>GET .../volume-by-day"]
            mgmtTxn["Analytics: Transactions<br/>GET /api/v1/analytics/transactions<br/>GET .../status-summary<br/>GET .../volume-by-day<br/>GET .../{id}/report"]
            mgmtHealth["Health<br/>GET /health"]
        end
    end

    subgraph dbService["DATABASE / SERVICE"]
        subgraph database["Database"]
            biometricDb[("biometric — Postgres<br/>(used by App API)<br/>selfies, verification_attempts,<br/>notifications, process_log,<br/>rica_records, sim_swap_orders,<br/>active_sims, port_requests")]
            analyticsDb[("analytics — Postgres<br/>(used by Management Backend API)<br/>process_log (mirror), rejected_requests,<br/>sim_swap_orders, transactions,<br/>users, process_docs (pgvector)")]
            biometricDb -.->|analytics_sync Azure Function, every 15 min| analyticsDb
        end
        subgraph service["Service"]
            subgraph appServices["Used by App API"]
                verifyNow["VerifyNow<br/>external ID + face-match provider"]
                ricaSvc["RICA Registry<br/>mock SIM registration"]
                fraudEngine["Fraud Engine<br/>device risk, fraud intel, decisioning"]
                simSwapSvc["SIM Swap / Number Port Service"]
                liveness["Liveness Detection<br/>local mock"]
                selfieStorage["Selfie Storage<br/>local / Azure Blob"]
            end
            subgraph mgmtServices["Used by Management Backend API"]
                openaiAgents["OpenAI Agents SDK<br/>Fraud Assistant chatbot,<br/>report narrative writer"]
                openaiEmbed["OpenAI Embeddings<br/>RAG search"]
                pdfGen["PDF Report Generation<br/>(reportlab)"]
            end
        end
    end

    customerApp --> validation
    customerApp --> verification
    customerApp --> selfies
    customerApp --> verifications
    customerApp --> notifications

    mgmtApp --> mgmtApi

    verifications -.->|internal call| rica

    appApi --> biometricDb
    appApi --> appServices
    mgmtApi --> analyticsDb
    mgmtApi --> mgmtServices
```

## Notes

- `health` (`/healthz`, `/readyz`) and `mgmtHealth` (`/health`) are infra
  liveness/readiness probes, not endpoints either front end calls — that's
  why they have no incoming arrows from the Front End block.
- `Backend/app/routers/iccid.py` and a duplicate `sim_swap.py` router exist
  in the codebase but are **not mounted** in `Backend/app/main.py`, so they
  are excluded here as dead code.
- `Backend/analytics_api` is excluded: it has no Dockerfile reference
  anywhere in the repo, and `management-console/management-backend`'s own
  code comments state it intentionally duplicates and supersedes it.
- See [`three-tier-architecture.md`](three-tier-architecture.md) for the
  general pattern this project follows: Front End (presentation) →
  Application Layer / API (logic) → Database/Service (data).
