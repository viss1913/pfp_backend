# Resolut Hybrid: implementation notes

## Scope

Current implementation is limited to AV Inform/Resolut integration for `projectId` from `RESOLUT_PROJECT_ID` (current target: `23`).

For other projects, access to this integration is blocked.

## PFP endpoints

All endpoints require authenticated agent/admin and are mounted under:

- `POST /api/pfp/resolut/products`
- `POST /api/pfp/resolut/quote`

Resolut `authorize` is **not** exposed as a separate PFP route: it runs inside `POST /api/pfp/auth/login` for agents on the Resolut project (same email/password as the login body), and the returned bearer is stored in [`src/services/resolutSessionStore.js`](../../src/services/resolutSessionStore.js).

## Upstream contract mode

- `authorize` (internal only, from login):
  - `POST /` with body `{ operation: "authorize", data: { login, password, type } }`.
  - Implemented in `exchangePasswordForSessionKey` in [`src/services/resolutService.js`](../../src/services/resolutService.js).
- `products`:
  - `POST /` with body `{ operation: "products", data: {} }`.
  - header: `Authorization: Bearer <session key from login cache OR resolut_static_key>`.
- `quote`:
  - `POST /` with body `{ operation: "quote", data: { code, parameters } }`.
  - header: same bearer resolution as `products`.

## Agent login → Resolut session (PFP backend)

For `projectId === RESOLUT_PROJECT_ID`, after successful PFP credential check on `POST /login` (agent), the backend **must** call Resolut `authorize` with the same email/password as in the login request and store the returned `key` in an in-memory cache keyed by `users.id` (`resolutSessionStore`, TTL `RESOLUT_SESSION_TTL_MS`). If Resolut rejects the pair, login fails with **401** (no silent success + broken quote later).

Subsequent `products`/`quote` from that agent use this bearer first. If the cache entry is missing or expired, **`resolut_static_key`** (project setting or `RESOLUT_STATIC_KEY`) is used for background/server flows.

If there is **no** cached session and **no** static key, `quote`/`products` return **401** with `ResolutSessionRequired` — agents must re-login; there is **no** env/project login+password fallback (`RESOLUT_AGENT_LOGIN` / `resolut_agent_login` removed).

**Multi-instance:** in-memory cache is per process. Use `RESOLUT_STATIC_KEY` on each instance for server-side LIFE/report paths that cannot attach to a logged-in agent, or accept LIFE fallback formula when Resolut is unavailable (see `lifeUpfrontAmount.js`).

## LIFE goal (NSJ) via Resolut for RESOLUT_PROJECT_ID

When `client.project_id` matches `RESOLUT_PROJECT_ID`, LIFE calculations use Resolut `quote` with PFP product code `assetShort` (override via `RESOLUT_NSJ_PFP_CODE`), mapping parameters from the goal/client into the partner’s `quote` shape. Implementation: `src/services/resolutNsjQuoteService.js`, branch in `src/algorithms/calculators/lifeUpfrontAmount.js`. Other projects still use `nsjApiService` / `api-life`.

**Background / B2C paths** (e.g. `reportService.calculateFirstRun` without `agentUserId`, client cabinet) do not have an agent bearer; for project 23 they rely on **`RESOLUT_STATIC_KEY`** if configured, otherwise Resolut quote fails and LIFE uses the **local fallback premium** (`_fallback: true` in `lifeUpfrontAmount.js`).

## PDF: same Finam HTML templates for project 23

Report HTML pipeline from `src/reports/finam/` is enabled for project ids listed in `FINAM_REPORT_PROJECT_IDS` (default `14,23`). This reuses templates only; it does not change Finam tenant (14) product logic. See `src/reports/finam/finamTemplateProjects.js`.

## Credentials source

Bearer for Resolut:

1. In-memory session after agent `POST /auth/login` (same credentials as PFP).
2. Else `resolut_static_key` from project `system_settings` or env `RESOLUT_STATIC_KEY`.

Project setting keys (Resolut):

- `resolut_static_key`

Env keys:

- `RESOLUT_BASE_URL`
- `RESOLUT_PROJECT_ID`
- `RESOLUT_STATIC_KEY` (optional; for background / multi-instance)
- `RESOLUT_OPERATION_PATH` (default `/`)
- `RESOLUT_AUTH_TYPE` (default `ПользовательРезолют`)
- `RESOLUT_TIMEOUT_MS` (default `10000`)
- `RESOLUT_ENABLED` (default `true`)
- `RESOLUT_SESSION_TTL_MS` (optional, default 23h in-memory session for bearer after login)
- `RESOLUT_NSJ_PFP_CODE` (optional, default `assetShort`)
- `FINAM_REPORT_PROJECT_IDS` (optional, default `14,23` for Finam-style PDF HTML)

## Request validation

- `products`: optional payload `{ data?: object }`.
- `quote`: required payload `{ code: string, parameters: object }`.

## Response normalization

PFP returns normalized envelope:

- `ok`
- `status`
- `operation`
- `data`
- `err`

For upstream failures:

- `err.code` keeps upstream `err.code` when available.
- `err.message` keeps upstream `err.message` when available.
- `err.upstream_status` exposes upstream HTTP status.

Sensitive fields (`login`, `password`, `key`) are sanitized before attaching upstream payload to internal error details.

## Smoke checklist

1. Login + Resolut:
   - agent from project `23`;
   - `POST /api/pfp/auth/login` with valid PFP + AV Inform credentials succeeds and caches Resolut bearer; invalid Resolut pair returns **401** with message from upstream.
2. Project block for non-target project:
   - agent from project != `RESOLUT_PROJECT_ID`;
   - `POST /api/pfp/resolut/quote` returns `403` when project context is wrong.
3. Products success:
   - `POST /api/pfp/resolut/products` with `{}` or `{ "data": {} }` and valid JWT after login (or static key for background).
4. Quote validation:
   - missing `code` or `parameters` returns `400 ValidationError`.
5. Quote upstream error passthrough:
   - invalid product/parameters return normalized `err.code`/`err.message`.
6. Session required:
   - call `quote`/`products` without prior login and without `RESOLUT_STATIC_KEY` → **401** `ResolutSessionRequired`.

## Diagnostics (demo, 2026-04)

Direct `authorize` to `https://demo.avinfors.ru/pfp/api/pfp/` with test agent `agent@agent.ru` / `123456` and `type=ПользовательРезолют` returns **200** and `data.key`. Direct `quote` with that Bearer may return upstream **400** `calcError` for minimal test payloads (partner validation); adjust `parameters` per partner contract — auth path is OK.
