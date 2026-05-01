# Resolut Hybrid: implementation notes

## Scope

Current implementation is limited to AV Inform/Resolut integration for `projectId` from `RESOLUT_PROJECT_ID` (current target: `23`).

For other projects, access to this integration is blocked.

## PFP endpoints

All endpoints require authenticated agent/admin and are mounted under:

- `POST /api/pfp/resolut/products`
- `POST /api/pfp/resolut/quote`
- `POST /api/pfp/resolut/portfolio` — публикация портфеля котировок в Resolut (оформление)
- `POST /api/pfp/resolut/client` — создание / изменение клиента в Resolut
- `GET /api/pfp/resolut/client?code=<Resolut client id>` — получение клиента (upstream GET `operation=client`)
- `GET /api/pfp/resolut/link` — одноразовая ссылка перехода в Resolut (upstream GET `operation=link`; **TTL ~20 с** у партнёра — вызывать по клику)
- `POST /api/pfp/resolut/publish-preview` — фильтр/предпросмотр публикации (eligible/skipped) для mixed-портфелей
- `POST /api/pfp/resolut/suggest-quote-line` — черновик `{ code, parameters }` для продуктов со схемой как у НСЖ/накоп (`byLimit` / `byPremium`); иные продукты — вручную на фронте
- `POST /api/pfp/resolut/plan-quotes` — сборка массива `quotes` из последнего `clients.goals_summary` (сводный портфель + fallback по целям); опционально `quote_patches`, `include_monthly_flow`
- `POST /api/pfp/resolut/plan-publish-preview` — то же + фильтр eligible/skipped как у `publish-preview`
- `POST /api/pfp/resolut/publish-from-plan` — автосборка `quotes` + публикация (оркестрация на бэке; фронт только дозаполняет `resolut_client` / patches при необходимости)
- `POST /api/pfp/resolut/publish` — оркестрация оформления: клиент Resolut (create/update) + `portfolio` + сохранение истории в БД; в ответе `data.portfolio` — нормализованные `portfolio_code` / `portfolio_number` / `contracts` (учтены плоский ответ партнёра и вложенный `content`)
- `GET /api/pfp/resolut/publications?client_id=` — история публикаций клиента (для ЛК)

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
- `portfolio`:
  - `POST /` with body `{ operation: "portfolio", data: { quotes: [...], client: {...} } }`.
  - header: same bearer as `products`.
- `client`:
  - `POST /` with body `{ operation: "client", data: { ... } }` (create/update по логике партнёра).
  - `GET /?operation=client&code=<id>` — получение клиента (реализовано в [`src/services/resolutService.js`](../../src/services/resolutService.js) как `callOperationGet`).
- `link`:
  - `GET /?operation=link` — строка URL для перехода в Resolut.

## Agent login → Resolut session (PFP backend)

For `projectId === RESOLUT_PROJECT_ID`, after successful PFP credential check on `POST /login` (agent), the backend **must** call Resolut `authorize` with the same email/password as in the login request and store the returned `key` in an in-memory cache keyed by `users.id` (`resolutSessionStore`, TTL `RESOLUT_SESSION_TTL_MS`). If Resolut rejects the pair, login fails with **401** (no silent success + broken quote later).

Subsequent `products`/`quote`/`portfolio`/`client`/`link` from that agent use this bearer first. If the cache entry is missing or expired, **`resolut_static_key`** (project setting or `RESOLUT_STATIC_KEY`) is used for background/server flows.

If there is **no** cached session and **no** static key, those operations return **401** with `ResolutSessionRequired` — agents must re-login; there is **no** env/project login+password fallback (`RESOLUT_AGENT_LOGIN` / `resolut_agent_login` removed).

**Multi-instance:** in-memory cache is per process. Use `RESOLUT_STATIC_KEY` on each instance for server-side LIFE/report paths that cannot attach to a logged-in agent, or accept LIFE fallback formula when Resolut is unavailable (see `lifeUpfrontAmount.js`).

## LIFE goal (NSJ) via Resolut for RESOLUT_PROJECT_ID

