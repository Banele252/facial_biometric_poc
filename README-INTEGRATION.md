# One Dockerfile + Compose + Expo Axios

Copy these files into the same paths in `facial_biometric_poc`.

## Backend

The supplied `pyproject.toml` declares the runtime dependencies already used by the code (`pydantic-settings`, `PyJWT[crypto]`, `redis`). Refresh the uv lock once:

```bash
uv lock
```

Two backend files are also included because the current branch has startup defects:

- `Backend/app/middleware/zero_trust.py` restores `api_key_header` and `bearer_auth`, which `Backend/app/main.py` imports.
- `Backend/app/routers/auth_router.py` adds the missing `Depends` import.

Start everything:

```bash
docker compose up --build
```

Verify:

```bash
curl http://localhost:8000/healthz
open http://localhost:8000/docs
```

This topology uses one custom Dockerfile. FastAPI is one application process; Redis is infrastructure supplied by Compose. The existing RICA, fraud, internal validation and SIM-swap Python packages are already imported/invoked in-process by `Backend.app`, so the service-specific Dockerfiles are unnecessary for this PoC layout.

## Mobile / Axios

From `mobile`:

```bash
npm install axios
cp .env.local .env.local
npx expo start -c
```

Choose the API URL for where the app runs:

- iOS Simulator / Expo web on Mac: `http://localhost:8000`
- Android emulator: `http://10.0.2.2:8000`
- Physical phone: `http://<MAC_LAN_IP>:8000`

Get your Mac Wi-Fi IP:

```bash
ipconfig getifaddr en0
```

`mobile/src/lib/http.ts` is the single Axios instance. The interceptor adds correlation ID, device fingerprint, geo-fence, request nonce, bearer token, and the PoC Tier-1 API key.

Before protected calls, authenticate once:

```ts
import { loginSandbox } from '@/lib/auth';

await loginSandbox('test_tier1', 'test-secret-456');
```

The JWT is stored with Expo SecureStore and Axios attaches it automatically.

The supplied `mobile/src/shared/api.ts` preserves the existing typed API helper functions but moves their transport from `fetch` to Axios. `useSimSwapOrder.ts` also stops calling `fetch` directly and uses that shared client.

## Important production rule

Do not treat `EXPO_PUBLIC_API_KEY` as a secret in production. Expo public environment variables are shipped to the client. For production, use OAuth/OIDC, device/app attestation and gateway-side policy instead of a static mobile secret.
