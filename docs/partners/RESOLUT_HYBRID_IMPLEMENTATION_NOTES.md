# Resolut Hybrid: implementation notes

## Scope

Current implementation is limited to AV Inform/Resolut integration for `projectId` from `RESOLUT_PROJECT_ID` (current target: `23`).

For other projects, access to this integration is blocked.

## PFP endpoints

All endpoints require authenticated agent/admin and are mounted under:

- `POST /api/pfp/resolut/authorize`
- `POST /api/pfp/resolut/products`
- `POST /api/pfp/resolut/quote`

## Upstream contract mode (hybrid)

- `authorize`:
  - primary path: YAML-style universal operation `POST /` with body `{ operation: "authorize", data: { login, password, type } }`.
  - fallback path: legacy `POST /authorize` with body `{ login, password, key }` if upstream returns `operationNotFound`.
- `products`:
  - `POST /` with body `{ operation: "products", data: {} }`.
  - header: `Authorization: Bearer <resolut_static_key>`.
- `quote`:
  - `POST /` with body `{ operation: "quote", data: { code, parameters } }`.
  - header: `Authorization: Bearer <token>` where token is either the cached session key (after agent login, see below) or `resolut_static_key`.

## Agent login → Resolut session (PFP backend)

For `projectId === RESOLUT_PROJECT_ID`, after successful `POST /login` (agent), the backend calls Resolut `authorize` with the same email/password as in the login request and stores the returned `key` in an in-memory cache keyed by `users.id` (`src/services/resolutSessionStore.js`, TTL `RESOLUT_SESSION_TTL_MS`). Subsequent `products`/`quote` from that agent use this bearer first; if missing/expired, `resolut_static_key` is used. For background jobs without a user session, keep `RESOLUT_STATIC_KEY` configured.

## LIFE goal (NSJ) via Resolut for RESOLUT_PROJECT_ID

When `client.project_id` matches `RESOLUT_PROJECT_ID`, LIFE calculations use Resolut `quote` with PFP product code `assetShort` (override via `RESOLUT_NSJ_PFP_CODE`), mapping parameters from the goal/client into the partner’s `quote` shape. Implementation: `src/services/resolutNsjQuoteService.js`, branch in `src/algorithms/calculators/lifeUpfrontAmount.js`. Other projects still use `nsjApiService` / `api-life`.

## PDF: same Finam HTML templates for project 23

Report HTML pipeline from `src/reports/finam/` is enabled for project ids listed in `FINAM_REPORT_PROJECT_IDS` (default `14,23`). This reuses templates only; it does not change Finam tenant (14) product logic. See `src/reports/finam/finamTemplateProjects.js`.

## Credentials source

Priority:
1. project settings (`system_settings`) for current `projectId`.
2. environment variables fallback.

Project setting keys:
- `resolut_agent_login`
- `resolut_agent_password`
- `resolut_static_key`

Env fallback keys:
- `RESOLUT_BASE_URL`
- `RESOLUT_PROJECT_ID`
- `RESOLUT_AGENT_LOGIN` (optional fallback)
- `RESOLUT_AGENT_PASSWORD` (optional fallback)
- `RESOLUT_STATIC_KEY` (optional fallback)
- `RESOLUT_OPERATION_PATH` (default `/`)
- `RESOLUT_AUTH_PATH` (default `/authorize`)
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

1. Authorize success:
   - agent from project `23`;
   - `POST /api/pfp/resolut/authorize` returns `ok=true`.
2. Authorize block for non-target project:
   - agent from project != `RESOLUT_PROJECT_ID`;
   - returns `403`.
3. Products success:
   - `POST /api/pfp/resolut/products` with `{}` or `{ "data": {} }`.
4. Quote validation:
   - missing `code` or `parameters` returns `400 ValidationError`.
5. Quote upstream error passthrough:
   - invalid product/parameters return normalized `err.code`/`err.message`.