When `client.project_id` matches `RESOLUT_PROJECT_ID`, LIFE calculations use Resolut `quote` with PFP product code `assetShort` (override via `RESOLUT_NSJ_PFP_CODE`), mapping parameters from the goal/client into the partner’s `quote` shape. Implementation: `src/services/resolutNsjQuoteService.js`, branch in `src/algorithms/calculators/lifeUpfrontAmount.js`. Other projects still use `nsjApiService` / `api-life`.

**Background / B2C paths** (e.g. `reportService.calculateFirstRun` without `agentUserId`, client cabinet) do not have an agent bearer; for project 23 they rely on **`RESOLUT_STATIC_KEY`** if configured, otherwise Resolut quote fails and LIFE uses the **local fallback premium** (`_fallback: true` in `lifeUpfrontAmount.js`).

## Portfolio-weighted yield (INVESTMENT, OTHER, etc.) for `RESOLUT_PROJECT_ID`

Products may include optional columns:

- `resolut_pfp_code` — PFP code from upstream `products` (e.g. `assetShort`, `cashback`).
- `resolut_quote_p_type` — payment cadence for `quote` (`0`, `1`, `2`, `4`, `12`); if null, use env `RESOLUT_PORTFOLIO_QUOTE_PTYPE` or `0`.

**Gating:** implied annual yield from Resolut is computed **only** when `client.project_id === RESOLUT_PROJECT_ID` **and** `resolut_pfp_code` is non-empty. Otherwise the existing **`lines` / `yields`** matrix is used (no extra HTTP).

**Implementation:** [`src/services/resolutPortfolioQuoteYieldService.js`](../../src/services/resolutPortfolioQuoteYieldService.js); integration in [`src/algorithms/calculators/BaseCalculator.js`](../../src/algorithms/calculators/BaseCalculator.js) (`resolveInstrumentYieldsForWeightedPortfolio`, passed `context` from calculators) and [`OtherGoalCalculator.js`](../../src/algorithms/calculators/OtherGoalCalculator.js).

**v1 limitation:** implied yield from quote is implemented for **lump-sum** payment (`pType === 0`): PV = `premium`/`premiumFull`, FV = survival benefit from `risks[]` (or top-level `limit`). Other `pType` values fall back to static `lines` if present.

**Caveat:** downstream simulation still uses a single compound monthly rate; this is an approximation for end-of-term insurance cash flows.

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
- `RESOLUT_TIMEOUT_MS` (default `10000`; **clamped** to **8000–120000** ms so mis-set `1000` on Railway cannot break login)
- `RESOLUT_ENABLED` (default `true`)
- `RESOLUT_SESSION_TTL_MS` (optional, default 23h in-memory session for bearer after login)
- `RESOLUT_NSJ_PFP_CODE` (optional, default `assetShort`)
- `RESOLUT_PORTFOLIO_QUOTE_PTYPE` (optional; default payment type for portfolio quote yield when `products.resolut_quote_p_type` is null)
- `FINAM_REPORT_PROJECT_IDS` (optional, default `14,23` for Finam-style PDF HTML)

## Request validation

- `products`: optional payload `{ data?: object }`.
- `quote`: required payload `{ code: string, parameters: object }`.
- `portfolio`: required payload `{ quotes: Array<{ code, parameters }>, client: object }`.
- `client` (POST): create requires `lastName`, `firstName`, `dob`, `sex`, `phone`, `email`; with `code` — update (must include fields besides `code`). Fetch only: use `GET /api/pfp/resolut/client?code=`.
- `link`: no body; `GET /api/pfp/resolut/link`.

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
   - call `quote`/`products`/`portfolio`/`client`/`link` without prior login and without `RESOLUT_STATIC_KEY` → **401** `ResolutSessionRequired`.
7. Stage 2 smoke (demo): `POST /portfolio` after valid quotes + client payload returns portfolio/contract identifiers; `GET /link` returns a URL string (open immediately; short TTL).

## Diagnostics (demo, 2026-04)

Direct `authorize` to `https://demo.avinfors.ru/pfp/api/pfp/` with test agent `agent@agent.ru` / `123456` and `type=ПользовательРезолют` returns **200** and `data.key`. Direct `quote` with that Bearer may return upstream **400** `calcError` for minimal test payloads (partner validation); adjust `parameters` per partner contract — auth path is OK.
